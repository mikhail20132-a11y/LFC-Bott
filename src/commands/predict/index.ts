import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { prisma } from "../../database/prisma.js";
import { predictionService } from "../../services/predictionService.js";
import type { Command } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("predict")
    .setDescription("Predict the outcome of an upcoming match")
    .addStringOption((o) => o.setName("match_id").setDescription("Match ID").setRequired(true))
    .addStringOption((o) => o.setName("winner").setDescription("Who wins?").setRequired(true)
      .addChoices(
        { name: "🏠 Home Team", value: "home" },
        { name: "🚗 Away Team", value: "away" },
        { name: "🤝 Draw", value: "draw" },
      )),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply({ ephemeral: true });

    const matchId = interaction.options.getString("match_id", true);
    const winner = interaction.options.getString("winner", true);

    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: { homeTeam: true, awayTeam: true },
    });
    if (!match) { await interaction.editReply({ content: "❌ Match not found." }); return; }
    if (match.status !== "Scheduled") { await interaction.editReply({ content: "❌ This match has already started or finished." }); return; }

    let predictedTeamId: string | undefined;
    let draw = false;

    if (winner === "home") predictedTeamId = match.homeTeamId;
    else if (winner === "away") predictedTeamId = match.awayTeamId;
    else draw = true;

    await predictionService.predict({
      matchId,
      userId: interaction.user.id,
      teamId: predictedTeamId,
      draw,
    });

    const prediction = draw ? "🤝 Draw" : `${winner === "home" ? match.homeTeam.name : match.awayTeam.name} wins`;

    const embed = new EmbedBuilder()
      .setTitle("🔮 Prediction Submitted")
      .setColor("#FF6600")
      .setDescription(`You predicted: **${prediction}**`)
      .addFields(
        { name: "⚽ Match", value: `${match.homeTeam.name} vs ${match.awayTeam.name}`, inline: false },
        { name: "🎯 Your Pick", value: prediction, inline: true },
        { name: "💰 Reward", value: "**3 pts** for correct prediction", inline: true },
      )
      .setFooter({ text: "Legacy Football Championship • Predictions" }).setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
export default command;