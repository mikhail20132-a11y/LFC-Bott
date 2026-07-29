import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { prisma } from "../../database/prisma.js";
import { hasRole, RoleType } from "../../utils/permissions.js";
import { createSuccessEmbed, createErrorEmbed, BRAND } from "../../utils/helpers.js";
import type { Command } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("demote")
    .setDescription("Demote a player — removes their leadership role")
    .addUserOption((opt) =>
      opt.setName("player").setDescription("The player to demote").setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    if (!hasRole(interaction.member as never, RoleType.Manager) &&
        !hasRole(interaction.member as never, RoleType.AssistantManager)) {
      await interaction.editReply({ embeds: [createErrorEmbed("❌ Insufficient Permissions", "You need **Manager** or **Assistant Manager** role.")] });
      return;
    }

    const targetUser = interaction.options.getUser("player", true);

    try {
      const player = await prisma.player.findUnique({
        where: { discordId: targetUser.id },
        include: { team: true, user: true },
      });

      if (!player) {
        await interaction.editReply({ embeds: [createErrorEmbed("❌ Player Not Found", `${targetUser.username} is not registered.`)] });
        return;
      }

      if (!player.roleInTeam || player.roleInTeam === "Starter") {
        await interaction.editReply({ embeds: [createErrorEmbed("❌ No Leadership Role", `${targetUser} doesn't hold a leadership role.`)] });
        return;
      }

      const oldRole = player.roleInTeam;
      await prisma.player.update({
        where: { discordId: targetUser.id },
        data: { roleInTeam: "Starter" },
      });

      const embed = new EmbedBuilder()
        .setTitle("⬇️ Player Demoted")
        .setColor(BRAND.colors.warning)
        .setDescription(`${targetUser} demoted from **${oldRole}** → **Starter**`)
        .addFields(
          { name: "👤 Player", value: `${targetUser}`, inline: true },
          { name: "📌 Previously", value: oldRole, inline: true },
          { name: "📌 Now", value: "🏃 Starter", inline: true },
          player.team ? { name: "🏟️ Team", value: `${player.team.emoji || ""} ${player.team.name}`, inline: false } : null,
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
              await channel.send({ embeds: [
                new EmbedBuilder()
                  .setTitle("⬇️ Demotion Notice")
                  .setColor(BRAND.colors.warning)
                  .setDescription(`${targetUser} has been demoted from **${oldRole}** → Starter`)
                  .setFooter({ text: BRAND.footer }).setTimestamp(),
              ]});
            }
          }
        } catch {}
      }
    } catch (error) {
      console.error("[Demote Error]", error);
      await interaction.editReply({ embeds: [createErrorEmbed("❌ Error", "Failed to demote.")] });
    }
  },
};

export default command;