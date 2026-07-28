import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { prisma } from "../../database/prisma.js";
import { hasRole, RoleType } from "../../utils/permissions.js";
import { createErrorEmbed } from "../../utils/helpers.js";
import type { Command } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("blacklist-word")
    .setDescription("Manage the server word blacklist (Moderator+)")
    .addStringOption((opt) =>
      opt
        .setName("action")
        .setDescription("Action to perform")
        .setRequired(true)
        .addChoices(
          { name: "Add", value: "add" },
          { name: "Remove", value: "remove" },
          { name: "List", value: "list" }
        )
    )
    .addStringOption((opt) =>
      opt
        .setName("word")
        .setDescription("The word to add or remove (not needed for list)")
        .setRequired(false)
    ),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply();

    // Moderator+ permission check
    const member = interaction.member;
    const isStaff =
      hasRole(member as never, RoleType.Founder) ||
      hasRole(member as never, RoleType.LeagueManagement) ||
      hasRole(member as never, RoleType.Moderator);

    if (!isStaff) {
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            "❌ Insufficient Permissions",
            "You need **Moderator** (or higher) role to manage the word blacklist."
          ),
        ],
      });
      return;
    }

    const action = interaction.options.getString("action", true) as
      | "add"
      | "remove"
      | "list";
    const word = interaction.options.getString("word");

    try {
      if (action === "add") {
        if (!word || word.trim().length === 0) {
          await interaction.editReply({
            embeds: [
              createErrorEmbed(
                "❌ Missing Word",
                "Please provide a word to blacklist."
              ),
            ],
          });
          return;
        }

        const normalized = word.trim().toLowerCase();

        // Check if already blacklisted
        const existing = await prisma.blacklist.findUnique({
          where: { discordId: normalized },
        });

        if (existing) {
          await interaction.editReply({
            embeds: [
              createErrorEmbed(
                "⚠️ Already Blacklisted",
                `The word **${normalized}** is already on the blacklist.`
              ),
            ],
          });
          return;
        }

        await prisma.blacklist.create({
          data: {
            discordId: normalized,
            reason: "word",
            issuedBy: interaction.user.id,
          },
        });

        const embed = new EmbedBuilder()
          .setTitle("⛔ Word Blacklisted")
          .setColor("#FF4444")
          .setDescription(`**${normalized}** has been added to the word blacklist.`)
          .addFields(
            { name: "🚫 Word", value: `||${normalized}||`, inline: true },
            {
              name: "👤 Added By",
              value: `<@${interaction.user.id}>`,
              inline: true,
            }
          )
          .setFooter({ text: "Legacy Football Championship • Moderation" })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } else if (action === "remove") {
        if (!word || word.trim().length === 0) {
          await interaction.editReply({
            embeds: [
              createErrorEmbed(
                "❌ Missing Word",
                "Please provide the word to remove from the blacklist."
              ),
            ],
          });
          return;
        }

        const normalized = word.trim().toLowerCase();

        const existing = await prisma.blacklist.findUnique({
          where: { discordId: normalized },
        });

        if (!existing) {
          await interaction.editReply({
            embeds: [
              createErrorEmbed(
                "❌ Not Found",
                `The word **${normalized}** is not on the blacklist.`
              ),
            ],
          });
          return;
        }

        await prisma.blacklist.delete({
          where: { discordId: normalized },
        });

        const embed = new EmbedBuilder()
          .setTitle("✅ Word Unblacklisted")
          .setColor("#00AA00")
          .setDescription(
            `**${normalized}** has been removed from the word blacklist.`
          )
          .addFields({
            name: "👤 Removed By",
            value: `<@${interaction.user.id}>`,
            inline: true,
          })
          .setFooter({ text: "Legacy Football Championship • Moderation" })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } else if (action === "list") {
        // Fetch all entries stored as words
        const blacklistedWords = await prisma.blacklist.findMany({
          where: { reason: "word" },
          orderBy: { createdAt: "desc" },
        });

        if (blacklistedWords.length === 0) {
          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setTitle("📋 Word Blacklist")
                .setColor("#00AA00")
                .setDescription("No words are currently blacklisted.")
                .setFooter({
                  text: "Legacy Football Championship • Moderation",
                })
                .setTimestamp(),
            ],
          });
          return;
        }

        const wordList = blacklistedWords
          .map(
            (entry, i) =>
              `${i + 1}. ||${entry.discordId}|| — <@${entry.issuedBy}>`
          )
          .join("\n");

        const embed = new EmbedBuilder()
          .setTitle("📋 Word Blacklist")
          .setColor("#FFAA00")
          .setDescription(
            `**${blacklistedWords.length}** word(s) blacklisted:\n\n${wordList}`
          )
          .setFooter({ text: "Legacy Football Championship • Moderation" })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      }
    } catch (error) {
      console.error("[Blacklist Word Error]", error);
      await interaction.editReply({
        content: "❌ An error occurred while managing the word blacklist.",
      });
    }
  },
};

export default command;
