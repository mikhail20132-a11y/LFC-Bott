import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { teamService } from "../../services/teamService.js";
import { playerService } from "../../services/playerService.js";
import { prisma } from "../../database/prisma.js";
import { leagueService } from "../../services/leagueService.js";
import { hasRole, RoleType } from "../../utils/permissions.js";
import { createErrorEmbed, formatDate } from "../../utils/helpers.js";
import type { Command, Position } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("team")
    .setDescription("Team commands — create, info, roster, and stats")
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("Create a new team (Management only)")
        .addStringOption((opt) =>
          opt
            .setName("name")
            .setDescription("Full team name (e.g. Legacy FC)")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("short")
            .setDescription("Short name (e.g. LFC)")
            .setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName("description")
            .setDescription("Team description")
            .setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName("emoji")
            .setDescription("Team emoji (e.g. ⚽)")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("info")
        .setDescription("View team information")
        .addStringOption((opt) =>
          opt
            .setName("name")
            .setDescription("Team name")
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("roster")
        .setDescription("View a team's full roster")
        .addStringOption((opt) =>
          opt
            .setName("name")
            .setDescription("Team name")
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("stats")
        .setDescription("View detailed team statistics")
        .addStringOption((opt) =>
          opt
            .setName("name")
            .setDescription("Team name")
            .setRequired(true)
            .setAutocomplete(true)
        )
    ),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case "create":
        return handleCreate(interaction);
      case "info":
        return handleInfo(interaction);
      case "roster":
        return handleRoster(interaction);
      case "stats":
        return handleStats(interaction);
      default:
        await interaction.reply({ content: "❌ Unknown subcommand.", ephemeral: true });
    }
  },
};

async function handleCreate(interaction: CommandInteraction): Promise<void> {
  await interaction.deferReply();

  // Permission check
  const member = interaction.member;
  if (
    !hasRole(member as never, RoleType.Founder) &&
    !hasRole(member as never, RoleType.LeagueManagement)
  ) {
    await interaction.editReply({
      embeds: [
        createErrorEmbed(
          "❌ Insufficient Permissions",
          "You need the **Founder** or **League Management** role to create teams."
        ),
      ],
    });
    return;
  }

  const name = interaction.options.getString("name", true);
  const shortName = interaction.options.getString("short");
  const description = interaction.options.getString("description");
  const emoji = interaction.options.getString("emoji");
  const managerDiscordId = interaction.user.id;

  try {
    // Ensure user exists in DB
    await playerService.getOrCreatePlayer(managerDiscordId, interaction.user.username);
    
    // Get DiscordUser internal ID for the foreign key
    const discordUser = await prisma.discordUser.findUnique({
      where: { discordId: managerDiscordId }
    });
    if (!discordUser) throw new Error("Discord user not found after creation");
    const managerId = discordUser.id;

    // Check if team name is taken
    const existing = await teamService.getTeamByName(name);
    if (existing) {
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            "❌ Team Already Exists",
            `A team named **${name}** already exists.`
          ),
        ],
      });
      return;
    }

    // Create Discord role for the team
    let roleId = null;
    try {
      if (interaction.guild) {
        const role = await interaction.guild.roles.create({
          name: name,
          mentionable: true,
          reason: `LFC Team role for ${name}`,
        });
        roleId = role.id;
      }
    } catch (roleErr) {
      console.error("[Role Create Error]", roleErr);
      // Non-critical - team still created without a role
    }

    const team = await teamService.createTeam({
      name,
      shortName: shortName ?? undefined,
      description: description ?? undefined,
      emoji: emoji ?? undefined,
      roleId: roleId,
      managerId,
    });

    const embed = new EmbedBuilder()
      .setTitle(`${emoji || "🏟️"} Team Created: ${team.name}`)
      .setColor("#00AA00")
      .addFields(
        { name: "📛 Name", value: team.name, inline: true },
        {
          name: "🔤 Short Name",
          value: team.shortName ?? "None",
          inline: true,
        },
        {
          name: "👤 Manager",
          value: `<@${team.manager.discordId}>`,
          inline: true,
        },
        {
          name: "🎭 Team Role",
          value: roleId ? `<@&${roleId}>` : "Not created (check perms)",
          inline: true,
        },
        {
          name: "📝 Description",
          value: team.description ?? "No description.",
          inline: false,
        }
      )
      .setFooter({ text: "Legacy Football Championship" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("[Team Create Error]", error);
    await interaction.editReply({
      content: "❌ An error occurred while creating the team.",
    });
  }
}

