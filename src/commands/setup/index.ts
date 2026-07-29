import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  PermissionFlagsBits,
  Guild,
} from "discord.js";
import { prisma } from "../../database/prisma.js";
import { createErrorEmbed, BRAND } from "../../utils/helpers.js";
import type { Command } from "../../types/index.js";

// ─── In-memory panel navigation state ──────────────────────────────
const panelState = new Map<string, string>();

// ─── Channel config entries ─────────────────────────────────────────
const CHANNEL_KEYS = [
  { key: "newsChannelId", label: "📢 News & Announcements", desc: "Match results, transfers, promotions" },
  { key: "demandsChannelId", label: "📢 Transfer Demands", desc: "Players requesting release" },
  { key: "appointmentsChannelId", label: "📅 Appointments", desc: "Staff role assignments" },
  { key: "signingsChannelId", label: "✍️ Signings", desc: "New contract signings" },
];

// ─── Role config entries ───────────────────────────────────────────
const ROLE_KEYS = [
  { key: "managerRoleId", label: "👑 Manager", desc: "Team managers / GMs" },
  { key: "assistantManagerRoleId", label: "🤝 Assistant Manager", desc: "Assistant managers" },
  { key: "moderatorRoleId", label: "🛡️ Moderator", desc: "Server moderators / staff" },
  { key: "refereeRoleId", label: "⚖️ Referee", desc: "Match officials" },
];

// ─── Command Definition ─────────────────────────────────────────────

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Open the interactive setup panel to configure channels, roles, and settings")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    panelState.set(interaction.user.id, "main");
    await showMainPanel(interaction);
  },
};

// ─── HELPERS ─────────────────────────────────────────────────────────

async function getConfig(interaction: { guildId: string | null }) {
  return prisma.guildConfig.findUnique({ where: { guildId: interaction.guildId! } });
}

// ─── MAIN PANEL ─────────────────────────────────────────────────────

export async function showMainPanel(interaction: any) {
  const config = await prisma.guildConfig.findUnique({ where: { guildId: interaction.guildId! } });

  let status: string[] = [];
  if (config) {
    if (config.newsChannelId) status.push(`📢 News: <#${config.newsChannelId}>`);
    if (config.demandsChannelId) status.push(`📢 Demands: <#${config.demandsChannelId}>`);
    if (config.appointmentsChannelId) status.push(`📅 Appointments: <#${config.appointmentsChannelId}>`);
    if (config.signingsChannelId) status.push(`✍️ Signings: <#${config.signingsChannelId}>`);
    if (config.managerRoleId) status.push(`👑 Manager: <@&${config.managerRoleId}>`);
    if (config.assistantManagerRoleId) status.push(`🤝 Asst Manager: <@&${config.assistantManagerRoleId}>`);
    if (config.moderatorRoleId) status.push(`🛡️ Moderator: <@&${config.moderatorRoleId}>`);
    if (config.refereeRoleId) status.push(`⚖️ Referee: <@&${config.refereeRoleId}>`);
    status.push(`👥 Roster Cap: **${config.rosterCap}**`);
    status.push(`✍️ Signings: ${config.signingsEnabled ? "✅ On" : "❌ Off"} (${config.signingChoice === "offer" ? "📩 Offer" : "✍️ Sign"})`);
  }

  const embed = new EmbedBuilder()
    .setTitle("⚙️ LFC Setup Panel")
    .setColor(BRAND.colors.primary)
    .setDescription(
      "Configure your Legacy Football Championship server below.\n\n" +
      (status.length > 0
        ? `**Current Configuration:**\n${status.join("\n")}`
        : "*No configuration yet — use the buttons below to start!*")
    )
    .setFooter({ text: BRAND.footer })
    .setTimestamp();

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("sp_channels").setLabel("📺 Channels").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("sp_roles").setLabel("🎭 Roles").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("sp_settings").setLabel("⚙️ Settings").setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("sp_autosetup").setLabel("🔄 Auto Setup").setStyle(ButtonStyle.Success),
  );

  if (interaction.isButton()) {
    await interaction.update({ embeds: [embed], components: [row1, row2] });
  } else {
    await interaction.editReply({ embeds: [embed], components: [row1, row2] });
  }
}

// ─── CHANNELS PANEL ────────────────────────────────────────────────

