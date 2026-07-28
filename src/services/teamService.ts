import { prisma } from "../database/prisma.js";

export class TeamService {
  /**
   * Create a new team.
   */
  async createTeam(data: {
    name: string;
    shortName?: string;
    description?: string;
    emoji?: string;
    roleId?: string | null;
    managerId: string;
  }) {
    return prisma.team.create({
      data: {
        name: data.name,
        shortName: data.shortName,
        description: data.description,
        emoji: data.emoji,
        roleId: data.roleId,
        managerId: data.managerId,
      },
      include: { manager: true },
    });
  }

  /**
   * Get a team by ID.
   */
  async getTeamById(teamId: string) {
    return prisma.team.findUnique({
      where: { id: teamId },
      include: {
        manager: true,
        players: { include: { user: true } },
        seasonTeams: { include: { season: true } },
      },
    });
  }

  /**
   * Get a team by name.
   */
  async getTeamByName(name: string) {
    return prisma.team.findUnique({
      where: { name },
      include: {
        manager: true,
        players: { include: { user: true } },
        seasonTeams: { include: { season: true } },
      },
    });
  }

  /**
   * List all teams.
   */
  async listTeams() {
    return prisma.team.findMany({
      include: {
        manager: true,
        _count: { select: { players: true } },
      },
      orderBy: { name: "asc" },
    });
  }

  /**
   * Get team stats for a specific season.
   */
  async getTeamSeasonStats(teamId: string, seasonId: string) {
    return prisma.teamSeasonStats.findUnique({
      where: { teamId_seasonId: { teamId, seasonId } },
    });
  }

  /**
   * Add a player to a team.
   */
  async addPlayerToTeam(playerId: string, teamId: string) {
    return prisma.player.update({
      where: { id: playerId },
      data: { teamId },
    });
  }

  /**
   * Remove a player from their team.
   */
  async removePlayerFromTeam(playerId: string) {
    return prisma.player.update({
      where: { id: playerId },
      data: { teamId: null },
    });
  }
}

export const teamService = new TeamService();