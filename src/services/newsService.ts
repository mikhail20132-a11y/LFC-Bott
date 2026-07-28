import {
  EmbedBuilder,
  TextChannel,
  Guild,
  Message,
  hyperlink,
} from "discord.js";
import { prisma } from "../database/prisma.js";
import type { ExtendedClient } from "../types/index.js";

type NewsType =
  | "match_result"
  | "transfer"
  | "award"
  | "season_start"
  | "season_end"
  | "milestone"
  | "broadcast"
  | "weekly_roundup";

interface NewsPayload {
  type: NewsType;
  guildId: string;
  title: string;
  content: string;
  embeds?: EmbedBuilder[];
  imageUrl?: string;
}

export class NewsService {
  /**
   * Get the configured news channel for a guild.
   */
  async getNewsChannel(guild: Guild): Promise<TextChannel | null> {
    const config = await prisma.guildConfig.findUnique({
      where: { guildId: guild.id },
    });

    if (!config?.newsChannelId) return null;

    const channel = guild.channels.cache.get(config.newsChannelId);
    if (channel instanceof TextChannel) return channel;

    // Try fetching if not cached
    try {
      const fetched = await guild.channels.fetch(config.newsChannelId);
      if (fetched instanceof TextChannel) return fetched;
    } catch {
      return null;
    }

    return null;
  }

  /**
   * Set the news channel for a guild.
   */
  async setNewsChannel(guildId: string, channelId: string) {
    return prisma.guildConfig.upsert({
      where: { guildId },
      update: { newsChannelId: channelId },
      create: { guildId, newsChannelId: channelId },
    });
  }

  /**
   * Publish a news article to the configured channel and database.
   */
  async publish(client: ExtendedClient, payload: NewsPayload): Promise<Message | null> {
    const guild = client.guilds.cache.get(payload.guildId);
    if (!guild) return null;

    const channel = await this.getNewsChannel(guild);
    if (!channel) return null;

    const embed = new EmbedBuilder()
      .setTitle(payload.title)
      .setDescription(payload.content)
      .setColor(this.getColorForType(payload.type))
      .setFooter({
        text: `Legacy Football Championship • ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`,
      })
      .setTimestamp();

    // If additional embeds were provided, use the first one instead
    const finalEmbeds = payload.embeds ?? [embed];

    if (payload.imageUrl) {
      finalEmbeds[0]?.setImage(payload.imageUrl);
    }

    // Send to channel
    const message = await channel.send({ embeds: finalEmbeds });

    // Store in database
    await prisma.newsArticle.create({
      data: {
        guildId: payload.guildId,
        type: payload.type,
        title: payload.title,
        content: payload.content,
        messageId: message.id,
        channelId: channel.id,
      },
    });

    return message;
  }

  /**
   * Auto-post a match result.
   */
  async announceMatchResult(
    client: ExtendedClient,
    data: {
      guildId: string;
      homeTeam: string;
      awayTeam: string;
      homeScore: number;
      awayScore: number;
      scorers?: string[];
      mvp?: string;
      matchId: string;
    }
  ) {
    const isDraw = data.homeScore === data.awayScore;
    const homeWin = data.homeScore > data.awayScore;

    const emoji = isDraw ? "🤝" : homeWin ? "🏠" : "🚗";
    const resultText = isDraw
      ? "Draw!"
      : homeWin
        ? `${data.homeTeam} wins!`
        : `${data.awayTeam} wins!`;

    const embed = new EmbedBuilder()
      .setTitle(`⚽ Full-Time: ${data.homeTeam} vs ${data.awayTeam}`)
      .setColor(isDraw ? "#FFAA00" : homeWin ? "#00AA00" : "#0066CC")
      .setDescription(
        `**${data.homeTeam}** ${data.homeScore} - ${data.awayScore} **${data.awayTeam}**\n\n${emoji} **${resultText}**`
      )
      .addFields(
        {
          name: "⚽ Scorers",
          value: data.scorers?.length
            ? data.scorers.join("\n")
            : "No goals recorded",
          inline: true,
        },
        {
          name: "🏆 MVP",
          value: data.mvp ?? "Not selected",
          inline: true,
        }
      )
      .setFooter({
        text: `Match ID: ${data.matchId.slice(0, 8)} • Legacy Football Championship`,
      })
      .setTimestamp();

    return this.publish(client, {
      type: "match_result",
      guildId: data.guildId,
      title: `⚽ Match Result: ${data.homeTeam} ${data.homeScore} - ${data.awayScore} ${data.awayTeam}`,
      content: `${emoji} **${resultText}**\n\n**${data.homeTeam}** ${data.homeScore} - ${data.awayScore} **${data.awayTeam}**`,
      embeds: [embed],
    });
  }