async function showChannelsPanel(interaction: any) {
  const config = await getConfig(interaction);

  const embed = new EmbedBuilder()
    .setTitle("📺 Channel Setup")
    .setColor(BRAND.colors.primary)
    .setDescription("Select a channel type below, then pick the channel from the dropdown.")
    .setFooter({ text: BRAND.footer })
    .setTimestamp();

  for (const ch of CHANNEL_KEYS) {
    const current = config ? (config as any)[ch.key] : null;
    embed.addFields({
      name: ch.label,
      value: current ? `<#${current}>` : "❌ Not set",
      inline: false,
    });
  }

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("sp_channel_select")
      .setPlaceholder("Choose a channel type to set...")
      .addOptions(
        CHANNEL_KEYS.map(ch => new StringSelectMenuOptionBuilder()
          .setLabel(ch.label)
          .setDescription(ch.desc)
          .setValue(ch.key)
        )
      )
  );

  const nav = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("sp_main").setLabel("← Main Page").setStyle(ButtonStyle.Primary),
  );

  await interaction.update({ embeds: [embed], components: [row, nav] });
}

// ─── ROLES PANEL ──────────────────────────────────────────────────

async function showRolesPanel(interaction: any) {
  const config = await getConfig(interaction);

  const embed = new EmbedBuilder()
    .setTitle("🎭 Role Setup")
    .setColor(BRAND.colors.primary)
    .setDescription("Map Discord roles to LFC bot permissions. Select a role type below, then pick a Discord role from the dropdown.")
    .setFooter({ text: BRAND.footer })
    .setTimestamp();

  for (const r of ROLE_KEYS) {
    const current = config ? (config as any)[r.key] : null;
    embed.addFields({
      name: r.label,
      value: current ? `<@&${current}>` : "❌ Not set",
      inline: false,
    });
  }

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("sp_role_select")
      .setPlaceholder("Choose a role type to set...")
      .addOptions(
        ROLE_KEYS.map(r => new StringSelectMenuOptionBuilder()
          .setLabel(r.label)
          .setDescription(r.desc)
          .setValue(r.key)
        )
      )
  );

  const nav = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("sp_main").setLabel("← Main Page").setStyle(ButtonStyle.Primary),
  );

  await interaction.update({ embeds: [embed], components: [row, nav] });
}

// ─── SETTINGS PANEL ───────────────────────────────────────────────

async function showSettingsPanel(interaction: any) {
  const config = await getConfig(interaction);
  const rosterCap = config?.rosterCap ?? 30;
  const signingsOn = config?.signingsEnabled ?? true;
  const choice = config?.signingChoice ?? "offer";

  const embed = new EmbedBuilder()
    .setTitle("⚙️ Server Settings")
    .setColor(BRAND.colors.warning)
    .setDescription([
      `**📋 Roster Cap:** ${rosterCap} players`,
      `**✍️ Signings:** ${signingsOn ? "✅ Enabled" : "❌ Disabled"}`,
      `**📩 Method:** ${choice === "offer" ? "Offer (DM accept)" : "Sign (instant)"}`,
    ].join("\n"))
    .setFooter({ text: BRAND.footer })
    .setTimestamp();

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("sp_roster_up").setLabel("➕ Roster +5").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("sp_roster_down").setLabel("➖ Roster -5").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("sp_toggle_signings").setLabel(signingsOn ? "❌ Disable Signings" : "✅ Enable Signings").setStyle(signingsOn ? ButtonStyle.Danger : ButtonStyle.Success),
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("sp_toggle_choice").setLabel(`Method: ${choice === "offer" ? "📩 Offer" : "✍️ Sign"}`).setStyle(ButtonStyle.Secondary),
  );

  const nav = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("sp_main").setLabel("← Main Page").setStyle(ButtonStyle.Primary),
  );

  await interaction.update({ embeds: [embed], components: [row1, row2, nav] });
}

// ─── BUTTON HANDLER ────────────────────────────────────────────────

export async function handleSetupButton(interaction: any) {
  if (!interaction.isButton()) return;
  const id = interaction.customId;

  // Navigation
  if (id === "sp_main") return showMainPanel(interaction);
  if (id === "sp_channels") return showChannelsPanel(interaction);
  if (id === "sp_roles") return showRolesPanel(interaction);
  if (id === "sp_settings") return showSettingsPanel(interaction);

  // Settings buttons
  if (id === "sp_roster_up" || id === "sp_roster_down") {
    const delta = id === "sp_roster_up" ? 5 : -5;
    const config = await getConfig(interaction);
    const current = config?.rosterCap ?? 30;
    const next = Math.max(5, Math.min(100, current + delta));
    await prisma.guildConfig.upsert({
      where: { guildId: interaction.guildId! },
      update: { rosterCap: next },
      create: { guildId: interaction.guildId!, rosterCap: next },
    });
    await interaction.deferUpdate();
    return showSettingsPanel(interaction);
  }

  if (id === "sp_toggle_signings") {
    const config = await getConfig(interaction);
    const next = !(config?.signingsEnabled ?? true);
    await prisma.guildConfig.upsert({
      where: { guildId: interaction.guildId! },
      update: { signingsEnabled: next },
      create: { guildId: interaction.guildId!, signingsEnabled: next },
    });
    await interaction.deferUpdate();
    return showSettingsPanel(interaction);
  }

  if (id === "sp_toggle_choice") {
    const config = await getConfig(interaction);
    const next = config?.signingChoice === "offer" ? "sign" : "offer";
    await prisma.guildConfig.upsert({
      where: { guildId: interaction.guildId! },
      update: { signingChoice: next },
      create: { guildId: interaction.guildId!, signingChoice: next },
    });
    await interaction.deferUpdate();
    return showSettingsPanel(interaction);
  }

  if (id === "sp_autosetup") {
    await interaction.deferUpdate();
    return runAutoSetup(interaction);
  }
}

