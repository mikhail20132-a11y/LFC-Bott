import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { leagueService } from "../../services/leagueService.js";
import { matchService } from "../../services/matchService.js";
import { formatDate } from "../../utils/helpers.js";
import type { Command } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("league")
    .setDescription("League commands — standings, fixtures, results, and history")
    .addSubcommand((sub) =>
      sub
        .setName("standings")
        .setDescription("View the current league table")
    )
    .addSubcommand((sub) =>
      sub
        .setName("fixtures")
        .setDescription("View upcoming match fixtures")
    )
    .addSubcommand((sub) =>
      sub
        .setName("results")
        .setDescription("View recent match results")
    )
    .addSubcommand((sub) =>
      sub
        .setName("history")
        .setDescription("View match history between two teams")
        .addStringOption((opt) =>
          opt
            .setName("team1")
            .setDescription("First team name")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("team2")
            .setDescription("Second team name")
            .setRequired(true)
        )
    ),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case "standings":
        return handleStandings(interaction);
      case "fixtures":
        return handleFixtures(interaction);
      case "results":
        return handleResults(interaction);
      case "history":
        return handleHistory(interaction);
      default:
        await interaction.reply({ content: "❌ Unknown subcommand.", ephemeral: true });
    }
  },
};

async function handleStandings(interaction: CommandInteraction): Promise<void> {
  await interaction.deferReply();

  try {
    const activeSeason = await leagueService.getActiveSeason();

    if (!activeSeason) {
      await interaction.editReply({
        content: "❌ No active season. Use `/season start` to begin a season.",
      });
      return;
    }

    const standings = await leagueService.getStandings(activeSeason.id);

    const embed = new EmbedBuilder()
      .setTitle(`🏆 ${activeSeason.name} — League Standings`)
      .setColor("#00AA00")
      .setDescription(
        standings.length > 0
          ? standings
              .map(
                (s) =>
                  `**${s.position}.** ${getPositionEmoji(s.position)} **${s.teamName}**` +
                  `\n    ${s.played}PL | ${s.wins}W | ${s.draws}D | ${s.losses}L` +
                  ` | GF:${s.goalsFor} GA:${s.goalsAgainst} GD:${s.goalDifference >= 0 ? "+" : ""}${s.goalDifference}` +
                  ` | **${s.points}pts**`
              )
              .join("\n\n")
          : "No standings data yet. Start the season and play matches!"
      )
      .setFooter({ text: "Legacy Football Championship" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("[Standings Error]", error);
    await interaction.editReply({
      content: "❌ An error occurred while fetching standings.",
    });
  }
}

function getPositionEmoji(pos: number): string {
  switch (pos) {
    case 1:
      return "🥇";
    case 2:
      return "🥈";
    case 3:
      return "🥉";
    default:
      return "#";
  }
}

async function handleFixtures(interaction: CommandInteraction): Promise<void> {
  await interaction.deferReply();

  try {
    const activeSeason = await leagueService.getActiveSeason();
    const fixtures = await matchService.getUpcomingFixtures(10);

    const embed = new EmbedBuilder()
      .setTitle("📅 Upcoming Fixtures")
      .setColor("#00AA00");

    if (fixtures.length > 0) {
      for (const match of fixtures) {
        embed.addFields({
          name: `${match.homeTeam.name} vs ${match.awayTeam.name}`,
          value: [
            `📅 **Date:** ${formatDate(match.matchDate)}`,
            `📊 **Season:** ${match.season.name}`,
            match.refereeId ? `👨‍⚖️ **Referee:** <@${match.refereeId}>` : null,
          ]
            .filter(Boolean)
            .join("\n"),
          inline: false,
        });
      }
    } else {
      embed.setDescription(
        activeSeason
          ? "No upcoming fixtures scheduled."
          : "No active season. Start a season first!"
      );
    }

    embed
      .setFooter({ text: "Legacy Football Championship" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("[Fixtures Error]", error);
    await interaction.editReply({
      content: "❌ An error occurred while fetching fixtures.",
    });
  }
}

async function handleResults(interaction: CommandInteraction): Promise<void> {
  await interaction.deferReply();

  try {
    const results = await matchService.getRecentResults(10);

    const embed = new EmbedBuilder()
      .setTitle("📋 Recent Results")
      .setColor("#00AA00");

    if (results.length > 0) {
      for (const match of results) {
        const homeWin = match.homeScore > match.awayScore;
        const awayWin = match.awayScore > match.homeScore;
        const scoreEmoji = homeWin ? "🏠" : awayWin ? "🚗" : "🤝";

        // Get scorers if available
        const scorers = match.goals
          .slice(0, 3)
          .map((g) => g.player.user.username)
          .join(", ");

        // Get MVP if available
        const mvp = match.mvps[0];

        embed.addFields({
          name: `${scoreEmoji} ${match.homeTeam.name} ${match.homeScore} - ${match.awayScore} ${match.awayTeam.name}`,
          value: [
            `📅 ${match.matchDate ? new Date(match.matchDate).toLocaleDateString() : "N/A"}`,
            scorers ? `⚽ **Scorers:** ${scorers}` : null,
            mvp ? `🏆 **MVP:** ${mvp.player.user.username}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
          inline: false,
        });
      }
    } else {
      embed.setDescription("No match results yet.");
    }

    embed
      .setFooter({ text: "Legacy Football Championship" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("[Results Error]", error);
    await interaction.editReply({
      content: "❌ An error occurred while fetching results.",
    });
  }
}

async function handleHistory(interaction: CommandInteraction): Promise<void> {
  await interaction.deferReply();

  const team1Name = interaction.options.getString("team1", true);
  const team2Name = interaction.options.getString("team2", true);

  try {
    const teamService = await import("../../services/teamService.js").then(
      (m) => m.teamService
    );

    const team1 = await teamService.getTeamByName(team1Name);
    const team2 = await teamService.getTeamByName(team2Name);

    if (!team1 || !team2) {
      await interaction.editReply({
        content: "❌ One or both teams not found.",
      });
      return;
    }

    const matches = await matchService.getTeamMatches(team1.id);
    const headToHead = matches.filter(
      (m) =>
        (m.homeTeamId === team1.id && m.awayTeamId === team2.id) ||
        (m.homeTeamId === team2.id && m.awayTeamId === team1.id)
    );

    if (headToHead.length === 0) {
      await interaction.editReply({
        content: `📋 **${team1.name}** and **${team2.name}** have no match history.`,
      });
      return;
    }

    // Calculate head-to-head record
    let team1Wins = 0;
    let team2Wins = 0;
    let draws = 0;
    let team1Goals = 0;
    let team2Goals = 0;

    for (const m of headToHead) {
      if (m.status !== "Finished") continue;
      const isTeam1Home = m.homeTeamId === team1.id;
      const t1Score = isTeam1Home ? m.homeScore : m.awayScore;
      const t2Score = isTeam1Home ? m.awayScore : m.homeScore;

      team1Goals += t1Score;
      team2Goals += t2Score;

      if (t1Score > t2Score) team1Wins++;
      else if (t2Score > t1Score) team2Wins++;
      else draws++;
    }

    const embed = new EmbedBuilder()
      .setTitle(`📊 Head-to-Head: ${team1.name} vs ${team2.name}`)
      .setColor("#00AA00")
      .addFields(
        {
          name: `🏠 ${team1.name}`,
          value: `${team1Wins} wins | ${team1Goals} goals`,
          inline: true,
        },
        { name: "🤝 Draws", value: `${draws}`, inline: true },
        {
          name: `🚗 ${team2.name}`,
          value: `${team2Wins} wins | ${team2Goals} goals`,
          inline: true,
        },
        {
          name: `📋 Last ${Math.min(headToHead.length, 5)} Meetings`,
          value: headToHead
            .slice(0, 5)
            .map((m) => {
              const isTeam1Home = m.homeTeamId === team1.id;
              const t1Score = isTeam1Home ? m.homeScore : m.awayScore;
              const t2Score = isTeam1Home ? m.awayScore : m.homeScore;
              return `${formatDate(m.matchDate)}: ${team1.name} ${t1Score} - ${t2Score} ${team2.name}`;
            })
            .join("\n"),
          inline: false,
        }
      )
      .setFooter({ text: "Legacy Football Championship" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("[History Error]", error);
    await interaction.editReply({
      content: "❌ An error occurred while fetching history.",
    });
  }
}

export default command;