  /**
   * Auto-post a transfer announcement.
   */
  async announceTransfer(
    client: ExtendedClient,
    data: {
      guildId: string;
      playerName: string;
      fromTeam: string;
      toTeam: string;
      fee?: string;
    }
  ) {
    const embed = new EmbedBuilder()
      .setTitle("🔄 Transfer Complete!")
      .setColor("#00AA00")
      .setDescription(
        `**${data.playerName}** has completed a move!`
      )
      .addFields(
        { name: "➡️ From", value: data.fromTeam, inline: true },
        { name: "🏠 To", value: data.toTeam, inline: true },
        {
          name: "💰 Fee",
          value: data.fee ?? "Free Transfer",
          inline: true,
        }
      )
      .setFooter({ text: "Legacy Football Championship • Transfer Window" })
      .setTimestamp();

    return this.publish(client, {
      type: "transfer",
      guildId: data.guildId,
      title: `🔄 ${data.playerName} joins ${data.toTeam}`,
      content: `${data.playerName} has moved from ${data.fromTeam} to ${data.toTeam}${data.fee ? ` for ${data.fee}` : " on a free transfer"}.`,
      embeds: [embed],
    });
  }

  /**
   * Auto-post an award announcement.
   */
  async announceAward(
    client: ExtendedClient,
    data: {
      guildId: string;
      playerName: string;
      awardType: string;
      season: string;
      reason?: string;
    }
  ) {
    const awardEmojis: Record<string, string> = {
      "Golden Boot": "🥾",
      "Golden Boy": "🌟",
      "Best Playmaker": "🎯",
      "Player of the Season": "👑",
      "Team of the Season": "🏅",
      "Manager of the Season": "📋",
    };

    const emoji = awardEmojis[data.awardType] ?? "🏅";

    const embed = new EmbedBuilder()
      .setTitle(`${emoji} ${data.awardType} Awarded!`)
      .setColor("#FFD700")
      .setDescription(
        `**${data.playerName}** has been awarded **${data.awardType}**!`
      )
      .addFields(
        { name: "🏅 Award", value: data.awardType, inline: true },
        { name: "📅 Season", value: data.season, inline: true },
        { name: "📝 Reason", value: data.reason ?? "Outstanding performance", inline: false }
      )
      .setFooter({ text: "Legacy Football Championship • Awards" })
      .setTimestamp();

    return this.publish(client, {
      type: "award",
      guildId: data.guildId,
      title: `${emoji} ${data.awardType}: ${data.playerName}`,
      content: `**${data.playerName}** has won the **${data.awardType}** award for ${data.season}!`,
      embeds: [embed],
    });
  }

  /**
   * Announce season start.
   */
  async announceSeasonStart(
    client: ExtendedClient,
    data: {
      guildId: string;
      seasonName: string;
      teamCount: number;
    }
  ) {
    const embed = new EmbedBuilder()
      .setTitle("📅 New Season Begins!")
      .setColor("#00AA00")
      .setDescription(
        `**${data.seasonName}** is officially underway!`
      )
      .addFields(
        { name: "📋 Season", value: data.seasonName, inline: true },
        { name: "🏟️ Teams", value: `${data.teamCount} teams competing`, inline: true },
        {
          name: "🎯 What to Expect",
          value: [
            "• Exciting matches every week",
            "• Intense title race",
            "• Individual awards up for grabs",
            "• Transfer window action",
          ].join("\n"),
          inline: false,
        }
      )
      .setFooter({ text: "Legacy Football Championship" })
      .setTimestamp();

    return this.publish(client, {
      type: "season_start",
      guildId: data.guildId,
      title: `📅 ${data.seasonName} has begun!`,
      content: `The **${data.seasonName}** of Legacy Football Championship is now LIVE with **${data.teamCount} teams** competing for glory!`,
      embeds: [embed],
    });
  }

