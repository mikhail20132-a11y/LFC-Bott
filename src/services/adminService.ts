import { prisma } from "../database/prisma.js";

export class AdminService {
  /**
   * Alias for backward compatibility.
   */
  async createWarning(discordId: string, reason: string, issuedBy: string) {
    return this.warnUser(discordId, reason, issuedBy);
  }

  /**
   * Issue a warning to a user.
   */
  async warnUser(discordId: string, reason: string, issuedBy: string) {
    return prisma.warning.create({
      data: { userId: discordId, reason, issuedBy },
    });
  }

  /**
   * Get warnings for a user.
   */
  async getUserWarnings(discordId: string) {
    return prisma.warning.findMany({
      where: { userId: discordId },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Alias for backward compatibility.
   */
  async createSuspension(
    discordId: string,
    reason: string,
    issuedBy: string,
    expiresAt?: Date
  ) {
    return this.suspendUser(discordId, reason, issuedBy, expiresAt);
  }

  /**
   * Suspend a user.
   */
  async suspendUser(
    discordId: string,
    reason: string,
    issuedBy: string,
    expiresAt?: Date
  ) {
    return prisma.suspension.create({
      data: {
        userId: discordId,
        reason,
        issuedBy,
        expiresAt,
        active: true,
      },
    });
  }

  /**
   * Check if a user is currently suspended.
   */
  async isUserSuspended(discordId: string): Promise<boolean> {
    const suspension = await prisma.suspension.findFirst({
      where: {
        userId: discordId,
        active: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gte: new Date() } },
        ],
      },
    });

    if (!suspension) return false;

    // Auto-expire if past expiry date
    if (suspension.expiresAt && suspension.expiresAt < new Date()) {
      await prisma.suspension.update({
        where: { id: suspension.id },
        data: { active: false },
      });
      return false;
    }

    return true;
  }

  /**
   * Lift a suspension.
   */
  async liftSuspension(discordId: string) {
    return prisma.suspension.updateMany({
      where: { userId: discordId, active: true },
      data: { active: false },
    });
  }

  /**
   * Blacklist a user.
   */
  async blacklistUser(discordId: string, reason: string, issuedBy: string) {
    return prisma.blacklist.create({
      data: { discordId, reason, issuedBy },
    });
  }

  /**
   * Check if a user is blacklisted.
   */
  async isBlacklisted(discordId: string): Promise<boolean> {
    const entry = await prisma.blacklist.findUnique({
      where: { discordId },
    });
    return !!entry;
  }

  /**
   * Get active suspensions.
   */
  async getActiveSuspensions() {
    return prisma.suspension.findMany({
      where: { active: true },
      include: { user: true },
      orderBy: { createdAt: "desc" },
    });
  }
}

export const adminService = new AdminService();