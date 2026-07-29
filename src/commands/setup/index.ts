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
} from "discord.js";
import { prisma } from "../../database/prisma.js";
import { createErrorEmbed, BRAND } from "../../utils/helpers.js";
import type { Command } from "../../types/index.js";

// ─── In-memory panel state ──────────────────────────────────────────────
const panelState = new Map<string, string>();

// ─── Channel options ────────────────────────────────────────────────────
const CHANNEL_KEYS = [
  { key: "newsChannelId", label: "📢 News & Announcements", desc: "Match results, transfers, promotions" },
  { key: "demandsChannelId", label: "📢 Transfer Demands", desc: "Players requesting release" },
  { key: "appointmentsChannelId", label: "📅 Appointments", desc: "Staff role assignments" },
  { key: "signingsChannelId", label: "✍️ Signings", desc: "New contract signings" },
];

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

// ─── MAIN PANEL ─────────────────────────────────────────────────────────
async function showMainPanel(interaction: ChatInputCommandInteraction) {
  const config = await prisma.guildConfig.findUnique({ where: { guildId: interaction.guildId! } });

  let status = "⚠️ Not configured yet!";
  if (config) {
    const items: string[] = [];
    if (config.newsChannelId) items.push(`📢 News: <#${config.newsChannelId}>`);
    if (config.demandsChannelId) items.push(`📢 Demands: <#${config.demandsChannelId}>`);
    if (config.appointmentsChannelId) items.push(`📅 Appointments: <#${config.appointmentsChannelId}>`);
    if (config.signingsChannelId) items.push(`✍️ Signings: <#${config.signingsChannelId}>`);
    items.push(`👥 Roster Cap: **${config.rosterCap}**`);
    items.push(`✍️ Signings: ${config.signingsEnabled ? "✅ On" : "❌ Off"} (${config.signingChoice})`);
    status = items.join("\n");
  }

  const embed = new EmbedBuilder()
    .setTitle("⚙️ Setup Panel")
    .setColor(BRAND.colors.primary)
    .setDescription("Configure your LFC server settings\n\n**Current Config:**\n" + status)
    .setFooter({ text: BRAND.footer })
    .setTimestamp();

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("sp_channels").setLabel("📺 Channels").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("sp_settings").setLabel("⚙️ Settings").setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("sp_autosetup").setLabel("🔄 Auto Setup").setStyle(ButtonStyle.Success),
  );

  await interaction.editReply({ embeds: [embed], components: [row1, row2] });
}

// ─── CHANNELS PANEL ─────────────────────────────────────────────────────
async function showChannelsPanel(interaction: ChatInputCommandInteraction) {
  const config = await prisma.guildConfig.findUnique({ where: { guildId: interaction.guildId! } });

  const embed = new EmbedBuilder()
    .setTitle("📺 Channel Setup")
    .setColor(BRAND.colors.primary)
    .setDescription("Click a button to set which channel receives each type of notification")
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

  await interaction.editReply({ embeds: [embed], components: [row, nav] });
}

// ─── SETTINGS PANEL ─────────────────────────────────────────────────────
async function showSettingsPanel(interaction: ChatInputCommandInteraction) {
  const config = await prisma.guildConfig.findUnique({ where: { guildId: interaction.guildId! } });
  const rosterCap = config?.rosterCap ?? 30;
  const signingsOn = config?.signingsEnabled ?? true;
  const choice = config?.signingChoice ?? "offer";

  const embed = new EmbedBuilder()
    .setTitle("⚙️ Server Settings")
    .setColor(BRAND.colors.warning)
    .setDescription([
      `**Roster Cap:** ${rosterCap} players`,
      `**Signings:** ${signingsOn ? "✅ Enabled" : "❌ Disabled"}`,
      `**Signing Method:** ${choice === "offer" ? "📩 Offer (player accepts in DM)" : "✍️ Sign (instant)"}`,
    ].join("\n"))
    .setFooter({ text: BRAND.footer })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("sp_roster_up").setLabel("➕ Roster +5").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("sp_roster_down").setLabel("➖ Roster -5").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("sp_toggle_signings").setLabel(signingsOn ? "❌ Disable Signings" : "✅ Enable Signings").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("sp_toggle_choice").setLabel(`Method: ${choice}`).setStyle(ButtonStyle.Secondary),
  );

  const nav = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("sp_main").setLabel("← Main Page").setStyle(ButtonStyle.Primary),
  );

  await interaction.editReply({ embeds: [embed], components: [row, nav] });
}

