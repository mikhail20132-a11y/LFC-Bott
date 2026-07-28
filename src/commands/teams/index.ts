import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { teamService } from "../../services/teamService.js";
import { createErrorEmbed } from "../../utils/helpers.js";
import type { Command } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("teams")
    .setDescription("Browse all registered teams in the league")
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("View all teams with their stats and managers")
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

  const embed = new EmbedBuilder()
    .setTitle("🏟️ League Teams")
    .setColor("#00AAFF")
    .setDescription(`**${teams.length} teams** registered in the league`)
    .setTimestamp();

  // Show teams in pages of 10
  const pageSize = 10;
  const pages = Math.ceil(teams.length / pageSize);
  
  for (let i = 0; i < Math.min(pages, 1); i++) {
    const slice = teams.slice(i * pageSize, (i + 1) * pageSize);
    for (const team of slice) {
      const emoji = team.emoji || "🏟️";
      const managerTag = team.manager?.username || "Unknown";
      embed.addFields({
        name: `${emoji} ${team.name}${team.shortName ? ` (${team.shortName})` : ""}`,
        value: `👤 Manager: ${managerTag} | 👥 ${(team as any)._count?.players || 0} players | 🏆 ${team.trophies || 0} trophies`,
        inline: false,
      });
    }
  }

  if (pages > 1) {
    embed.setFooter({ text: `Page 1/${pages} · ${teams.length} total teams` });
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
    .setTitle("🏆 Top Teams by Trophies")
    .setColor("#FFD700")
    .setTimestamp();

  const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
  
  top.forEach((team, i) => {
    const emoji = team.emoji || "🏟️";
    embed.addFields({
      name: `${medals[i] || "#${i+1}"} ${emoji} ${team.name}`,
      value: `🏆 ${team.trophies || 0} trophies | 👤 ${team.manager?.username || "Unknown"}`,
      inline: false,
    });
  });

  await interaction.editReply({ embeds: [embed] });
}

export default command;