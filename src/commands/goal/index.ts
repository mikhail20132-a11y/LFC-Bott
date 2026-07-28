import { SlashCommandBuilder, CommandInteraction, EmbedBuilder } from "discord.js";
import { prisma } from "../../database/prisma.js";
import { hasRole, RoleType } from "../../utils/permissions.js";
import { createErrorEmbed } from "../../utils/helpers.js";
import type { Command, ExtendedClient } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("goal")
    .setDescription("Quick log a goal during a live match")
    .addStringOption((o) => o.setName("match_id").setDescription("Match ID").setRequired(true))
    .addUserOption((o) => o.setName("scorer").setDescription("Player who scored").setRequired(true))
    .addUserOption((o) => o.setName("assist").setDescription("Player who assisted").setRequired(false))
    .addIntegerOption((o) => o.setName("minute").setDescription("Minute scored").setRequired(false)),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply();
    if (!hasRole(interaction.member as never, RoleType.Founder) && !hasRole(interaction.member as never, RoleType.LeagueManagement) && !hasRole(interaction.member as never, RoleType.Referee)) {
      await interaction.editReply({ embeds: [createErrorEmbed("❌ Permissions", "Staff only.")] }); return;
    }

    const matchId = interaction.options.getString("match_id", true);
    const scorer = interaction.options.getUser("scorer", true);
    const assist = interaction.options.getUser("assist");
    const minute = interaction.options.getInteger("minute");

    const player = await prisma.player.findUnique({ where: { discordId: scorer.id } });
    if (!player) { await interaction.editReply({ content: "❌ Scorer not registered." }); return; }

    await prisma.matchGoal.create({ data: { matchId, playerId: player.id, minute } });
    await prisma.player.update({ where: { id: player.id }, data: { goals: { increment: 1 }, appearances: { increment: 1 } } });
    await updatePlayerSeasonStat(player.id, matchId, "goals");

    let assistText = "";
    if (assist) {
      const aPlayer = await prisma.player.findUnique({ where: { discordId: assist.id } });
      if (aPlayer) {
        await prisma.matchAssist.create({ data: { matchId, playerId: aPlayer.id, minute } });
        await prisma.player.update({ where: { id: aPlayer.id }, data: { assists: { increment: 1 } } });
        assistText = `\n🎯 **Assist:** <@${assist.id}>`;
      }
    }

    const embed = new EmbedBuilder()
      .setTitle("⚽ GOAL!")
      .setColor("#00AA00")
      .setDescription(`**<@${scorer.id}>** scores!${assistText}`)
      .addFields(
        { name: "🔢 Match", value: matchId.slice(0, 8), inline: true },
        { name: "⏱ Minute", value: minute ? `${minute}'` : "N/A", inline: true },
      )
      .setFooter({ text: "Legacy Football Championship • Live" }).setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};

async function updatePlayerSeasonStat(playerId: string, matchId: string, field: string) {
  const match = await prisma.match.findUnique({ where: { id: matchId }, select: { seasonId: true } });
  if (!match) return;
  const stat = await prisma.playerSeasonStats.findUnique({
    where: { playerId_seasonId: { playerId, seasonId: match.seasonId } },
  });
  if (stat) {
    await prisma.playerSeasonStats.update({ where: { id: stat.id }, data: { [field]: { increment: 1 } } });
  }
}

export default command;