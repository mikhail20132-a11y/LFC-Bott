import {
  SlashCommandBuilder,
  CommandInteraction,
  PermissionFlagsBits,
  GuildMember,
} from "discord.js";
import { hasRole, RoleType } from "../../utils/permissions.js";
import { createSuccessEmbed, createErrorEmbed } from "../../utils/helpers.js";
import type { Command } from "../../types/index.js";

const MAX_PURGE = 100;
const MIN_PURGE = 1;

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Bulk delete messages in the current channel")
    .addIntegerOption((opt) =>
      opt
        .setName("amount")
        .setDescription("Number of messages to delete (1–100)")
        .setRequired(true)
        .setMinValue(MIN_PURGE)
        .setMaxValue(MAX_PURGE)
    ),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply({ ephemeral: true });

    const member = interaction.member as GuildMember | null;
    if (!member) {
      await interaction.editReply({
        embeds: [
          createErrorEmbed("❌ Error", "Could not resolve your member information."),
        ],
      });
      return;
    }

    // Permission check: Moderator+ OR explicit Manage Messages permission
    const isStaff =
      hasRole(member, RoleType.Founder) ||
      hasRole(member, RoleType.LeagueManagement) ||
      hasRole(member, RoleType.Moderator);
    const hasManageMessages = member.permissions.has(
      PermissionFlagsBits.ManageMessages
    );

    if (!isStaff && !hasManageMessages) {
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            "❌ Insufficient Permissions",
            "You need the **Moderator** (or higher) role, or the **Manage Messages** permission to purge messages."
          ),
        ],
      });
      return;
    }

    const amount = interaction.options.getInteger("amount", true);

    if (!interaction.channel || !interaction.channel.isTextBased()) {
      await interaction.editReply({
        embeds: [
          createErrorEmbed("❌ Error", "This command can only be used in a text channel."),
        ],
      });
      return;
    }

    try {
      // Fetch messages to delete (bulkDelete requires messages < 14 days old)
      const messages = await interaction.channel.messages.fetch({ limit: amount });
      const deleted = await interaction.channel.bulkDelete(messages, true);

      const embed = createSuccessEmbed(
        "🧹 Messages Purged",
        `Successfully deleted **${deleted.size}** message(s) in ${interaction.channel}.`
      );

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("[Purge Error]", error);
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            "❌ Purge Failed",
            "Could not delete messages. Messages older than 14 days cannot be bulk-deleted. Make sure the bot has **Manage Messages** permission."
          ),
        ],
      });
    }
  },
};

export default command;
