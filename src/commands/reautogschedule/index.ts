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
    .setName("reautogschedule")
    .setDescription("Regenerate all Scheduled matches for a specific week")
    .addIntegerOption((opt) =>
      opt
        .setName("week")
        .setDescription("Matchweek number to regenerate")
        .setRequired(true)
        .setMinValue(1)
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
            "You need **Founder** or **League Management** role to regenerate schedules."
          ),
        ],
      });
      return;
    }

    const week = interaction.options.getInteger("week", true);

    try {
      // 1. Get active season
      const activeSeason = await leagueService.getActiveSeason();
      if (!activeSeason) {
        await interaction.editReply({
          embeds: [
            createErrorEmbed(
              "📭 No Active Season",
              "There is no active season. Start one first."
            ),
          ],
        });
        return;
      }

      // 2. Delete all Scheduled matches for the given week
      const deleted = await prisma.match.deleteMany({
        where: {
          matchweek: week,
          seasonId: activeSeason.id,
          status: "Scheduled",
        },
      });

      // 3. Get all teams
      const teams = await teamService.listTeams();
      if (teams.length < 2) {
        await interaction.editReply({
          embeds: [
            createErrorEmbed(
              "❌ Not Enough Teams",
              `Need at least 2 teams to regenerate. Found ${teams.length}.`
            ),
          ],
        });
        return;
      }

      // 4. Rebuild round-robin pairs for this week
      const matchPairs: Array<[typeof teams[0], typeof teams[0]]> = [];
      for (let i = 0; i < teams.length; i++) {
        for (let j = i + 1; j < teams.length; j++) {
          const pairIndex = matchPairs.length;
          if (pairIndex % 2 === 0) {
            matchPairs.push([teams[i], teams[j]]);
          } else {
            matchPairs.push([teams[j], teams[i]]);
          }
        }
      }

      // 5. Ensure season stats exist
      await leagueService.initializeSeasonStats(activeSeason.id);

      // 6. Determine which pairs belong to this week
      const totalMatches = matchPairs.length;
      const matchesPerWeek = Math.max(1, Math.ceil(totalMatches / 52)); // Use max possible weeks as distribution

      // Recalculate effective distribution from existing matches
      const existingMatchweeks = await prisma.match.findMany({
        where: { seasonId: activeSeason.id, status: "Scheduled" },
        distinct: ["matchweek"],
        select: { matchweek: true },
        orderBy: { matchweek: "asc" },
      });

      const usedWeeks = existingMatchweeks
        .map((m) => m.matchweek)
        .filter((w): w is number => w !== null);

      const allWeekNumbers = [...new Set([...usedWeeks, week])];
      const effectiveWeeks = Math.max(allWeekNumbers.length, 1);

      const effectiveMatchesPerWeek = Math.max(
        1,
        Math.ceil(totalMatches / effectiveWeeks)
      );

      const weekStartIdx = (week - 1) * effectiveMatchesPerWeek;
      const weekEndIdx = Math.min(
        weekStartIdx + effectiveMatchesPerWeek,
        totalMatches
      );

      // 7. Create matches for this week
      let createdCount = 0;
      if (weekStartIdx < totalMatches) {
        for (let m = weekStartIdx; m < weekEndIdx; m++) {
          const [homeTeam, awayTeam] = matchPairs[m];
          await prisma.match.create({
            data: {
              homeTeamId: homeTeam.id,
              awayTeamId: awayTeam.id,
              seasonId: activeSeason.id,
              matchweek: week,
              status: "Scheduled",
            },
          });
          createdCount++;
        }
      }

      await interaction.editReply({
        embeds: [
          createSuccessEmbed(
            "✅ Schedule Regenerated!",
            `Deleted **${deleted.count}** existing match(es) and generated **${createdCount}** new match(es) for **Matchweek ${week}**.\n\nUse \`/viewschedule week:${week}\` to see the updated schedule.`
          ),
        ],
      });
    } catch (error) {
      console.error("[ReAutoGSchedule Error]", error);
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            "❌ Error",
            "An error occurred while regenerating the schedule."
          ),
        ],
      });
    }
  },
};

export default command;
