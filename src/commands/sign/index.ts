import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { contractService } from "../../services/contractService.js";
import { prisma } from "../../database/prisma.js";
import { hasRole, RoleType } from "../../utils/permissions.js";
import { createErrorEmbed } from "../../utils/helpers.js";
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
    .setName("sign")
    .setDescription("Force-sign a player to a team immediately (Manager/Assistant Manager only)")
    .addUserOption((opt) =>
      opt.setName("player").setDescription("Player to sign").setRequired(true)
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
    await interaction.deferReply();

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
      // Immediate contract signing (same as old /offer flow)
      const { player, contract, team } = await contractService.offerContract({
        discordId: target.id,
        username: target.username,
        teamName,
        position,
        region,
        robloxUsername: roblox ?? undefined,
        roleInTeam: role ?? undefined,
        nickname: nickname ?? undefined,
      });

      // Auto-nickname
      let nicknameResult = "None";
      if (nickname && interaction.guild) {
        try {
          const member = await interaction.guild.members.fetch(target.id);
          await member.setNickname(nickname);
          nicknameResult = nickname;
        } catch {
          nicknameResult = "⚠️ Could not set nickname (check perms)";
        }
      }

      // Auto-generate [SHORT_NAME] Username if no custom nickname given
      if (!nickname && interaction.guild) {
        try {
          const member = await interaction.guild.members.fetch(target.id);
          const shortName = team.shortName || team.name.slice(0, 4).toUpperCase();
          const autoNick = `[${shortName}] ${target.username}`;
          await member.setNickname(autoNick);
          nicknameResult = `✅ ${autoNick}`;
        } catch {
          // Non-critical
        }
      }

      // Auto-assign team role
      let roleResult = "";
      if (interaction.guild && team.roleId) {
        try {
          const member = await interaction.guild.members.fetch(target.id);
          const tRole = await interaction.guild.roles.fetch(team.roleId).catch(() => null);
          if (tRole) {
            await member.roles.add(tRole, "LFC Force Sign");
            roleResult = `\n🎭 Role **${tRole.name}** assigned`;
          }
        } catch {
          // Non-critical
        }
      }

      // Remove Free Agent role if they had it
      if (interaction.guild) {
        try {
          const member = await interaction.guild.members.fetch(target.id);
          const faRole = interaction.guild.roles.cache.find((r) => r.name === "Free Agent");
          if (faRole && member.roles.cache.has(faRole.id)) {
            await member.roles.remove(faRole, "Signed to team");
          }
        } catch {
          // Non-critical
        }
      }

      // Post to news channel
      if (interaction.guild) {
        try {
          const config = await prisma.guildConfig.findUnique({
            where: { guildId: interaction.guild.id },
          });
          if (config?.newsChannelId) {
            const channel = interaction.guild.channels.cache.get(config.newsChannelId);
            if (channel && channel.isTextBased()) {
              const transferEmbed = new EmbedBuilder()
                .setTitle("🔄 Signed!")
                .setColor(0x22c55e)
                .setDescription(`**${target.username}** has been signed to **${team.emoji || ""} ${team.name}**!`)
                .addFields(
                  { name: "👤 Player", value: `<@${target.id}>`, inline: true },
                  { name: "🏟️ Team", value: `${team.emoji || ""} ${team.name}`, inline: true },
                  { name: "⚽ Position", value: position, inline: true },
                  { name: "🎭 Role", value: role ?? "Starter", inline: true },
                )
                .setFooter({ text: "Legacy Football Championship • Transfers" })
                .setTimestamp();
              await channel.send({ embeds: [transferEmbed] });
            }
          }
        } catch {
          // Non-critical
        }
      }

      // Reply with confirmation
      const posEmoji: Record<string, string> = {
        Goalkeeper: "🧤", Defender: "🛡️", Midfielder: "⚡", Forward: "⚽",
      };
      const embed = new EmbedBuilder()
        .setTitle(`${posEmoji[position] || "📝"} Player Signed!`)
        .setColor(0x22c55e)
        .setThumbnail(target.displayAvatarURL())
        .setDescription(`**${target.username}** → **${team.name}** (Force Sign)`)
        .addFields(
          { name: "👤 Player", value: `<@${target.id}>`, inline: true },
          { name: "🏟️ Team", value: `${team.emoji || ""} ${team.name}`, inline: true },
          { name: "⚽ Position", value: position, inline: true },
          { name: "🎭 Role", value: role ?? "Starter", inline: true },
          { name: "🆔 LFC ID", value: `\`${player.lfcId}\``, inline: true },
          { name: "📛 Nickname", value: nicknameResult, inline: true },
        )
        .setFooter({ text: `Contract: ${contract.id.slice(0, 8)}${roleResult}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      console.error("[Sign Error]", error);
      await interaction.editReply({ content: `❌ ${msg}` });
    }
  },
};

export default command;