// ─── STRING SELECT MENU HANDLER ────────────────────────────────────

export async function handleSetupSelect(interaction: any) {
  if (!interaction.isStringSelectMenu()) return;

  // Channel type selection
  if (interaction.customId === "sp_channel_select") {
    const selectedKey = interaction.values[0];
    panelState.set(interaction.user.id, `ch_${selectedKey}`);

    const chInfo = CHANNEL_KEYS.find(c => c.key === selectedKey);
    const embed = new EmbedBuilder()
      .setTitle(`📺 Set ${chInfo?.label || selectedKey}`)
      .setColor(BRAND.colors.primary)
      .setDescription(`**Purpose:** ${chInfo?.desc || "Notification channel"}\n\nSelect a text channel from the dropdown below.`)
      .setFooter({ text: BRAND.footer })
      .setTimestamp();

    const row = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(`sp_setchannel:${selectedKey}`)
        .setPlaceholder("Select a text channel...")
        .setChannelTypes(ChannelType.GuildText)
    );

    const nav = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("sp_channels").setLabel("← Back to Channels").setStyle(ButtonStyle.Primary),
    );

    await interaction.update({ embeds: [embed], components: [row, nav] });
    return;
  }

  // Role type selection
  if (interaction.customId === "sp_role_select") {
    const selectedKey = interaction.values[0];
    panelState.set(interaction.user.id, `role_${selectedKey}`);

    const roleInfo = ROLE_KEYS.find(r => r.key === selectedKey);
    const embed = new EmbedBuilder()
      .setTitle(`🎭 Set ${roleInfo?.label || selectedKey}`)
      .setColor(BRAND.colors.primary)
      .setDescription(`**Purpose:** ${roleInfo?.desc || "LFC role"}\n\nSelect a Discord role from the dropdown below.`)
      .setFooter({ text: BRAND.footer })
      .setTimestamp();

    // Build a role select menu populated from the guild
    const guild = interaction.guild;
    const roleOptions = guild?.roles.cache
      .filter((r: any) => r.name !== "@everyone")
      .sort((a: any, b: any) => b.position - a.position)
      .first(25)
      .map((role: any) => new StringSelectMenuOptionBuilder()
        .setLabel(role.name.length > 95 ? role.name.slice(0, 93) + "…" : role.name)
        .setValue(role.id)
        .setDescription(`ID: ${role.id.slice(0, 8)}…`)
      ) ?? [];

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`sp_setrole:${selectedKey}`)
        .setPlaceholder("Select a Discord role...")
        .addOptions(roleOptions.length > 0 ? roleOptions : [
          new StringSelectMenuOptionBuilder().setLabel("No roles found").setValue("none")
        ])
    );

    const nav = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("sp_roles").setLabel("← Back to Roles").setStyle(ButtonStyle.Primary),
    );

    await interaction.update({ embeds: [embed], components: [row, nav] });
    return;
  }

  // Role selection (when user picks a specific role)
  if (interaction.customId.startsWith("sp_setrole:")) {
    const key = interaction.customId.split(":")[1];
    const roleId = interaction.values[0];
    if (roleId === "none") return;

    await prisma.guildConfig.upsert({
      where: { guildId: interaction.guildId! },
      update: { [key]: roleId },
      create: { guildId: interaction.guildId!, [key]: roleId },
    });

    await interaction.deferUpdate();
    return showRolesPanel(interaction);
  }
}

// ─── CHANNEL SELECT HANDLER ────────────────────────────────────────

