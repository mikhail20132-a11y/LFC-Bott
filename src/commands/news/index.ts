import {
  SlashCommandBuilder,
  CommandInteraction,
  ChannelType,
  EmbedBuilder,
} from "discord.js";
import { newsService } from "../../services/newsService.js";
import { leagueService } from "../../services/leagueService.js";
import { playerService } from "../../services/playerService.js";
import { matchService } from "../../services/matchService.js";
import { hasRole, RoleType } from "../../utils/permissions.js";
import { createErrorEmbed } from "../../utils/helpers.js";
import type { Command } from "../../types/index.js";

const TYPE_EMOJIS: Record<string, string> = {
  match_result: "⚽",
  transfer: "🔄",
  award: "🏅",
  season_start: "📅",
  season_end: "🏆",
  milestone: "🌟",
  broadcast: "📢",
  weekly_roundup: "📊",
};

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("news")
    .setDescription("News commands — channel, latest, broadcast, and roundup")
    .addSubcommand((sub) =>
      sub
        .setName("setchannel")
        .setDescription("Set the news broadcast channel (Management only)")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("The text channel for news broadcasts")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("latest")
        .setDescription("View the latest LFC news and announcements")
        .addIntegerOption((opt) =>
          opt
            .setName("count")
            .setDescription("Number of articles to show (1-20)")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(20)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("broadcast")
        .setDescription("Send a breaking news broadcast (Management only)")
        .addStringOption((opt) =>
          opt
            .setName("title")
            .setDescription("Broadcast headline")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("message")
            .setDescription("Broadcast message content")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("color")
            .setDescription("Embed color (red, blue, green, gold)")
            .setRequired(false)
            .addChoices(
              { name: "🔴 Red (Urgent)", value: "#FF0000" },
              { name: "🔵 Blue (Info)", value: "#0066FF" },
              { name: "🟢 Green (Positive)", value: "#00AA00" },
              { name: "🟡 Gold (Important)", value: "#FFD700" }
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("roundup")
        .setDescription("Generate a weekly league roundup (Management only)")
    ),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case "setchannel":
        return handleSetChannel(interaction);
      case "latest":
        return handleLatest(interaction);
      case "broadcast":
        return handleBroadcast(interaction);
      case "roundup":
        return handleRoundup(interaction);
      default:
        await interaction.reply({ content: "❌ Unknown subcommand.", ephemeral: true });
    }
  },
};

