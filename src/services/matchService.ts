import { prisma } from "../database/prisma.js";

export class MatchService {
  /**
   * Create a new match.
   */
  async createMatch(data: {
    homeTeamId: string;
    awayTeamId: string;
    seasonId: string;
    matchDate?: Date;
    refereeId?: string;
  }) {
    return prisma.match.create({
      data: {
        homeTeamId: data.homeTeamId,
        awayTeamId: data.awayTeamId,
        seasonId: data.seasonId,
        matchDate: data.matchDate,
        refereeId: data.refereeId,
        status: "Scheduled",
      },
      include: {
        homeTeam: true,
        awayTeam: true,
        season: true,
      },
    });
  }

  /**
   * Start a match (set status to Live).
   */
  async startMatch(matchId: string) {
    return prisma.match.update({
      where: { id: matchId },
      data: { status: "Live" },
    });
  }

  /**
   * Finish a match with a score.
   */
  async finishMatch(
    matchId: string,
    data: {
      homeScore: number;
      awayScore: number;
    }
  ) {
    const match = await prisma.match.update({
      where: { id: matchId },
      data: {
        homeScore: data.homeScore,
        awayScore: data.awayScore,
        status: "Finished",
      },
    });

    // Update team season stats
    await this.updateTeamStatsAfterMatch(match);

    return match;
  }

  /**
   * Update team standings after a match finishes.
   */
  private async updateTeamStatsAfterMatch(match: {
    id: string;
    homeTeamId: string;
    awayTeamId: string;
    homeScore: number;
    awayScore: number;
    seasonId: string;
  }) {
    const homeStats = await prisma.teamSeasonStats.findUnique({
      where: {
        teamId_seasonId: {
          teamId: match.homeTeamId,
          seasonId: match.seasonId,
        },
      },
    });

    const awayStats = await prisma.teamSeasonStats.findUnique({
      where: {
        teamId_seasonId: {
          teamId: match.awayTeamId,
          seasonId: match.seasonId,
        },
      },
    });

    // Determine result
    let homeResult: "win" | "draw" | "loss";
    let awayResult: "win" | "draw" | "loss";

    if (match.homeScore > match.awayScore) {
      homeResult = "win";
      awayResult = "loss";
    } else if (match.homeScore < match.awayScore) {
      homeResult = "loss";
      awayResult = "win";
    } else {
      homeResult = "draw";
      awayResult = "draw";
    }

    // Update home team stats
    if (homeStats) {
      await prisma.teamSeasonStats.update({
        where: { id: homeStats.id },
        data: {
          played: homeStats.played + 1,
          wins: homeStats.wins + (homeResult === "win" ? 1 : 0),
          draws: homeStats.draws + (homeResult === "draw" ? 1 : 0),
          losses: homeStats.losses + (homeResult === "loss" ? 1 : 0),
          goalsFor: homeStats.goalsFor + match.homeScore,
          goalsAgainst: homeStats.goalsAgainst + match.awayScore,
          points:
            homeStats.points +
            (homeResult === "win" ? 3 : homeResult === "draw" ? 1 : 0),
        },
      });
    }

    // Update away team stats
    if (awayStats) {
      await prisma.teamSeasonStats.update({
        where: { id: awayStats.id },
        data: {
          played: awayStats.played + 1,
          wins: awayStats.wins + (awayResult === "win" ? 1 : 0),
          draws: awayStats.draws + (awayResult === "draw" ? 1 : 0),
          losses: awayStats.losses + (awayResult === "loss" ? 1 : 0),
          goalsFor: awayStats.goalsFor + match.awayScore,
          goalsAgainst: awayStats.goalsAgainst + match.homeScore,
          points:
            awayStats.points +
            (awayResult === "win" ? 3 : awayResult === "draw" ? 1 : 0),
        },
      });
    }
  }

  /**
   * Record a goal in a match.
   */
  async recordGoal(matchId: string, playerId: string, minute?: number) {
    const goal = await prisma.matchGoal.create({
      data: { matchId, playerId, minute },
    });

    // Increment player goals
    await prisma.player.update({
      where: { id: playerId },
      data: { goals: { increment: 1 } },
    });

    return goal;
  }

  /**
   * Record an assist in a match.
   */
  async recordAssist(matchId: string, playerId: string, minute?: number) {
    const assist = await prisma.matchAssist.create({
      data: { matchId, playerId, minute },
    });

    // Increment player assists
    await prisma.player.update({
      where: { id: playerId },
      data: { assists: { increment: 1 } },
    });

    return assist;
  }

  /**
   * Record a card in a match.
   */
  async recordCard(
    matchId: string,
    playerId: string,
    type: "Yellow" | "Red",
    minute?: number,
    reason?: string
  ) {
    const card = await prisma.matchCard.create({
      data: { matchId, playerId, type, minute, reason },
    });

    // Increment player cards
    const field = type === "Yellow" ? "yellowCards" : "redCards";
    await prisma.player.update({
      where: { id: playerId },
      data: { [field]: { increment: 1 } },
    });

    return card;
  }

  /**
   * Record MVP for a match.
   */
  async recordMvp(matchId: string, playerId: string, reason?: string) {
    const mvp = await prisma.matchMvp.upsert({
      where: { matchId },
      update: { playerId, reason },
      create: { matchId, playerId, reason },
    });

    // Increment player MVPs
    await prisma.player.update({
      where: { id: playerId },
      data: { mvps: { increment: 1 } },
    });

    return mvp;
  }

  /**
   * Get matches for a team.
   */
  async getTeamMatches(teamId: string) {
    return prisma.match.findMany({
      where: {
        OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
      },
      include: {
        homeTeam: true,
        awayTeam: true,
        season: true,
      },
      orderBy: { matchDate: "desc" },
    });
  }

  /**
   * Get upcoming fixtures.
   */
  async getUpcomingFixtures(limit = 10) {
    return prisma.match.findMany({
      where: { status: "Scheduled" },
      include: {
        homeTeam: true,
        awayTeam: true,
        season: true,
      },
      orderBy: { matchDate: "asc" },
      take: limit,
    });
  }

  /**
   * Get recent results.
   */
  async getRecentResults(limit = 10) {
    return prisma.match.findMany({
      where: { status: "Finished" },
      include: {
        homeTeam: true,
        awayTeam: true,
        season: true,
        goals: { include: { player: { include: { user: true } } } },
        mvps: { include: { player: { include: { user: true } } } },
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    });
  }
}

export const matchService = new MatchService();