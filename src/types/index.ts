import type {
  Client,
  Collection,
  CommandInteraction,
  SlashCommandBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  SlashCommandOptionsOnlyBuilder,
  PermissionResolvable,
} from "discord.js";

export interface Command {
  data:
    | SlashCommandBuilder
    | SlashCommandSubcommandsOnlyBuilder
    | SlashCommandOptionsOnlyBuilder;
  execute: (interaction: CommandInteraction) => Promise<void>;
  cooldown?: number;
  permissions?: PermissionResolvable[];
  category?: string;
}

export interface ExtendedClient extends Client {
  commands: Collection<string, Command>;
}

export interface PlayerStats {
  goals: number;
  assists: number;
  saves: number;
  mvps: number;
  appearances: number;
  yellowCards: number;
  redCards: number;
  cleanSheets: number;
}

export interface SeasonStats extends PlayerStats {
  seasonId: string;
  seasonName: string;
}

export interface LeagueStanding {
  teamId: string;
  teamName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export type Position =
  | "Goalkeeper"
  | "Defender"
  | "Midfielder"
  | "Forward";

export type Region =
  | "Europe"
  | "Asia"
  | "Africa"
  | "North America"
  | "South America"
  | "Oceania";

export type AwardType =
  | "Golden Boot"
  | "Golden Boy"
  | "Best Playmaker"
  | "Player of the Season"
  | "Team of the Season"
  | "Manager of the Season"
  | "Golden Glove";

export type TransferStatus = "Pending" | "Completed" | "Cancelled";

export type MatchStatus = "Scheduled" | "Live" | "Finished" | "Postponed" | "Forfeit";

export type TeamRole = "Captain" | "Vice Captain" | "Starter" | "Sub" | "Academy";

export type Formation = "4-4-2" | "4-3-3" | "3-5-2" | "4-2-3-1" | "5-3-2" | "4-1-4-1" | "3-4-3";