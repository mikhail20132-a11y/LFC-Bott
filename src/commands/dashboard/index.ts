import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import { playerService } from "../../services/playerService.js";
import { contractService } from "../../services/contractService.js";
import { matchService } from "../../services/matchService.js";
import { predictionService } from "../../services/predictionService.js";
import { prisma } from "../../database/prisma.js";
import type { Command } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("dashboard")
    .setDescription("Your personal LFC control panel"),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply();
    await showDashboard(interaction, "overview");
  },
};

async function showDashboard(interaction: CommandInteraction, tab: string) {
  const userId = interaction.user.id;
  const player = await playerService.getPlayer(userId);

  if (!player) {
    await interaction.editReply({ content: "❌ You're not registered as an LFC player yet. Get offered a contract first!" });
    return;
  }

  let embed: EmbedBuilder;

  switch (tab) {
    case "contract": {
      const contract = await contractService.getActiveContract(player.id);
      embed = new EmbedBuilder()
        .setTitle("📝 My Contract")
        .setColor("#00AA00")
        .setDescription(contract
          ? `**Club:** ${contract.team.name}\n**Role:** ${contract.roleInTeam ?? "Starter"}\n**Signed:** <t:${Math.floor(contract.signedAt.getTime() / 1000)}:R>`
          : "No active contract. You're a free agent.")
        .setFooter({ text: "Legacy Football Championship" }).setTimestamp();
      break;
    }
    case "stats": {
      const activeStat = player.seasonStats.find((s) => s.season.isActive);
      embed = new EmbedBuilder()
        .setTitle("📊 My Stats")
        .setColor("#00AA00")
        .addFields(
          { name: "📈 This Season", value: activeStat
            ? `⚽ ${activeStat.goals}G | 🎯 ${activeStat.assists}A | 🧤 ${activeStat.saves}S | 🏆 ${activeStat.mvps}MVP\n📋 ${activeStat.appearances}Apps | 🧹 ${activeStat.cleanSheets}CS`
            : "No active season.", inline: false },
          { name: "🏆 Career", value: `⚽ ${player.goals}G | 🎯 ${player.assists}A | 🧤 ${player.saves}S | 🏆 ${player.mvps}MVP\n📋 ${player.appearances}Apps | 🏅 ${player.trophies}Trophies`, inline: false },
        )
        .setFooter({ text: "Legacy Football Championship" }).setTimestamp();
      break;
    }
    case "predictions": {
      const predStats = await predictionService.getUserStats(userId);
      embed = new EmbedBuilder()
        .setTitle("🔮 My Predictions")
        .setColor("#FF6600")
        .addFields(
          { name: "📊 Record", value: `✅ ${predStats.correct} correct | ❌ ${predStats.total - predStats.correct} wrong | 📊 ${predStats.accuracy}% accuracy`, inline: false },
          { name: "📋 Recent Picks", value: predStats.predictions.slice(0, 5).map((p) =>
            `${p.match.homeTeam.name} vs ${p.match.awayTeam.name}: ${p.predictedDraw ? "🤝 Draw" : p.predictedTeamId === p.match.homeTeamId ? `🏠 ${p.match.homeTeam.name}` : `🚗 ${p.match.awayTeam.name}`}${p.resolved ? p.points > 0 ? " ✅" : " ❌" : " ⏳"}`
          ).join("\n") || "No predictions yet.", inline: false },
        )
        .setFooter({ text: "Legacy Football Championship" }).setTimestamp();
      break;
    }
    default: {
      const contract = await contractService.getActiveContract(player.id);
      const upcomingMatches = contract
        ? await prisma.match.findMany({
            where: {
              OR: [{ homeTeamId: contract.teamId }, { awayTeamId: contract.teamId }],
              status: "Scheduled",
            },
            include: { homeTeam: true, awayTeam: true },
            take: 3,
          })
        : [];

      embed = new EmbedBuilder()
        .setTitle(`👋 Welcome, ${interaction.user.username}`)
        .setThumbnail(interaction.user.displayAvatarURL())
        .setColor("#00AA00")
        .setDescription(`**LFC ID:** ${player.lfcId}\n**Club:** ${player.team?.name ?? "🆓 Free Agent"}\n**Position:** ${player.position} | **Region:** ${player.region}`)
        .addFields(
          { name: "⚽ Season Stats", value: `⚽${player.goals}G 🎯${player.assists}A 🏆${player.mvps}MVP`, inline: true },
          { name: "🏆 Trophies", value: `${player.trophies}`, inline: true },
          { name: "📋 Appearances", value: `${player.appearances}`, inline: true },
        );

      if (upcomingMatches.length) {
        embed.addFields({
          name: "📅 Upcoming Fixtures",
          value: upcomingMatches.map((m) => `• ${m.homeTeam.name} vs ${m.awayTeam.name}`).join("\n"),
          inline: false,
        });
      }
    }
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("dash_overview").setLabel("🏠 Home").setStyle(tab === "overview" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("dash_stats").setLabel("📊 Stats").setStyle(tab === "stats" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("dash_contract").setLabel("📝 Contract").setStyle(tab === "contract" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("dash_predictions").setLabel("🔮 Predictions").setStyle(tab === "predictions" ? ButtonStyle.Primary : ButtonStyle.Secondary),
  );

  const reply = await interaction.editReply({ embeds: [embed], components: [row] });

  const collector = reply.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120_000 });
  collector.on("collect", async (bi) => {
    if (bi.user.id !== interaction.user.id) { await bi.reply({ content: "❌ Not your dashboard.", ephemeral: true }); return; }
    await bi.deferUpdate();
    const newTab = bi.customId.replace("dash_", "");
    await showDashboard(bi as unknown as CommandInteraction, newTab);
  });
  collector.on("end", async () => {
    const dr = ActionRowBuilder.from<ButtonBuilder>(row);
    dr.components.forEach((c) => c.setDisabled(true));
    await interaction.editReply({ components: [dr] }).catch(() => {});
  });
}

export default command;