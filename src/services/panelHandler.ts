import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  CommandInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
  GuildMember,
} from "discord.js";
import { prisma } from "../database/prisma.js";
import { hasRole, RoleType } from "../utils/permissions.js";
import { createErrorEmbed } from "../utils/helpers.js";

const DASHBOARD = "dashboard";
const TEAMS = "teams";
const FREEAGENTS = "freeagents";
const AUTOMAP = "automap";

function isAuthorized(member) {
  return hasRole(member, RoleType.Manager) || hasRole(member, RoleType.AssistantManager);
}

export async function showMainPanel(interaction, tab) {
  tab = tab || DASHBOARD;
  const member = interaction.member;
  if (!isAuthorized(member)) {
    await interaction.editReply({
      embeds: [createErrorEmbed("Access Denied", "Manager or Assistant Manager role required.")],
    });
    return;
  }

  let embed;
  let components = [];

  if (tab === TEAMS) {
    const result = await buildTeamsView();
    embed = result.embed;
    components = result.components;
  } else if (tab === FREEAGENTS) {
    const result = await buildFreeAgentsView();
    embed = result.embed;
    components = result.components;
  } else if (tab === AUTOMAP) {
    const result = await buildAutoMapView();
    embed = result.embed;
    components = result.components;
  } else {
    const result = await buildDashboardView();
    embed = result.embed;
    components = result.components;
  }

  const navRow = buildNavRow(tab);
  components.unshift(navRow);
  await interaction.editReply({ embeds: [embed], components });
}

function buildNavRow(currentTab) {
  const tabs = [
    { label: "Dashboard", value: DASHBOARD, emoji: String.fromCodePoint(0x1F4CA) },
    { label: "Teams", value: TEAMS, emoji: String.fromCodePoint(0x1F465) },
    { label: "Free Agents", value: FREEAGENTS, emoji: String.fromCodePoint(0x1F4D3) },
    { label: "AutoMap", value: AUTOMAP, emoji: String.fromCodePoint(0x1F504) },
  ];

  const row = new ActionRowBuilder();
  for (const t of tabs) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId("panel_nav:" + t.value)
        .setLabel(t.label)
        .setStyle(t.value === currentTab ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setEmoji(t.emoji)
        .setDisabled(t.value === currentTab)
    );
  }
  return row;
}

async function buildDashboardView() {
  const [teamCount, playerCount, matchCount, freeAgentCount, activeSeason] = await Promise.all([
    prisma.team.count(),
    prisma.player.count(),
    prisma.match.count(),
    prisma.player.count({ where: { teamId: null } }),
    prisma.season.findFirst({ where: { isActive: true } }),
  ]);

  const finishedMatches = await prisma.match.count({ where: { status: "Finished" } });
  const scheduledMatches = await prisma.match.count({ where: { status: "Scheduled" } });

  const seasonInfo = activeSeason
    ? "**Season:** " + activeSeason.name + "\n**Started:** " + (activeSeason.startedAt ? activeSeason.startedAt.toLocaleDateString() : "N/A")
    : "No active season.";

  const embed = new EmbedBuilder()
    .setTitle(String.fromCodePoint(0x1F4CA) + " LFC Management Dashboard")
    .setColor(0x6366f1)
    .setDescription("*Franchise oversight panel for the Legacy Football Championship*")
    .addFields(
      {
        name: String.fromCodePoint(0x1F3F0) + " League Overview",
        value: "**Teams:** " + teamCount + "\n**Total Players:** " + playerCount + "\n**Free Agents:** " + freeAgentCount + "\n**Total Matches:** " + matchCount,
        inline: true,
      },
      {
        name: String.fromCodePoint(0x1F3C6) + " Season Info",
        value: seasonInfo,
        inline: true,
      },
      {
        name: String.fromCodePoint(0x1F3BE) + " Match Status",
        value: "**Finished:** " + finishedMatches + "\n**Scheduled:** " + scheduledMatches + "\n**Other:** " + (matchCount - finishedMatches - scheduledMatches),
        inline: true,
      }
    )
    .setFooter({ text: "Management Panel | " + new Date().toLocaleDateString() })
    .setTimestamp();

  return { embed, components: [] };
}

