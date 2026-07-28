import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { prisma } from "../../database/prisma.js";
import { createErrorEmbed } from "../../utils/helpers.js";
import type { Command } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("viewschedule")
    .setDescription("View all matches for a specific matchweek")
    .addIntegerOption((opt) =>
      opt
        .setName("week")
        .setDescription("Matchweek number to view")
        .setRequired(true)
        .setMinValue(1)
    ),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply();

    const week = interaction.options.getInteger("week", true);

    try {
      const matches = await prisma.match.findMany({
        where: { matchweek: week },
        include: {
          homeTeam: true,
          awayTeam: true,
          season: true,
          referee: true,
        },
        orderBy: [{ id: "asc" }],
      });

      if (matches.length === 0) {
        await interaction.editReply({
          embeds: [
            createErrorEmbed(
              "📭 No Matches",
              `No matches found for matchweek **${week}**.`
            ),
          ],
        });
        return;
      }

      const seasonName = matches[0].season?.name || "Current Season";

      const embed = new EmbedBuilder()
        .setTitle(`📅 ${seasonName} — Matchweek ${week}`)
        .setColor("#0099FF")
        .setDescription(
          `**${matches.length} match(es)** scheduled for this week`
        )
        .setTimestamp();

      const statusEmojis: Record<string, string> = {
        Scheduled: "🟢",
        Live: "🟡",
        Finished: "✅",
        Postponed: "🔴",
        Forfeit: "⚪",
      };

      matches.forEach((m) => {
        const homeEmoji = m.homeTeam?.emoji || "🏠";
        const awayEmoji = m.awayTeam?.emoji || "✈️";
        const statusEmoji = statusEmojis[m.status] || "❓";
        const scoreStr =
          m.status === "Finished" || m.status === "Forfeit"
            ? `**${m.homeScore} - ${m.awayScore}**`
            : "vs";
        const refereeStr = m.referee
          ? `👨‍⚖️ <@${m.referee.discordId}>`
          : "";
        const dateStr = m.matchDate
          ? `<t:${Math.floor(m.matchDate.getTime() / 1000)}:F>`
          : "";

        embed.addFields({
          name: `${statusEmoji} ${homeEmoji} ${m.homeTeam?.name || "???"} ${scoreStr} ${awayEmoji} ${m.awayTeam?.name || "???"}`,
          value:
            `Status: \`${m.status}\`` +
            (dateStr ? ` | ${dateStr}` : "") +
            (refereeStr ? ` | ${refereeStr}` : ""),
          inline: false,
        });
      });

      embed.setFooter({
        text: `Legacy Football Championship • Matchweek ${week}`,
      });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("[ViewSchedule Error]", error);
      await interaction.editReply({
        embeds: [
          createErrorEmbed("❌ Error", "Failed to load schedule for this week."),
        ],
      });
    }
  },
};

export default command;
