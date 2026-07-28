import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ComponentType,
} from "discord.js";
import { playerService } from "../../services/playerService.js";
import { formatSeasonStats, formatDate } from "../../utils/helpers.js";
import type { Command } from "../../types/index.js";

const LEADERBOARD_TYPES = [
  { label: "⚽ Top Goalscorers", value: "goals", emoji: "⚽" },
  { label: "🎯 Top Assists", value: "assists", emoji: "🎯" },
  { label: "🏆 Most MVPs", value: "mvps", emoji: "🏆" },
  { label: "📋 Most Appearances", value: "appearances", emoji: "📋" },
] as const;

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("player")
    .setDescription("Player commands — profile, stats, and leaderboards")
    .addSubcommand((sub) =>
      sub
        .setName("profile")
        .setDescription("View a player profile")
        .addUserOption((opt) =>
          opt
            .setName("player")
            .setDescription("The player to look up")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("stats")
        .setDescription("View a player's detailed career statistics")
        .addUserOption((opt) =>
          opt
            .setName("player")
            .setDescription("The player to view stats for")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("leaderboard")
        .setDescription("View league leaderboards")
        .addStringOption((opt) =>
          opt
            .setName("type")
            .setDescription("Leaderboard category")
            .setRequired(false)
            .addChoices(
              { name: "⚽ Top Goalscorers", value: "goals" },
              { name: "🎯 Top Assists", value: "assists" },
              { name: "🏆 Most MVPs", value: "mvps" },
              { name: "📋 Most Appearances", value: "appearances" }
            )
        )
    ),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case "profile":
        return handleProfile(interaction);
      case "stats":
        return handleStats(interaction);
      case "leaderboard":
        return handleLeaderboard(interaction);
      default:
        await interaction.reply({ content: "❌ Unknown subcommand.", ephemeral: true });
    }
  },
};