async function handleInfo(interaction: CommandInteraction): Promise<void> {
  await interaction.deferReply();

  const teamName = interaction.options.getString("name", true);

  try {
    const team = await teamService.getTeamByName(teamName);

    if (!team) {
      await interaction.editReply({
        content: `❌ Team **${teamName}** not found.`,
      });
      return;
    }

    // Get current season stats
    const seasonStats = team.seasonTeams[team.seasonTeams.length - 1];

    const embed = new EmbedBuilder()
      .setTitle(`🏟️ ${team.name} ${team.shortName ? `(${team.shortName})` : ""}`)
      .setColor("#00AA00")
      .addFields(
        {
          name: "👤 Manager",
          value: `<@${team.manager.discordId}>`,
          inline: true,
        },
        {
          name: "👥 Squad Size",
          value: `${team.players.length} players`,
          inline: true,
        },
        {
          name: "🏆 Trophies",
          value: `${team.trophies}`,
          inline: true,
        },
        {
          name: "📝 Description",
          value: team.description ?? "No description set.",
          inline: false,
        }
      );

    // Add season stats if available
    if (seasonStats) {
      embed.addFields({
        name: `📊 Season Record (${seasonStats.season?.name ?? "Current"})`,
        value: [
          `**Played:** ${seasonStats.played}`,
          `**Wins:** ${seasonStats.wins}`,
          `**Draws:** ${seasonStats.draws}`,
          `**Losses:** ${seasonStats.losses}`,
          `**Goals For:** ${seasonStats.goalsFor}`,
          `**Goals Against:** ${seasonStats.goalsAgainst}`,
          `**GD:** ${seasonStats.goalsFor - seasonStats.goalsAgainst}`,
          `**Points:** ${seasonStats.points}`,
        ].join(" | "),
        inline: false,
      });
    }

    // Top 5 players by goals
    const topScorers = [...team.players]
      .sort((a, b) => b.goals - a.goals)
      .slice(0, 5);

    if (topScorers.length > 0) {
      embed.addFields({
        name: "⚽ Top Scorers",
        value: topScorers
          .map(
            (p, i) =>
              `${i + 1}. **${p.user.username}** — ${p.goals}G / ${p.assists}A`
          )
          .join("\n"),
        inline: false,
      });
    }

    embed
      .setFooter({ text: "Legacy Football Championship" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("[Team Info Error]", error);
    await interaction.editReply({
      content: "❌ An error occurred while fetching team info.",
    });
  }
}

async function handleRoster(interaction: CommandInteraction): Promise<void> {
  await interaction.deferReply();

  const teamName = interaction.options.getString("name", true);

  try {
    const team = await teamService.getTeamByName(teamName);

    if (!team) {
      await interaction.editReply({
        content: `❌ Team **${teamName}** not found.`,
      });
      return;
    }

    const positions: Position[] = [
      "Goalkeeper",
      "Defender",
      "Midfielder",
      "Forward",
    ];

    const embed = new EmbedBuilder()
      .setTitle(`👥 ${team.name} — Squad Roster`)
      .setColor("#00AA00");

    let totalPlayers = 0;

    for (const pos of positions) {
      const positionPlayers = team.players.filter(
        (p) => p.position === pos
      );

      if (positionPlayers.length > 0) {
        totalPlayers += positionPlayers.length;
        embed.addFields({
          name: `${getPositionEmoji(pos)} ${pos}s (${positionPlayers.length})`,
          value: positionPlayers
            .map(
              (p) =>
                `**${p.user.username}** — ⚽ ${p.goals}G / 🎯 ${p.assists}A / 🏆 ${p.mvps} MVP`
            )
            .join("\n"),
          inline: false,
        });
      } else {
        embed.addFields({
          name: `${getPositionEmoji(pos)} ${pos}s`,
          value: "No players",
          inline: true,
        });
      }
    }

    embed.setFooter({
      text: `Total: ${totalPlayers} players | Legacy Football Championship`,
    });
    embed.setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("[Team Roster Error]", error);
    await interaction.editReply({
      content: "❌ An error occurred while fetching the roster.",
    });
  }
}

function getPositionEmoji(position: Position): string {
  switch (position) {
    case "Goalkeeper":
      return "🧤";
    case "Defender":
      return "🛡️";
    case "Midfielder":
      return "🎯";
    case "Forward":
      return "⚽";
    default:
      return "👤";
  }
}

async function handleStats(interaction: CommandInteraction): Promise<void> {
  await interaction.deferReply();

  const teamName = interaction.options.getString("name", true);

  try {
    const team = await teamService.getTeamByName(teamName);

    if (!team) {
      await interaction.editReply({
        content: `❌ Team **${teamName}** not found.`,
      });
      return;
    }

    const activeSeason = await leagueService.getActiveSeason();

    const embed = new EmbedBuilder()
      .setTitle(`📊 ${team.name} — Statistics`)
      .setColor("#00AA00");

    // Season-by-season breakdown
    if (team.seasonTeams.length > 0) {
      for (const stat of team.seasonTeams) {
        const gd = stat.goalsFor - stat.goalsAgainst;
        const gdText = gd >= 0 ? `+${gd}` : `${gd}`;
        embed.addFields({
          name: `📅 ${stat.season?.name ?? "Unknown Season"}`,
          value: [
            `**Played:** ${stat.played}`,
            `**Wins:** ${stat.wins}`,
            `**Draws:** ${stat.draws}`,
            `**Losses:** ${stat.losses}`,
            `**GF:** ${stat.goalsFor} | **GA:** ${stat.goalsAgainst} | **GD:** ${gdText}`,
            `**Points:** ${stat.points} (${((stat.points / (stat.played * 3)) * 100).toFixed(1)}% win rate)`,
          ].join("\n"),
          inline: true,
        });
      }
    } else {
      embed.addFields({
        name: "No Season Data",
        value: "This team hasn't played any matches yet.",
        inline: false,
      });
    }

    // Player contributions
    const topScorer = [...team.players].sort((a, b) => b.goals - a.goals)[0];
    const topAssist = [...team.players].sort(
      (a, b) => b.assists - a.assists
    )[0];
    const topMvp = [...team.players].sort((a, b) => b.mvps - a.mvps)[0];

    embed.addFields({
      name: "🌟 Key Players",
      value: [
        `⚽ **Top Scorer:** ${topScorer ? `${topScorer.user.username} (${topScorer.goals}G)` : "N/A"}`,
        `🎯 **Top Assists:** ${topAssist ? `${topAssist.user.username} (${topAssist.assists}A)` : "N/A"}`,
        `🏆 **Most MVPs:** ${topMvp ? `${topMvp.user.username} (${topMvp.mvps})` : "N/A"}`,
      ].join("\n"),
      inline: false,
    });

    embed
      .setFooter({ text: "Legacy Football Championship" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("[Team Stats Error]", error);
    await interaction.editReply({
      content: "❌ An error occurred while fetching team stats.",
    });
  }
}

export default command;
