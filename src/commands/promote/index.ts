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
    .setName("promote")
    .setDescription("Promote a player to a leadership role (Captain / Vice Captain)")
    .addUserOption((opt) =>
      opt
        .setName("player")
        .setDescription("The player to promote")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("role")
        .setDescription("Leadership role to assign")
        .setRequired(true)
        .addChoices(
          { name: "Captain", value: "Captain" },
          { name: "Vice Captain", value: "Vice Captain" }
        )
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
            "You need the **Founder** or **League Management** role to promote players."
          ),
        ],
      });
      return;
    }

    const targetUser = interaction.options.getUser("player", true);
    const roleValue = interaction.options.getString("role", true) as
      | "Captain"
      | "Vice Captain";

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

      await prisma.player.update({
        where: { discordId: targetUser.id },
        data: { roleInTeam: roleValue },
      });

      const embed = createSuccessEmbed(
        "✅ Player Promoted",
        `${targetUser} has been promoted to **${roleValue}**!`
      );
      embed.setColor("#FFD700");

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("[Promote Error]", error);
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            "❌ Error",
            "An error occurred while promoting the player."
          ),
        ],
      });
    }
  },
};

export default command;