export async function handleSetupChannelSelect(interaction: any) {
  if (!interaction.isChannelSelectMenu()) return;
  if (!interaction.customId.startsWith("sp_setchannel:")) return;

  const key = interaction.customId.split(":")[1];
  const channel = interaction.channels.first();
  if (!channel) return;

  await prisma.guildConfig.upsert({
    where: { guildId: interaction.guildId! },
    update: { [key]: channel.id },
    create: { guildId: interaction.guildId!, [key]: channel.id },
  });

  await interaction.deferUpdate();
  return showChannelsPanel(interaction);
}

// ─── AUTO SETUP ────────────────────────────────────────────────────

async function runAutoSetup(interaction: any) {
  const guild = interaction.guild;
  if (!guild) return;

  const progressEmbed = new EmbedBuilder()
    .setTitle("🔄 Auto Setup Running...")
    .setColor(BRAND.colors.warning)
    .setDescription("Scanning server for roles and channels...")
    .setTimestamp();

  await interaction.editReply({ embeds: [progressEmbed], components: [] });

  const config: Record<string, any> = { guildId: guild.id };

  // ── Detect roles by name keywords ──
  const roleDetectMap: Record<string, string[]> = {
    managerRoleId: ["manager", "gm", "general manager"],
    assistantManagerRoleId: ["assistant manager", "asst manager", "assistant gm"],
    moderatorRoleId: ["moderator", "mod", "staff"],
    refereeRoleId: ["referee", "match official", "ref"],
  };

  for (const [configKey, keywords] of Object.entries(roleDetectMap)) {
    for (const keyword of keywords) {
      const role = guild.roles.cache.find((r: any) =>
        r.name.toLowerCase().includes(keyword)
      );
      if (role) {
        config[configKey] = role.id;
        break;
      }
    }
  }

  // Also set legacy staffRoleId from manager
  if (config.managerRoleId) {
    config.staffRoleId = config.managerRoleId;
  }

  // ── Detect channels by name keywords ──
  const channelDetectMap: Record<string, string[]> = {
    newsChannelId: ["announcement", "news", "broadcast"],
    demandsChannelId: ["demand", "transfer"],
    appointmentsChannelId: ["appointment", "staff", "management"],
    signingsChannelId: ["signing", "transfer", "offer", "contract"],
  };

  const textChannels = guild.channels.cache.filter((c: any) => c.isTextBased());
  for (const [configKey, keywords] of Object.entries(channelDetectMap)) {
    for (const keyword of keywords) {
      const channel = textChannels.find(
        (c: any) => c.name.toLowerCase().includes(keyword) && !config[configKey]
      );
      if (channel) {
        config[configKey] = channel.id;
        break;
      }
    }
  }

  // ── Save to database ──
  await prisma.guildConfig.upsert({
    where: { guildId: guild.id },
    update: config,
    create: config,
  });

  // ── Build result embed ──
  const results: string[] = [];
  results.push(config.newsChannelId ? `📢 News: <#${config.newsChannelId}>` : "📢 News: ❌ Not found");
  results.push(config.demandsChannelId ? `📢 Demands: <#${config.demandsChannelId}>` : "📢 Demands: ❌ Not found");
  results.push(config.appointmentsChannelId ? `📅 Appointments: <#${config.appointmentsChannelId}>` : "📅 Appointments: ❌ Not found");
  results.push(config.signingsChannelId ? `✍️ Signings: <#${config.signingsChannelId}>` : "✍️ Signings: ❌ Not found");
  results.push("");
  results.push(config.managerRoleId ? `👑 Manager: <@&${config.managerRoleId}>` : "👑 Manager: ❌ Not found");
  results.push(config.assistantManagerRoleId ? `🤝 Asst Manager: <@&${config.assistantManagerRoleId}>` : "🤝 Asst Manager: ❌ Not found");
  results.push(config.moderatorRoleId ? `🛡️ Moderator: <@&${config.moderatorRoleId}>` : "🛡️ Moderator: ❌ Not found");
  results.push(config.refereeRoleId ? `⚖️ Referee: <@&${config.refereeRoleId}>` : "⚖️ Referee: ❌ Not found");
  results.push("");
  results.push(`👥 Roster Cap: **${config.rosterCap || 30}** (default)`);
  results.push(`✍️ Signings: ✅ On (offer)`);

  const successEmbed = new EmbedBuilder()
    .setTitle("✅ Auto Setup Complete!")
    .setColor(BRAND.colors.success)
    .setDescription(results.join("\n"))
    .setFooter({ text: BRAND.footer })
    .setTimestamp();

  const nav = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("sp_main").setLabel("← Back to Panel").setStyle(ButtonStyle.Primary),
  );

  await interaction.editReply({ embeds: [successEmbed], components: [nav] });
}

export default command;