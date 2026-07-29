import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { prisma } from "../../database/prisma.js";
import { hasRole, RoleType } from "../../utils/permissions.js";
import { createSuccessEmbed, createErrorEmbed, BRAND } from "../../utils/helpers.js";
import type { Command } from "../../types/index.js";

const PROMOTE_ROLES = [
  { name: "👑 Captain", value: "Captain" },
  { name: "⭐ Vice Captain", value: "Vice Captain" },
  { name: "🏃 Starter", value: "Starter" },
  { name: "📚 Academy", value: "Academy" },
];

const TEAM_ROLE_EMOJIS: Record<string, string> = {
  Captain: "👑", "Vice Captain": "⭐", Starter: "🏃", Sub: "🔄", Academy: "📚",
};

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("promote")
    .setDescription("Promote a player to a team role (Captain, Vice Captain, etc.)")
    .addUserOption((opt) =>
      opt.setName("player").setDescription("The player to promote").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("role").setDescription("Team role to assign").setRequired(true)
        .addChoices(...PROMOTE_ROLES)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    if (!hasRole(interaction.member as never, RoleType.Manager) &&
        !hasRole(interaction.member as never, RoleType.AssistantManager)) {
      await interaction.editReply({ embeds: [createErrorEmbed("❌ Insufficient Permissions", "You need **Manager** or **Assistant Manager** role.")] });
      return;
    }

    const targetUser = interaction.options.getUser("player", true);
    const roleValue = interaction.options.getString("role", true);
    const emoji = TEAM_ROLE_EMOJIS[roleValue] || "📌";

    try {
      const player = await prisma.player.findUnique({
        where: { discordId: targetUser.id },
        include: { team: true, user: true },
      });

      if (!player) {
        await interaction.editReply({
          embeds: [createErrorEmbed("❌ Player Not Found", `${targetUser.username} is not registered.`)],
        });
        return;
      }

      await prisma.player.update({
        where: { discordId: targetUser.id },
        data: { roleInTeam: roleValue as any },
      });

      const embed = new EmbedBuilder()
        .setTitle(`${emoji} Player Promoted`)
        .setColor(BRAND.colors.success)
        .setDescription(`${targetUser} has been promoted to **${roleValue}**`)
        .addFields(
          { name: "👤 Player", value: `${targetUser}`, inline: true },
          { name: "📌 Role", value: `${emoji} ${roleValue}`, inline: true },
          player.team ? { name: "🏟️ Team", value: `${player.team.emoji || ""} ${player.team.name}`, inline: true } : null,
        )
        .filter((f: any) => f)
        .setFooter({ text: BRAND.footer })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      // Post to news channel
      if (interaction.guild) {
        try {
          const config = await prisma.guildConfig.findUnique({ where: { guildId: interaction.guild.id } });
          if (config?.newsChannelId) {
            const channel = interaction.guild.channels.cache.get(config.newsChannelId);
            if (channel?.isTextBased()) {
              await channel.send({
                embeds: [
                  new EmbedBuilder()
                    .setTitle(`${emoji} Promotion`)
                    .setColor(BRAND.colors.success)
                    .setDescription(`${targetUser} promoted to **${roleValue}**${player.team ? ` for ${player.team.emoji || ""} ${player.team.name}` : ""}`)
                    .setFooter({ text: BRAND.footer })
                    .setTimestamp(),
                ],
              });
            }
          }
        } catch {}
      }
    } catch (error) {
      console.error("[Promote Error]", error);
      await interaction.editReply({ embeds: [createErrorEmbed("❌ Error", "Failed to promote player.")] });
    }
  },
};

export default command;