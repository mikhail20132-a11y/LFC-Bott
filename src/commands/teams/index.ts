import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { teamService } from "../../services/teamService.js";
import { createErrorEmbed } from "../../utils/helpers.js";
import type { Command } from "../../types/index.js";

/** Simple hash function to derive a stable hex colour from a team name. */
function teamColor(teamName: string): number {
  let hash = 0;
  for (let i = 0; i < teamName.length; i++) {
    hash = teamName.charCodeAt(i) + ((hash << 5) - hash);
  }
  // Keep in a nice hue range (avoid very dark/bright)
  const h = ((hash % 360) + 360) % 360;
  // Convert HSL-ish to approximate hex — just use a fixed rich palette of colours
  const palette = [
    0xc8102e, // LFC Red
    0x1e40af, // Royal Blue
    0x059669, // Emerald
    0xd97706, // Amber
    0xdc2626, // Crimson
    0x2563eb, // Bright Blue
    0x9333ea, // Purple
    0xca8a04, // Gold
    0x0891b2, // Cyan
    0xbe123c, // Rose
    0x4f46e5, // Indigo
    0xea580c, // Orange
    0x0d9488, // Teal
    0x65a30d, // Lime
    0x0284c7, // Sky
    0xdb2777, // Pink
  ];
  return palette[Math.abs(hash) % palette.length];
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("teams")
    .setDescription("Browse all registered teams in the league")
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("View all teams with managers, roster size, and trophies")
    )
    .addSubcommand((sub) =>
      sub
        .setName("top")
        .setDescription("View top teams by trophies")
    ),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply();

    const sub = interaction.options.getSubcommand();

    try {
      switch (sub) {
        case "list":
          return handleList(interaction);
        case "top":
          return handleTop(interaction);
        default:
          await interaction.editReply({ content: "❌ Unknown subcommand." });
      }
    } catch (error) {
      console.error("[Teams Error]", error);
      await interaction.editReply({
        embeds: [createErrorEmbed("❌ Error", "Failed to load teams.")],
      });
    }
  },
};

async function handleList(interaction: CommandInteraction): Promise<void> {
  const teams = await teamService.listTeams();

  if (!teams || teams.length === 0) {
    await interaction.editReply({
      embeds: [createErrorEmbed("📭 No Teams", "No teams have been created yet! Use `/team create` to start.")],
    });
    return;
  }

  // Split into pages of 8 teams (Discord embed field limit)
  const pageSize = 8;
  const pages = Math.ceil(teams.length / pageSize);
  const currentPage = 0;
  const slice = teams.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  const embed = new EmbedBuilder()
    .setTitle("🏟️ Franchise Owner List")
    .setColor(0x059669)
    .setDescription(`**Active Franchises — ${teams.length} total**`)
    .setTimestamp();

  for (const team of slice) {
    const emoji = team.emoji || "🏟️";
    const colorHex = teamColor(team.name).toString(16).padStart(6, "0");
    const rosterCount = (team as any)._count?.players || 0;
    const managerTag = team.manager?.username
      ? `<@${team.managerId}>`
      : "`No FO`";

    embed.addFields({
      name: `${emoji} **${team.name}**`,
      value: [
        `\`${rosterCount}/30\``,
        `👤 ${managerTag}`,
        team.trophies ? `🏆 ${team.trophies} trophy${team.trophies !== 1 ? "ies" : "y"}` : "",
      ]
        .filter(Boolean)
        .join("　·　"),
      inline: false,
    });
  }

  if (pages > 1) {
    embed.setFooter({
      text: `Page ${currentPage + 1}/${pages} · ${teams.length} franchises total`,
    });
  } else {
    embed.setFooter({ text: `${teams.length} franchises registered` });
  }

  await interaction.editReply({ embeds: [embed] });
}

async function handleTop(interaction: CommandInteraction): Promise<void> {
  const teams = await teamService.listTeams();

  if (!teams || teams.length === 0) {
    await interaction.editReply({
      embeds: [createErrorEmbed("📭 No Teams", "No teams yet!")],
    });
    return;
  }

  const sorted = [...teams].sort((a, b) => (b.trophies || 0) - (a.trophies || 0));
  const top = sorted.slice(0, 10);

  const embed = new EmbedBuilder()
    .setTitle("🏆 Trophy Leaders")
    .setColor(0xffd700)
    .setDescription("**Most decorated franchises in LFC history**")
    .setTimestamp();

  const medals = ["🥇", "🥈", "🥉", "4⃣", "5⃣", "6⃣", "7⃣", "8⃣", "9⃣", "🔟"];

  for (let i = 0; i < top.length; i++) {
    const team = top[i];
    const emoji = team.emoji || "🏟️";
    const rosterCount = (team as any)._count?.players || 0;

    embed.addFields({
      name: `${medals[i]} ${emoji} **${team.name}**`,
      value: [
        `🏆 **${team.trophies}** trophy${team.trophies !== 1 ? "ies" : "y"}`,
        `👤 ${team.manager?.username || "Unknown"}`,
        `\`${rosterCount}/30\``,
      ].join(" · "),
      inline: false,
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

export default command;
