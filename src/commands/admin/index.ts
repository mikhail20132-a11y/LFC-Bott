import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  REST,
  Routes,
  ChannelType,
} from "discord.js";
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
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub.setName("setup").setDescription("Auto-configure the LFC bot for this server (Manager only)")
    )
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
      setup: handleSetup,
      "set-demandschannel": handleSetDemandsChannel,
      warn: handleWarn,
      suspend: handleSuspend,
      blacklist: handleBlacklist,
    };
    if (handlers[subcommand]) return handlers[subcommand](interaction);
    await interaction.reply({ content: "❌ Unknown subcommand.", ephemeral: true });
  },
};

async function handleSetup(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  
  // Allow server owner OR Manager role to run setup
  const member = await interaction.guild?.members.fetch(interaction.user.id);
  const isOwner = member?.id === interaction.guild?.ownerId;
  
  if (!isOwner && !hasRole(interaction.member as never, RoleType.Manager)) {
    await interaction.editReply({ embeds: [createErrorEmbed("❌ Insufficient Permissions", "Only the server **Owner** or someone with **Manager** role can run setup.")] });
    return;
  }
  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply({ embeds: [createErrorEmbed("❌ Error", "This command must be used in a server.")] });
    return;
  }

  try {
    // 1. Create roles
    const managerRole = await guild.roles.create({ name: "Manager", color: 0x6366f1, reason: "LFC Auto-Setup" });
    const assistantRole = await guild.roles.create({ name: "Assistant Manager", color: 0x22c55e, reason: "LFC Auto-Setup" });
    const modRole = await guild.roles.create({ name: "Moderator", color: 0x00CC66, reason: "LFC Auto-Setup" });
    const refRole = await guild.roles.create({ name: "Referee", color: 0xFF4444, reason: "LFC Auto-Setup" });
    const faRole = await guild.roles.create({ name: "Free Agent", color: 0x808080, reason: "LFC Auto-Setup" });

    // 2. Assign Manager & Assistant Manager roles to command user
    await member.roles.add(managerRole, "LFC Auto-Setup");
    await member.roles.add(assistantRole, "LFC Auto-Setup");

    // 3. Create channel categories and channels
    let catInfo: any = null, catLeague: any = null, catMgmt: any = null, catSocial: any = null, catMisc: any = null;
    const createdChannels: string[] = [];
    try {
      catInfo = await guild.channels.create({ name: "📜 INFO", type: 4, reason: "LFC Setup" });
      catLeague = await guild.channels.create({ name: "📊 LEAGUE", type: 4, reason: "LFC Setup" });
      catMgmt = await guild.channels.create({ name: "🔧 MANAGEMENT", type: 4, reason: "LFC Setup" });
      catSocial = await guild.channels.create({ name: "🎬 SOCIAL", type: 4, reason: "LFC Setup" });
      catMisc = await guild.channels.create({ name: "📎 MISC", type: 4, reason: "LFC Setup" });

      const makeChan = async (name: string, cat: any) => {
        const c = await guild.channels.create({ name, type: 0, parent: cat?.id, reason: "LFC Setup" });
        createdChannels.push(c.id);
        if (name === "announcements" || name === "match-announcements") return c;
        return null;
      };

      await makeChan("verify", catInfo);
      await makeChan("rules", catInfo);
      await makeChan("welcome", catInfo);
      const annChan = await makeChan("announcements", catInfo);
      await makeChan("activity-checks", catMgmt);
      await makeChan("demands", catMgmt);
      await makeChan("case-files", catMgmt);
      await makeChan("blacklist", catMgmt);
      await makeChan("awards", catInfo);
      await makeChan("league-media", catSocial);
      await makeChan("interviews", catSocial);
      await makeChan("highlights", catSocial);
      await makeChan("teams-list", catLeague);
      await makeChan("standings", catLeague);
      await makeChan("fixtures", catLeague);
      await makeChan("roster", catLeague);
      await makeChan("results", catLeague);
      await makeChan("stats", catLeague);
      await makeChan("transfer-news", catMgmt);
      await makeChan("free-agents", catMgmt);
      await makeChan("pickups", catMgmt);
      await makeChan("predictions", catSocial);
      await makeChan("tickets", catMisc);
      await makeChan("partnerships", catMisc);
      await makeChan("applications", catMisc);
      await makeChan("match-rules", catInfo);
    } catch (_) {} // channels are best-effort

    // 4. Save GuildConfig — find demands channel by name
    let demandsChanId: string | null = null;
    const demandsChannel = guild.channels.cache.find(
      (c) => c.name === "demands" && c.parent?.name.includes("MANAGEMENT")
    );
    if (demandsChannel) demandsChanId = demandsChannel.id;

    await prisma.guildConfig.upsert({
      where: { guildId: guild.id },
      update: { staffRoleId: managerRole.id, newsChannelId: null, demandsChannelId: demandsChanId },
      create: { guildId: guild.id, staffRoleId: managerRole.id, newsChannelId: null, demandsChannelId: demandsChanId },
    });

    // 4. Create active season if none
    const existing = await prisma.season.findFirst({ where: { isActive: true } });
    if (!existing) {
      await prisma.season.create({
        data: { name: `Season ${new Date().getFullYear()}`, isActive: true, startedAt: new Date() },
      });
    }

    // 4. Re-register all commands globally
    try {
      const token = process.env.DISCORD_TOKEN;
      const clientId = process.env.CLIENT_ID;
      if (token && clientId) {
        const rest = new REST({ version: "10" }).setToken(token);
        const cmds = [...((interaction.client as any).commands?.values() || [])].map((c: any) => c.data.toJSON());
        await rest.put(Routes.applicationCommands(clientId), { body: cmds });
      }
    } catch (_) {}

    const chanCount = createdChannels.length;
    const embed = new EmbedBuilder()
      .setTitle("✅ LFC Bot — Full Auto-Setup Complete!")
      .setColor(0xFFD700)
      .setDescription("Your Legacy Football Championship is fully configured! 🏆")
      .addFields(
        { name: "👑 Roles Created", 
          value: `<@&${managerRole.id}> (You!), <@&${assistantRole.id}>, <@&${modRole.id}>, <@&${refRole.id}>, <@&${faRole.id}>`,
          inline: false },
        { name: "📁 Categories Created", value: "📜 INFO · 📊 LEAGUE · 🔧 MANAGEMENT · 🎬 SOCIAL · 📎 MISC", inline: false },
        { name: "📺 Channels", value: `**${chanCount} channels** created across all categories!`, inline: true },
        { name: "⚙️ Season", value: `Season ${new Date().getFullYear()} active!`, inline: true },
        { name: "📋 Commands Added",
          value: [
            "`/standings` `/fixtures` `/viewschedule`",
            "`/autogenerateschedule` `/team create`",
            "`/offer` `/release` `/promote` `/demote`",
            "`/gametime` `/lfp` `/appoint` `/demand`",
            "`/waitlist` `/purge` `/disband` `/swap-teams`",
            "`/threadcreate` `/add-emojis` `/blacklist-word`",
          ].join("\n"), inline: false },
        { name: "💡 Quick Start",
          value: [
            "1️⃣ `/admin setup` → done!",
            "2️⃣ `/team create name:\"Team\" emoji:⚽` → add teams",
            "3️⃣ Players run `/offer @user position:FWD` → sign up",
            "4️⃣ `/autogenerateschedule weeks:10` → season ready!",
            "5️⃣ `/match start` → play!"
          ].join("\n"), inline: false }
      );
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("[Setup Error]", error);
    await interaction.editReply({ embeds: [createErrorEmbed("❌ Setup Failed", `Error: \`${error}\`\n\nMake sure the bot has **Manage Roles** permission.`)] });
  }
}

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