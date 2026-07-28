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
    .setName("swap-teams")
    .setDescription("Swap two teams' names and short names (Founder only)")
    .addStringOption((opt) =>
      opt
        .setName("team1")
        .setDescription("First team name")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("team2")
        .setDescription("Second team name")
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
            "Only the **Founder** can swap teams."
          ),
        ],
      });
      return;
    }

    const team1Name = interaction.options.getString("team1", true);
    const team2Name = interaction.options.getString("team2", true);

    try {
      // Find both teams
      const team1 = await prisma.team.findUnique({
        where: { name: team1Name },
      });

      const team2 = await prisma.team.findUnique({
        where: { name: team2Name },
      });

      if (!team1 || !team2) {
        const missing = [];
        if (!team1) missing.push(`**${team1Name}**`);
        if (!team2) missing.push(`**${team2Name}**`);

        await interaction.editReply({
          embeds: [
            createErrorEmbed(
              "❌ Team Not Found",
              `Could not find: ${missing.join(", ")}`
            ),
          ],
        });
        return;
      }

      // Guard against swapping a team with itself
      if (team1.id === team2.id) {
        await interaction.editReply({
          embeds: [
            createErrorEmbed(
              "❌ Same Team",
              "You cannot swap a team with itself."
            ),
          ],
        });
        return;
      }

      // Perform the swap using a unique temporary name to avoid unique constraint conflicts
      const tempName = `__TEMP_SWAP_${Date.now()}__`;
      const tempShort = `__TEMP_SHORT_${Date.now()}__`;

      // Step 1: Move team1 to temporary names
      await prisma.team.update({
        where: { id: team1.id },
        data: { name: tempName, shortName: tempShort },
      });

      // Step 2: Move team2 to team1's original names
      await prisma.team.update({
        where: { id: team2.id },
        data: {
          name: team1Name,
          shortName: team1.shortName ?? null,
        },
      });

      // Step 3: Move temp names to team2's original names
      await prisma.team.update({
        where: { id: team1.id },
        data: {
          name: team2Name,
          shortName: team2.shortName ?? null,
        },
      });

      const embed = new EmbedBuilder()
        .setTitle("🔄 Teams Swapped")
        .setColor("#FFAA00")
        .setDescription("Both teams have had their names swapped successfully.")
        .addFields(
          {
            name: "➡️ Team 1",
            value: `~~${team1Name}~~ → **${team2Name}**`,
            inline: true,
          },
          {
            name: "⬅️ Team 2",
            value: `~~${team2Name}~~ → **${team1Name}**`,
            inline: true,
          },
          {
            name: "🔤 Short Names",
            value: team1.shortName || team2.shortName
              ? `~~${team1.shortName ?? "—"}~~ ⇄ ~~${team2.shortName ?? "—"}~~`
              : "No short names affected",
            inline: false,
          }
        )
        .setFooter({ text: "Legacy Football Championship • Administration" })
        .setTimestamp();

      // Update Discord roles if possible
      if (interaction.guild) {
        try {
          const role1 = team1.roleId
            ? await interaction.guild.roles.fetch(team1.roleId)
            : null;
          const role2 = team2.roleId
            ? await interaction.guild.roles.fetch(team2.roleId)
            : null;

          if (role1) await role1.setName(team2Name, "LFC Team swap");
          if (role2) await role2.setName(team1Name, "LFC Team swap");
        } catch (_) {
          // Non-critical — role renaming may fail
        }
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("[Swap Teams Error]", error);
      await interaction.editReply({
        content: "❌ An error occurred while swapping teams.",
      });
    }
  },
};

export default command;
