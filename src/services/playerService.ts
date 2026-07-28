import { prisma } from "../database/prisma.js";
import { generateLfcId } from "../utils/helpers.js";
import type { Position, Region } from "../types/index.js";

export class PlayerService {
  /**
   * Get or create a player profile linked to a Discord user.
   */
  async getOrCreatePlayer(discordId: string, username: string) {
    // First ensure the DiscordUser exists
    let discordUser = await prisma.discordUser.findUnique({
      where: { discordId },
    });

    if (!discordUser) {
      discordUser = await prisma.discordUser.create({
        data: { discordId, username },
      });
    } else if (discordUser.username !== username) {
      // Update username if changed
      discordUser = await prisma.discordUser.update({
        where: { discordId },
        data: { username },
      });
    }

    // Check if player exists
    let player = await prisma.player.findUnique({
      where: { discordId },
      include: {
        user: true,
        team: true,
        seasonStats: { include: { season: true } },
        awards: { include: { season: true } },
      },
    });

    if (!player) {
      player = await prisma.player.create({
        data: {
          lfcId: generateLfcId(discordId),
          discordId,
          position: "Midfielder",
          region: "Europe",
        },
        include: {
          user: true,
          team: true,
          seasonStats: { include: { season: true } },
          awards: { include: { season: true } },
        },
      });
    }

    return player;
  }

  /**
   * Get a player by Discord ID.
   */
  async getPlayer(discordId: string) {
    return prisma.player.findUnique({
      where: { discordId },
      include: {
        user: true,
        team: true,
        seasonStats: {
          include: { season: true },
          orderBy: { season: { name: "desc" } },
        },
        awards: { include: { season: true } },
      },
    });
  }

  /**
   * Get a player by LFC ID.
   */
  async getPlayerByLfcId(lfcId: string) {
    return prisma.player.findUnique({
      where: { lfcId },
      include: {
        user: true,
        team: true,
        seasonStats: {
          include: { season: true },
          orderBy: { season: { name: "desc" } },
        },
        awards: { include: { season: true } },
      },
    });
  }

  /**
   * Update player position and region.
   */
  async updatePlayerProfile(
    discordId: string,
    data: { position?: Position; region?: Region }
  ) {
    return prisma.player.update({
      where: { discordId },
      data,
      include: { user: true, team: true },
    });
  }

  /**
   * Get top goalscorers.
   */
  async getTopGoalscorers(limit = 10) {
    return prisma.player.findMany({
      orderBy: { goals: "desc" },
      take: limit,
      include: { user: true, team: true },
    });
  }

  /**
   * Get top assist providers.
   */
  async getTopAssists(limit = 10) {
    return prisma.player.findMany({
      orderBy: { assists: "desc" },
      take: limit,
      include: { user: true, team: true },
    });
  }

  /**
   * Get most MVPs.
   */
  async getTopMvps(limit = 10) {
    return prisma.player.findMany({
      orderBy: { mvps: "desc" },
      take: limit,
      include: { user: true, team: true },
    });
  }

  /**
   * Get most appearances.
   */
  async getTopAppearances(limit = 10) {
    return prisma.player.findMany({
      orderBy: { appearances: "desc" },
      take: limit,
      include: { user: true, team: true },
    });
  }

  /**
   * Get transfer history for a player.
   */
  async getTransferHistory(playerId: string) {
    return prisma.transfer.findMany({
      where: { playerId, status: "Completed" },
      orderBy: { completedAt: "desc" },
    });
  }
}

export const playerService = new PlayerService();