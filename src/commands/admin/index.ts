import { SlashCommandBuilder, CommandInteraction, EmbedBuilder, PermissionFlagsBits, REST, Routes, ChannelType } from "discord.js";
import { leagueService } from "../../services/leagueService.js";
import { newsService } from "../../services/newsService.js";
import { adminService } from "../../services/adminService.js";
import { teamService } from "../../services/teamService.js";
import { playerService } from "../../services/playerService.js";
import { prisma } from "../../database/prisma.js";
import { hasRole, RoleType } from "../../utils/permissions.js";
import { createErrorEmbed, createSuccessEmbed, formatDate } from "../../utils/helpers.js";
import type { Command, ExtendedClient } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("admin")
    .setDescription("Admin commands — setup, warn, suspend, blacklist, and season management")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply();
    await interaction.editReply({ content: "Admin command loaded! Use subcommands." });
  },
};

export default command;