async function handleSetChannel(interaction: CommandInteraction): Promise<void> {
  await interaction.deferReply();

  const member = interaction.member;
  if (
    !hasRole(member as never, RoleType.Founder) &&
    !hasRole(member as never, RoleType.LeagueManagement)
  ) {
    await interaction.editReply({
      embeds: [
        createErrorEmbed(
          "❌ Insufficient Permissions",
          "You need **Founder** or **League Management** role."
        ),
      ],
    });
    return;
  }

  const channel = interaction.options.getChannel("channel", true);
  if (!interaction.guild) return;

  await newsService.setNewsChannel(interaction.guild.id, channel.id);

  const embed = new EmbedBuilder()
    .setTitle("📢 News Channel Configured!")
    .setColor("#00AA00")
    .setDescription(
      `All auto-news will now be posted in ${channel}.`
    )
    .addFields(
      { name: "📺 Channel", value: `${channel}`, inline: true },
      {
        name: "📋 Auto-Posts Include",
        value: [
          "• ⚽ Match results & highlights",
          "• 🔄 Transfer announcements",
          "• 🏅 Award ceremonies",
          "• 📅 Season start/end",
          "• 🌟 Player milestones",
          "• 📊 Weekly roundups",
          "• 📢 Breaking broadcasts",
        ].join("\n"),
        inline: false,
      }
    )
    .setFooter({ text: "Legacy Football Championship • News System" })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

async function handleLatest(interaction: CommandInteraction): Promise<void> {
  await interaction.deferReply();

  const count = interaction.options.getInteger("count") ?? 5;
  const guildId = interaction.guild?.id;
  if (!guildId) return;

  try {
    const articles = await newsService.getRecentNews(guildId, count);

    const embed = new EmbedBuilder()
      .setTitle("📰 Latest LFC News")
      .setColor("#00AA00");

    if (articles.length > 0) {
      embed.setDescription(
        articles
          .map(
            (a, i) =>
              `${i + 1}. ${TYPE_EMOJIS[a.type] ?? "📰"} **${a.title}**\n` +
              `   ${a.content.slice(0, 100)}${a.content.length > 100 ? "..." : ""}\n` +
              `   🕐 <t:${Math.floor(a.createdAt.getTime() / 1000)}:R>`
          )
          .join("\n\n")
      );
    } else {
      embed.setDescription("No news articles yet. As matches happen, transfers complete, and awards are given, they'll appear here automatically!");
    }

    embed
      .setFooter({
        text: `Showing last ${articles.length || 0} articles • Legacy Football Championship`,
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("[News Latest Error]", error);
    await interaction.editReply({
      content: "❌ An error occurred while fetching news.",
    });
  }
}

async function handleBroadcast(interaction: CommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const member = interaction.member;
  if (
    !hasRole(member as never, RoleType.Founder) &&
    !hasRole(member as never, RoleType.LeagueManagement)
  ) {
    await interaction.editReply({
      embeds: [
        createErrorEmbed(
          "❌ Insufficient Permissions",
          "Only **Founder** or **League Management** can broadcast."
        ),
      ],
    });
    return;
  }

  const title = interaction.options.getString("title", true);
  const message = interaction.options.getString("message", true);
  const color = interaction.options.getString("color") ?? "#FF0000";

  if (!interaction.guild?.id) return;

  try {
    const result = await newsService.announceBroadcast(
      interaction.client as never,
      {
        guildId: interaction.guild.id,
        title,
        message,
        authorName: interaction.user.username,
        color,
      }
    );

    if (result) {
      await interaction.editReply({
        content: `✅ Broadcast sent! [View message](${result.url})`,
      });
    } else {
      await interaction.editReply({
        content: "⚠️ Broadcast published but no news channel is configured. Use `/news setchannel` first.",
      });
    }
  } catch (error) {
    console.error("[Broadcast Error]", error);
    await interaction.editReply({
      content: "❌ Failed to send broadcast. Make sure a news channel is set via `/news setchannel`.",
    });
  }
}

async function handleRoundup(interaction: CommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const member = interaction.member;
  if (
    !hasRole(member as never, RoleType.Founder) &&
    !hasRole(member as never, RoleType.LeagueManagement)
  ) {
    await interaction.editReply({
      embeds: [
        createErrorEmbed(
          "❌ Insufficient Permissions",
          "You need **Founder** or **League Management** role."
        ),
      ],
    });
    return;
  }

  const guildId = interaction.guild?.id;
  if (!guildId) return;

  try {
    const activeSeason = await leagueService.getActiveSeason();
    if (!activeSeason) {
      await interaction.editReply({
        content: "❌ No active season to generate a roundup for.",
      });
      return;
    }

    const standings = await leagueService.getStandings(activeSeason.id);
    const topScorers = await playerService.getTopGoalscorers(5);
    const results = await matchService.getRecentResults(5);

    const result = await newsService.generateWeeklyRoundup(
      interaction.client as never,
      guildId,
      activeSeason.name,
      standings.map((s) => ({
        position: s.position,
        teamName: s.teamName,
        played: s.played,
        wins: s.wins,
        draws: s.draws,
        losses: s.losses,
        points: s.points,
      })),
      topScorers.map((p) => ({
        name: p.user.username,
        goals: p.goals,
        team: p.team?.name,
      })),
      results.map((m) => ({
        homeTeam: m.homeTeam.name,
        awayTeam: m.awayTeam.name,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
      }))
    );

    if (result) {
      await interaction.editReply({
        content: `✅ Weekly roundup published! [View post](${result.url})`,
      });
    } else {
      await interaction.editReply({
        content: "⚠️ Roundup generated but no news channel is configured. Use `/news setchannel` first.",
      });
    }
  } catch (error) {
    console.error("[Roundup Error]", error);
    await interaction.editReply({
      content: "❌ An error occurred while generating the roundup.",
    });
  }
}

export default command;
