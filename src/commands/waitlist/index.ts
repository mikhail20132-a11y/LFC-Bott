import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { prisma } from "../../database/prisma.js";
import { hasRole, RoleType } from "../../utils/permissions.js";
import { createErrorEmbed, createSuccessEmbed } from "../../utils/helpers.js";
import type { Command } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("waitlist")
    .setDescription("Manage the league waitlist")
    .addSubcommand((sub) =>
      sub
        .setName("view")
        .setDescription("List all candidates currently on the waitlist")
    )
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Add a candidate to the waitlist")
        .addUserOption((opt) =>
          opt
            .setName("user")
            .setDescription("Discord user to add")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("position")
            .setDescription("Preferred position")
            .setRequired(true)
            .addChoices(
              { name: "Goalkeeper", value: "Goalkeeper" },
              { name: "Defender", value: "Defender" },
              { name: "Midfielder", value: "Midfielder" },
              { name: "Forward", value: "Forward" },
              { name: "Any", value: "Any" }
            )
        )
        .addStringOption((opt) =>
          opt
            .setName("region")
            .setDescription("Region")
            .setRequired(true)
            .addChoices(
              { name: "Europe", value: "Europe" },
              { name: "Asia", value: "Asia" },
              { name: "Africa", value: "Africa" },
              { name: "North America", value: "North America" },
              { name: "South America", value: "South America" },
              { name: "Oceania", value: "Oceania" }
            )
        )
        .addStringOption((opt) =>
          opt
            .setName("note")
            .setDescription("Optional note about the candidate")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove a candidate from the waitlist")
        .addUserOption((opt) =>
          opt
            .setName("user")
            .setDescription("Discord user to remove")
            .setRequired(true)
        )
    ),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case "view":
        return handleView(interaction);
      case "add":
        return handleAdd(interaction);
      case "remove":
        return handleRemove(interaction);
      default:
        await interaction.reply({
          content: "❌ Unknown subcommand.",
          ephemeral: true,
        });
    }
  },
};

async function handleView(interaction: CommandInteraction): Promise<void> {
  await interaction.deferReply();

  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.editReply({
      embeds: [createErrorEmbed("❌ Error", "This command must be used in a server.")],
    });
    return;
  }

  try {
    const entries = await prisma.waitlistEntry.findMany({
      where: { guildId },
      orderBy: { addedAt: "asc" },
    });

    if (entries.length === 0) {
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            "📭 Empty Waitlist",
            "No candidates are currently on the waitlist."
          ),
        ],
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("📋 League Waitlist")
      .setColor("#9900FF")
      .setDescription(
        `**${entries.length} candidate(s)** waiting to join the league`
      )
      .setTimestamp();

    entries.forEach((entry, index) => {
      const positionEmojis: Record<string, string> = {
        Goalkeeper: "🧤",
        Defender: "🛡️",
        Midfielder: "🎯",
        Forward: "⚽",
        Any: "❓",
      };
      const posEmoji = positionEmojis[entry.position] || "❓";

      embed.addFields({
        name: `#${index + 1} — ${entry.username}`,
        value:
          `${posEmoji} **Position:** ${entry.position}\n` +
          `🌍 **Region:** ${entry.region}\n` +
          `📅 **Added:** <t:${Math.floor(entry.addedAt.getTime() / 1000)}:R>\n` +
          (entry.note ? `📝 **Note:** ${entry.note}` : ""),
        inline: false,
      });
    });

    embed.setFooter({ text: "Legacy Football Championship • Waitlist" });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("[Waitlist View Error]", error);
    await interaction.editReply({
      embeds: [
        createErrorEmbed("❌ Error", "Failed to load the waitlist."),
      ],
    });
  }
}

async function handleAdd(interaction: CommandInteraction): Promise<void> {
  await interaction.deferReply();

  const member = interaction.member;
  if (
    !hasRole(member as never, RoleType.Founder) &&
    !hasRole(member as never, RoleType.LeagueManagement)
  ) {
    await interaction.editReply({
      embeds: [
        createErrorEmbed(
          "❌ Insufficient Permissions",
          "You need **Founder** or **League Management** role to manage the waitlist."
        ),
      ],
    });
    return;
  }

  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.editReply({
      embeds: [createErrorEmbed("❌ Error", "This command must be used in a server.")],
    });
    return;
  }

  const targetUser = interaction.options.getUser("user", true);
  const position = interaction.options.getString("position", true);
  const region = interaction.options.getString("region", true);
  const note = interaction.options.getString("note");

  try {
    // Check if already on the waitlist
    const existing = await prisma.waitlistEntry.findUnique({
      where: {
        guildId_discordId: { guildId, discordId: targetUser.id },
      },
    });

    if (existing) {
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            "⚠️ Already on Waitlist",
            `<@${targetUser.id}> is already on the waitlist (added <t:${Math.floor(existing.addedAt.getTime() / 1000)}:R>).\n\nRemove them first with \`/waitlist remove\` if you want to re-add with different details.`
          ),
        ],
      });
      return;
    }

    await prisma.waitlistEntry.create({
      data: {
        guildId,
        discordId: targetUser.id,
        username: targetUser.username,
        position,
        region,
        note: note || null,
      },
    });

    const positionEmojis: Record<string, string> = {
      Goalkeeper: "🧤",
      Defender: "🛡️",
      Midfielder: "🎯",
      Forward: "⚽",
      Any: "❓",
    };
    const posEmoji = positionEmojis[position] || "❓";

    await interaction.editReply({
      embeds: [
        createSuccessEmbed(
          "✅ Added to Waitlist",
          `<@${targetUser.id}> has been added to the waitlist.\n\n` +
          `${posEmoji} **Position:** ${position}\n` +
          `🌍 **Region:** ${region}\n` +
          (note ? `📝 **Note:** ${note}` : "")
        ),
      ],
    });
  } catch (error) {
    console.error("[Waitlist Add Error]", error);
    await interaction.editReply({
      embeds: [
        createErrorEmbed("❌ Error", "Failed to add user to the waitlist."),
      ],
    });
  }
}

async function handleRemove(interaction: CommandInteraction): Promise<void> {
  await interaction.deferReply();

  const member = interaction.member;
  if (
    !hasRole(member as never, RoleType.Founder) &&
    !hasRole(member as never, RoleType.LeagueManagement)
  ) {
    await interaction.editReply({
      embeds: [
        createErrorEmbed(
          "❌ Insufficient Permissions",
          "You need **Founder** or **League Management** role to manage the waitlist."
        ),
      ],
    });
    return;
  }

  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.editReply({
      embeds: [createErrorEmbed("❌ Error", "This command must be used in a server.")],
    });
    return;
  }

  const targetUser = interaction.options.getUser("user", true);

  try {
    const existing = await prisma.waitlistEntry.findUnique({
      where: {
        guildId_discordId: { guildId, discordId: targetUser.id },
      },
    });

    if (!existing) {
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            "❌ Not Found",
            `<@${targetUser.id}> is not on the waitlist.`
          ),
        ],
      });
      return;
    }

    await prisma.waitlistEntry.delete({
      where: { id: existing.id },
    });

    await interaction.editReply({
      embeds: [
        createSuccessEmbed(
          "✅ Removed from Waitlist",
          `<@${targetUser.id}> has been removed from the waitlist.`
        ),
      ],
    });
  } catch (error) {
    console.error("[Waitlist Remove Error]", error);
    await interaction.editReply({
      embeds: [
        createErrorEmbed("❌ Error", "Failed to remove user from the waitlist."),
      ],
    });
  }
}

export default command;
