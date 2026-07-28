import { SlashCommandBuilder, CommandInteraction, EmbedBuilder } from "discord.js";
import { prisma } from "../../database/prisma.js";
import type { Command } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("topsaves")
    .setDescription("View the top saves leaderboard (Goalkeepers)"),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply();
    const players = await prisma.player.findMany({
      where: { position: "Goalkeeper" },
      orderBy: { saves: "desc" },
      take: 15,
      include: { user: true, team: true },
    });
    const embed = new EmbedBuilder()
      .setTitle("🧤 Top Saves")
      .setColor("#00AA00")
      .setDescription(players.length
        ? players.map((p, i) =>
            `${i + 1}. **${p.user.globalName ?? p.user.username}**${p.team ? ` (${p.team.name})` : ""} — **${p.saves} saves** | 🧹 ${p.cleanSheets} CS`)
          .join("\n")
        : "No goalkeeper data yet."
      )
      .setFooter({ text: "Legacy Football Championship" }).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  },
};
export default command;