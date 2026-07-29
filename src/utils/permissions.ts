import type { GuildMember } from "discord.js";
import { prisma } from "../database/prisma.js";

export enum RoleType {
  Founder = "founder",
  LeagueManagement = "league-management",
  Manager = "manager",
  AssistantManager = "assistant-manager",
  Moderator = "moderator",
  Referee = "referee",
}

const ROLE_NAMES: Record<RoleType, string[]> = {
  [RoleType.Founder]: ["Founder", "Owner", "LFC Founder", "Creator", "LFC Owner"],
  [RoleType.LeagueManagement]: ["League Management", "League Admin", "Commissioner", "League Commissioner"],
  [RoleType.Manager]: ["Manager", "GM", "General Manager", "LFC Manager"],
  [RoleType.AssistantManager]: ["Assistant Manager", "Asst. Manager", "Asst Manager", "Assistant GM"],
  [RoleType.Moderator]: ["Moderator", "Mod", "Staff"],
  [RoleType.Referee]: ["Referee", "Match Official", "Ref"],
};

// Maps RoleType to the GuildConfig field that stores the Discord role ID
const ROLE_ID_FIELDS: Record<RoleType, string | null> = {
  [RoleType.Founder]: null,
  [RoleType.LeagueManagement]: null,
  [RoleType.Manager]: "managerRoleId",
  [RoleType.AssistantManager]: "assistantManagerRoleId",
  [RoleType.Moderator]: "moderatorRoleId",
  [RoleType.Referee]: "refereeRoleId",
};

/**
 * Check if a member has a particular role type.
 * First checks by stored role ID from GuildConfig (for setup-configured servers),
 * then falls back to checking by role name (for auto-detected servers).
 */
export async function hasRoleAsync(
  member: GuildMember | null,
  roleType: RoleType,
  guildId?: string
): Promise<boolean> {
  if (!member) return false;

  // Quick name-based check first
  if (hasRole(member, roleType)) return true;

  // ID-based check using stored GuildConfig
  if (guildId) {
    const field = ROLE_ID_FIELDS[roleType];
    if (field) {
      try {
        const config = await prisma.guildConfig.findUnique({ where: { guildId } });
        if (config) {
          const storedRoleId = (config as any)[field] as string | null;
          if (storedRoleId && member.roles.cache.has(storedRoleId)) {
            return true;
          }
        }
      } catch {
        // DB error, fall through
      }
    }
  }

  return false;
}

export function hasRole(
  member: GuildMember | null,
  roleType: RoleType
): boolean {
  if (!member) return false;
  const allowedNames = ROLE_NAMES[roleType];
  return member.roles.cache.some((role) =>
    allowedNames.some(
      (name) => role.name.toLowerCase() === name.toLowerCase()
    )
  );
}

export async function hasAnyStaffRoleAsync(member: GuildMember | null, guildId?: string): Promise<boolean> {
  if (!member) return false;
  for (const roleType of Object.values(RoleType)) {
    if (await hasRoleAsync(member, roleType, guildId)) return true;
  }
  return false;
}

export function hasAnyStaffRole(member: GuildMember | null): boolean {
  if (!member) return false;
  return Object.values(RoleType).some((roleType) => hasRole(member, roleType));
}

export function requireRole(roleType: RoleType) {
  return function (interaction: any): boolean {
    const member = interaction.member as GuildMember | null;
    if (!member) return false;
    return hasRole(member, roleType);
  };
}

export function getRoleHierarchy(): RoleType[] {
  return [RoleType.Manager, RoleType.AssistantManager, RoleType.Moderator, RoleType.Referee];
}
