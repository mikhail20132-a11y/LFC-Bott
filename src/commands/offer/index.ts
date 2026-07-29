import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { prisma } from "../../database/prisma.js";
import { hasRole, RoleType } from "../../utils/permissions.js";
import { createErrorEmbed } from "../../utils/helpers.js";
import { createOffer } from "../../services/offerSessionStore.js";
import type { Command, TeamRole } from "../../types/index.js";

const POSITIONS = [
  { name: "🧤 Goalkeeper", value: "Goalkeeper" },
  { name: "🛡️ Defender", value: "Defender" },
  { name: "🎯 Midfielder", value: "Midfielder" },
  { name: "⚽ Forward", value: "Forward" },
];

const ROLES = [
  { name: "👑 Captain", value: "Captain" },
  { name: "⭐ Vice Captain", value: "Vice Captain" },
  { name: "🏃 Starter", value: "Starter" },
  { name: "🔄 Sub", value: "Sub" },
  { name: "📚 Academy", value: "Academy" },
];

const REGIONS = [
  { name: "🌍 Europe", value: "Europe" },
  { name: "🌏 Asia", value: "Asia" },
  { name: "🌍 Africa", value: "Africa" },
  { name: "🌎 North America", value: "North America" },
  { name: "🌎 South America", value: "South America" },
  { name: "🌏 Oceania", value: "Oceania" },
];

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("offer")
    .setDescription("Offer a contract to a player via DM with accept/decline buttons (Manager/Assistant Manager only)")
    .addUserOption((opt) =>
      opt.setName("player").setDescription("Player to offer contract").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("team").setDescription("Team name").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("position").setDescription("Position").setRequired(true)
        .addChoices(...POSITIONS)
    )
    .addStringOption((opt) =>
      opt.setName("region").setDescription("Region").setRequired(true)
        .addChoices(...REGIONS)
    )
    .addStringOption((opt) =>
      opt.setName("role").setDescription("Team role").setRequired(false)
        .addChoices(...ROLES)
    )
    .addStringOption((opt) =>
      opt.setName("roblox").setDescription("Roblox username").setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName("nickname").setDescription("Server nickname to assign").setRequired(false)
    ),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply({ ephemeral: true });

    if (
      !hasRole(interaction.member as never, RoleType.Manager) &&
      !hasRole(interaction.member as never, RoleType.AssistantManager)
    ) {
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            "❌ Insufficient Permissions",
            "You need **Manager** or **Assistant Manager** role."
          ),
        ],
      });
      return;
    }

    const target = interaction.options.getUser("player", true);
    const teamName = interaction.options.getString("team", true);
    const position = interaction.options.getString("position", true);
    const region = interaction.options.getString("region", true);
    const role = interaction.options.getString("role") as TeamRole | null;
    const roblox = interaction.options.getString("roblox");
    const nickname = interaction.options.getString("nickname");

    try {
      // Validate team exists
      const team = await prisma.team.findUnique({ where: { name: teamName } });
      if (!team) {
        await interaction.editReply({
          embeds: [createErrorEmbed("❌ Team Not Found", `No team named **${teamName}**.`)],
        });
        return;
      }

      // Check if target is blacklisted
      const blacklisted = await prisma.blacklist.findUnique({
        where: { discordId: target.id },
      });
      if (blacklisted) {
        await interaction.editReply({
          embeds: [createErrorEmbed("⛔ Blacklisted", `${target} is blacklisted and cannot receive offers.`)],
        });
        return;
      }

      // Create pending offer
      const offerId = createOffer({
        targetDiscordId: target.id,
        offeredByDiscordId: interaction.user.id,
        guildId: interaction.guildId!,
        contractData: {
          discordId: target.id,
          username: target.username,
          teamName,
          position,
          region,
          robloxUsername: roblox ?? undefined,
          roleInTeam: role ?? undefined,
          nickname: nickname ?? undefined,
        },
        teamName: team.name,
        teamEmoji: team.emoji || "",
        expiresAt: Date.now() + 6 * 60 * 60 * 1000, // 6 hours
      });

      // Build the DM embed — styled with an accent colour
      const posEmoji: Record<string, string> = {
        Goalkeeper: "🧤", Defender: "🛡️", Midfielder: "⚡", Forward: "⚽",
      };
      const offerEmbed = new EmbedBuilder()
        .setTitle(`📩 Offer Received`)
        .setColor(0xf59e0b)
        .setDescription(
          `**${team.emoji || "🏟️"} ${team.name}** have sent you an offer to join their team!\n\nDo you accept?`
        )
        .addFields(
          {
            name: "👤 Player",
            value: `${target.globalName || target.username} \`${target.username}\``,
            inline: true,
          },
          {
            name: "🏟️ Team",
            value: `${team.emoji || "🏟️"} ${team.name}${team.shortName ? ` (\`${team.shortName}\`)` : ""}`,
            inline: true,
          },
          {
            name: "⚽ Position",
            value: `${posEmoji[position] || ""} ${position}`,
            inline: true,
          },
          { name: "🌍 Region", value: region, inline: true },
          {
            name: "🎭 Role",
            value: role ?? "Starter",
            inline: true,
          },
          {
            name: "⏰ Expires",
            value: "`6 Hours`",
            inline: true,
          },
        )
        .setThumbnail(team.logoUrl || target.displayAvatarURL())
        .setFooter({
          text: `Legacy Football Championship • Offered by ${interaction.user.username}`,
        })
        .setTimestamp();

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`offer_accept:${offerId}`)
          .setLabel("Accept")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`offer_decline:${offerId}`)
          .setLabel("Decline")
          .setStyle(ButtonStyle.Danger)
      );

      // Attempt to DM the player
      let dmSent = false;
      try {
        await target.send({ embeds: [offerEmbed], components: [row] });
        dmSent = true;
      } catch {
        // DM failed — DMs likely disabled
      }

      if (dmSent) {
        const confirmEmbed = new EmbedBuilder()
          .setTitle("📨 Offer Sent!")
          .setColor(0x22c55e)
          .setDescription(
            `An offer has been sent to ${target}'s DMs with **Accept**/**Decline** buttons.\n\n` +
            `**${team.emoji || "🏟️"} ${team.name}** → ${position}${role ? ` (${role})` : ""}`
          )
          .addFields(
            { name: "⏰ Expires In", value: "`6 Hours`", inline: true },
            { name: "👤 Player", value: `<@${target.id}>`, inline: true }
          )
          .setFooter({ text: "Wait for them to respond via DM" })
          .setTimestamp();

        await interaction.editReply({ embeds: [confirmEmbed] });
      } else {
        await interaction.editReply({
          embeds: [
            createErrorEmbed(
              "⚠️ DM Not Sent",
              `Could not DM ${target} — they may have DMs disabled.\n\n` +
                `The offer is **pending** for 6 hours. Ask them to enable DMs from server members.`
            ),
          ],
        });
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      console.error("[Offer Error]", error);
      await interaction.editReply({ content: `❌ ${msg}` });
    }
  },
};

export default command;
