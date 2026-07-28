import {
  SlashCommandBuilder,
  CommandInteraction,
  ChannelType,
  EmbedBuilder,
} from "discord.js";
import { prisma } from "../../database/prisma.js";
import { teamService } from "../../services/teamService.js";
import { hasRole, RoleType } from "../../utils/permissions.js";
import { createErrorEmbed, createSuccessEmbed } from "../../utils/helpers.js";
import type { Command } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("threadcreate")
    .setDescription("Create a scheduling thread between two team managers")
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

    // Permission check
    const member = interaction.member;
    if (
      !hasRole(member as never, RoleType.Founder) &&
      !hasRole(member as never, RoleType.LeagueManagement) &&
      !hasRole(member as never, RoleType.Referee)
    ) {
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            "❌ Insufficient Permissions",
            "You need **Founder**, **League Management**, or **Referee** role to create scheduling threads."
          ),
        ],
      });
      return;
    }

    const team1Name = interaction.options.getString("team1", true);
    const team2Name = interaction.options.getString("team2", true);

    try {
      const team1 = await teamService.getTeamByName(team1Name);
      const team2 = await teamService.getTeamByName(team2Name);

      if (!team1) {
        await interaction.editReply({
          embeds: [
            createErrorEmbed("❌ Team Not Found", `Team **${team1Name}** not found.`),
          ],
        });
        return;
      }

      if (!team2) {
        await interaction.editReply({
          embeds: [
            createErrorEmbed("❌ Team Not Found", `Team **${team2Name}** not found.`),
          ],
        });
        return;
      }

      // Validate we're in a text channel that supports threads
      if (
        !interaction.channel ||
        !("threads" in interaction.channel) ||
        interaction.channel.type !== ChannelType.GuildText
      ) {
        await interaction.editReply({
          embeds: [
            createErrorEmbed(
              "❌ Wrong Channel",
              "This command must be used in a text channel that supports threads."
            ),
          ],
        });
        return;
      }

      const threadName = `scheduling-${team1.name.toLowerCase().replace(/\s+/g, "-")}-vs-${team2.name.toLowerCase().replace(/\s+/g, "-")}`;

      // Create the private thread
      const thread = await interaction.channel.threads.create({
        name: threadName,
        type: ChannelType.PrivateThread,
        reason: `Scheduling thread between ${team1.name} and ${team2.name}`,
      });

      // Build the embed with pings
      const manager1Ping = team1.managerId
        ? `<@${team1.managerId}>`
        : "*(no manager assigned)*";
      const manager2Ping = team2.managerId
        ? `<@${team2.managerId}>`
        : "*(no manager assigned)*";

      const embed = new EmbedBuilder()
        .setTitle("📅 Scheduling Meeting")
        .setColor("#FF6600")
        .setDescription(
          `This thread is for scheduling **${team1.name}** vs **${team2.name}**.\n\n` +
          `**${team1.emoji || "🏠"} ${team1.name} Manager:** ${manager1Ping}\n` +
          `**${team2.emoji || "✈️"} ${team2.name} Manager:** ${manager2Ping}\n\n` +
          `Please coordinate a match date/time and notify a Referee when ready.`
        )
        .addFields(
          {
            name: "📋 Instructions",
            value:
              "1. Agree on a date & time\n" +
              "2. Find an available Referee\n" +
              "3. Use `/match create` to schedule the official match",
            inline: false,
          }
        )
        .setFooter({ text: "Legacy Football Championship" })
        .setTimestamp();

      await thread.send({
        content: `${manager1Ping} ${manager2Ping}`,
        embeds: [embed],
      });

      await interaction.editReply({
        embeds: [
          createSuccessEmbed(
            "✅ Thread Created!",
            `Private scheduling thread created: ${thread}\n\n` +
            `Invited managers for **${team1.name}** and **${team2.name}**.`
          ),
        ],
      });
    } catch (error) {
      console.error("[ThreadCreate Error]", error);
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            "❌ Error",
            "Failed to create scheduling thread."
          ),
        ],
      });
    }
  },
};

export default command;
