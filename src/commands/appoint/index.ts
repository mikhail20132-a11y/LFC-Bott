import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildMember,
  PermissionFlagsBits,
} from "discord.js";
import { prisma } from "../../database/prisma.js";
import { hasRole, RoleType } from "../../utils/permissions.js";
import { createSuccessEmbed, createErrorEmbed, BRAND, formatDate } from "../../utils/helpers.js";
import type { Command } from "../../types/index.js";

const APPOINT_ROLES = [
  { name: "👑 Franchise Owner", value: "Franchise Owner" },
  { name: "📋 General Manager", value: "General Manager" },
  { name: "🏋️ Head Coach", value: "Head Coach" },
  { name: "📊 Assistant Coach", value: "Assistant Coach" },
  { name: "🔧 Manager", value: "Manager" },
  { name: "⚙️ Assistant Manager", value: "Assistant Manager" },
  { name: "🛡️ Moderator", value: "Moderator" },
  { name: "⚪ Referee", value: "Referee" },
];

// Maps appointment roles to Discord role names to look up
const ROLE_DISPLAY: Record<string, { emoji: string; color: number }> = {
  "Franchise Owner": { emoji: "👑", color: 0xffd700 },
  "General Manager": { emoji: "📋", color: 0x6366f1 },
  "Head Coach": { emoji: "🏋️", color: 0x22c55e },
  "Assistant Coach": { emoji: "📊", color: 0x8b5cf6 },
  "Manager": { emoji: "🔧", color: 0x6366f1 },
  "Assistant Manager": { emoji: "⚙️", color: 0x22c55e },
  "Moderator": { emoji: "🛡️", color: 0x00cc66 },
  "Referee": { emoji: "⚪", color: 0xef4444 },
};

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("appoint")
    .setDescription("Appoint a user to a role on a team — assigns roles + sends notification")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("The user to appoint")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("role")
        .setDescription("Role to appoint them as")
        .setRequired(true)
        .addChoices(...APPOINT_ROLES)
    )
    .addStringOption((opt) =>
      opt
        .setName("team")
        .setDescription("Team name to assign them to")
        .setRequired(true)
        .setAutocomplete(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    if (
      !(interaction.member as GuildMember | null)?.permissions.has(PermissionFlagsBits.Administrator)
    ) {
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            "❌ Insufficient Permissions",
            "You need **Administrator** permission to use this command."
          ),
        ],
      });
      return;
    }

    const targetUser = interaction.options.getUser("user", true);
    const appointRole = interaction.options.getString("role", true);
    const teamName = interaction.options.getString("team", true);
    const roleDisplay = ROLE_DISPLAY[appointRole] || { emoji: "📌", color: BRAND.colors.primary };

    try {
      // 1. Find team
      const team = await prisma.team.findUnique({
        where: { name: teamName },
        include: { manager: true },
      });
      if (!team) {
        await interaction.editReply({
          embeds: [createErrorEmbed("❌ Team Not Found", `No team named **${teamName}** exists.`)],
        });
        return;
      }

      // 2. Ensure DiscordUser exists
      let discordUser = await prisma.discordUser.findUnique({
        where: { discordId: targetUser.id },
      });
      if (!discordUser) {
        discordUser = await prisma.discordUser.create({
          data: { discordId: targetUser.id, username: targetUser.username },
        });
      }

      // 3. Update DB — set team manager for FO/GM roles
      if (["Franchise Owner", "General Manager"].includes(appointRole)) {
        await prisma.team.update({
          where: { id: team.id },
          data: { managerId: discordUser.id },
        });
      }

      // 4. Assign Discord roles
      let roleAssigned = "";
      const guild = interaction.guild;
      if (guild) {
        try {
          const targetMember = await guild.members.fetch(targetUser.id);

          // Find and assign the appoint role
          const guildRole = guild.roles.cache.find(
            (r) => r.name.toLowerCase() === appointRole.toLowerCase()
          );
          if (guildRole) {
            await targetMember.roles.add(guildRole, `Appointed as ${appointRole}`);
            roleAssigned = guildRole.id;
          }

          // Assign team role too
          if (team.roleId) {
            const teamRole = guild.roles.cache.get(team.roleId);
            if (teamRole) {
              await targetMember.roles.add(teamRole, `Added to ${team.name}`);
            }
          }
        } catch {
          // Non-critical
        }
      }

      // 5. Build confirmation embed
      const confirmEmbed = new EmbedBuilder()
        .setTitle(`${roleDisplay.emoji} Appointment Confirmed`)
        .setColor(roleDisplay.color)
        .setDescription(`${targetUser} has been appointed as **${appointRole}** of **${team.name}**`)
        .setThumbnail(team.emoji ? `https://cdn.discordapp.com/emojis/${team.emoji}.png` : null)
        .addFields(
          { name: "👤 Appointee", value: `${targetUser} (\`${targetUser.id}\`)`, inline: true },
          { name: "🏟️ Team", value: `${team.emoji || ""} ${team.name}`, inline: true },
          { name: "📌 Role", value: `${roleDisplay.emoji} ${appointRole}`, inline: true },
          roleAssigned
            ? { name: "🎭 Discord Role", value: `<@&${roleAssigned}>`, inline: false }
            : null,
        )
        .filter((_: any) => _)
        .setFooter({ text: BRAND.footer })
        .setTimestamp();

      await interaction.editReply({ embeds: [confirmEmbed] });

      // 6. Post to appointments channel if configured
      if (guild) {
        try {
          const config = await prisma.guildConfig.findUnique({
            where: { guildId: guild.id },
          });
          if (config?.newsChannelId) {
            const channel = guild.channels.cache.get(config.newsChannelId);
            if (channel?.isTextBased()) {
              const notifEmbed = new EmbedBuilder()
                .setTitle(`${roleDisplay.emoji} New Appointment`)
                .setColor(roleDisplay.color)
                .setDescription(`**${appointRole}** appointed for **${team.name}**`)
                .addFields(
                  { name: "👤 Person", value: `${targetUser}`, inline: true },
                  { name: "📌 Role", value: appointRole, inline: true },
                  { name: "🏟️ Team", value: `${team.emoji || ""} ${team.name}`, inline: true },
                )
                .setFooter({ text: `Appointed by ${interaction.user.username} • ${BRAND.footer}` })
                .setTimestamp();
              await channel.send({ embeds: [notifEmbed] });
            }
          }
        } catch {
          // Non-critical
        }
      }

    } catch (error) {
      console.error("[Appoint Error]", error);
      await interaction.editReply({
        embeds: [createErrorEmbed("❌ Error", "An error occurred during appointment.")],
      });
    }
  },
};

export default command;