async function buildTeamsView() {
  const teams = await prisma.team.findMany({
    include: { manager: true, _count: { select: { players: true } } },
    orderBy: { name: "asc" },
  });

  if (teams.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle(String.fromCodePoint(0x1F465) + " Teams Overview")
      .setColor(0xf59e0b)
      .setDescription("No teams have been created yet.")
      .setTimestamp();
    return { embed, components: [] };
  }

  const totalPlayers = teams.reduce((sum, t) => sum + t._count.players, 0);
  const embed = new EmbedBuilder()
    .setTitle(String.fromCodePoint(0x1F465) + " Teams Overview")
    .setColor(0x6366f1)
    .setDescription("**" + teams.length + " teams** with **" + totalPlayers + " total players**")
    .setTimestamp();

  for (const team of teams) {
    embed.addFields({
      name: (team.emoji || "") + " " + team.name + (team.shortName ? " (" + team.shortName + ")" : ""),
      value: [
        "**Manager:** <@" + team.manager.discordId + ">",
        "**Players:** " + team._count.players,
        "**Role:** " + (team.roleId ? "<@&" + team.roleId + ">" : "No role"),
        "**Trophies:** " + team.trophies,
      ].join("  "),
      inline: true,
    });
  }

  if (teams.length <= 25) {
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("panel_select_team")
      .setPlaceholder("Select a team to view details...")
      .addOptions(
        teams.map(function(t) {
          return new StringSelectMenuOptionBuilder()
            .setLabel(t.name)
            .setDescription(t._count.players + " players | " + t.trophies + " trophies")
            .setValue(t.name)
            .setEmoji(t.emoji || String.fromCodePoint(0x1F3DF));
        })
      );
    const row = new ActionRowBuilder().addComponents(selectMenu);
    return { embed, components: [row] };
  }

  return { embed, components: [] };
}

async function buildFreeAgentsView() {
  const freeAgents = await prisma.player.findMany({
    where: { teamId: null },
    include: { user: true },
    orderBy: { goals: "desc" },
  });

  const embed = new EmbedBuilder()
    .setTitle(String.fromCodePoint(0x1F4D3) + " Free Agents")
    .setColor(0xf59e0b)
    .setDescription(freeAgents.length > 0
      ? "**" + freeAgents.length + "** unsigned player(s) available"
      : "No free agents at this time."
    );

  const positions = ["Goalkeeper", "Defender", "Midfielder", "Forward"];
  for (const pos of positions) {
    const filtered = freeAgents.filter(function(p) { return p.position === pos; });
    if (filtered.length > 0) {
      embed.addFields({
        name: pos + "s (" + filtered.length + ")",
        value: filtered.map(function(p) {
          return "**<@" + p.discordId + ">** " + String.fromCodePoint(0x26BD) + " " + p.goals + "G " + String.fromCodePoint(0x1F3AF) + " " + p.assists + "A";
        }).join("\n"),
        inline: false,
      });
    }
  }

  embed.setTimestamp();
  return { embed, components: [] };
}

