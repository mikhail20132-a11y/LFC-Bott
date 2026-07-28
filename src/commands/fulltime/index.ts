import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { matchService } from "../../services/matchService.js";
import { prisma } from "../../database/prisma.js";
import { newsService } from "../../services/newsService.js";
import { predictionService } from "../../services/predictionService.js";
import { hasRole, RoleType } from "../../utils/permissions.js";
import { createErrorEmbed } from "../../utils/helpers.js";
import type { Command, ExtendedClient } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("fulltime")
    .setDescription("Conclude a match — freeze log, update standings, post result")
    .addStringOption((o) => o.setName("match_id").setDescription("Match ID").setRequired(true))
    .addIntegerOption((o) => o.setName("home_score").setDescription("Home score").setRequired(true).setMinValue(0))
    .addIntegerOption((o) => o.setName("away_score").setDescription("Away score").setRequired(true).setMinValue(0))
    .addUserOption((o) => o.setName("motm").setDescription("Man of the Match").setRequired(false)),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply();

    if (!hasRole(interaction.member as never, RoleType.Founder) && !hasRole(interaction.member as never, RoleType.LeagueManagement) && !hasRole(interaction.member as never, RoleType.Referee)) {
      await interaction.editReply({ embeds: [createErrorEmbed("❌ Permissions", "Staff only.")] }); return;
    }

    const matchId = interaction.options.getString("match_id", true);
    const homeScore = interaction.options.getInteger("home_score", true);
    const awayScore = interaction.options.getInteger("away_score", true);
    const motmUser = interaction.options.getUser("motm");

    try {
      const match = await matchService.finishMatch(matchId, { homeScore, awayScore });

      // Record MOTM
      if (motmUser) {
        const motmPlayer = await prisma.player.findUnique({ where: { discordId: motmUser.id } });
        if (motmPlayer) {
          await prisma.matchMvp.create({ data: { matchId, playerId: motmPlayer.id, reason: "Man of the Match" } });
          await prisma.player.update({ where: { id: motmPlayer.id }, data: { mvps: { increment: 1 } } });
        }
      }

      // Resolve predictions
      await predictionService.resolvePredictions(matchId);

      // Auto-post news
      const fullMatch = await prisma.match.findUnique({
        where: { id: match.id },
        include: {
          homeTeam: true, awayTeam: true,
          goals: { include: { player: { include: { user: true } } } },
          mvps: { include: { player: { include: { user: true } } } },
        },
      });

      if (fullMatch && interaction.guild) {
        const scorers = fullMatch.goals.map((g) => `${g.player.user.username}${g.minute ? ` (${g.minute}')` : ""}`);
        const mvp = fullMatch.mvps[0]?.player.user.username;
        await newsService.announceMatchResult(interaction.client as ExtendedClient, {
          guildId: interaction.guild.id,
          homeTeam: fullMatch.homeTeam.name,
          awayTeam: fullMatch.awayTeam.name,
          homeScore: fullMatch.homeScore,
          awayScore: fullMatch.awayScore,
          scorers, mvp, matchId: match.id,
        });
        for (const g of fullMatch.goals) await newsService.checkMilestones(interaction.client as ExtendedClient, interaction.guild.id, g.playerId);
        if (fullMatch.mvps[0]) await newsService.checkMilestones(interaction.client as ExtendedClient, interaction.guild.id, fullMatch.mvps[0].playerId);
      }

      // Archive thread
      if (fullMatch?.threadId && interaction.channel) {
        try {
          const thread = await interaction.channel.client.channels.fetch(fullMatch.threadId);
          if (thread?.isThread()) await thread.setArchived(true);
        } catch { /* ok */ }
      }

      const result = homeScore > awayScore ? "🏠 Home Win" : awayScore > homeScore ? "🚗 Away Win" : "🤝 Draw";
      const embed = new EmbedBuilder()
        .setTitle("✅ Full-Time!")
        .setColor("#00AA00")
        .setDescription(`**${match.homeTeamId}** ${homeScore} - ${awayScore} **${match.awayTeamId}**\n\n📊 **${result}**`)
        .addFields(
          { name: "🏆 MOTM", value: motmUser ? `<@${motmUser.id}>` : "Not selected", inline: true },
          { name: "📊 Status", value: "✅ Finished", inline: true },
        )
        .setFooter({ text: "Standings & predictions updated • Legacy Football Championship" }).setTimestamp();
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("[Fulltime Error]", error);
      await interaction.editReply({ content: "❌ Failed to conclude match." });
    }
  },
};
export default command;