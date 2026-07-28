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