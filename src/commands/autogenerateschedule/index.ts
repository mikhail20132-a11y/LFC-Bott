import {
  SlashCommandBuilder,
  CommandInteraction,
} from "discord.js";
import { prisma } from "../../database/prisma.js";
import { leagueService } from "../../services/leagueService.js";
import { teamService } from "../../services/teamService.js";
import { hasRole, RoleType } from "../../utils/permissions.js";
import { createErrorEmbed, createSuccessEmbed } from "../../utils/helpers.js";
import type { Command } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("autogenerateschedule")
    .setDescription("Auto-generate round-robin schedule for all teams")
    .addIntegerOption((opt) =>
      opt
        .setName("weeks")
        .setDescription("Number of weeks to distribute matches across (1-52)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(52)
    ),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
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
            "You need **Founder** or **League Management** role to auto-generate schedules."
          ),
        ],
      });
      return;
    }

    const weeks = interaction.options.getInteger("weeks", true);

    try {
      // 1. Get active season
      const activeSeason = await leagueService.getActiveSeason();
      if (!activeSeason) {
        await interaction.editReply({
          embeds: [
            createErrorEmbed(
              "📭 No Active Season",
              "There is no active season. Start one with `/season start` first."
            ),
          ],
        });
        return;
      }

      // 2. Get all teams
      const teams = await teamService.listTeams();
      if (teams.length < 2) {
        await interaction.editReply({
          embeds: [
            createErrorEmbed(
              "❌ Not Enough Teams",
              `Need at least 2 teams to generate a schedule. Found only ${teams.length}.`
            ),
          ],
        });
        return;
      }

      // 3. Generate round-robin pairs (each team plays each other once)
      const matchPairs: Array<[typeof teams[0], typeof teams[0]]> = [];
      for (let i = 0; i < teams.length; i++) {
        for (let j = i + 1; j < teams.length; j++) {
          // Alternate home/away assignment based on pair index parity
          const pairIndex = matchPairs.length;
          if (pairIndex % 2 === 0) {
            matchPairs.push([teams[i], teams[j]]);
          } else {
            matchPairs.push([teams[j], teams[i]]);
          }
        }
      }

      // 4. Calculate matches per week
      const totalMatches = matchPairs.length;
      const matchesPerWeek = Math.max(1, Math.ceil(totalMatches / weeks));

      // 5. Ensure season stats exist for every team
      await leagueService.initializeSeasonStats(activeSeason.id);

      // 6. Create match records distributed across weeks
      let createdCount = 0;
      for (let w = 1; w <= weeks; w++) {
        const weekStartIdx = (w - 1) * matchesPerWeek;
        const weekEndIdx = Math.min(weekStartIdx + matchesPerWeek, totalMatches);

        if (weekStartIdx >= totalMatches) break;

        for (let m = weekStartIdx; m < weekEndIdx; m++) {
          const [homeTeam, awayTeam] = matchPairs[m];

          await prisma.match.create({
            data: {
              homeTeamId: homeTeam.id,
              awayTeamId: awayTeam.id,
              seasonId: activeSeason.id,
              matchweek: w,
              status: "Scheduled",
            },
          });
          createdCount++;
        }
      }

      await interaction.editReply({
        embeds: [
          createSuccessEmbed(
            "✅ Schedule Generated!",
            `Generated **${createdCount}** matches across **${weeks}** week(s) for **${teams.length}** teams.\n\nUse \`/viewschedule week:<number>\` to view matches for a specific week.`
          ),
        ],
      });
    } catch (error) {
      console.error("[AutoGenerateSchedule Error]", error);
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            "❌ Error",
            "An error occurred while generating the schedule."
          ),
        ],
      });
    }
  },
};

export default command;
