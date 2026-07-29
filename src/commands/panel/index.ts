import {
  SlashCommandBuilder,
  CommandInteraction,
  PermissionFlagsBits,
  GuildMember,
} from "discord.js";
import { createErrorEmbed } from "../../utils/helpers.js";
import { showMainPanel } from "../../services/panelHandler.js";
import type { Command } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("panel")
    .setDescription("Open the LFC Management Control Panel (Admin only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((opt) =>
      opt
        .setName("section")
        .setDescription("Jump to a specific section")
        .setRequired(false)
        .addChoices(
          { name: "Dashboard", value: "dashboard" },
          { name: "Teams Overview", value: "teams" },
          { name: "Free Agents", value: "freeagents" },
          { name: "AutoMap Roles", value: "automap" },
        )
    ),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply({ ephemeral: true });

    const member = interaction.member as GuildMember | null;
    if (!member || !member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            "Access Denied",
            "The Management Panel is restricted to **Administrators** only."
          ),
        ],
      });
      return;
    }

    const section = interaction.options.getString("section") || "dashboard";
    await showMainPanel(interaction, section);
  },
};

export default command;