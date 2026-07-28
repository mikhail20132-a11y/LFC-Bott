import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { prisma } from "../../database/prisma.js";
import { teamService } from "../../services/teamService.js";
import { createErrorEmbed } from "../../utils/helpers.js";
import type { Command, Formation } from "../../types/index.js";

const FORMATIONS: { name: string; value: string }[] = [
  { name: "4-4-2", value: "4-4-2" },
  { name: "4-3-3", value: "4-3-3" },
  { name: "3-5-2", value: "3-5-2" },
  { name: "4-2-3-1", value: "4-2-3-1" },
  { name: "5-3-2", value: "5-3-2" },
  { name: "4-1-4-1", value: "4-1-4-1" },
  { name: "3-4-3", value: "3-4-3" },
];

const POSITIONS: Record<string, string[]> = {
  "4-4-2": ["GK", "LB", "CB", "CB", "RB", "LM", "CM", "CM", "RM", "ST", "ST"],
  "4-3-3": ["GK", "LB", "CB", "CB", "RB", "CM", "CDM", "CM", "LW", "ST", "RW"],
  "3-5-2": ["GK", "CB", "CB", "CB", "LM", "CM", "CDM", "CM", "RM", "ST", "ST"],
  "4-2-3-1": ["GK", "LB", "CB", "CB", "RB", "CDM", "CDM", "LW", "CAM", "RW", "ST"],
  "5-3-2": ["GK", "LWB", "CB", "CB", "CB", "RWB", "CM", "CM", "CM", "ST", "ST"],
  "4-1-4-1": ["GK", "LB", "CB", "CB", "RB", "CDM", "LM", "CM", "CM", "RM", "ST"],
  "3-4-3": ["GK", "CB", "CB", "CB", "LM", "CM", "CM", "RM", "LW", "ST", "RW"],
};

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("lineup")
    .setDescription("Submit a starting lineup for your team (Captains)")
    .addStringOption((o) => o.setName("match_id").setDescription("Match ID").setRequired(true))
    .addStringOption((o) => o.setName("formation").setDescription("Formation").setRequired(true).addChoices(...FORMATIONS))
    .addStringOption((o) => o.setName("starters").setDescription("11 player @mentions comma-separated").setRequired(true))
    .addStringOption((o) => o.setName("bench").setDescription("Bench players @mentions comma-separated").setRequired(false)),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply();

    const matchId = interaction.options.getString("match_id", true);
    const formation = interaction.options.getString("formation", true) as Formation;
    const startersRaw = interaction.options.getString("starters", true);
    const benchRaw = interaction.options.getString("bench");

    const match = await prisma.match.findUnique({ where: { id: matchId }, include: { homeTeam: true, awayTeam: true } });
    if (!match) { await interaction.editReply({ content: "❌ Match not found." }); return; }

    // Check user is manager of one of the teams
    const isHomeManager = match.homeTeam.managerId === interaction.user.id;
    const isAwayManager = match.awayTeam.managerId === interaction.user.id;
    if (!isHomeManager && !isAwayManager) {
      await interaction.editReply({ embeds: [createErrorEmbed("❌ Not Your Team", "You must be the manager of a team in this match.")] });
      return;
    }

    const teamId = isHomeManager ? match.homeTeamId : match.awayTeamId;
    const teamName = isHomeManager ? match.homeTeam.name : match.awayTeam.name;

    // Parse starters
    const starterIds = startersRaw.match(/<@(\d+)>/g)?.map((m) => m.replace(/<@|>/g, "")) ?? [];
    if (starterIds.length !== 11) {
      await interaction.editReply({ content: "❌ You must provide exactly 11 starters." });
      return;
    }

    // Resolve player IDs
    const playerMap = await prisma.player.findMany({ where: { discordId: { in: starterIds } }, include: { user: true } });
    const benchIds = benchRaw ? benchRaw.match(/<@(\d+)>/g)?.map((m) => m.replace(/<@|>/g, "")) ?? [] : [];
    const benchPlayers = benchIds.length ? await prisma.player.findMany({ where: { discordId: { in: benchIds } } }) : [];

    // Create lineup
    const lineup = await prisma.lineup.create({
      data: {
        matchId, teamId, captainId: interaction.user.id, formation, isConfirmed: true,
        players: {
          create: [
            ...playerMap.map((p, i) => ({
              playerId: p.id,
              position: POSITIONS[formation]?.[i] ?? `POS${i + 1}`,
              isBench: false,
              order: i,
              matchId,
            })),
            ...benchPlayers.map((p, i) => ({
              playerId: p.id,
              position: "SUB",
              isBench: true,
              order: i + 20,
              matchId,
            })),
          ],
        },
      },
      include: { players: { include: { player: { include: { user: true } } } } },
    });

    const embed = new EmbedBuilder()
      .setTitle(`📋 ${teamName} — Lineup Submitted`)
      .setColor("#00AA00")
      .addFields(
        { name: "🎯 Formation", value: formation, inline: true },
        { name: "👥 Starting XI", value: lineup.players.filter((p) => !p.isBench).map((p) => `**${p.position}** — ${p.player.user.username}`).join("\n"), inline: false },
      );
    if (lineup.players.some((p) => p.isBench)) {
      embed.addFields({ name: "🔄 Bench", value: lineup.players.filter((p) => p.isBench).map((p) => p.player.user.username).join(", "), inline: false });
    }
    embed.setFooter({ text: "Legacy Football Championship • Lineup" }).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  },
};
export default command;