async function buildAutoMapView() {
  const teams = await prisma.team.findMany({
    include: { _count: { select: { players: true } } },
    orderBy: { name: "asc" },
  });

  const teamsWithRoles = teams.filter(function(t) { return !!t.roleId; });
  const teamsWithoutRoles = teams.filter(function(t) { return !t.roleId; });

  const allReady = teamsWithRoles.length === teams.length;
  const statusEmoji = allReady ? String.fromCodePoint(0x2705) : String.fromCodePoint(0x26A0) + "\uFE0F";

  let infoLines = [];
  if (teamsWithRoles.length > 0) {
    infoLines.push("**" + teamsWithRoles.length + " teams** have Discord roles configured and ready.");
  }
  if (teamsWithoutRoles.length > 0) {
    infoLines.push("**" + teamsWithoutRoles.length + " teams** are missing a Discord role ID.");
  }

  const embed = new EmbedBuilder()
    .setTitle(String.fromCodePoint(0x1F504) + " Auto-Map Panel")
    .setColor(allReady ? 0x22c55e : 0xf59e0b)
    .setDescription(
      "*Auto-assign Discord roles to players based on their team membership*\n\n" +
      "**Total Teams:** " + teams.length + "\n" +
      "**Ready:** " + teamsWithRoles.length + " | **Missing Roles:** " + teamsWithoutRoles.length + "\n\n" +
      statusEmoji + " " + (allReady ? "All teams ready!" : "Some teams need role configuration first.")
    );

  if (infoLines.length > 0) {
    embed.addFields({
      name: String.fromCodePoint(0x2139) + " Info",
      value: infoLines.join("\n"),
      inline: false,
    });
  }

  for (const team of teams) {
    embed.addFields({
      name: (team.emoji || "") + " " + team.name,
      value: [
        "**Role:** " + (team.roleId ? "<@&" + team.roleId + ">" : String.fromCodePoint(0x274C) + " Not set"),
        "**Players:** " + team._count.players,
        team.roleId ? String.fromCodePoint(0x2705) + " Ready" : String.fromCodePoint(0x26A0) + " Needs roleId",
      ].join("  "),
      inline: true,
    });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("panel_automap_run")
      .setLabel("Run Auto-Map Now")
      .setStyle(ButtonStyle.Success)
      .setEmoji(String.fromCodePoint(0x1F504))
      .setDisabled(!(teamsWithRoles.length > 0)),
    new ButtonBuilder()
      .setCustomId("panel_automap_report")
      .setLabel("Last Report")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(String.fromCodePoint(0x1F4CB))
  );

  embed.setFooter({ text: "Click Run Auto-Map to assign team roles to all players" });
  embed.setTimestamp();
  return { embed, components: [row] };
}

export async function handlePanelButton(interaction) {
  if (!interaction.isButton()) return;
  const member = interaction.member;
  if (!isAuthorized(member)) {
    await interaction.reply({ content: "Access denied.", ephemeral: true });
    return;
  }

  const customId = interaction.customId;

  if (customId.startsWith("panel_nav:")) {
    const tab = customId.split(":")[1];
    await interaction.deferUpdate();
    await showMainPanel(interaction, tab);
    return;
  }

  if (customId === "panel_automap_run") {
    await interaction.deferReply({ ephemeral: true });

    const teams = await prisma.team.findMany({
      where: { roleId: { not: null } },
      include: { players: { include: { user: true } } },
    });

    const guild = interaction.guild;
    if (!guild) {
      await interaction.editReply({ content: "Must be used in a server." });
      return;
    }

    let mappedCount = 0;
    let failCount = 0;
    const details = [];

    for (const team of teams) {
      if (!team.roleId) continue;
      const role = guild.roles.cache.get(team.roleId);
      if (!role) {
        details.push((team.emoji || "") + " **" + team.name + "**: Role not found");
        failCount++;
        continue;
      }

      let teamSuccess = 0;
      let teamFail = 0;

      for (const player of team.players) {
        try {
          const member = await guild.members.fetch(player.discordId).catch(function() { return null; });
          if (!member) { teamFail++; continue; }

          // Remove other team roles
          for (const otherTeam of teams) {
            if (otherTeam.id !== team.id && otherTeam.roleId) {
              const otherRole = guild.roles.cache.get(otherTeam.roleId);
              if (otherRole && member.roles.cache.has(otherRole.id)) {
                await member.roles.remove(otherRole, "AutoMap corrected").catch(function() {});
              }
            }
          }

          if (!member.roles.cache.has(role.id)) {
            await member.roles.add(role, "AutoMap assigned team role");
          }
          teamSuccess++;
        } catch { teamFail++; }
      }

      mappedCount += teamSuccess;
      details.push((team.emoji || "") + " **" + team.name + "**: " + teamSuccess + " assigned, " + teamFail + " failed");
    }

    const summary = new EmbedBuilder()
      .setTitle(String.fromCodePoint(0x2705) + " Auto-Map Complete")
      .setColor(mappedCount > 0 ? 0x22c55e : 0xf59e0b)
      .setDescription("Processed **" + teams.length + " teams**\n**" + mappedCount + " players** assigned roles\n**" + failCount + "** teams with errors")
      .addFields({ name: "Details", value: details.join("\n") || "Nothing to report." })
      .setTimestamp();

    await interaction.editReply({ embeds: [summary] });
    return;
  }

  if (customId === "panel_automap_report") {
    await interaction.deferReply({ ephemeral: true });
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle(String.fromCodePoint(0x1F4CB) + " Auto-Map Report")
          .setColor(0x6366f1)
          .setDescription("Run Auto-Map to generate a fresh report.")
          .setTimestamp(),
      ],
    });
    return;
  }
}

