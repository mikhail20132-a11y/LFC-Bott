import { prisma } from "../database/prisma.js";
import { generateLfcId } from "../utils/helpers.js";
import type { TeamRole } from "../types/index.js";

export class ContractService {
  /**
   * Offer a contract to a player — creates player if new, signs contract, assigns nickname.
   */
  async offerContract(data: {
    discordId: string;
    username: string;
    teamName: string;
    position: string;
    region: string;
    robloxUsername?: string;
    roleInTeam?: TeamRole;
    nickname?: string;
  }) {
    // 1. Ensure DiscordUser exists
    let discordUser = await prisma.discordUser.findUnique({
      where: { discordId: data.discordId },
    });
    if (!discordUser) {
      discordUser = await prisma.discordUser.create({
        data: { discordId: data.discordId, username: data.username },
      });
    }

    // 2. Find team
    const team = await prisma.team.findUnique({ where: { name: data.teamName } });
    if (!team) throw new Error(`Team "${data.teamName}" not found.`);

    // 3. Upsert player
    let player = await prisma.player.findUnique({
      where: { discordId: data.discordId },
    });
    if (!player) {
      player = await prisma.player.create({
        data: {
          lfcId: generateLfcId(data.discordId),
          discordId: data.discordId,
          position: data.position,
          region: data.region,
          robloxUsername: data.robloxUsername,
          nickname: data.nickname,
          roleInTeam: data.roleInTeam,
          teamId: team.id,
        },
      });
    } else {
      player = await prisma.player.update({
        where: { discordId: data.discordId },
        data: {
          position: data.position,
          region: data.region,
          robloxUsername: data.robloxUsername,
          nickname: data.nickname,
          roleInTeam: data.roleInTeam,
          teamId: team.id,
        },
      });
    }

    // 4. Deactivate any existing active contracts
    await prisma.contract.updateMany({
      where: { playerId: player.id, isActive: true },
      data: { isActive: false },
    });

    // 5. Create new contract
    const contract = await prisma.contract.create({
      data: {
        playerId: player.id,
        teamId: team.id,
        teamName: team.name,
        roleInTeam: data.roleInTeam,
        isActive: true,
      },
    });

    const updatedPlayer = await prisma.player.findUnique({
      where: { id: player.id },
      include: { user: true, team: true },
    });

    return { player: updatedPlayer!, contract, team };
  }

  /**
   * Release a player from their team (back to free agency).
   */
  async releasePlayer(discordId: string) {
    const player = await prisma.player.findUnique({
      where: { discordId },
      include: { team: true, contracts: { where: { isActive: true } } },
    });
    if (!player) throw new Error("Player not found.");
    if (!player.teamId) throw new Error("Player is already a free agent.");

    // Deactivate active contracts
    await prisma.contract.updateMany({
      where: { playerId: player.id, isActive: true },
      data: { isActive: false },
    });

    // Remove from team
    await prisma.player.update({
      where: { id: player.id },
      data: { teamId: null, roleInTeam: null },
    });

    return player;
  }

  /**
   * Get all free agents (verified players without a team).
   */
  async getFreeAgents() {
    return prisma.player.findMany({
      where: { teamId: null },
      include: { user: true },
      orderBy: { goals: "desc" },
    });
  }

  /**
   * Get a player's current contract.
   */
  async getActiveContract(playerId: string) {
    return prisma.contract.findFirst({
      where: { playerId, isActive: true },
      include: { team: true },
    });
  }

  /**
   * Get all players for a team with their roles.
   */
  async getTeamRoster(teamId: string) {
    return prisma.player.findMany({
      where: { teamId },
      include: { user: true },
      orderBy: [{ roleInTeam: "asc" }, { goals: "desc" }],
    });
  }
}

export const contractService = new ContractService();