  /**
   * Announce season end with champion.
   */
  async announceSeasonEnd(
    client: ExtendedClient,
    data: {
      guildId: string;
      seasonName: string;
      championName?: string;
      championPoints?: number;
    }
  ) {
    const embed = new EmbedBuilder()
      .setTitle("🏆 Season Over!")
      .setColor("#FFD700")
      .setDescription(`**${data.seasonName}** has concluded!`);

    if (data.championName) {
      embed.addFields(
        {
          name: "👑 Champions",
          value: `**${data.championName}**${data.championPoints ? ` — ${data.championPoints} points` : ""}`,
          inline: false,
        },
        {
          name: "🎊 Congratulations!",
          value: `A huge congratulations to **${data.championName}** for winning ${data.seasonName}!`,
          inline: false,
        }
      );
    }

    embed
      .addFields({
        name: "🏅 Awards Ceremony",
        value: "Use `/award give` to distribute season awards before the next season begins.",
        inline: false,
      })
      .setFooter({ text: "Legacy Football Championship" })
      .setTimestamp();

    return this.publish(client, {
      type: "season_end",
      guildId: data.guildId,
      title: `🏆 ${data.seasonName} has ended!`,
      content: data.championName
        ? `**${data.championName}** are the champions of ${data.seasonName}!`
        : `${data.seasonName} has come to a close.`,
      embeds: [embed],
    });
  }

  /**
   * Announce a player milestone.
   */
  async announceMilestone(
    client: ExtendedClient,
    data: {
      guildId: string;
      playerName: string;
      teamName?: string;
      milestone: string; // e.g. "10 Goals", "50 Appearances", "5 MVPs"
      stat: string;
    }
  ) {
    const embed = new EmbedBuilder()
      .setTitle("🌟 Milestone Achieved!")
      .setColor("#00AA00")
      .setDescription(
        `**${data.playerName}** has reached a career milestone!`
      )
      .addFields(
        { name: "👤 Player", value: data.playerName, inline: true },
        { name: "🎯 Milestone", value: data.milestone, inline: true },
        {
          name: "🏠 Team",
          value: data.teamName ?? "Free Agent",
          inline: true,
        },
        {
          name: "📈 Career Stats",
          value: data.stat,
          inline: false,
        }
      )
      .setFooter({ text: "Legacy Football Championship • Milestones" })
      .setTimestamp();

    return this.publish(client, {
      type: "milestone",
      guildId: data.guildId,
      title: `🌟 ${data.playerName} — ${data.milestone}!`,
      content: `**${data.playerName}** has achieved **${data.milestone}** in their LFC career!`,
      embeds: [embed],
    });
  }

  /**
   * Announce a breaking news broadcast from management.
   */
  async announceBroadcast(
    client: ExtendedClient,
    data: {
      guildId: string;
      title: string;
      message: string;
      authorName: string;
      color?: string;
    }
  ) {
    const embed = new EmbedBuilder()
      .setTitle(`📢 ${data.title}`)
      .setColor((data.color as never) ?? "#FF0000")
      .setDescription(data.message)
      .setFooter({
        text: `Posted by ${data.authorName} • Legacy Football Championship`,
      })
      .setTimestamp();

    return this.publish(client, {
      type: "broadcast",
      guildId: data.guildId,
      title: `📢 ${data.title}`,
      content: data.message,
      embeds: [embed],
    });
  }

