import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
  ChannelType,
  TextChannel,
  GuildMember,
} from "discord.js";
import { prisma } from "../../database/prisma.js";
import { hasRole, RoleType } from "../../utils/permissions.js";
import { createSuccessEmbed, createErrorEmbed } from "../../utils/helpers.js";
import type { Command } from "../../types/index.js";

const POSITIONS = [
  { name: "Goalkeeper", value: "Goalkeeper" },
  { name: "Defender", value: "Defender" },
  { name: "Midfielder", value: "Midfielder" },
  { name: "Forward", value: "Forward" },
] as const;

const REGIONS = [
  { name: "Europe", value: "Europe" },
  { name: "Asia", value: "Asia" },
  { name: "Africa", value: "Africa" },
  { name: "North America", value: "North America" },
  { name: "South America", value: "South America" },
  { name: "Oceania", value: "Oceania" },
] as const;

async function isTeamManager(
  member: GuildMember | null,
  teamName: string
): Promise<boolean> {
  if (!member) return false;

  // Check if they have a high-level role
  if (
    hasRole(member, RoleType.Founder) ||
    hasRole(member, RoleType.LeagueManagement)
  ) {
    return true;
  }

  // Check if they are a team manager in the database
  const discordUser = await prisma.discordUser.findUnique({
    where: { discordId: member.id },
    include: { teamsManaged: true },
  });

  if (!discordUser) return false;

  return discordUser.teamsManaged.some(
    (team) => team.name.toLowerCase() === teamName.toLowerCase()
  );
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("lfp")
    .setDescription("Broadcast that a team is looking for players")
    .addStringOption((opt) =>
      opt
        .setName("team")
        .setDescription("Your team name")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("position")
        .setDescription("Position you're recruiting for")
        .setRequired(false)
        .addChoices(...POSITIONS)
    )
    .addStringOption((opt) =>
      opt
        .setName("region")
        .setDescription("Preferred region")
        .setRequired(false)
        .addChoices(...REGIONS)
    ),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply({ ephemeral: true });

    const member = interaction.member as GuildMember | null;
    const teamName = interaction.options.getString("team", true);

    if (!member) {
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            "❌ Error",
            "Could not resolve your member information."
          ),
        ],
      });
      return;
    }

    // Permission: team manager
    const authorized = await isTeamManager(member, teamName);
    if (!authorized) {
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            "❌ Insufficient Permissions",
            `You must be the manager of **${teamName}** or have a **Founder**/**League Management** role to post a recruitment ad.`
          ),
        ],
      });
      return;
    }

    const position = interaction.options.getString("position");
    const region = interaction.options.getString("region");

    // Try to find #lfc-announcements first, fall back to current channel
    const guild = interaction.guild;
    let targetChannel: TextChannel | null = null;

    if (guild) {
      const channels = guild.channels.cache.filter(
        (ch) =>
          ch.name === "lfc-announcements" && ch.type === ChannelType.GuildText
      );
      targetChannel = (channels.first() as TextChannel) ?? null;
    }

    targetChannel =
      targetChannel ?? (interaction.channel as TextChannel);

    if (!targetChannel || !targetChannel.isTextBased()) {
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            "❌ Invalid Channel",
            "Could not resolve a text channel for the announcement."
          ),
        ],
      });
      return;
    }

    try {
      const embed = new EmbedBuilder()
        .setTitle(`📢 Looking For Players — ${teamName}`)
        .setDescription(
          `${teamName} is recruiting! Interested players should react or contact the team manager.`
        )
        .setColor("#00AAFF")
        .addFields(
          {
            name: "👕 Team",
            value: teamName,
            inline: true,
          },
          {
            name: "📍 Position",
            value: position ?? "Any",
            inline: true,
          },
          {
            name: "🌍 Region",
            value: region ?? "Any",
            inline: true,
          }
        )
        .setFooter({
          text: `Posted by ${interaction.user.tag} • Legacy Football Championship`,
        })
        .setTimestamp();

      await targetChannel.send({ embeds: [embed] });

      await interaction.editReply({
        content: `✅ Recruitment post published in ${targetChannel}!`,
      });
    } catch (error) {
      console.error("[LFP Error]", error);
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            "❌ Error",
            "Failed to post the recruitment announcement. Make sure the bot has permission to send embeds in that channel."
          ),
        ],
      });
    }
  },
};

export default command;
