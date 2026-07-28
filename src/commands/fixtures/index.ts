import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { leagueService } from "../../services/leagueService.js";
import { createErrorEmbed, formatDate } from "../../utils/helpers.js";
import type { Command } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("fixtures")
    .setDescription("View upcoming match schedules"),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply();

    try {
      const activeSeason = await leagueService.getActiveSeason();
      if (!activeSeason) {
        await interaction.editReply({
          embeds: [createErrorEmbed("📭 No Active Season", "No active season. An admin can start one with `/admin season start`.")],
        });
        return;
      }

      const matches = await leagueService.getUpcomingFixtures(activeSeason.id);
      if (!matches || matches.length === 0) {
        await interaction.editReply({
          embeds: [createErrorEmbed("📭 No Upcoming Fixtures", "No matches scheduled yet. Use `/match create` to schedule one!")],
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`📅 ${activeSeason.name} — Upcoming Fixtures`)
        .setColor("#00AAFF")
        .setDescription(`**${matches.length} match(es) scheduled**`)
        .setTimestamp();

      matches.forEach((m: any) => {
        const date = m.matchDate ? formatDate(m.matchDate) : "TBD";
        const homeEmoji = m.homeTeam?.emoji || "🏠";
        const awayEmoji = m.awayTeam?.emoji || "✈️";
        embed.addFields({
          name: `⚽ ${date}`,
          value: `${homeEmoji} **${m.homeTeam?.name || "???"}** vs ${awayEmoji} **${m.awayTeam?.name || "???"}**\nStatus: \`${m.status}\`${m.matchweek ? ` | Matchweek ${m.matchweek}` : ""}`,
          inline: false,
        });
      });

      embed.setFooter({ text: "Legacy Football Championship" });
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("[Fixtures Error]", error);
      await interaction.editReply({ embeds: [createErrorEmbed("❌ Error", "Failed to load fixtures.")] });
    }
  },
};

export default command;