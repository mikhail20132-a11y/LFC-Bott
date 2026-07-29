import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { createErrorEmbed, createSuccessEmbed } from "../../utils/helpers.js";
import type { Command } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("add-emojis")
    .setDescription("Add a custom emoji to the server (Manage Expressions required)")
    .addStringOption((opt) =>
      opt
        .setName("emoji_url")
        .setDescription("URL of the emoji image (must be a valid image link)")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("name")
        .setDescription("Name for the emoji (lowercase letters, numbers, underscores)")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply();

    if (!interaction.guild) {
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            "❌ Not in Server",
            "This command can only be used inside a server."
          ),
        ],
      });
      return;
    }

    // Verify the caller has Manage Expressions permission
    const member = interaction.member;
    if (member && typeof member.permissions !== "undefined") {
      const perms = (member as any).permissions;
      const hasPerm =
        typeof perms.has === "function"
          ? perms.has(PermissionFlagsBits.ManageGuildExpressions)
          : false;
      if (!hasPerm) {
        await interaction.editReply({
          embeds: [
            createErrorEmbed(
              "❌ Insufficient Permissions",
              "You need the **Manage Expressions** permission to add emojis."
            ),
          ],
        });
        return;
      }
    }

    const emojiUrl = interaction.options.getString("emoji_url", true);
    const emojiName = interaction.options.getString("name", true);

    // Validate emoji name (basic discord constraints)
    const validName = emojiName.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
    if (validName.length < 2 || validName.length > 32) {
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            "❌ Invalid Name",
            "Emoji name must be between 2 and 32 characters (letters, numbers, underscores)."
          ),
        ],
      });
      return;
    }

    try {
      const created = await interaction.guild.emojis.create({
        attachment: emojiUrl,
        name: validName,
        reason: `Added by ${interaction.user.tag}`,
      });

      const embed = new EmbedBuilder()
        .setTitle("✅ Emoji Added")
        .setColor("#00AA00")
        .setDescription(
          `Successfully added a new custom emoji to the server!`
        )
        .addFields(
          {
            name: "😀 Emoji",
            value: `${created}`,
            inline: true,
          },
          {
            name: "📛 Name",
            value: `\`:${created.name}:\``,
            inline: true,
          },
          {
            name: "🔢 ID",
            value: created.id,
            inline: true,
          },
          {
            name: "👤 Added By",
            value: `<@${interaction.user.id}>`,
            inline: false,
          }
        )
        .setThumbnail(created.imageURL({ size: 128 }))
        .setFooter({ text: "Legacy Football Championship • Emojis" })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error: unknown) {
      console.error("[Add Emoji Error]", error);
      const message =
        error instanceof Error ? error.message : "Unknown error";

      let userMessage =
        "Failed to add the emoji. Make sure the URL points to a valid image (PNG, GIF, JPEG) and is publicly accessible.";

      if (message.includes("DiscordAPIError")) {
        if (message.includes("Maximum number")) {
          userMessage =
            "The server has reached the maximum number of custom emojis.";
        } else if (message.includes("Invalid")) {
          userMessage =
            "Invalid image URL. Make sure it ends with a valid image extension (.png, .gif, etc.).";
        }
      }

      await interaction.editReply({
        embeds: [createErrorEmbed("❌ Failed to Add Emoji", userMessage)],
      });
    }
  },
};

export default command;
