import { prisma } from "../database/prisma.js";

export class LeagueService {
  /**
   * Get the current active season.
   */
  async getActiveSeason() {
    return prisma.season.findFirst({
      where: { isActive: true },
      include: {
        _count: { select: { matches: true } },
      },
    });
  }

  /**
   * Get a season by ID.
   */
  async getSeasonById(seasonId: string) {
    return prisma.season.findUnique({
      where: { id: seasonId },
      include: {
        _count: { select: { matches: true } },
      },
    });
  }

  /**
   * Get upcoming fixtures for a season (scheduled + live matches).
   */
  async getUpcomingFixtures(seasonId: string) {
    return prisma.match.findMany({
      where: {
        seasonId,
        status: { in: ["Scheduled", "Live"] },
      },
      include: {
        homeTeam: true,
        awayTeam: true,
      },
      orderBy: { matchDate: "asc" },
      take: 20,
    });
  }

  /**
   * Get standings for a season, sorted by points descending.
   */
  async getStandings(seasonId: string) {
    const teamStats = await prisma.teamSeasonStats.findMany({
      where: { seasonId },
      include: { team: true },
      orderBy: [{ points: "desc" }, { goalsFor: "desc" }],
    });

    return teamStats.map((stat, index) => ({
      position: index + 1,
      teamId: stat.teamId,
      teamName: stat.team.name,
      played: stat.played,
      wins: stat.wins,
      draws: stat.draws,
      losses: stat.losses,
      goalsFor: stat.goalsFor,
      goalsAgainst: stat.goalsAgainst,
      goalDifference: stat.goalsFor - stat.goalsAgainst,
      points: stat.points,
    }));
  }

  /**
   * Alias for backward compatibility.
   */
  async startNewSeason(name: string) {
    return this.createSeason(name);
  }

  /**
   * Create a new season.
   */
  async createSeason(name: string) {
    return prisma.season.create({
      data: { name, isActive: true },
    });
  }

  /**
   * Alias for backward compatibility.
   */
  async endCurrentSeason() {
    return this.endActiveSeason();
  }

  /**
   * End the current active season.
   */
  async endActiveSeason() {
    const activeSeason = await this.getActiveSeason();
    if (!activeSeason) return null;

    return prisma.season.update({
      where: { id: activeSeason.id },
      data: {
        isActive: false,
        endedAt: new Date(),
      },
    });
  }

  /**
   * Initialize season stats for all teams.
   */
  async initializeSeasonStats(seasonId: string) {
    const teams = await prisma.team.findMany();
    const stats = [];

    for (const team of teams) {
      const existing = await prisma.teamSeasonStats.findUnique({
        where: {
          teamId_seasonId: { teamId: team.id, seasonId },
        },
      });

      if (!existing) {
        const stat = await prisma.teamSeasonStats.create({
          data: { teamId: team.id, seasonId },
        });
        stats.push(stat);
      }
    }

    return stats;
  }

  /**
   * Initialize season stats for all players in a team.
   */
  async initializePlayerSeasonStats(seasonId: string, teamId?: string) {
    const whereClause = teamId ? { teamId } : {};
    const players = await prisma.player.findMany({ where: whereClause });
    const stats = [];

    for (const player of players) {
      const existing = await prisma.playerSeasonStats.findUnique({
        where: {
          playerId_seasonId: { playerId: player.id, seasonId },
        },
      });

      if (!existing) {
        const stat = await prisma.playerSeasonStats.create({
          data: { playerId: player.id, seasonId },
        });
        stats.push(stat);
      }
    }

    return stats;
  }
}

export const leagueService = new LeagueService();