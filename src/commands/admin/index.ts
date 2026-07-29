import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { leagueService } from "../../services/leagueService.js";
import { adminService } from "../../services/adminService.js";
import { prisma } from "../../database/prisma.js";
import { hasRole, RoleType } from "../../utils/permissions.js";
import { createErrorEmbed, createSuccessEmbed, BRAND } from "../../utils/helpers.js";
import type { Command } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("admin")
    .setDescription("Admin commands — warn, suspend, blacklist, and season management")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub.setName("set-demandschannel").setDescription("Set the channel where /demand notifications appear")
        .addChannelOption((opt) =>
          opt.setName("channel").setDescription("The channel for demands").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName("warn").setDescription("Warn a user for misconduct (Staff only)")
        .addUserOption((opt) => opt.setName("user").setDescription("User to warn").setRequired(true))
        .addStringOption((opt) => opt.setName("reason").setDescription("Reason for the warning").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub.setName("suspend").setDescription("Suspend a user from the league (Assistant Manager only)")
        .addUserOption((opt) => opt.setName("user").setDescription("User to suspend").setRequired(true))
        .addStringOption((opt) => opt.setName("reason").setDescription("Reason for the suspension").setRequired(true))
        .addStringOption((opt) => opt.setName("duration").setDescription("Suspension duration (e.g. 7d, 30d, permanent)").setRequired(false))
    )
    .addSubcommand((sub) =>
      sub.setName("blacklist").setDescription("Blacklist a user from the league (Manager only)")
        .addUserOption((opt) => opt.setName("user").setDescription("User to blacklist").setRequired(true))
        .addStringOption((opt) => opt.setName("reason").setDescription("Reason for blacklisting").setRequired(true))
    )
    .addSubcommandGroup((group) =>
      group.setName("season").setDescription("Season management")
        .addSubcommand((sub) => sub.setName("start").setDescription("Start a new season (Assistant Manager only)")
          .addStringOption((opt) => opt.setName("name").setDescription("Season name").setRequired(true)))
        .addSubcommand((sub) => sub.setName("end").setDescription("End the current active season (Assistant Manager only)"))
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    const group = interaction.options.getSubcommandGroup(false);
    if (group === "season") {
      const sub = interaction.options.getSubcommand(true);
      return sub === "start" ? handleSeasonStart(interaction) : handleSeasonEnd(interaction);
    }
    const subcommand = interaction.options.getSubcommand(true);
    const handlers: Record<string, (i: ChatInputCommandInteraction) => Promise<void>> = {
      "set-demandschannel": handleSetDemandsChannel,
      warn: handleWarn,
      suspend: handleSuspend,
      blacklist: handleBlacklist,
    };
    if (handlers[subcommand]) return handlers[subcommand](interaction);
    await interaction.reply({ content: "❌ Unknown subcommand.", ephemeral: true });
  },
};

async function handleWarn(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  if (!hasRole(interaction.member as never, RoleType.Moderator) && !hasRole(interaction.member as never, RoleType.AssistantManager) && !hasRole(interaction.member as never, RoleType.Manager)) {
    await interaction.editReply({ embeds: [createErrorEmbed("❌ No Permission", "Staff+ required.")] });
    return;
  }
  const user = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason", true);
  try {
    await adminService.createWarning(user.id, reason, interaction.user.id);
    await interaction.editReply({ embeds: [createSuccessEmbed("⚠️ Warning Issued", `${user} warned: **${reason}**`)] });
  } catch (e) {
    await interaction.editReply({ embeds: [createErrorEmbed("❌ Failed", String(e))] });
  }
}

async function handleSuspend(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  if (!hasRole(interaction.member as never, RoleType.AssistantManager) && !hasRole(interaction.member as never, RoleType.Manager)) {
    await interaction.editReply({ embeds: [createErrorEmbed("❌ No Permission", "Management+ required.")] });
    return;
  }
  const user = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason", true);
  const duration = interaction.options.getString("duration");
  const expiresAt = duration && duration !== "permanent" ? new Date(Date.now() + parseInt(duration) * 86400000) : null;
  try {
    await adminService.createSuspension(user.id, reason, interaction.user.id, expiresAt);
    await interaction.editReply({ embeds: [createSuccessEmbed("🔒 User Suspended", `${user} suspended${duration ? ` for ${duration}` : ""}: **${reason}**`)] });
  } catch (e) {
    await interaction.editReply({ embeds: [createErrorEmbed("❌ Failed", String(e))] });
  }
}

async function handleBlacklist(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  if (!hasRole(interaction.member as never, RoleType.Manager)) {
    await interaction.editReply({ embeds: [createErrorEmbed("❌ No Permission", "Manager only.")] });
    return;
  }
  const user = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason", true);
  try {
    await adminService.blacklistUser(user.id, reason, interaction.user.id);
    await interaction.editReply({ embeds: [createSuccessEmbed("⛔ User Blacklisted", `${user} blacklisted: **${reason}**`)] });
  } catch (e) {
    await interaction.editReply({ embeds: [createErrorEmbed("❌ Failed", String(e))] });
  }
}

async function handleSeasonStart(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  if (!hasRole(interaction.member as never, RoleType.AssistantManager) && !hasRole(interaction.member as never, RoleType.Manager)) {
    await interaction.editReply({ embeds: [createErrorEmbed("❌ No Permission", "Management+ required.")] });
    return;
  }
  const name = interaction.options.getString("name", true);
  try {
    await leagueService.startNewSeason(name);
    await interaction.editReply({ embeds: [createSuccessEmbed("🌅 Season Started", `**${name}** is now active!`)] });
  } catch (e) {
    await interaction.editReply({ embeds: [createErrorEmbed("❌ Failed", String(e))] });
  }
}

async function handleSetDemandsChannel(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  if (!hasRole(interaction.member as never, RoleType.AssistantManager) && !hasRole(interaction.member as never, RoleType.Manager)) {
    await interaction.editReply({ embeds: [createErrorEmbed("❌ No Permission", "Management+ required.")] });
    return;
  }
  const channel = interaction.options.getChannel("channel", true);
  await prisma.guildConfig.upsert({
    where: { guildId: interaction.guildId! },
    update: { demandsChannelId: channel.id },
    create: { guildId: interaction.guildId!, demandsChannelId: channel.id },
  });
  await interaction.editReply({
    embeds: [
      createSuccessEmbed(
        "📢 Demands Channel Set!",
        `Demand notifications will now be posted to ${channel}.\n\n` +
          `When players use \`/demand\`, the transfer demand will appear there.`
      ),
    ],
  });
}

async function handleSeasonEnd(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  if (!hasRole(interaction.member as never, RoleType.AssistantManager) && !hasRole(interaction.member as never, RoleType.Manager)) {
    await interaction.editReply({ embeds: [createErrorEmbed("❌ No Permission", "Management+ required.")] });
    return;
  }
  try {
    await leagueService.endCurrentSeason();
    await interaction.editReply({ embeds: [createSuccessEmbed("🌅 Season Ended", "Current season has been concluded.")] });
  } catch (e) {
    await interaction.editReply({ embeds: [createErrorEmbed("❌ Failed", String(e))] });
  }
}

export default command;