async function handleProfile(interaction: CommandInteraction): Promise<void> {
  await interaction.deferReply();

  const targetUser = interaction.options.getUser("player", true);

  try {
    const player = await playerService.getPlayer(targetUser.id);

    if (!player) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Player Not Found")
        .setDescription(
          `${targetUser.username} is not registered as an LFC player yet. They need to play their first match to be registered.`
        )
        .setColor("#FF0000")
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Season stats display
    const seasonStatsText =
      player.seasonStats.length > 0
        ? player.seasonStats
            .map(
              (s) =>
                `**${s.season.name}**: ⚽ ${s.goals}G | 🎯 ${s.assists}A | 🏆 ${s.mvps} MVP | 📋 ${s.appearances} Apps`
            )
            .join("\n")
        : "No season data yet.";

    // Career stats
    const careerStats = {
      goals: player.goals,
      assists: player.assists,
      mvps: player.mvps,
      appearances: player.appearances,
      yellowCards: player.yellowCards,
      redCards: player.redCards,
    };

    // Awards
    const awardsText =
      player.awards.length > 0
        ? player.awards
            .map((a) => `🏅 **${a.type}** — ${a.season.name}`)
            .join("\n")
        : "No awards yet.";

    // Transfers
    const transfers = await playerService.getTransferHistory(player.id);
    const transfersText =
      transfers.length > 0
        ? transfers
            .slice(0, 5)
            .map(
              (t) =>
                `🔄 ${t.fromTeamName ?? "Free Agent"} → ${t.toTeamName ?? "Free Agent"}${t.fee ? ` ($${t.fee}M)` : ""}`
            )
            .join("\n")
        : "No transfer history.";

    const embed = new EmbedBuilder()
      .setTitle(`${targetUser.username} — LFC Profile`)
      .setThumbnail(targetUser.displayAvatarURL())
      .setColor("#00AA00")
      .addFields(
        {
          name: "👤 General",
          value: [
            `**LFC ID:** ${player.lfcId}`,
            `**Discord ID:** ${player.discordId}`,
            `**Joined:** ${formatDate(player.joinedAt)}`,
          ].join("\n"),
          inline: false,
        },
        {
          name: "⚽ Club & Position",
          value: [
            `**Club:** ${player.team?.name ?? "Free Agent"}`,
            `**Position:** ${player.position}`,
            `**Region:** ${player.region}`,
          ].join("\n"),
          inline: true,
        },
        {
          name: "🏆 Trophies & Awards",
          value: `**Trophies:** ${player.trophies}\n${awardsText}`,
          inline: true,
        },
        {
          name: "📊 Season Stats",
          value: seasonStatsText,
          inline: false,
        },
        {
          name: "📈 Career Stats",
          value: formatSeasonStats(careerStats),
          inline: false,
        },
        {
          name: "🔄 Transfer History",
          value: transfersText,
          inline: false,
        }
      )
      .setFooter({ text: "Legacy Football Championship" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("[Player Profile Error]", error);
    await interaction.editReply({
      content: "❌ An error occurred while fetching the player profile.",
    });
  }
}

async function handleStats(interaction: CommandInteraction): Promise<void> {
  await interaction.deferReply();

  const targetUser = interaction.options.getUser("player", true);

  try {
    const player = await playerService.getPlayer(targetUser.id);

    if (!player) {
      await interaction.editReply({
        content: `❌ ${targetUser.username} is not registered as an LFC player.`,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`📊 ${targetUser.username} — Career Statistics`)
      .setThumbnail(targetUser.displayAvatarURL())
      .setColor("#00AA00");

    // Per-season breakdown
    if (player.seasonStats.length > 0) {
      for (const stat of player.seasonStats) {
        embed.addFields({
          name: `📅 ${stat.season.name}`,
          value: formatSeasonStats({
            goals: stat.goals,
            assists: stat.assists,
            mvps: stat.mvps,
            appearances: stat.appearances,
            yellowCards: stat.yellowCards,
            redCards: stat.redCards,
          }),
          inline: true,
        });
      }
    } else {
      embed.addFields({
        name: "No Season Data",
        value: "This player hasn't recorded any stats yet.",
        inline: false,
      });
    }

    // Career totals
    embed.addFields({
      name: "🏆 Career Totals",
      value: formatSeasonStats({
        goals: player.goals,
        assists: player.assists,
        mvps: player.mvps,
        appearances: player.appearances,
        yellowCards: player.yellowCards,
        redCards: player.redCards,
      }),
      inline: false,
    });

    embed.setFooter({ text: "Legacy Football Championship" }).setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("[Player Stats Error]", error);
    await interaction.editReply({
      content: "❌ An error occurred while fetching player stats.",
    });
  }
}

async function handleLeaderboard(interaction: CommandInteraction): Promise<void> {
  await interaction.deferReply();

  const selectedType = interaction.options.getString("type") ?? "goals";

  try {
    await showLeaderboard(interaction, selectedType);
  } catch (error) {
    console.error("[Leaderboard Error]", error);
    await interaction.editReply({
      content: "❌ An error occurred while fetching the leaderboard.",
    });
  }
}

async function showLeaderboard(
  interaction: CommandInteraction,
  type: string
) {
  let players: Array<{
    user: { username: string; globalName: string | null };
    team: { name: string } | null;
    goals: number;
    assists: number;
    mvps: number;
    appearances: number;
  }>;
  let title: string;
  let valueKey: string;

  switch (type) {
    case "assists":
      players = await playerService.getTopAssists();
      title = "🎯 Top Assists";
      valueKey = "assists";
      break;
    case "mvps":
      players = await playerService.getTopMvps();
      title = "🏆 Most MVPs";
      valueKey = "mvps";
      break;
    case "appearances":
      players = await playerService.getTopAppearances();
      title = "📋 Most Appearances";
      valueKey = "appearances";
      break;
    default:
      players = await playerService.getTopGoalscorers();
      title = "⚽ Top Goalscorers";
      valueKey = "goals";
  }

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor("#00AA00")
    .setDescription(
      players.length > 0
        ? players
            .map(
              (p, i) =>
                `${i + 1}. **${p.user.globalName ?? p.user.username}**` +
                `${p.team ? ` (${p.team.name})` : ""} — **${(p as Record<string, number>)[valueKey]}**`
            )
            .join("\n")
        : "No data available yet."
    )
    .setFooter({ text: "Legacy Football Championship" })
    .setTimestamp();

  // Add a select menu to switch leaderboard types
  const select = new StringSelectMenuBuilder()
    .setCustomId("leaderboard_select")
    .setPlaceholder("Switch leaderboard...")
    .addOptions(
      LEADERBOARD_TYPES.map((lt) => ({
        label: lt.label,
        value: lt.value,
      }))
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    select
  );

  const reply = await interaction.editReply({
    embeds: [embed],
    components: [row],
  });

  // Handle select menu interaction
  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    time: 60_000,
  });

  collector.on("collect", async (selectInteraction) => {
    if (selectInteraction.user.id !== interaction.user.id) {
      await selectInteraction.reply({
        content: "❌ Only the command author can use this.",
        ephemeral: true,
      });
      return;
    }

    await selectInteraction.deferUpdate();
    await showLeaderboard(
      selectInteraction as unknown as CommandInteraction,
      selectInteraction.values[0]
    );
  });

  collector.on("end", async () => {
    const disabledRow = ActionRowBuilder.from<StringSelectMenuBuilder>(row);
    disabledRow.components.forEach((c) => c.setDisabled(true));

    await interaction.editReply({ components: [disabledRow] });
  });
}

export default command;
