import { SlashCommandBuilder, CommandInteraction, EmbedBuilder } from "discord.js";
import { prisma } from "../../database/prisma.js";
import { hasRole, RoleType } from "../../utils/permissions.js";
import { createErrorEmbed } from "../../utils/helpers.js";
import type { Command } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("yellow")
    .setDescription("Log a yellow card during a match")
    .addStringOption((o) => o.setName("match_id").setDescription("Match ID").setRequired(true))
    .addUserOption((o) => o.setName("player").setDescription("Player booked").setRequired(true))
    .addIntegerOption((o) => o.setName("minute").setDescription("Minute").setRequired(false))
    .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(false)),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply();
    if (!hasRole(interaction.member as never, RoleType.Founder) && !hasRole(interaction.member as never, RoleType.LeagueManagement) && !hasRole(interaction.member as never, RoleType.Referee)) {
      await interaction.editReply({ embeds: [createErrorEmbed("❌ Permissions", "Staff only.")] }); return;
    }
    const matchId = interaction.options.getString("match_id", true);
    const target = interaction.options.getUser("player", true);
    const minute = interaction.options.getInteger("minute");
    const reason = interaction.options.getString("reason");
    const player = await prisma.player.findUnique({ where: { discordId: target.id } });
    if (!player) { await interaction.editReply({ content: "❌ Player not registered." }); return; }
    await prisma.matchCard.create({ data: { matchId, playerId: player.id, type: "Yellow", minute, reason } });
    await prisma.player.update({ where: { id: player.id }, data: { yellowCards: { increment: 1 } } });
    const embed = new EmbedBuilder().setTitle("🟨 Yellow Card").setColor("#FFAA00")
      .setDescription(`**<@${target.id}>** has been booked!`)
      .addFields({ name: "🔢 Match", value: matchId.slice(0, 8), inline: true }, { name: "⏱ Minute", value: minute ? `${minute}'` : "N/A", inline: true }, { name: "📝 Reason", value: reason ?? "Foul", inline: false })
      .setFooter({ text: "Legacy Football Championship • Live" }).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  },
};
export default command;