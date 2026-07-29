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
  Goalkeeper: String.fromCodePoint(0x1F9E4),
  Defender: String.fromCodePoint(0x1F6E1) + "\uFE0F",
  Midfielder: "\u26A1",
  Forward: "\u26BD",
};

const ROLE_EMOJIS: Record<string, string> = {
  Captain: String.fromCodePoint(0x1F451),
  "Vice Captain": "\u2B50",
  Starter: String.fromCodePoint(0x1F3C3),
  Sub: String.fromCodePoint(0x1F504),
  Academy: String.fromCodePoint(0x1F4DA),
};

const REGION_FLAGS: Record<string, string> = {
  Europe: String.fromCodePoint(0x1F30D),
  Asia: String.fromCodePoint(0x1F30F),
  Africa: String.fromCodePoint(0x1F30D),
  "North America": String.fromCodePoint(0x1F30E),
  "South America": String.fromCodePoint(0x1F30E),
  Oceania: String.fromCodePoint(0x1F30F),
};

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("View your LFC player identity card - LFC ID, contract, and registration info")
    .addUserOption((opt) =>
      opt
        .setName("player")
        .setDescription("Player whose profile to view (defaults to you)")
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
              "Not Registered",
              target.id === interaction.user.id
                ? "You are not registered as an LFC player yet."
                : target.username + " is not registered as an LFC player yet."
            ),
          ],
        });
        return;
      }

      const posEmoji = POSITION_EMOJIS[player.position] || String.fromCodePoint(0x1F3AF);
      const regionFlag = REGION_FLAGS[player.region] || String.fromCodePoint(0x1F310);
      const roleEmoji = player.roleInTeam
        ? ROLE_EMOJIS[player.roleInTeam] || ""
        : "";

      const statusBadge = player.team
        ? (player.team.emoji || String.fromCodePoint(0x1F3DF) + "\uFE0F") + " **Signed**"
        : String.fromCodePoint(0x1F4D3) + " **Free Agent**";
      const contractBadge = player.contracts.length > 0
        ? String.fromCodePoint(0x2705) + " **Active**"
        : String.fromCodePoint(0x1F4C4) + " **No Contract**";

      const descParts = [
        "*Identity card for the Legacy Football Championship*",
        "",
        posEmoji + " **" + player.position + "**" +
          (player.team ? " " + String.fromCodePoint(0x00B7) + " " + (player.team.emoji || String.fromCodePoint(0x1F3DF) + "\uFE0F") + " **" + player.team.name + "**" : "") +
          (player.roleInTeam ? " " + String.fromCodePoint(0x00B7) + " " + roleEmoji + " **" + player.roleInTeam + "**" : ""),
      ];
      const description = descParts.join("\n");

      const embed = new EmbedBuilder()
        .setTitle(String.fromCodePoint(0x1F3B4) + " " + target.username + " - Player Profile")
        .setColor(player.team ? 0x6366f1 : 0x6b7280)
        .setThumbnail(target.displayAvatarURL({ size: 256 }))
        .setDescription(description)
        .addFields(
          {
            name: String.fromCodePoint(0x1F194) + " Identity",
            value: [
              "**LFC ID:** \`" + player.lfcId + "\`",
              "**Discord:** " + target.username + " (\`" + target.id + "\`)",
              player.robloxUsername
                ? "**Roblox:** " + player.robloxUsername
                : "**Roblox:** Not linked",
            ].join("\n"),
            inline: true,
          },
          {
            name: String.fromCodePoint(0x26BD) + " Club Info",
            value: [
              "**Status:** " + statusBadge,
              "**Position:** " + posEmoji + " " + player.position,
              "**Region:** " + regionFlag + " " + player.region,
              player.nickname
                ? "**Nickname:** \`" + player.nickname + "\`"
                : "**Nickname:** None",
            ].join("\n"),
            inline: true,
          },
          {
            name: String.fromCodePoint(0x1F4DC) + " Registration",
            value: [
              "**Since:** " + formatDate(player.joinedAt),
              "**Role:** " + (roleEmoji || "-") + " " + (player.roleInTeam ?? "Unassigned"),
              "**Contract:** " + contractBadge,
            ].join("\n"),
            inline: false,
          },
          {
            name: String.fromCodePoint(0x1F3C6) + " Career Snapshot",
            value: [
              "**Apps:** " + player.appearances,
              "**Goals:** " + player.goals + " | **Assists:** " + player.assists,
              "**MVP:** " + player.mvps + " | **Trophies:** " + player.trophies,
              "**Cards:** " + String.fromCodePoint(0x1F7E8) + " " + player.yellowCards + " " + String.fromCodePoint(0x00B7) + " " + String.fromCodePoint(0x1F7E5) + " " + player.redCards,
            ].join("  " + String.fromCodePoint(0x00B7) + "  "),
            inline: false,
          }
        )
        .setFooter({
          text: "Legacy Football Championship" + (player.team ? " " + String.fromCodePoint(0x2022) + " " + player.team.name : ""),
        })
        .setTimestamp();

      if (player.contracts.length > 0) {
        const c = player.contracts[0];
        embed.addFields({
          name: String.fromCodePoint(0x1F4CB) + " Active Contract",
          value: [
            "**Contract ID:** \`" + c.id.slice(0, 12) + "...\`",
            "**Signed:** " + formatDate(c.signedAt),
            c.roleInTeam ? "**Role:** " + (ROLE_EMOJIS[c.roleInTeam] || "") + " " + c.roleInTeam : null,
            c.expiresAt ? "**Expires:** " + formatDate(c.expiresAt) : "**Expires:** Indefinite",
          ]
            .filter(Boolean)
            .join("\n"),
          inline: false,
        });
      }

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("disabled_placeholder")
          .setLabel("LFC ID: " + player.lfcId)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setLabel("View Profile")
          .setStyle(ButtonStyle.Link)
          .setURL("https://discord.com/users/" + target.id),
      );

      await interaction.editReply({ embeds: [embed], components: [row] });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      console.error("[Profile Error]", error);
      await interaction.editReply({ content: String.fromCodePoint(0x274C) + " " + msg });
    }
  },
};

export default command;