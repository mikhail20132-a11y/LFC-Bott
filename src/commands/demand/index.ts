import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from "discord.js";
import { prisma } from "../../database/prisma.js";
import { createErrorEmbed } from "../../utils/helpers.js";
import type { Command } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("demand")
    .setDescription("Request to be released from your current team (self-service)"),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply({ ephemeral: true });

    const discordId = interaction.user.id;

    try {
      const player = await prisma.player.findUnique({
        where: { discordId },
        include: { team: true, user: true },
      });

      if (!player) {
        await interaction.editReply({
          embeds: [
            createErrorEmbed(
              "❌ Not Registered",
              "You are not registered as a player. Get a team to offer you a contract first."
            ),
          ],
        });
        return;
      }

      if (!player.teamId || !player.team) {
        await interaction.editReply({
          embeds: [
            createErrorEmbed("❌ No Team", "You are not currently assigned to any team."),
          ],
        });
        return;
      }

      const previousTeam = player.team;

      // Release the player
      await prisma.player.update({
        where: { id: player.id },
        data: { teamId: null, roleInTeam: null },
      });

      await prisma.contract.updateMany({
        where: { playerId: player.id, isActive: true },
        data: { isActive: false },
      });

      // Role swap
      if (interaction.guild) {
        try {
          const member = await interaction.guild.members.fetch(discordId);
          const faRole = interaction.guild.roles.cache.find((r) => r.name === "Free Agent");

          const teamRoles = member.roles.cache.filter((r) =>
            r.name.toLowerCase() === previousTeam.name.toLowerCase()
          );
          for (const [, role] of teamRoles) {
            await member.roles.remove(role, "LFC Demand — self-release");
          }
          if (faRole) {
            await member.roles.add(faRole, "LFC Demand — Free Agent");
          }
        } catch (_) {
          // Non-critical
        }
      }

      // ─── POST TO DEMANDS CHANNEL (if configured) ───
      if (interaction.guild) {
        try {
          const config = await prisma.guildConfig.findUnique({
            where: { guildId: interaction.guild.id },
          });
          if (config?.demandsChannelId) {
            const demandsChannel = interaction.guild.channels.cache.get(config.demandsChannelId);
            if (demandsChannel && demandsChannel.isTextBased()) {
              const publicEmbed = new EmbedBuilder()
                .setTitle("📢 Transfer Demand")
                .setColor(0xf59e0b)
                .setDescription(
                  `<@${discordId}> has demanded a transfer from **${previousTeam.emoji || ""} ${previousTeam.name}** and is now a **Free Agent** 🆓`
                )
                .addFields(
                  {
                    name: "👤 Player",
                    value: `<@${discordId}> \`${player.user?.username || "Unknown"}\``,
                    inline: true,
                  },
                  {
                    name: "🏟️ Former Team",
                    value: `${previousTeam.emoji || ""} ${previousTeam.name}`,
                    inline: true,
                  },
                  { name: "📊 Status", value: "🆓 Free Agent", inline: true },
                  {
                    name: "⚽ Career Stats",
                    value: `${player.goals}G / ${player.assists}A / ${player.mvps} MVP / ${player.appearances} Apps`,
                    inline: false,
                  },
                )
                .setFooter({
                  text: "Legacy Football Championship • Transfer Market",
                })
                .setTimestamp();

              await demandsChannel.send({ embeds: [publicEmbed] });
            }
          }
        } catch {
          // Non-critical
        }
      }

      // ─── EPHEMERAL CONFIRMATION TO USER ───
      const userEmbed = new EmbedBuilder()
        .setTitle("📢 Demand Submitted")
        .setColor(0xf59e0b)
        .setDescription(
          `You have been released from **${previousTeam.emoji || ""} ${previousTeam.name}** and are now a **Free Agent**.`
        )
        .addFields(
          { name: "👤 Player", value: `<@${discordId}>`, inline: true },
          { name: "🏟️ Previous Team", value: previousTeam.name, inline: true },
          { name: "📊 Status", value: "🆓 Free Agent", inline: true },
          {
            name: "⚽ Career Stats",
            value: `${player.goals}G / ${player.assists}A / ${player.mvps} MVP / ${player.appearances} Apps`,
            inline: false,
          },
        )
        .setFooter({ text: "Legacy Football Championship • Transfers" })
        .setTimestamp();

      await interaction.editReply({ embeds: [userEmbed] });
    } catch (error) {
      console.error("[Demand Error]", error);
      await interaction.editReply({
        content: "❌ An error occurred while processing your demand.",
      });
    }
  },
};

export default command;