  /**
   * Generate a weekly roundup embed.
   */
  async generateWeeklyRoundup(
    client: ExtendedClient,
    guildId: string,
    seasonName: string,
    standings: Array<{
      position: number;
      teamName: string;
      played: number;
      wins: number;
      draws: number;
      losses: number;
      points: number;
    }>,
    topScorers: Array<{
      name: string;
      goals: number;
      team?: string;
    }>,
    recentMatches: Array<{
      homeTeam: string;
      awayTeam: string;
      homeScore: number;
      awayScore: number;
    }>
  ) {
    // Build standings snippet
    const top3 = standings.slice(0, 3);
    const standingsText = top3.length
      ? top3
          .map(
            (s) =>
              `${getMedalEmoji(s.position)} **${s.teamName}** — ${s.points}pts (${s.wins}W / ${s.draws}D / ${s.losses}L)`
          )
          .join("\n")
      : "No standings data yet.";

    // Build scorers snippet
    const scorersText = topScorers.length
      ? topScorers
          .slice(0, 5)
          .map((s, i) => `${i + 1}. **${s.name}**${s.team ? ` (${s.team})` : ""} — ${s.goals}G`)
          .join("\n")
      : "No scorers data yet.";

    // Build results snippet
    const resultsText = recentMatches.length
      ? recentMatches
          .slice(0, 5)
          .map((m) => `**${m.homeTeam}** ${m.homeScore} - ${m.awayScore} **${m.awayTeam}**`)
          .join("\n")
      : "No recent matches.";

    const embed = new EmbedBuilder()
      .setTitle("📊 Weekly Roundup")
      .setColor("#00AA00")
      .setDescription(`**${seasonName}** — Weekly summary of league action.`)
      .addFields(
        {
          name: "🏆 Top 3 Standings",
          value: standingsText,
          inline: false,
        },
        {
          name: "⚽ Top Goalscorers",
          value: scorersText,
          inline: true,
        },
        {
          name: "📋 Recent Results",
          value: resultsText,
          inline: true,
        }
      )
      .setFooter({ text: "Legacy Football Championship • Weekly Roundup" })
      .setTimestamp();

    return this.publish(client, {
      type: "weekly_roundup",
      guildId,
      title: "📊 Weekly Roundup",
      content: `Here's your weekly roundup of **${seasonName}** action!`,
      embeds: [embed],
    });
  }

  /**
   * Get news history for a guild.
   */
  async getRecentNews(guildId: string, limit = 10) {
    return prisma.newsArticle.findMany({
      where: { guildId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  /**
   * Check and announce player milestones.
   * Called after a match updates player stats.
   */
  async checkMilestones(
    client: ExtendedClient,
    guildId: string,
    playerId: string
  ) {
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      include: { user: true, team: true },
    });

    if (!player) return;

    const milestones: Array<{ name: string; threshold: number; format: string }> = [
      { name: "Goals", threshold: 10, format: `${player.goals} Goals` },
      { name: "Goals", threshold: 25, format: `${player.goals} Goals` },
      { name: "Goals", threshold: 50, format: `${player.goals} Goals` },
      { name: "Assists", threshold: 10, format: `${player.assists} Assists` },
      { name: "Assists", threshold: 25, format: `${player.assists} Assists` },
      { name: "MVPs", threshold: 5, format: `${player.mvps} MVPs` },
      { name: "MVPs", threshold: 10, format: `${player.mvps} MVPs` },
      { name: "Appearances", threshold: 10, format: `${player.appearances} Appearances` },
      { name: "Appearances", threshold: 25, format: `${player.appearances} Appearances` },
      { name: "Appearances", threshold: 50, format: `${player.appearances} Appearances` },
      { name: "Appearances", threshold: 100, format: `${player.appearances} Appearances` },
    ];

    for (const milestone of milestones) {
      const current =
        milestone.name === "Goals"
          ? player.goals
          : milestone.name === "Assists"
            ? player.assists
            : milestone.name === "MVPs"
              ? player.mvps
              : player.appearances;

      if (current === milestone.threshold) {
        // Check if we already announced this milestone
        const alreadyAnnounced = await prisma.newsArticle.findFirst({
          where: {
            guildId,
            type: "milestone",
            content: { contains: `${milestone.format}` },
            title: { contains: player.user.username },
          },
        });

        if (!alreadyAnnounced) {
          const statLine = `⚽ ${player.goals}G | 🎯 ${player.assists}A | 🏆 ${player.mvps} MVP | 📋 ${player.appearances} Apps`;
          await this.announceMilestone(client, {
            guildId,
            playerName: player.user.username,
            teamName: player.team?.name,
            milestone: milestone.format,
            stat: statLine,
          });
        }
      }
    }
  }

  private getColorForType(type: NewsType): number {
    const colors: Record<NewsType, number> = {
      match_result: 0x00aa00,
      transfer: 0x0099ff,
      award: 0xffd700,
      season_start: 0x00aa00,
      season_end: 0xffd700,
      milestone: 0x00aaff,
      broadcast: 0xff0000,
      weekly_roundup: 0x00aa00,
    };
    return colors[type] ?? 0x00aa00;
  }
}

function getMedalEmoji(position: number): string {
  switch (position) {
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

export const newsService = new NewsService();