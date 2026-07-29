import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { contractService } from "../../services/contractService.js";
import type { Command } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("freeagents")
    .setDescription("List all available free agents (unassigned players)"),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply();

    const freeAgents = await contractService.getFreeAgents();

    const embed = new EmbedBuilder()
      .setTitle("🆓 Free Agents")
      .setColor(BRAND.colors.success);

    if (freeAgents.length === 0) {
      embed.setDescription("No free agents available. All players are under contract.");
    } else {
      // Group by position
      const grouped: Record<string, typeof freeAgents> = {};
      for (const p of freeAgents) {
        if (!grouped[p.position]) grouped[p.position] = [];
        grouped[p.position].push(p);
      }

      for (const [pos, players] of Object.entries(grouped)) {
        const emojis: Record<string, string> = {
          Goalkeeper: "🧤", Defender: "🛡️", Midfielder: "🎯", Forward: "⚽",
        };
        embed.addFields({
          name: `${emojis[pos] ?? "👤"} ${pos}s (${players.length})`,
          value: players
            .slice(0, 8)
            .map((p) =>
              `**${p.user.username}** — ⚽${p.goals}G / 🎯${p.assists}A / 📋${p.appearances}Apps`
            )
            .join("\n") + (players.length > 8 ? `\n*+${players.length - 8} more...*` : ""),
          inline: false,
        });
      }
    }

    embed
      .setFooter({ text: `Total: ${freeAgents.length} free agents • Use /offer to sign` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;