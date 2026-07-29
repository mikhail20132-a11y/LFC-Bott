import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ComponentType,
} from "discord.js";
import { playerService } from "../../services/playerService.js";
import { predictionService } from "../../services/predictionService.js";
import { prisma } from "../../database/prisma.js";
import { leagueService } from "../../services/leagueService.js";
import type { Command } from "../../types/index.js";

const BOARDS = [
  { label: "⚽ Golden Boot (Goals)", value: "goals", emoji: "⚽" },
  { label: "🎯 Playmaker (Assists)", value: "assists", emoji: "🎯" },
  { label: "🧤 Golden Glove (Saves)", value: "saves", emoji: "🧤" },
  { label: "🏆 Most MVPs", value: "mvps", emoji: "🏆" },
  { label: "📋 Most Appearances", value: "apps", emoji: "📋" },
  { label: "🔮 Prediction King", value: "predictions", emoji: "🔮" },
];

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("leaderboards")
    .setDescription("View all award rankings in one place with a dropdown"),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply();
    await showBoard(interaction, "goals");
  },
};

async function showBoard(interaction: CommandInteraction, type: string) {
  let embed: EmbedBuilder;

  switch (type) {
    case "assists": {
      const players = await playerService.getTopAssists(10);
      embed = makeBoardEmbed("🎯 Playmaker Rankings — Top Assists", "#00AAFF", players, "assists", "A");
      break;
    }
    case "saves": {
      const players = await prisma.player.findMany({ where: { position: "Goalkeeper" }, orderBy: { saves: "desc" }, take: 10, include: { user: true, team: true } });
      embed = new EmbedBuilder().setTitle("🧤 Golden Glove — Top Saves").setColor("#00AA00")
        .setDescription(players.length ? players.map((p, i) => `${i + 1}. **${p.user.globalName ?? p.user.username}**${p.team ? ` (${p.team.name})` : ""} — **${p.saves} saves** | 🧹 ${p.cleanSheets} CS`).join("\n") : "No data.")
        .setFooter({ text: "Legacy Football Championship" }).setTimestamp();
      break;
    }
    case "mvps": {
      const players = await playerService.getTopMvps(10);
      embed = makeBoardEmbed("🏆 Most Valuable Players — Top MVPs", "#FFD700", players, "mvps", "MVP");
      break;
    }
    case "apps": {
      const players = await playerService.getTopAppearances(10);
      embed = makeBoardEmbed("📋 Iron Men — Most Appearances", "#00AA00", players, "appearances", "Apps");
      break;
    }
    case "predictions": {
      const season = await leagueService.getActiveSeason();
      const list = season ? await predictionService.getLeaderboard(season.id) : [];
      embed = new EmbedBuilder().setTitle("🔮 Prediction King").setColor("#FF6600")
        .setDescription(list.length
          ? list.slice(0, 10).map((u, i) => `${i + 1}. <@${u.userId}> — **${u.points} pts**`).join("\n")
          : "No predictions yet. Use `/predict` on matches!")
        .setFooter({ text: "Legacy Football Championship" }).setTimestamp();
      break;
    }
    default: {
      const players = await playerService.getTopGoalscorers(10);
      embed = makeBoardEmbed("⚽ Golden Boot — Top Goalscorers", "#FFD700", players, "goals", "G");
    }
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId("lb_select").setPlaceholder("Switch leaderboard...")
    .addOptions(BOARDS.map((b) => ({ label: b.label, value: b.value })));

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
  const reply = await interaction.editReply({ embeds: [embed], components: [row] });

  const collector = reply.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 120_000 });
  collector.on("collect", async (si) => {
    if (si.user.id !== interaction.user.id) { await si.reply({ content: "❌ Not your menu.", ephemeral: true }); return; }
    await si.deferUpdate();
    await showBoard(si as unknown as CommandInteraction, si.values[0]);
  });
  collector.on("end", async () => {
    const dr = ActionRowBuilder.from<StringSelectMenuBuilder>(row);
    dr.components.forEach((c) => c.setDisabled(true));
    await interaction.editReply({ components: [dr] });
  });
}

function makeBoardEmbed(title: string, color: string, players: Array<{ user: { username: string; globalName: string | null }; team: { name: string } | null; goals: number; assists: number; mvps: number; appearances: number }>, key: string, suffix: string) {
  return new EmbedBuilder().setTitle(title).setColor(color as never)
    .setDescription(players.length
      ? players.map((p, i) => `${i + 1}. **${p.user.globalName ?? p.user.username}**${p.team ? ` (${p.team.name})` : ""} — **${(p as any)[key] ?? 0}${suffix}**`).join("\n")
      : "No data.")
    .setFooter({ text: "Legacy Football Championship" }).setTimestamp();
}

export default command;