export async function handlePanelSelect(interaction) {
  if (!interaction.isStringSelectMenu()) return;
  const member = interaction.member;
  if (!isAuthorized(member)) {
    await interaction.reply({ content: "Access denied.", ephemeral: true });
    return;
  }

  const customId = interaction.customId;
  const value = interaction.values[0];

  if (customId === "panel_select_team") {
    await interaction.deferUpdate();

    const team = await prisma.team.findUnique({
      where: { name: value },
      include: {
        manager: true,
        players: { include: { user: true }, orderBy: [{ roleInTeam: "asc" }, { goals: "desc" }] },
        seasonTeams: { include: { season: true }, orderBy: { season: { name: "desc" } }, take: 1 },
      },
    });

    if (!team) {
      await interaction.editReply({ content: "Team not found." });
      return;
    }

    const posOrder = ["Goalkeeper", "Defender", "Midfielder", "Forward"];
    const embed = new EmbedBuilder()
      .setTitle((team.emoji || "") + " " + team.name + (team.shortName ? " (" + team.shortName + ")" : ""))
      .setColor(0x6366f1)
      .setDescription(team.description || "No description.")
      .addFields(
        { name: String.fromCodePoint(0x1F464) + " Manager", value: "<@" + team.manager.discordId + ">", inline: true },
        { name: String.fromCodePoint(0x1F465) + " Squad", value: team.players.length + " players", inline: true },
        { name: String.fromCodePoint(0x1F3C6) + " Trophies", value: String(team.trophies), inline: true },
      );

    if (team.roleId) {
      embed.addFields({ name: String.fromCodePoint(0x1F3F7) + " Role", value: "<@&" + team.roleId + ">", inline: true });
    }

    const ss = team.seasonTeams[0];
    if (ss) {
      const gd = ss.goalsFor - ss.goalsAgainst;
      embed.addFields({
        name: String.fromCodePoint(0x1F3BE) + " Season Record",
        value: "**" + ss.played + "** PL | **" + ss.wins + "** W | **" + ss.draws + "** D | **" + ss.losses + "** L | GF:" + ss.goalsFor + " GA:" + ss.goalsAgainst + " GD:" + (gd >= 0 ? "+" : "") + gd + " | **" + ss.points + " pts**",
        inline: false,
      });
    }

    for (const pos of posOrder) {
      const filtered = team.players.filter(function(p) { return p.position === pos; });
      if (filtered.length > 0) {
        embed.addFields({
          name: pos + "s (" + filtered.length + ")",
          value: filtered.map(function(p) {
            return "**" + p.user.username + "**" +
              (p.roleInTeam ? " - " + p.roleInTeam : "") +
              " " + String.fromCodePoint(0x26BD) + p.goals + "G " + String.fromCodePoint(0x1F3AF) + p.assists + "A";
          }).join("\n"),
          inline: false,
        });
      }
    }

    embed.setFooter({ text: "Showing " + team.players.length + " players" });
    embed.setTimestamp();

    const backBtn = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("panel_nav:teams")
        .setLabel("< Back to Teams")
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.editReply({ embeds: [embed], components: [backBtn] });
  }
}
