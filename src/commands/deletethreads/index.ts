import {
  SlashCommandBuilder,
  CommandInteraction,
  ChannelType,
} from "discord.js";
import { hasRole, RoleType } from "../../utils/permissions.js";
import { createErrorEmbed, createSuccessEmbed } from "../../utils/helpers.js";
import type { Command } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("deletethreads")
    .setDescription("Delete all active threads in the current channel"),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply();

    // Permission check
    const member = interaction.member;
    if (
      !hasRole(member as never, RoleType.Founder) &&
      !hasRole(member as never, RoleType.LeagueManagement)
    ) {
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            "❌ Insufficient Permissions",
            "You need **Founder** or **League Management** role to delete threads."
          ),
        ],
      });
      return;
    }

    try {
      // Validate we're in a text channel
      if (
        !interaction.channel ||
        interaction.channel.type !== ChannelType.GuildText
      ) {
        await interaction.editReply({
          embeds: [
            createErrorEmbed(
              "❌ Wrong Channel",
              "This command must be used in a text channel."
            ),
          ],
        });
        return;
      }

      // Fetch all active threads in this channel
      const fetched = await interaction.channel.threads.fetchActive();
      const threads = fetched.threads;

      if (threads.size === 0) {
        await interaction.editReply({
          embeds: [
            createErrorEmbed(
              "📭 No Threads",
              "No active threads found in this channel."
            ),
          ],
        });
        return;
      }

      const threadCount = threads.size;
      let deletedCount = 0;
      let errorCount = 0;

      for (const [, thread] of threads) {
        try {
          // Archiving/deleting threads: set archived + locked, then delete
          await thread.setArchived(true, "Bulk deletion by /deletethreads");
          await thread.setLocked(true, "Bulk deletion by /deletethreads");
          await thread.delete(`Deleted by ${interaction.user.tag} via /deletethreads`);
          deletedCount++;
        } catch (threadErr) {
          console.error(`[DeleteThreads] Failed to delete thread ${thread.id}:`, threadErr);
          errorCount++;
        }
      }

      const detailParts = [`✅ Deleted **${deletedCount}** thread(s)`];
      if (errorCount > 0) {
        detailParts.push(`⚠️ Failed to delete **${errorCount}** thread(s)`);
      }

      await interaction.editReply({
        embeds: [
          createSuccessEmbed("🗑️ Threads Cleaned Up", detailParts.join("\n")),
        ],
      });
    } catch (error) {
      console.error("[DeleteThreads Error]", error);
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            "❌ Error",
            "An error occurred while deleting threads."
          ),
        ],
      });
    }
  },
};

export default command;
