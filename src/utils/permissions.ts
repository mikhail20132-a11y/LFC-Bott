import type { CommandInteraction, GuildMember } from "discord.js";

export enum RoleType {
  Founder = "founder",
  LeagueManagement = "league-management",
  Moderator = "moderator",
  Referee = "referee",
}

const ROLE_NAMES: Record<RoleType, string[]> = {
  [RoleType.Founder]: ["Founder", "Owner", "LFC Founder"],
  [RoleType.LeagueManagement]: ["League Management", "League Admin", "Commissioner"],
  [RoleType.Moderator]: ["Moderator", "Mod", "Staff"],
  [RoleType.Referee]: ["Referee", "Match Official", "Ref"],
};

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

export function hasAnyStaffRole(member: GuildMember | null): boolean {
  if (!member) return false;
  return Object.values(RoleType).some((roleType) => hasRole(member, roleType));
}

export function requireRole(roleType: RoleType) {
  return function (interaction: CommandInteraction): boolean {
    const member = interaction.member as GuildMember | null;
    if (!member) return false;
    return hasRole(member, roleType);
  };
}

export function getRoleHierarchy(): RoleType[] {
  return [RoleType.Founder, RoleType.LeagueManagement, RoleType.Moderator, RoleType.Referee];
}