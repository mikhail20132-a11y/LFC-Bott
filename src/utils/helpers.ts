import {
  EmbedBuilder,
  ColorResolvable,
  CommandInteraction,
  GuildMember,
} from "discord.js";

const PRIMARY_COLOR: ColorResolvable = "#00AA00";
const ERROR_COLOR: ColorResolvable = "#FF0000";
const WARNING_COLOR: ColorResolvable = "#FFAA00";

export function createEmbed(
  title: string,
  description?: string,
  color: ColorResolvable = PRIMARY_COLOR
): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description ?? null)
    .setColor(color)
    .setTimestamp();
}

export function createSuccessEmbed(title: string, description?: string): EmbedBuilder {
  return createEmbed(title, description, "#00AA00");
}

export function createErrorEmbed(title: string, description?: string): EmbedBuilder {
  return createEmbed(title, description, ERROR_COLOR);
}

export function createWarningEmbed(title: string, description?: string): EmbedBuilder {
  return createEmbed(title, description, WARNING_COLOR);
}

export function getMember(interaction: CommandInteraction): GuildMember | null {
  return interaction.member as GuildMember | null;
}

export function formatDate(date: Date | null | undefined): string {
  if (!date) return "N/A";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatSeasonStats(stats: {
  goals: number;
  assists: number;
  saves?: number;
  mvps: number;
  appearances: number;
  yellowCards?: number;
  redCards?: number;
  cleanSheets?: number;
}): string {
  const parts = [
    `⚽ Goals: ${stats.goals}`,
    `🎯 Assists: ${stats.assists}`,
    `🏆 MVPs: ${stats.mvps}`,
    `📋 Appearances: ${stats.appearances}`,
  ];
  if (stats.saves !== undefined && stats.saves > 0) {
    parts.push(`🧤 Saves: ${stats.saves}`);
  }
  if (stats.cleanSheets !== undefined && stats.cleanSheets > 0) {
    parts.push(`🧹 Clean Sheets: ${stats.cleanSheets}`);
  }
  if (stats.yellowCards !== undefined) {
    parts.push(`🟨 Yellow Cards: ${stats.yellowCards}`);
  }
  if (stats.redCards !== undefined) {
    parts.push(`🟥 Red Cards: ${stats.redCards}`);
  }
  return parts.join("\n");
}

export function generateLfcId(discordId: string): string {
  // Generate a unique LFC ID
  const hash = Array.from(discordId)
    .reduce((acc, char) => acc + char.charCodeAt(0), 0)
    .toString(16)
    .toUpperCase()
    .slice(0, 6);
  return `LFC-${hash}`;
}

// ─── BRANDING & THEME ──────────────────────────────────────────────────────

export const BRAND = {
  name: "Legacy Football Championship",
  year: 2026,
  footer: "Legacy Football Championship • Est. 2026",
  colors: {
    primary: 0x6366f1 as const,      // Indigo (info/general)
    success: 0x22c55e as const,       // Green (accepts/signings)
    danger: 0xef4444 as const,        // Red (releases/declines)
    warning: 0xf59e0b as const,       // Amber (pending/warnings)
    gold: 0xffd700 as const,          // Gold (awards/championships)
    accent: 0x8b5cf6 as const,        // Purple (dashboards/cards)
    muted: 0x6b7280 as const,         // Gray (neutral info)
  },
} as const;

// ─── POSITION HELPERS ───────────────────────────────────────────────────────

import type { Position, PositionCategory } from "../types/index.js";

const POSITION_META: Record<Position, {
  category: PositionCategory;
  emoji: string;
  fullName: string;
}> = {
  GK:  { category: "Goalkeeper", emoji: "🧤", fullName: "Goalkeeper" },
  CB:  { category: "Defender",   emoji: "🛡️", fullName: "Center Back" },
  LB:  { category: "Defender",   emoji: "🛡️", fullName: "Left Back" },
  RB:  { category: "Defender",   emoji: "🛡️", fullName: "Right Back" },
  CDM: { category: "Midfielder", emoji: "⚡", fullName: "Defensive Midfielder" },
  CM:  { category: "Midfielder", emoji: "⚡", fullName: "Center Midfielder" },
  CAM: { category: "Midfielder", emoji: "⚡", fullName: "Attacking Midfielder" },
  LW:  { category: "Forward",    emoji: "⚽", fullName: "Left Wing" },
  RW:  { category: "Forward",    emoji: "⚽", fullName: "Right Wing" },
  LF:  { category: "Forward",    emoji: "⚽", fullName: "Left Forward" },
  RF:  { category: "Forward",    emoji: "⚽", fullName: "Right Forward" },
  CF:  { category: "Forward",    emoji: "⚽", fullName: "Center Forward" },
  ST:  { category: "Forward",    emoji: "⚽", fullName: "Striker" },
};

export function getPositionMeta(position: string): {
  category: PositionCategory;
  emoji: string;
  fullName: string;
} {
  return POSITION_META[position as Position] ?? {
    category: "Forward" as PositionCategory,
    emoji: "⚽",
    fullName: position,
  };
}

export function getPositionEmoji(position: string): string {
  return getPositionMeta(position).emoji;
}

export function getPositionCategory(position: string): PositionCategory {
  return getPositionMeta(position).category;
}

export const POSITION_CHOICES = Object.entries(POSITION_META).map(([value, meta]) => ({
  name: `${meta.emoji} ${meta.fullName} (${value})`,
  value,
}));