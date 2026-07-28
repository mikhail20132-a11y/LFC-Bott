import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ComponentType,
} from "discord.js";
import { teamService } from "../../services/teamService.js";
import { matchService } from "../../services/matchService.js";
import { playerService } from "../../services/playerService.js";
import type { Command } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("club")
    .setDescription("View a complete team hub with stats, history, and roster")
    .addStringOption((opt) =>
      opt.setName("team").setDescription("Team name").setRequired(true)
    ),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply();
    const teamName = interaction.options.getString("team", true);
    const team = await teamService.getTeamByName(teamName);
    if (!team) {
      await interaction.editReply({ content: `❌ Team **${teamName}** not found.` });
      return;
    }
    await showClubPage(interaction, team, "stats");
  },
};

async function showClubPage(interaction: CommandInteraction, team: Awaited<ReturnType<typeof teamService.getTeamByName>>, tab: string) {
  if (!team) return;
  let embed: EmbedBuilder;

  switch (tab) {
    case "roster": {
      const posOrder = ["Goalkeeper", "Defender", "Midfielder", "Forward"];
      embed = new EmbedBuilder().setTitle(`👥 ${team.name} — Roster`).setColor("#00AA00");
      for (const pos of posOrder) {
        const filtered = team.players.filter((p) => p.position === pos);
        if (filtered.length) embed.addFields({ name: `${pos}s (${filtered.length})`, value: filtered.map((p) => `**${p.user.username}**${p.roleInTeam ? ` — ${p.roleInTeam}` : ""} — ⚽${p.goals}G 🎯${p.assists}A`).join("\n"), inline: false });
      }
      break;
    }
    case "history": {
      const matches = await matchService.getTeamMatches(team.id);
      embed = new EmbedBuilder().setTitle(`📊 ${team.name} — Match History`).setColor("#00AA00");
      if (matches.length) {
        const finished = matches.filter((m) => m.status === "Finished").slice(0, 10);
        embed.setDescription(finished.length
          ? finished.map((m) => {
              const isHome = m.homeTeamId === team.id;
              const score = isHome ? `${m.homeScore}-${m.awayScore}` : `${m.awayScore}-${m.homeScore}`;
              const opponent = isHome ? m.awayTeam.name : m.homeTeam.name;
              const result = isHome ? (m.homeScore > m.awayScore ? "✅ W" : m.homeScore < m.awayScore ? "❌ L" : "🤝 D") : (m.awayScore > m.homeScore ? "✅ W" : m.awayScore < m.homeScore ? "❌ L" : "🤝 D");
              return `${result} | ${team.name} ${score} vs ${opponent}`;
            }).join("\n")
          : "No finished matches."
        );
      } else {
        embed.setDescription("No matches played yet.");
      }
      break;
    }
    default: {
      const ss = team.seasonTeams[team.seasonTeams.length - 1];
      embed = new EmbedBuilder()
        .setTitle(`🏟️ ${team.name} ${team.shortName ? `(${team.shortName})` : ""}`)
        .setColor("#00AA00")
        .setDescription(team.description ?? "No description.")
        .addFields(
          { name: "👤 Manager", value: `<@${team.manager.discordId}>`, inline: true },
          { name: "👥 Squad", value: `${team.players.length} players`, inline: true },
          { name: "🏆 Trophies", value: `${team.trophies}`, inline: true }
        );
      if (ss) {
        const gd = ss.goalsFor - ss.goalsAgainst;
        embed.addFields({ name: "📊 Season Record", value: `**${ss.played}**PL | **${ss.wins}**W | **${ss.draws}**D | **${ss.losses}**L | GF:${ss.goalsFor} GA:${ss.goalsAgainst} GD:${gd >= 0 ? "+" : ""}${gd} | **${ss.points}pts**`, inline: false });
      }
      const top = [...team.players].sort((a, b) => b.goals - a.goals).slice(0, 3);
      if (top.length) embed.addFields({ name: "⚽ Top Scorers", value: top.map((p, i) => `${i + 1}. **${p.user.username}** — ${p.goals}G`).join("\n"), inline: false });
    }
  }

  const select = new StringSelectMenuBuilder().setCustomId("club_tabs").setPlaceholder("Switch tab...")
    .addOptions(
      { label: "📊 Stats & Info", value: "stats", emoji: "📊", default: tab === "stats" },
      { label: "👥 Roster", value: "roster", emoji: "👥", default: tab === "roster" },
      { label: "📋 Match History", value: "history", emoji: "📋", default: tab === "history" },
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
  const reply = await interaction.editReply({ embeds: [embed], components: [row] });

  const collector = reply.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 120_000 });
  collector.on("collect", async (si) => {
    if (si.user.id !== interaction.user.id) { await si.reply({ content: "❌ Not your menu.", ephemeral: true }); return; }
    await si.deferUpdate();
    const refreshed = await teamService.getTeamByName(team.name);
    if (refreshed) await showClubPage(si as unknown as CommandInteraction, refreshed, si.values[0]);
  });
  collector.on("end", async () => {
    const dr = ActionRowBuilder.from<StringSelectMenuBuilder>(row);
    dr.components.forEach((c) => c.setDisabled(true));
    await interaction.editReply({ components: [dr] }).catch(() => {});
  });
}

export default command;