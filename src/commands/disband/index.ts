import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { prisma } from "../../database/prisma.js";
import { hasRole, RoleType } from "../../utils/permissions.js";
import { createErrorEmbed } from "../../utils/helpers.js";
import type { Command } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("disband")
    .setDescription("Permanently delete a team and all its data (Founder only)")
    .addStringOption((opt) =>
      opt
        .setName("team")
        .setDescription("Name of the team to disband")
        .setRequired(true)
    ),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply();

    // Founder only
    if (!hasRole(interaction.member as never, RoleType.Founder)) {
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            "❌ Insufficient Permissions",
            "Only the **Founder** can disband teams."
          ),
        ],
      });
      return;
    }

    const teamName = interaction.options.getString("team", true);

    try {
      // 1. Find the team
      const team = await prisma.team.findUnique({
        where: { name: teamName },
      });

      if (!team) {
        await interaction.editReply({
          embeds: [
            createErrorEmbed("❌ Team Not Found", `A team named **${teamName}** does not exist.`),
          ],
        });
        return;
      }

      const teamId = team.id;

      // 2. Delete all contracts for the team
      await prisma.contract.deleteMany({
        where: { teamId },
      });

      // 3. Delete team season stats
      await prisma.teamSeasonStats.deleteMany({
        where: { teamId },
      });

      // 4. Release all players from the team
      await prisma.player.updateMany({
        where: { teamId },
        data: { teamId: null, roleInTeam: null },
      });

      // 5. Delete related lineups
      await prisma.lineup.deleteMany({
        where: { teamId },
      });

      // 6. Finally delete the team itself
      await prisma.team.delete({
        where: { id: teamId },
      });

      const embed = new EmbedBuilder()
        .setTitle("💥 Team Disbanded")
        .setColor("#FF0000")
        .setDescription(`**${teamName}** has been permanently disbanded.`)
        .addFields(
          { name: "🏟️ Team", value: teamName, inline: true },
          {
            name: "🗑️ Cleared Data",
            value: [
              "• Contracts deleted",
              "• Season stats cleared",
              "• Players released to free agency",
              "• Team record removed",
            ].join("\n"),
            inline: false,
          }
        )
        .setFooter({ text: "Legacy Football Championship • Administration" })
        .setTimestamp();

      // Attempt to delete the Discord role as well
      if (team.roleId && interaction.guild) {
        try {
          const role = await interaction.guild.roles.fetch(team.roleId);
          if (role) {
            await role.delete("LFC Team disbanded");
          }
        } catch (_) {
          // Non-critical — role deletion may fail due to hierarchy
        }
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("[Disband Error]", error);
      await interaction.editReply({
        content: "❌ An error occurred while disbanding the team.",
      });
    }
  },
};

export default command;
