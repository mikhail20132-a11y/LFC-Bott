import {
  SlashCommandBuilder,
  CommandInteraction,
} from "discord.js";
import { hasRole, RoleType } from "../../utils/permissions.js";
import { createErrorEmbed } from "../../utils/helpers.js";
import { showMainPanel } from "../../services/panelHandler.js";
import type { Command } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("panel")
    .setDescription("Open the LFC Management Control Panel (Manager/Assistant Manager only)")
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

    if (
      !hasRole(interaction.member as never, RoleType.Manager) &&
      !hasRole(interaction.member as never, RoleType.AssistantManager)
    ) {
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            "Access Denied",
            "The Management Panel is restricted to **Manager** and **Assistant Manager** roles only."
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