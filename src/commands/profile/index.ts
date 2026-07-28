import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { playerService } from "../../services/playerService.js";
import { contractService } from "../../services/contractService.js";
import { formatDate, formatSeasonStats } from "../../utils/helpers.js";
import type { Command } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("View a unified player profile with Roblox info and season stats")
    .addUserOption((opt) =>
      opt.setName("player").setDescription("Player to view").setRequired(true)
    ),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply();

    const target = interaction.options.getUser("player", true);

    try {
      const player = await playerService.getPlayer(target.id);
      if (!player) {
        await interaction.editReply({
          content: `❌ ${target.username} is not registered as an LFC player.`,
        });
        return;
      }

      const contract = await contractService.getActiveContract(player.id);

      // Build season stats string
      const activeStat = player.seasonStats.find((s) => s.season.isActive);
      const seasonLine = activeStat
        ? formatSeasonStats({
            goals: activeStat.goals,
            assists: activeStat.assists,
            saves: activeStat.saves,
            mvps: activeStat.mvps,
            appearances: activeStat.appearances,
            yellowCards: activeStat.yellowCards,
            redCards: activeStat.redCards,
            cleanSheets: activeStat.cleanSheets,
          })
        : "No active season data.";

      const embed = new EmbedBuilder()
        .setTitle(`👤 ${target.username} — Player Profile`)
        .setThumbnail(target.displayAvatarURL())
        .setColor("#00AA00")
        .addFields(
          {
            name: "🆔 Identity",
            value: [
              `**LFC ID:** ${player.lfcId}`,
              `**Discord:** ${target.username}`,
              player.robloxUsername ? `**Roblox:** ${player.robloxUsername}` : null,
              `**Joined:** ${formatDate(player.joinedAt)}`,
            ].filter(Boolean).join("\n"),
            inline: true,
          },
          {
            name: "⚽ Football",
            value: [
              `**Club:** ${player.team?.name ?? "🆓 Free Agent"}`,
              `**Position:** ${player.position}`,
              `**Region:** ${player.region}`,
              player.nickname ? `**Nickname:** ${player.nickname}` : null,
            ].filter(Boolean).join("\n"),
            inline: true,
          },
          {
            name: "🎭 Team Role",
            value: player.roleInTeam ?? "Unassigned",
            inline: true,
          },
          {
            name: "📈 Active Season Stats",
            value: seasonLine,
            inline: false,
          },
          {
            name: "🏆 Career Totals",
            value: formatSeasonStats({
              goals: player.goals,
              assists: player.assists,
              saves: player.saves,
              mvps: player.mvps,
              appearances: player.appearances,
              yellowCards: player.yellowCards,
              redCards: player.redCards,
              cleanSheets: player.cleanSheets,
            }),
            inline: false,
          },
          {
            name: "📋 Contract",
            value: contract
              ? `**${contract.team.name}** — ${contract.roleInTeam ?? "Starter"}\nSigned: ${formatDate(contract.signedAt)}`
              : "No active contract",
            inline: false,
          },
        )
        .setFooter({ text: `Trophies: ${player.trophies} 🏆 | Legacy Football Championship` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("[Profile Error]", error);
      await interaction.editReply({ content: "❌ An error occurred." });
    }
  },
};

export default command;