import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { matchService } from "../../services/matchService.js";
import { leagueService } from "../../services/leagueService.js";
import { teamService } from "../../services/teamService.js";
import { newsService } from "../../services/newsService.js";
import { prisma } from "../../database/prisma.js";
import { hasRole, RoleType } from "../../utils/permissions.js";
import { createErrorEmbed, formatDate } from "../../utils/helpers.js";
import type { Command, ExtendedClient } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("match")
    .setDescription("Match commands — schedule, start, report, and finish")
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("Schedule a new match (Management/Referee only)")
        .addStringOption((opt) =>
          opt
            .setName("home")
            .setDescription("Home team name")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("away")
            .setDescription("Away team name")
            .setRequired(true)
        )
        .addUserOption((opt) =>
          opt
            .setName("referee")
            .setDescription("Match referee")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("start")
        .setDescription("Start a scheduled match")
        .addStringOption((opt) =>
          opt
            .setName("match_id")
            .setDescription("Match ID to start")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("report")
        .setDescription("Report match events (goal, assist, card, MVP)")
        .addStringOption((opt) =>
          opt
            .setName("match_id")
            .setDescription("Match ID")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("event")
            .setDescription("Event type")
            .setRequired(true)
            .addChoices(
              { name: "⚽ Goal", value: "goal" },
              { name: "🎯 Assist", value: "assist" },
              { name: "🟨 Yellow Card", value: "yellow" },
              { name: "🟥 Red Card", value: "red" },
              { name: "🏆 MVP", value: "mvp" }
            )
        )
        .addUserOption((opt) =>
          opt
            .setName("player")
            .setDescription("Player involved")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("minute")
            .setDescription("Minute of the event")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("finish")
        .setDescription("Finish a match with the final score")
        .addStringOption((opt) =>
          opt
            .setName("match_id")
            .setDescription("Match ID to finish")
            .setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("home_score")
            .setDescription("Home team final score")
            .setRequired(true)
            .setMinValue(0)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("away_score")
            .setDescription("Away team final score")
            .setRequired(true)
            .setMinValue(0)
        )
    ),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case "create":
        return handleCreate(interaction);
      case "start":
        return handleStart(interaction);
      case "report":
        return handleReport(interaction);
      case "finish":
        return handleFinish(interaction);
      default:
        await interaction.reply({ content: "❌ Unknown subcommand.", ephemeral: true });
    }
  },
};

