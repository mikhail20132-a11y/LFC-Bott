import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { prisma } from "../../database/prisma.js";
import { hasRole, RoleType } from "../../utils/permissions.js";
import { createSuccessEmbed, createErrorEmbed } from "../../utils/helpers.js";
import type { Command } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("demote")
    .setDescription("Demote a player — removes their leadership role")
    .addUserOption((opt) =>
      opt
        .setName("player")
        .setDescription("The player to demote")
        .setRequired(true)
    ),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply();

    const member = interaction.member as import("discord.js").GuildMember | null;
    if (
      !member ||
      (!hasRole(member, RoleType.Founder) &&
        !hasRole(member, RoleType.LeagueManagement))
    ) {
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            "❌ Insufficient Permissions",
            "You need the **Founder** or **League Management** role to demote players."
          ),
        ],
      });
      return;
    }

    const targetUser = interaction.options.getUser("player", true);

    try {
      const player = await prisma.player.findUnique({
        where: { discordId: targetUser.id },
      });

      if (!player) {
        await interaction.editReply({
          embeds: [
            createErrorEmbed(
              "❌ Player Not Found",
              `${targetUser.username} is not registered as an LFC player.`
            ),
          ],
        });
        return;
      }

      if (!player.roleInTeam || player.roleInTeam === "Starter") {
        await interaction.editReply({
          embeds: [
            createErrorEmbed(
              "❌ No Leadership Role",
              `${targetUser} does not currently hold a leadership role to demote.`
            ),
          ],
        });
        return;
      }

      await prisma.player.update({
        where: { discordId: targetUser.id },
        data: { roleInTeam: "Starter" },
      });

      const embed = createSuccessEmbed(
        "⬇️ Player Demoted",
        `${targetUser} has been demoted to **Starter**.`
      );
      embed.setColor("#FFAA00");

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("[Demote Error]", error);
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            "❌ Error",
            "An error occurred while demoting the player."
          ),
        ],
      });
    }
  },
};

export default command;
