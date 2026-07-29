import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { prisma } from "../../database/prisma.js";
import { contractService } from "../../services/contractService.js";
import { createErrorEmbed, formatDate } from "../../utils/helpers.js";
import type { Command } from "../../types/index.js";

const POSITION_EMOJIS: Record<string, string> = {
  Goalkeeper: "🧤",
  Defender: "🛡️",
  Midfielder: "⚡",
  Forward: "⚽",
};

const ROLE_EMOJIS: Record<string, string> = {
  Captain: "👑",
  "Vice Captain": "⭐",
  Starter: "🏃",
  Sub: "🔄",
  Academy: "📚",
};

const REGION_FLAGS: Record<string, string> = {
  Europe: "🌍",
  Asia: "🌏",
  Africa: "🌍",
  "North America": "🌎",
  "South America": "🌎",
  Oceania: "🌏",
};

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("account")
    .setDescription("View your LFC player identity card — LFC ID, contract, and registration info")
    .addUserOption((opt) =>
      opt
        .setName("player")
        .setDescription("Player whose account to view (defaults to you)")
        .setRequired(false)
    ),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply();

    const target =
      interaction.options.getUser("player") ?? interaction.user;

    try {
      const player = await prisma.player.findUnique({
        where: { discordId: target.id },
        include: {
          user: true,
          team: true,
          contracts: {
            where: { isActive: true },
            orderBy: { signedAt: "desc" },
            take: 1,
          },
        },
      });

      if (!player) {
        await interaction.editReply({
          embeds: [
            createErrorEmbed(
              "❌ Not Registered",
              `${target.id === interaction.user.id ? "You are" : `${target.username} is`} not registered as an LFC player yet.`
            ),
          ],
        });
        return;
      }

      const posEmoji = POSITION_EMOJIS[player.position] || "🎯";
      const regionFlag = REGION_FLAGS[player.region] || "🌐";
      const roleEmoji = player.roleInTeam
        ? ROLE_EMOJIS[player.roleInTeam] || ""
        : "";

      // ── Identity Badges ──
      const statusBadge = player.team
        ? `${player.team.emoji || "🏟️"} **Signed**`
        : "🆓 **Free Agent**";
      const contractBadge = player.contracts.length > 0 ? "✅ **Active**" : "📄 **No Contract**";

      // ── Build the embed ──
      const embed = new EmbedBuilder()
        .setTitle(`🎴 ${target.username} — Player Account`)
        .setColor(player.team ? 0x6366f1 : 0x6b7280)
        .setThumbnail(target.displayAvatarURL({ size: 256 }))
        .setDescription(
          `*Identity card for the Legacy Football Championship*\n\n` +
            `${posEmoji} **${player.position}**` +
            (player.team ? ` · ${player.team.emoji || "🏟️"} **${player.team.name}**` : "") +
            (player.roleInTeam ? ` · ${roleEmoji} **${player.roleInTeam}**` : "")
        )
        .addFields(
          {
            name: "🆔 Identity",
            value: [
              `**LFC ID:** \`${player.lfcId}\``,
              `**Discord:** ${target.username} (\`${target.id}\`)`,
              player.robloxUsername
                ? `**Roblox:** ${player.robloxUsername}`
                : "**Roblox:** ❌ Not linked",
            ].join("\n"),
            inline: true,
          },
          {
            name: "⚽ Club Info",
            value: [
              `**Status:** ${statusBadge}`,
              `**Position:** ${posEmoji} ${player.position}`,
              `**Region:** ${regionFlag} ${player.region}`,
              player.nickname
                ? `**Nickname:** \`${player.nickname}\``
                : "**Nickname:** None",
            ].join("\n"),
            inline: true,
          },
          {
            name: "📜 Registration",
            value: [
              `**Since:** ${formatDate(player.joinedAt)}`,
              `**Role:** ${roleEmoji || "—"} ${player.roleInTeam ?? "Unassigned"}`,
              `**Contract:** ${contractBadge}`,
            ].join("\n"),
            inline: false,
          },
          {
            name: "🏆 Career Snapshot",
            value: [
              `**Apps:** ${player.appearances}`,
              `**Goals:** ${player.goals} | **Assists:** ${player.assists}`,
              `**MVP:** ${player.mvps} | **Trophies:** ${player.trophies}`,
              `**Cards:** 🟨 ${player.yellowCards} · 🟥 ${player.redCards}`,
            ].join("  ·  "),
            inline: false,
          }
        )
        .setFooter({
          text: `Legacy Football Championship ${player.team ? `• ${player.team.name}` : ""}`,
        })
        .setTimestamp();

      // If they have an active contract, show extra detail
      if (player.contracts.length > 0) {
        const c = player.contracts[0];
        embed.addFields({
          name: "📋 Active Contract",
          value: [
            `**Contract ID:** \`${c.id.slice(0, 12)}…\``,
            `**Signed:** ${formatDate(c.signedAt)}`,
            c.roleInTeam ? `**Role:** ${ROLE_EMOJIS[c.roleInTeam] || ""} ${c.roleInTeam}` : null,
            c.expiresAt ? `**Expires:** ${formatDate(c.expiresAt)}` : "**Expires:** Indefinite",
          ]
            .filter(Boolean)
            .join("\n"),
          inline: false,
        });
      }

      // Show a quick-action row
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("disabled_placeholder")
          .setLabel(`LFC ID: ${player.lfcId}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setLabel("View Profile")
          .setStyle(ButtonStyle.Link)
          .setURL(
            `https://discord.com/users/${target.id}`
          ),
      );

      await interaction.editReply({ embeds: [embed], components: [row] });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      console.error("[Account Error]", error);
      await interaction.editReply({ content: `❌ ${msg}` });
    }
  },
};

export default command;