async function handleCreate(interaction: CommandInteraction): Promise<void> {
  await interaction.deferReply();

  const member = interaction.member;
  if (
    !hasRole(member as never, RoleType.Founder) &&
    !hasRole(member as never, RoleType.LeagueManagement) &&
    !hasRole(member as never, RoleType.Referee)
  ) {
    await interaction.editReply({
      embeds: [
        createErrorEmbed(
          "❌ Insufficient Permissions",
          "You need **Founder**, **League Management**, or **Referee** role to create matches."
        ),
      ],
    });
    return;
  }

  const homeName = interaction.options.getString("home", true);
  const awayName = interaction.options.getString("away", true);
  const refereeUser = interaction.options.getUser("referee");

  try {
    const homeTeam = await teamService.getTeamByName(homeName);
    const awayTeam = await teamService.getTeamByName(awayName);

    if (!homeTeam) {
      await interaction.editReply({
        embeds: [createErrorEmbed("❌ Team Not Found", `Home team **${homeName}** not found.`)],
      });
      return;
    }

    if (!awayTeam) {
      await interaction.editReply({
        embeds: [createErrorEmbed("❌ Team Not Found", `Away team **${awayName}** not found.`)],
      });
      return;
    }

    if (homeTeam.id === awayTeam.id) {
      await interaction.editReply({
        embeds: [createErrorEmbed("❌ Invalid Match", "A team cannot play against itself.")],
      });
      return;
    }

    const activeSeason = await leagueService.getActiveSeason();
    if (!activeSeason) {
      await interaction.editReply({
        embeds: [createErrorEmbed("❌ No Active Season", "Please start a season first using `/season start`.")],
      });
      return;
    }

    const match = await matchService.createMatch({
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
      seasonId: activeSeason.id,
      refereeId: refereeUser?.id,
    });

    const embed = new EmbedBuilder()
      .setTitle("⚽ Match Scheduled")
      .setColor("#00AA00")
      .addFields(
        { name: "🏠 Home", value: homeTeam.name, inline: true },
        { name: "🆚", value: "vs", inline: true },
        { name: "🚗 Away", value: awayTeam.name, inline: true },
        { name: "📅 Season", value: activeSeason.name, inline: true },
        { name: "🔢 Match ID", value: match.id.slice(0, 8), inline: true },
        { name: "👨‍⚖️ Referee", value: refereeUser ? `<@${refereeUser.id}>` : "TBD", inline: true },
        { name: "📋 Status", value: "🟢 Scheduled", inline: false }
      )
      .setFooter({ text: "Use /match start to begin the match" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("[Match Create Error]", error);
    await interaction.editReply({
      content: "❌ An error occurred while creating the match.",
    });
  }
}

async function handleStart(interaction: CommandInteraction): Promise<void> {
  await interaction.deferReply();

  const member = interaction.member;
  if (
    !hasRole(member as never, RoleType.Founder) &&
    !hasRole(member as never, RoleType.LeagueManagement) &&
    !hasRole(member as never, RoleType.Referee)
  ) {
    await interaction.editReply({
      embeds: [
        createErrorEmbed(
          "❌ Insufficient Permissions",
          "Only staff can start matches."
        ),
      ],
    });
    return;
  }

  const matchId = interaction.options.getString("match_id", true);

  try {
    const match = await matchService.startMatch(matchId);

    const embed = new EmbedBuilder()
      .setTitle("⚽ Match Started!")
      .setColor("#FFAA00")
      .setDescription(
        `**${match.homeTeamId}** vs **${match.awayTeamId}** is now **LIVE**!`
      )
      .addFields(
        { name: "🟢 Status", value: "Live", inline: true },
        { name: "🔢 Match ID", value: match.id.slice(0, 8), inline: true }
      )
      .setFooter({ text: "Use /match report to record goals, assists, and cards" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("[Match Start Error]", error);
    await interaction.editReply({
      content: "❌ Match not found or could not be started.",
    });
  }
}

async function handleReport(interaction: CommandInteraction): Promise<void> {
  await interaction.deferReply();

  const member = interaction.member;
  if (
    !hasRole(member as never, RoleType.Founder) &&
    !hasRole(member as never, RoleType.LeagueManagement) &&
    !hasRole(member as never, RoleType.Referee)
  ) {
    await interaction.editReply({
      embeds: [
        createErrorEmbed(
          "❌ Insufficient Permissions",
          "Only staff can report match events."
        ),
      ],
    });
    return;
  }

  const matchId = interaction.options.getString("match_id", true);
  const eventType = interaction.options.getString("event", true);
  const targetUser = interaction.options.getUser("player", true);
  const minute = interaction.options.getString("minute");
  const minuteNum = minute ? parseInt(minute) : undefined;

  // Note: In production, you'd import playerService to resolve the player ID
  // For now we output the event as a logged message
  const eventEmojis: Record<string, string> = {
    goal: "⚽",
    assist: "🎯",
    yellow: "🟨",
    red: "🟥",
    mvp: "🏆",
  };

  const embed = new EmbedBuilder()
    .setTitle(`${eventEmojis[eventType] ?? "📋"} Match Event Reported`)
    .setColor("#00AA00")
    .addFields(
      { name: "🔢 Match ID", value: matchId.slice(0, 8), inline: true },
      { name: "📋 Event", value: eventType.toUpperCase(), inline: true },
      { name: "👤 Player", value: `<@${targetUser.id}>`, inline: true },
      { name: "⏱ Minute", value: minute ?? "N/A", inline: true },
      { name: "📝 Reported By", value: `<@${interaction.user.id}>`, inline: true }
    )
    .setFooter({ text: "Use /match finish to end the match" })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

async function handleFinish(interaction: CommandInteraction): Promise<void> {
  await interaction.deferReply();

  const member = interaction.member;
  if (
    !hasRole(member as never, RoleType.Founder) &&
    !hasRole(member as never, RoleType.LeagueManagement) &&
    !hasRole(member as never, RoleType.Referee)
  ) {
    await interaction.editReply({
      embeds: [
        createErrorEmbed(
          "❌ Insufficient Permissions",
          "Only staff can finish matches."
        ),
      ],
    });
    return;
  }

  const matchId = interaction.options.getString("match_id", true);
  const homeScore = interaction.options.getInteger("home_score", true);
  const awayScore = interaction.options.getInteger("away_score", true);

  try {
    const match = await matchService.finishMatch(matchId, {
      homeScore,
      awayScore,
    });

    // ── Auto-post match result news ──
    try {
      const fullMatch = await prisma.match.findUnique({
        where: { id: match.id },
        include: {
          homeTeam: true,
          awayTeam: true,
          goals: { include: { player: { include: { user: true } } } },
          mvps: { include: { player: { include: { user: true } } } },
        },
      });

      if (fullMatch && interaction.guild) {
        const scorers = fullMatch.goals.map(
          (g) => `${g.player.user.username}${g.minute ? ` (${g.minute}')` : ""}`
        );
        const mvp = fullMatch.mvps[0]?.player.user.username;

        await newsService.announceMatchResult(
          interaction.client as ExtendedClient,
          {
            guildId: interaction.guild.id,
            homeTeam: fullMatch.homeTeam.name,
            awayTeam: fullMatch.awayTeam.name,
            homeScore: fullMatch.homeScore,
            awayScore: fullMatch.awayScore,
            scorers,
            mvp,
            matchId: match.id,
          }
        );

        // Check milestones for all goal scorers and MVP
        for (const g of fullMatch.goals) {
          await newsService.checkMilestones(
            interaction.client as ExtendedClient,
            interaction.guild.id,
            g.playerId
          );
        }
        if (fullMatch.mvps[0]) {
          await newsService.checkMilestones(
            interaction.client as ExtendedClient,
            interaction.guild.id,
            fullMatch.mvps[0].playerId
          );
        }
      }
    } catch (newsError) {
      console.error("[Match News Error]", newsError);
      // Non-fatal — match result is still saved
    }

    const winnerText =
      homeScore > awayScore
        ? "🏠 **Home team wins!**"
        : awayScore > homeScore
          ? "🚗 **Away team wins!**"
          : "🤝 **It's a draw!**";

    const embed = new EmbedBuilder()
      .setTitle("✅ Match Finished!")
      .setColor("#00AA00")
      .setDescription(
        `**${match.homeTeamId}** ${match.homeScore} - ${match.awayScore} **${match.awayTeamId}**`
      )
      .addFields(
        { name: "📋 Result", value: winnerText, inline: false },
        { name: "🔢 Match ID", value: match.id.slice(0, 8), inline: true },
        { name: "📊 Status", value: "✅ Finished", inline: true }
      )
      .setFooter({
        text: "Standings have been updated | Legacy Football Championship",
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("[Match Finish Error]", error);
    await interaction.editReply({
      content: "❌ Failed to finish the match. Check the match ID.",
    });
  }
}

export default command;
