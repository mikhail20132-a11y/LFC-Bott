import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { prisma } from "../../database/prisma.js";
import { createErrorEmbed } from "../../utils/helpers.js";
import type { Command } from "../../types/index.js";

const POSITION_COLORS: Record<string, string> = {
  Goalkeeper: "#FFD700",
  Defender: "#00AAFF",
  Midfielder: "#00CC66",
  Forward: "#FF4444",
};

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("card")
    .setDescription("View a player's profile card")
    .addUserOption((o) => o.setName("player").setDescription("Player to view").setRequired(true)),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply();

    const target = interaction.options.getUser("player", true);
    const player = await prisma.player.findUnique({
      where: { discordId: target.id },
      include: { user: true, team: true, seasonStats: { include: { season: true } } },
    });
    if (!player) {
      await interaction.editReply({
        embeds: [createErrorEmbed("❌ Player Not Found", `${target.username} isn't registered as a player.`)],
      });
      return;
    }

    const color = POSITION_COLORS[player.position] || "#00AA00";
    const rating = Math.min(99, Math.max(60, player.goals * 3 + player.appearances + 60));
    const posEmoji: Record<string, string> = { Goalkeeper: "🧤", Defender: "🛡️", Midfielder: "⚡", Forward: "⚽" };

    const embed = new EmbedBuilder()
      .setTitle(`🎴 ${target.username} — Player Card`)
      .setColor(color)
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: "⭐ Rating", value: `${rating}/99`, inline: true },
        { name: "📍 Position", value: `${posEmoji[player.position] || "🎯"} ${player.position}`, inline: true },
        { name: "🏷️ LFC ID", value: `\`${player.lfcId}\``, inline: true },
        { name: "\u200B", value: "\u200B", inline: false },
        { name: "⚽ Goals", value: `${player.goals}`, inline: true },
        { name: "🎯 Assists", value: `${player.assists}`, inline: true },
        { name: "📋 Apps", value: `${player.appearances}`, inline: true },
        { name: "🏆 MVPs", value: `${player.mvps}`, inline: true },
        { name: "🟨 Yellows", value: `${player.yellowCards}`, inline: true },
        { name: "🟥 Reds", value: `${player.redCards}`, inline: true },
      )
      .setFooter({ text: `Team: ${player.team?.name || "Free Agent"}` });

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;