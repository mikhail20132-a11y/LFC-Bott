import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { teamService } from "../../services/teamService.js";
import type { Command, Position } from "../../types/index.js";

const POSITION_ORDER: Position[] = ["Goalkeeper", "Defender", "Midfielder", "Forward"];
const POS_EMOJIS: Record<string, string> = { Goalkeeper: "🧤", Defender: "🛡️", Midfielder: "🎯", Forward: "⚽" };

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("squad")
    .setDescription("Display a club's full roster")
    .addStringOption((opt) =>
      opt.setName("team").setDescription("Team name").setRequired(true)
    ),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply();

    const teamName = interaction.options.getString("team", true);
    const team = await teamService.getTeamByName(teamName);
    if (!team) {
      await interaction.editReply({ content: `❌ Team **${teamName}** not found.` });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`👥 ${team.name} — Full Squad`)
      .setColor(BRAND.colors.success)
      .setDescription(
        team.players.length
          ? `**Manager:** <@${team.manager.discordId}> | **Total:** ${team.players.length} players`
          : "No players registered."
      );

    // Group by role then position
    const captains = team.players.filter((p) => p.roleInTeam === "Captain" || p.roleInTeam === "Vice Captain");
    const starters = team.players.filter((p) => p.roleInTeam === "Starter" || !p.roleInTeam);
    const subs = team.players.filter((p) => p.roleInTeam === "Sub" || p.roleInTeam === "Academy");

    if (captains.length) {
      embed.addFields({
        name: "👑 Leadership",
        value: captains.map((p) => `**${p.roleInTeam}:** ${p.user.username} (${p.position})`).join("\n"),
        inline: false,
      });
    }

    for (const pos of POSITION_ORDER) {
      const posPlayers = starters.filter((p) => p.position === pos);
      if (posPlayers.length) {
        embed.addFields({
          name: `${POS_EMOJIS[pos] ?? "👤"} ${pos}s (${posPlayers.length})`,
          value: posPlayers
            .map((p) => `**${p.user.username}** — ⚽${p.goals}G / 🎯${p.assists}A / 📋${p.appearances}Apps`)
            .join("\n"),
          inline: false,
        });
      }
    }

    if (subs.length) {
      embed.addFields({
        name: "🔄 Substitutes & Academy",
        value: subs.map((p) => `**${p.user.username}** (${p.position}${p.roleInTeam ? ` — ${p.roleInTeam}` : ""})`).join("\n"),
        inline: false,
      });
    }

    embed.setFooter({ text: "Legacy Football Championship" }).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;