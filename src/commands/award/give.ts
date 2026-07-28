import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { prisma } from "../../database/prisma.js";
import { playerService } from "../../services/playerService.js";
import { leagueService } from "../../services/leagueService.js";
import { newsService } from "../../services/newsService.js";
import { hasRole, RoleType } from "../../utils/permissions.js";
import { createErrorEmbed } from "../../utils/helpers.js";
import type { Command, AwardType, ExtendedClient } from "../../types/index.js";

const AWARD_TYPES: AwardType[] = [
  "Golden Boot",
  "Golden Boy",
  "Best Playmaker",
  "Player of the Season",
  "Team of the Season",
  "Manager of the Season",
];

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("award")
    .setDescription("Award management commands")
    .addSubcommand((sub) =>
      sub
        .setName("give")
        .setDescription("Give an award to a player (Management only)")
        .addStringOption((opt) =>
          opt
            .setName("type")
            .setDescription("Award type")
            .setRequired(true)
            .addChoices(
              ...AWARD_TYPES.map((t) => ({ name: t, value: t }))
            )
        )
        .addUserOption((opt) =>
          opt
            .setName("player")
            .setDescription("Player to award")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("reason")
            .setDescription("Reason for the award")
            .setRequired(false)
        )
    ),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply();

    const member = interaction.member;
    if (
      !hasRole(member as never, RoleType.Founder) &&
      !hasRole(member as never, RoleType.LeagueManagement)
    ) {
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            "❌ Insufficient Permissions",
            "Only **Founder** or **League Management** can give awards."
          ),
        ],
      });
      return;
    }

    const awardType = interaction.options.getString("type", true) as AwardType;
    const targetUser = interaction.options.getUser("player", true);
    const reason = interaction.options.getString("reason");

    try {
      const player = await playerService.getPlayer(targetUser.id);

      if (!player) {
        await interaction.editReply({
          embeds: [
            createErrorEmbed(
              "❌ Player Not Found",
              `${targetUser.username} is not registered as an LFC player.`
            ),
          ],
        });
        return;
      }

      const activeSeason = await leagueService.getActiveSeason();

      if (!activeSeason) {
        await interaction.editReply({
          embeds: [
            createErrorEmbed(
              "❌ No Active Season",
              "Start a season before giving awards."
            ),
          ],
        });
        return;
      }

      // Check if player already has this award this season
      const existingAward = await prisma.award.findUnique({
        where: {
          playerId_seasonId_type: {
            playerId: player.id,
            seasonId: activeSeason.id,
            type: awardType,
          },
        },
      });

      if (existingAward) {
        await interaction.editReply({
          embeds: [
            createErrorEmbed(
              "❌ Award Already Given",
              `${targetUser.username} already received **${awardType}** in ${activeSeason.name}.`
            ),
          ],
        });
        return;
      }

      const award = await prisma.award.create({
        data: {
          type: awardType,
          playerId: player.id,
          seasonId: activeSeason.id,
          reason,
        },
        include: {
          player: { include: { user: true } },
          season: true,
        },
      });

      const embed = new EmbedBuilder()
        .setTitle(`🏅 Award Given!`)
        .setColor("#FFD700")
        .setDescription(
          `**${award.player.user.username}** has been awarded **${award.type}**!`
        )
        .addFields(
          { name: "🏅 Award", value: award.type, inline: true },
          { name: "📅 Season", value: award.season.name, inline: true },
          {
            name: "📝 Reason",
            value: award.reason ?? "Outstanding performance",
            inline: false,
          }
        )
        .setFooter({ text: "Legacy Football Championship" })
        .setTimestamp();

      // Increment trophies counter
      await prisma.player.update({
        where: { id: player.id },
        data: { trophies: { increment: 1 } },
      });

      // ── Auto-post award news ──
      try {
        if (interaction.guild) {
          await newsService.announceAward(
            interaction.client as ExtendedClient,
            {
              guildId: interaction.guild.id,
              playerName: targetUser.username,
              awardType: award.type,
              season: award.season.name,
              reason: award.reason ?? undefined,
            }
          );
        }
      } catch (newsError) {
        console.error("[Award News Error]", newsError);
        // Non-fatal
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("[Award Give Error]", error);
      await interaction.editReply({
        content: "❌ An error occurred while giving the award.",
      });
    }
  },
};

export default command;