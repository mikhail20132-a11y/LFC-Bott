import { SlashCommandBuilder, CommandInteraction, EmbedBuilder } from "discord.js";
import { prisma } from "../../database/prisma.js";
import { hasRole, RoleType } from "../../utils/permissions.js";
import { createErrorEmbed } from "../../utils/helpers.js";
import type { Command } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("assist")
    .setDescription("Quick log an assist during a live match")
    .addStringOption((o) => o.setName("match_id").setDescription("Match ID").setRequired(true))
    .addUserOption((o) => o.setName("player").setDescription("Player who assisted").setRequired(true))
    .addIntegerOption((o) => o.setName("minute").setDescription("Minute").setRequired(false)),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply();
    if (!hasRole(interaction.member as never, RoleType.Founder) && !hasRole(interaction.member as never, RoleType.LeagueManagement) && !hasRole(interaction.member as never, RoleType.Referee)) {
      await interaction.editReply({ embeds: [createErrorEmbed("❌ Permissions", "Staff only.")] }); return;
    }
    const matchId = interaction.options.getString("match_id", true);
    const target = interaction.options.getUser("player", true);
    const minute = interaction.options.getInteger("minute");
    const player = await prisma.player.findUnique({ where: { discordId: target.id } });
    if (!player) { await interaction.editReply({ content: "❌ Player not registered." }); return; }
    await prisma.matchAssist.create({ data: { matchId, playerId: player.id, minute } });
    await prisma.player.update({ where: { id: player.id }, data: { assists: { increment: 1 } } });
    const embed = new EmbedBuilder().setTitle("🎯 Assist Logged").setColor("#00AAFF")
      .setDescription(`**<@${target.id}>** provided the assist!`)
      .addFields({ name: "🔢 Match", value: matchId.slice(0, 8), inline: true }, { name: "⏱ Minute", value: minute ? `${minute}'` : "N/A", inline: true })
      .setFooter({ text: "Legacy Football Championship • Live" }).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  },
};
export default command;