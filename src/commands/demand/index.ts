import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
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
      // Find the player by their Discord ID
      const player = await prisma.player.findUnique({
        where: { discordId },
        include: { team: true },
      });

      if (!player) {
        await interaction.editReply({
          embeds: [
            createErrorEmbed(
              "❌ Not Registered",
              "You are not registered as a player. Use `/offer` to sign up first."
            ),
          ],
        });
        return;
      }

      if (!player.teamId || !player.team) {
        await interaction.editReply({
          embeds: [
            createErrorEmbed(
              "❌ No Team",
              "You are not currently assigned to any team."
            ),
          ],
        });
        return;
      }

      const previousTeam = player.team;

      // Release the player: set teamId to null
      await prisma.player.update({
        where: { id: player.id },
        data: { teamId: null, roleInTeam: null },
      });

      // Deactivate active contracts
      await prisma.contract.updateMany({
        where: { playerId: player.id, isActive: true },
        data: { isActive: false },
      });

      // Swap roles: remove team role → add Free Agent
      if (interaction.guild) {
        try {
          const member = await interaction.guild.members.fetch(discordId);
          const faRole = interaction.guild.roles.cache.find(
            (r) => r.name === "Free Agent"
          );

          // Remove team-specific roles
          const teamRoles = member.roles.cache.filter((r) =>
            r.name.toLowerCase() === previousTeam.name.toLowerCase()
          );
          for (const [, role] of teamRoles) {
            await member.roles.remove(role, "LFC Demand — self-release");
          }

          // Add Free Agent role if it exists
          if (faRole) {
            await member.roles.add(faRole, "LFC Demand — Free Agent");
          }
        } catch (_) {
          // Non-critical — role operations may fail without perms
        }
      }

      const embed = new EmbedBuilder()
        .setTitle("📢 Transfer Demand Submitted")
        .setColor("#FFAA00")
        .setDescription(
          `You have successfully demanded a transfer and are now a free agent.`
        )
        .addFields(
          { name: "👤 Player", value: `<@${discordId}>`, inline: true },
          {
            name: "🏟️ Previous Team",
            value: previousTeam.name,
            inline: true,
          },
          {
            name: "📊 Status",
            value: "🆓 Free Agent",
            inline: true,
          },
          {
            name: "⚽ Career Stats",
            value: `${player.goals}G / ${player.assists}A / ${player.mvps} MVP / ${player.appearances} Apps`,
            inline: false,
          }
        )
        .setFooter({
          text: "Legacy Football Championship • Transfers",
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("[Demand Error]", error);
      await interaction.editReply({
        content: "❌ An error occurred while processing your demand.",
      });
    }
  },
};

export default command;
