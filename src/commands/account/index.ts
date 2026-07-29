import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { prisma } from "../../database/prisma.js";
import { contractService } from "../../services/contractService.js";
import {
  createErrorEmbed,
  formatDate,
  BRAND,
  getPositionMeta,
  getPositionEmoji,
} from "../../utils/helpers.js";
import type { Command } from "../../types/index.js";

const ROLE_BADGES: Record<string, { emoji: string; color: number }> = {
  Captain: { emoji: "👑", color: 0xffd700 },
  "Vice Captain": { emoji: "⭐", color: 0xc0c0c0 },
  Starter: { emoji: "🏃", color: 0x22c55e },
  Sub: { emoji: "🔄", color: 0xf59e0b },
  Academy: { emoji: "📚", color: 0x6366f1 },
};

const REGION_FLAGS: Record<string, string> = {
  Europe: "🇪🇺", Asia: "🌏", Africa: "🌍",
  "North America": "🇺🇸", "South America": "🇧🇷", Oceania: "🇦🇺",
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

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const target = interaction.options.getUser("player") ?? interaction.user;

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

      const pos = getPositionMeta(player.position);
      const regionFlag = REGION_FLAGS[player.region] || "🌐";
      const roleBadge = player.roleInTeam ? ROLE_BADGES[player.roleInTeam] : null;
      const embedColor = player.team
        ? (roleBadge?.color ?? BRAND.colors.primary)
        : BRAND.colors.muted;

      // ── Build the embed ──
      const embed = new EmbedBuilder()
        .setTitle(`${pos.emoji} ${target.username}`)
        .setColor(embedColor)
        .setThumbnail(target.displayAvatarURL({ size: 512 }))
        .setDescription([
          `**LFC ID:** \`${player.lfcId}\``,
          `━━━━━━━━━━━━━━━━━━`,
          `${player.team ? `${player.team.emoji || "🏟️"} **${player.team.name}**` : "🆓 **Free Agent**"}` +
            ` · ${pos.emoji} **${pos.fullName}** (${player.position})`,
          player.nickname ? `📛 \`${player.nickname}\`` : "",
        ].filter(Boolean).join("\n"))
        .addFields(
          {
            name: "👤 Identity",
            value: [
              `**Discord:** ${target.username}`,
              player.robloxUsername
                ? `**Roblox:** \`${player.robloxUsername}\``
                : "**Roblox:** ❌ Not linked",
              `**Region:** ${regionFlag} ${player.region}`,
            ].join("\n"),
            inline: true,
          },
          {
            name: `${player.team ? "🏟️" : "📋"} Status`,
            value: [
              player.roleInTeam
                ? `**Role:** ${roleBadge?.emoji || ""} ${player.roleInTeam}`
                : "**Role:** Unassigned",
              `**Since:** ${formatDate(player.joinedAt)}`,
              player.contracts.length > 0
                ? "**Contract:** ✅ Active"
                : "**Contract:** 📄 None",
            ].join("\n"),
            inline: true,
          },
          {
            name: "🏆 Career",
            value: [
              `**Apps:** ${player.appearances}`,
              `**Goals:** ${player.goals}  ·  **Assists:** ${player.assists}`,
              `**MVP:** ${player.mvps}  ·  **Trophies:** ${player.trophies}`,
              `🟨 ${player.yellowCards}  ·  🟥 ${player.redCards}`,
            ].join("\n"),
            inline: false,
          }
        )
        .setFooter({
          text: player.team
            ? `${BRAND.footer} • ${player.team.name}`
            : BRAND.footer,
          iconURL: target.displayAvatarURL(),
        })
        .setTimestamp();

      if (player.contracts.length > 0) {
        const c = player.contracts[0];
        const cRoleBadge = c.roleInTeam ? ROLE_BADGES[c.roleInTeam] : null;
        embed.addFields({
          name: "📋 Active Contract",
          value: [
            `**ID:** \`${c.id.slice(0, 12)}…\``,
            `**Signed:** ${formatDate(c.signedAt)}`,
            c.roleInTeam
              ? `**Role:** ${cRoleBadge?.emoji || ""} ${c.roleInTeam}`
              : null,
            c.expiresAt
              ? `**Expires:** ${formatDate(c.expiresAt)}`
              : "**Expires:** Indefinite",
          ]
            .filter(Boolean)
            .join("\n"),
          inline: false,
        });
      }

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("_account_id")
          .setLabel(`🆔 ${player.lfcId}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setLabel("Open Discord Profile")
          .setStyle(ButtonStyle.Link)
          .setURL(`https://discord.com/users/${target.id}`),
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