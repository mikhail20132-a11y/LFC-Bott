import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
  GuildMember,
} from "discord.js";
import { prisma } from "../../database/prisma.js";
import { hasRole, RoleType } from "../../utils/permissions.js";
import { createSuccessEmbed, createErrorEmbed } from "../../utils/helpers.js";
import type { Command } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("appoint")
    .setDescription("Appoint a user as Franchise Owner of a team (Founder only)")
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("The user to appoint as owner")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("team")
        .setDescription("Team name to assign")
        .setRequired(true)
    ),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply();

    const member = interaction.member as GuildMember | null;
    if (!member || !hasRole(member, RoleType.Founder)) {
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            "❌ Insufficient Permissions",
            "Only users with the **Founder** role can appoint franchise owners."
          ),
        ],
      });
      return;
    }

    const targetUser = interaction.options.getUser("user", true);
    const teamName = interaction.options.getString("team", true);

    try {
      // Verify the team exists
      const team = await prisma.team.findUnique({
        where: { name: teamName },
        include: { manager: true },
      });

      if (!team) {
        await interaction.editReply({
          embeds: [
            createErrorEmbed(
              "❌ Team Not Found",
              `No team named **${teamName}** exists.`
            ),
          ],
        });
        return;
      }

      // Ensure the DiscordUser record exists for the target
      let discordUser = await prisma.discordUser.findUnique({
        where: { discordId: targetUser.id },
      });

      if (!discordUser) {
        discordUser = await prisma.discordUser.create({
          data: {
            discordId: targetUser.id,
            username: targetUser.username,
            globalName: targetUser.globalName,
            avatarUrl: targetUser.displayAvatarURL(),
          },
        });
      }

      // Update the team's manager in the database
      await prisma.team.update({
        where: { id: team.id },
        data: { managerId: discordUser.id },
      });

      // Attempt to assign Discord roles
      const guild = interaction.guild;
      if (guild) {
        try {
          const targetMember = await guild.members.fetch(targetUser.id);

          // Find and assign the Founder role
          const founderRole = guild.roles.cache.find(
            (r) => r.name.toLowerCase() === "founder"
          );
          if (founderRole) {
            await targetMember.roles.add(founderRole, "Appointed as Franchise Owner");
          }

          // Assign the team's role if it exists
          if (team.roleId) {
            const teamRole = guild.roles.cache.get(team.roleId);
            if (teamRole) {
              await targetMember.roles.add(
                teamRole,
                `Appointed as owner of ${team.name}`
              );
            }
          }
        } catch (roleErr) {
          console.error("[Appoint Role Assignment Warning]", roleErr);
          // Non-blocking — continue even if role assignment fails
        }
      }

      const embed = new EmbedBuilder()
        .setTitle("👑 Franchise Owner Appointed")
        .setDescription(
          `${targetUser} has been appointed as the **Franchise Owner** of **${teamName}**!`
        )
        .setColor("#FFD700")
        .addFields(
          {
            name: "👤 User",
            value: `${targetUser.tag}`,
            inline: true,
          },
          {
            name: "👕 Team",
            value: teamName,
            inline: true,
          }
        )
        .setFooter({ text: "Legacy Football Championship" })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("[Appoint Error]", error);
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            "❌ Error",
            "An error occurred while appointing the franchise owner."
          ),
        ],
      });
    }
  },
};

export default command;