// ─── BUTTON HANDLER ─────────────────────────────────────────────────────
export async function handleSetupButton(interaction: any) {
  if (!interaction.isButton()) return;
  const id = interaction.customId;

  if (id === "sp_main") return showMainPanel(interaction);
  if (id === "sp_channels") return showChannelsPanel(interaction);
  if (id === "sp_settings") return showSettingsPanel(interaction);

  // Settings buttons
  if (id === "sp_roster_up" || id === "sp_roster_down") {
    const delta = id === "sp_roster_up" ? 5 : -5;
    const config = await prisma.guildConfig.findUnique({ where: { guildId: interaction.guildId! } });
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
    const config = await prisma.guildConfig.findUnique({ where: { guildId: interaction.guildId! } });
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
    const config = await prisma.guildConfig.findUnique({ where: { guildId: interaction.guildId! } });
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

// ─── SELECT MENU HANDLER ────────────────────────────────────────────────
export async function handleSetupSelect(interaction: any) {
  if (!interaction.isStringSelectMenu()) return;
  if (interaction.customId !== "sp_channel_select") return;

  const selectedKey = interaction.values[0];
  // Store what they're setting, prompt them to use the channel select menu
  panelState.set(interaction.user.id, `ch_${selectedKey}`);

  const chInfo = CHANNEL_KEYS.find(c => c.key === selectedKey);
  const embed = new EmbedBuilder()
    .setTitle(`📺 Set ${chInfo?.label || selectedKey}`)
    .setColor(BRAND.colors.primary)
    .setDescription(`Select the channel below\n\n**Purpose:** ${chInfo?.desc || "Notification channel"}`)
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
}

// ─── CHANNEL SELECT HANDLER ─────────────────────────────────────────────
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
  await showChannelsPanel(interaction);
}

// ─── AUTO SETUP ─────────────────────────────────────────────────────────
async function runAutoSetup(interaction: any) {
  const guild = interaction.guild;
  if (!guild) return;

  const embed = new EmbedBuilder()
    .setTitle("🔄 Auto Setup Running...")
    .setColor(BRAND.colors.warning)
    .setDescription("Scanning server for roles and channels...")
    .setTimestamp();

  await interaction.editReply({ embeds: [embed], components: [] });

  const config: any = { guildId: guild.id };

  // Detect roles
  const roleMap: Record<string, string> = {
    "manager": "Manager",
    "assistant manager": "Assistant Manager",
    "assistant": "Assistant Manager",
    "moderator": "Moderator",
    "mod": "Moderator",
    "referee": "Referee",
    "ref": "Referee",
  };

  for (const [keyword, roleName] of Object.entries(roleMap)) {
    const role = guild.roles.cache.find(r => r.name.toLowerCase().includes(keyword));
    if (role) {
      if (roleName === "Manager") config.staffRoleId = role.id;
      console.log(`[AutoSetup] Found role: ${role.name} → ${roleName}`);
    }
  }

  // Detect channels by name keywords
  const channelKeywords: Record<string, string[]> = {
    newsChannelId: ["announcement", "news", "broadcast"],
    demandsChannelId: ["demand", "transfer"],
    appointmentsChannelId: ["appointment", "staff", "management"],
    signingsChannelId: ["signing", "transfer", "offer"],
  };

  const channels = guild.channels.cache.filter(c => c.isTextBased());
  for (const [configKey, keywords] of Object.entries(channelKeywords)) {
    for (const keyword of keywords) {
      const channel = channels.find(c =>
        c.name.toLowerCase().includes(keyword) && !config[configKey]
      );
      if (channel) {
        config[configKey] = channel.id;
        break;
      }
    }
  }

  // Save
  await prisma.guildConfig.upsert({
    where: { guildId: guild.id },
    update: config,
    create: config,
  });

  const successEmbed = new EmbedBuilder()
    .setTitle("✅ Auto Setup Complete")
    .setColor(BRAND.colors.success)
    .setDescription([
      config.newsChannelId ? `📢 News: <#${config.newsChannelId}>` : "📢 News: ❌ Not found",
      config.demandsChannelId ? `📢 Demands: <#${config.demandsChannelId}>` : "📢 Demands: ❌ Not found",
      config.appointmentsChannelId ? `📅 Appointments: <#${config.appointmentsChannelId}>` : "📅 Appointments: ❌ Not found",
      config.signingsChannelId ? `✍️ Signings: <#${config.signingsChannelId}>` : "✍️ Signings: ❌ Not found",
      config.staffRoleId ? `🎭 Staff Role: <@&${config.staffRoleId}>` : "🎭 Staff Role: ❌ Not found",
      `👥 Roster Cap: **${config.rosterCap || 30}**`,
      `✍️ Signings: ✅ On (offer)`,
    ].join("\n"))
    .setFooter({ text: BRAND.footer })
    .setTimestamp();

  const nav = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("sp_main").setLabel("← Back to Panel").setStyle(ButtonStyle.Primary),
  );

  await interaction.editReply({ embeds: [successEmbed], components: [nav] });
}

export default command;