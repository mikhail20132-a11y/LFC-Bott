import { SlashCommandBuilder, CommandInteraction, EmbedBuilder } from "discord.js";
import { prisma } from "../../database/prisma.js";
import { leagueService } from "../../services/leagueService.js";
import { newsService } from "../../services/newsService.js";
import { hasRole, RoleType } from "../../utils/permissions.js";
import { createErrorEmbed } from "../../utils/helpers.js";
import type { Command, ExtendedClient } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("potw")
    .setDescription("Award Player of the Week (Management only)")
    .addUserOption((o) => o.setName("player").setDescription("Player").setRequired(true))
    .addIntegerOption((o) => o.setName("week").setDescription("Week number").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(false)),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply();
    if (!hasRole(interaction.member as never, RoleType.Founder) && !hasRole(interaction.member as never, RoleType.LeagueManagement)) {
      await interaction.editReply({ embeds: [createErrorEmbed("❌ Permissions", "Management only.")] }); return;
    }
    const target = interaction.options.getUser("player", true);
    const week = interaction.options.getInteger("week", true);
    const reason = interaction.options.getString("reason");
    const season = await leagueService.getActiveSeason();
    if (!season) { await interaction.editReply({ content: "❌ No active season." }); return; }
    const player = await prisma.player.findUnique({ where: { discordId: target.id }, include: { user: true, team: true } });
    if (!player) { await interaction.editReply({ content: "❌ Player not registered." }); return; }

    const award = await prisma.weeklyAward.create({
      data: { type: "potw", playerId: player.id, seasonId: season.id, weekNumber: week, reason },
    });

    if (interaction.guild) {
      await newsService.announceAward(interaction.client as ExtendedClient, {
        guildId: interaction.guild.id,
        playerName: target.username,
        awardType: `Player of the Week (GW${week})`,
        season: season.name,
        reason: reason ?? undefined,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle("🌟 Player of the Week!")
      .setColor("#00AAFF")
      .setDescription(`**${target.username}** is the Player of the Week for **GW${week}**!`)
      .addFields(
        { name: "👤 Player", value: `<@${target.id}>`, inline: true },
        { name: "🏠 Club", value: player.team?.name ?? "Free Agent", inline: true },
        { name: "⚽ Position", value: player.position, inline: true },
        { name: "📝 Reason", value: reason ?? "Outstanding performance", inline: false },
      )
      .setFooter({ text: `Week ${week} • Legacy Football Championship` }).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  },
};
export default command;