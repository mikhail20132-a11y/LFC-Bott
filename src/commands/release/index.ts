import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { contractService } from "../../services/contractService.js";
import { hasRole, RoleType } from "../../utils/permissions.js";
import { createErrorEmbed } from "../../utils/helpers.js";
import type { Command } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("release")
    .setDescription("Release a player from their team back to free agency (Management only)")
    .addUserOption((opt) =>
      opt.setName("player").setDescription("Player to release").setRequired(true)
    ),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply();

    if (!hasRole(interaction.member as never, RoleType.Founder) &&
        !hasRole(interaction.member as never, RoleType.LeagueManagement)) {
      await interaction.editReply({
        embeds: [createErrorEmbed("❌ Insufficient Permissions","You need **Founder** or **League Management** role.")],
      });
      return;
    }

    const target = interaction.options.getUser("player", true);

    try {
      const player = await contractService.releasePlayer(target.id);
      const embed = new EmbedBuilder()
        .setTitle("🆓 Player Released")
        .setColor("#FFAA00")
        .setDescription(`**${target.username}** has been released from **${player.team?.name ?? "their club"}** and is now a free agent.`)
        .addFields(
          { name: "👤 Player", value: `<@${target.id}>`, inline: true },
          { name: "📊 Status", value: "🆓 Free Agent", inline: true },
          { name: "⚽ Career Stats", value: `${player.goals}G / ${player.assists}A / ${player.appearances} Apps`, inline: false },
        )
        .setFooter({ text: "Legacy Football Championship • Transfers" })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      await interaction.editReply({ content: `❌ ${msg}` });
    }
  },
};

export default command;