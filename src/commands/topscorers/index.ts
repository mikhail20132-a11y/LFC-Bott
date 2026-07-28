import { SlashCommandBuilder, CommandInteraction, EmbedBuilder } from "discord.js";
import { playerService } from "../../services/playerService.js";
import type { Command } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("topscorers")
    .setDescription("View the top goalscorers leaderboard"),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply();
    const players = await playerService.getTopGoalscorers(15);
    const embed = new EmbedBuilder()
      .setTitle("⚽ Top Goalscorers")
      .setColor("#FFD700")
      .setDescription(players.length
        ? players.map((p, i) =>
            `${i + 1}. **${p.user.globalName ?? p.user.username}**${p.team ? ` (${p.team.name})` : ""} — **${p.goals}G**`)
          .join("\n")
        : "No data yet."
      )
      .setFooter({ text: "Legacy Football Championship" }).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  },
};
export default command;