import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
  ChannelType,
} from "discord.js";
import { matchService } from "../../services/matchService.js";
import { leagueService } from "../../services/leagueService.js";
import { teamService } from "../../services/teamService.js";
import { hasRole, RoleType } from "../../utils/permissions.js";
import { createErrorEmbed } from "../../utils/helpers.js";
import type { Command, ExtendedClient } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("creatematch")
    .setDescription("Create a match with thread for live updates (Management/Referee)")
    .addStringOption((o) => o.setName("home").setDescription("Home team").setRequired(true))
    .addStringOption((o) => o.setName("away").setDescription("Away team").setRequired(true))
    .addIntegerOption((o) => o.setName("week").setDescription("Matchweek number").setRequired(false))
    .addUserOption((o) => o.setName("referee").setDescription("Referee").setRequired(false))
    .addBooleanOption((o) => o.setName("createthread").setDescription("Create a match thread?").setRequired(false)),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply();

    if (!hasRole(interaction.member as never, RoleType.Founder) &&
        !hasRole(interaction.member as never, RoleType.LeagueManagement) &&
        !hasRole(interaction.member as never, RoleType.Referee)) {
      await interaction.editReply({ embeds: [createErrorEmbed("❌ Insufficient Permissions", "Need Staff role.")] });
      return;
    }

    const homeName = interaction.options.getString("home", true);
    const awayName = interaction.options.getString("away", true);
    const week = interaction.options.getInteger("week");
    const refUser = interaction.options.getUser("referee");
    const createThread = interaction.options.getBoolean("createthread") ?? true;

    const homeTeam = await teamService.getTeamByName(homeName);
    const awayTeam = await teamService.getTeamByName(awayName);
    if (!homeTeam || !awayTeam) {
      await interaction.editReply({ content: "❌ One or both teams not found." });
      return;
    }
    if (homeTeam.id === awayTeam.id) {
      await interaction.editReply({ embeds: [createErrorEmbed("❌ Invalid", "Cannot play itself.")] });
      return;
    }

    const activeSeason = await leagueService.getActiveSeason();
    if (!activeSeason) {
      await interaction.editReply({ embeds: [createErrorEmbed("❌ No Active Season", "Start a season first.")] });
      return;
    }

    const match = await matchService.createMatch({
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
      seasonId: activeSeason.id,
      refereeId: refUser?.id,
    });

    // Update matchweek
    if (week) {
      await (await import("../../database/prisma.js")).prisma.match.update({
        where: { id: match.id },
        data: { matchweek: week },
      });
    }

    // Create thread
    let threadInfo = "No thread created.";
    if (createThread && interaction.channel && interaction.channel.type === ChannelType.GuildText) {
      try {
        const thread = await interaction.channel.threads.create({
          name: `⚽ ${homeTeam.name} vs ${awayTeam.name}${week ? ` (GW${week})` : ""}`,
          reason: "Match thread for live updates",
        });
        await thread.send(`⚽ **${homeTeam.name}** vs **${awayTeam.name}**\n📅 ${activeSeason.name}${refUser ? `\n👨‍⚖️ Referee: <@${refUser.id}>` : ""}\n\nUse **/goal**, **/assist**, **/yellow**, **/red** in this thread to log events!`);
        await (await import("../../database/prisma.js")).prisma.match.update({
          where: { id: match.id },
          data: { threadId: thread.id },
        });
        threadInfo = `📝 Thread created: ${thread}`;
      } catch { threadInfo = "⚠️ Could not create thread."; }
    }

    const embed = new EmbedBuilder()
      .setTitle("⚽ Match Created!")
      .setColor("#00AA00")
      .addFields(
        { name: "🏠 Home", value: homeTeam.name, inline: true },
        { name: "🆚 vs", value: awayTeam.name, inline: true },
        { name: "📅 Week", value: week ? `GW${week}` : "TBD", inline: true },
        { name: "👨‍⚖️ Referee", value: refUser ? `<@${refUser.id}>` : "TBD", inline: true },
        { name: "🆔 Match ID", value: match.id.slice(0, 8), inline: true },
        { name: "📋 Status", value: "🟢 Scheduled", inline: true },
        { name: "📎 Thread", value: threadInfo, inline: false },
      )
      .setFooter({ text: "Use /match start or /fulltime when ready" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
export default command;