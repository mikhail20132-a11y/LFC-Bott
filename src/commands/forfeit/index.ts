import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { prisma } from "../../database/prisma.js";
import { matchService } from "../../services/matchService.js";
import { newsService } from "../../services/newsService.js";
import { predictionService } from "../../services/predictionService.js";
import { hasRole, RoleType } from "../../utils/permissions.js";
import { createErrorEmbed } from "../../utils/helpers.js";
import type { Command, ExtendedClient } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("forfeit")
    .setDescription("Log a 3-0 default win if a team fails to show (Management only)")
    .addStringOption((o) => o.setName("match_id").setDescription("Match ID").setRequired(true))
    .addStringOption((o) => o.setName("winner").setDescription("Winning team name").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Forfeit reason").setRequired(false)),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply();

    if (!hasRole(interaction.member as never, RoleType.Founder) && !hasRole(interaction.member as never, RoleType.LeagueManagement)) {
      await interaction.editReply({ embeds: [createErrorEmbed("❌ Permissions", "Management only.")] }); return;
    }

    const matchId = interaction.options.getString("match_id", true);
    const winnerName = interaction.options.getString("winner", true);
    const reason = interaction.options.getString("reason") ?? "Team failed to show";

    try {
      const match = await prisma.match.findUnique({
        where: { id: matchId },
        include: { homeTeam: true, awayTeam: true },
      });
      if (!match) { await interaction.editReply({ content: "❌ Match not found." }); return; }

      const isHomeWin = match.homeTeam.name.toLowerCase() === winnerName.toLowerCase();
      const homeScore = isHomeWin ? 3 : 0;
      const awayScore = isHomeWin ? 0 : 3;

      await prisma.match.update({
        where: { id: matchId },
        data: { status: "Forfeit", homeScore, awayScore, forfeit: true, forfeitingTeam: isHomeWin ? "away" : "home" },
      });

      // Update standings as if finished
      await matchService["updateTeamStatsAfterMatch"]({
        id: matchId, homeTeamId: match.homeTeamId, awayTeamId: match.awayTeamId,
        homeScore, awayScore, seasonId: match.seasonId,
      });

      await predictionService.resolvePredictions(matchId);

      if (interaction.guild) {
        await newsService.announceMatchResult(interaction.client as ExtendedClient, {
          guildId: interaction.guild.id,
          homeTeam: match.homeTeam.name,
          awayTeam: match.awayTeam.name,
          homeScore, awayScore,
          scorers: ["Default win (forfeit)"],
          mvp: undefined,
          matchId,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("⚖️ Forfeit — Default Win")
        .setColor("#FF0000")
        .setDescription(`**${match.homeTeam.name}** ${homeScore} - ${awayScore} **${match.awayTeam.name}**`)
        .addFields(
          { name: "✅ Winner", value: isHomeWin ? match.homeTeam.name : match.awayTeam.name, inline: true },
          { name: "📝 Reason", value: reason, inline: false },
          { name: "📊 Status", value: "⚖️ Forfeit", inline: true },
        )
        .setFooter({ text: "Legacy Football Championship" }).setTimestamp();
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("[Forfeit Error]", error);
      await interaction.editReply({ content: "❌ Failed to process forfeit." });
    }
  },
};
export default command;