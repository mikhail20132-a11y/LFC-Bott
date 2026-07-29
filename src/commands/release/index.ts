import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { contractService } from "../../services/contractService.js";
import { prisma } from "../../database/prisma.js";
import { createSuccessEmbed, createErrorEmbed, BRAND } from "../../utils/helpers.js";
import type { Command } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("release")
    .setDescription("Release a player from their team back to free agency (Admin only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((opt) =>
      opt.setName("player").setDescription("Player to release").setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const target = interaction.options.getUser("player", true);

    try {
      const player = await contractService.releasePlayer(target.id);

      // Remove team role, add Free Agent
      if (interaction.guild) {
        try {
          const member = await interaction.guild.members.fetch(target.id);
          const faRole = interaction.guild.roles.cache.find(r => r.name === "Free Agent");
          const teamRoles = member.roles.cache.filter(r => r.name === player.team?.name);
          for (const [, role] of teamRoles) {
            await member.roles.remove(role, "LFC Release");
          }
          if (faRole) await member.roles.add(faRole, "LFC Release — Free Agent");
        } catch {}
      }

      const embed = new EmbedBuilder()
        .setTitle("🆓 Player Released")
        .setColor(BRAND.colors.warning)
        .setDescription(`${target} has been released from **${player.team?.name || "their club"}**`)
        .addFields(
          { name: "👤 Player", value: `${target}`, inline: true },
          { name: "📊 Status", value: "🆓 Free Agent", inline: true },
          { name: "⚽ Career", value: `${player.goals}G / ${player.assists}A / ${player.appearances} Apps`, inline: false },
        )
        .setFooter({ text: BRAND.footer })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      // Post to news channel
      if (interaction.guild) {
        try {
          const config = await prisma.guildConfig.findUnique({ where: { guildId: interaction.guild.id } });
          if (config?.newsChannelId) {
            const channel = interaction.guild.channels.cache.get(config.newsChannelId);
            if (channel?.isTextBased()) {
              await channel.send({ embeds: [
                new EmbedBuilder()
                  .setTitle("🆓 Player Released to Free Agency")
                  .setColor(BRAND.colors.warning)
                  .setDescription(`${target} is now a Free Agent`)
                  .setFooter({ text: BRAND.footer }).setTimestamp(),
              ]});
            }
          }
        } catch {}
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      await interaction.editReply({ content: `❌ ${msg}` });
    }
  },
};

export default command;