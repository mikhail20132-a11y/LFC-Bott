import { prisma } from "../database/prisma.js";

export class PredictionService {
  /**
   * Place a prediction on a match.
   */
  async predict(data: {
    matchId: string;
    userId: string;
    teamId?: string;
    draw?: boolean;
  }) {
    return prisma.prediction.upsert({
      where: {
        matchId_userId: { matchId: data.matchId, userId: data.userId },
      },
      update: {
        predictedTeamId: data.teamId ?? null,
        predictedDraw: data.draw ?? false,
      },
      create: {
        matchId: data.matchId,
        userId: data.userId,
        predictedTeamId: data.teamId ?? null,
        predictedDraw: data.draw ?? false,
      },
    });
  }

  /**
   * Resolve predictions after a match ends.
   * Points: 3 for correct winner, 1 for correct draw.
   */
  async resolvePredictions(matchId: string) {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
    });
    if (!match || match.status !== "Finished") return;
    if (match.homeScore === null || match.awayScore === null) return;

    const predictions = await prisma.prediction.findMany({
      where: { matchId, resolved: false },
    });

    let winnerId: string | null = null;
    let isDraw = false;

    if (match.homeScore > match.awayScore) {
      winnerId = match.homeTeamId;
    } else if (match.awayScore > match.homeScore) {
      winnerId = match.awayTeamId;
    } else {
      isDraw = true;
    }

    for (const pred of predictions) {
      let points = 0;
      if (isDraw && pred.predictedDraw) points = 3;
      else if (winnerId && pred.predictedTeamId === winnerId) points = 3;

      await prisma.prediction.update({
        where: { id: pred.id },
        data: { points, resolved: true },
      });
    }
  }

  /**
   * Get prediction leaderboard for a season.
   */
  async getLeaderboard(seasonId: string) {
    const matches = await prisma.match.findMany({
      where: { seasonId, status: "Finished" },
      select: { id: true },
    });
    const matchIds = matches.map((m) => m.id);

    const predictions = await prisma.prediction.findMany({
      where: { matchId: { in: matchIds }, resolved: true },
    });

    // Aggregate by user
    const userPoints = new Map<string, number>();
    for (const p of predictions) {
      userPoints.set(p.userId, (userPoints.get(p.userId) ?? 0) + p.points);
    }

    return Array.from(userPoints.entries())
      .map(([userId, points]) => ({ userId, points }))
      .sort((a, b) => b.points - a.points);
  }

  /**
   * Get total predictions for a user.
   */
  async getUserStats(userId: string) {
    const predictions = await prisma.prediction.findMany({
      where: { userId },
      include: { match: { include: { homeTeam: true, awayTeam: true } } },
      orderBy: { createdAt: "desc" },
    });

    const correct = predictions.filter((p) => p.resolved && p.points > 0).length;
    const total = predictions.filter((p) => p.resolved).length;

    return { predictions, correct, total, accuracy: total > 0 ? ((correct / total) * 100).toFixed(1) : "0" };
  }
}

export const predictionService = new PredictionService();