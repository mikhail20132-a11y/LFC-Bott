import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { prisma } from "../../database/prisma.js";
import { createErrorEmbed, BRAND } from "../../utils/helpers.js";
import type { Command } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("autosetup")
    .setDescription("Auto-detect roles and channels by scanning your server")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const guild = interaction.guild;
    if (!guild) {
      await interaction.editReply({
        embeds: [createErrorEmbed("❌ Error", "This command must be used in a server.")],
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("🔄 Auto-Setup Scanning...")
      .setColor(BRAND.colors.warning)
      .setDescription("Scanning your server for roles and channels by name keywords...\n\nThis won't create anything — it just detects what's already here.")
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    const config: Record<string, any> = { guildId: guild.id };
    const findings: string[] = [];

    // ── Role Detection ──
    const roleDetectMap: Record<string, { keywords: string[]; label: string }> = {
      managerRoleId: { keywords: ["manager", "gm", "general manager"], label: "Manager" },
      assistantManagerRoleId: { keywords: ["assistant manager", "asst manager", "assistant gm", "assisstant"], label: "Assistant Manager" },
      moderatorRoleId: { keywords: ["moderator", "mod", "staff"], label: "Moderator" },
      refereeRoleId: { keywords: ["referee", "match official", "ref"], label: "Referee" },
    };

    for (const [configKey, info] of Object.entries(roleDetectMap)) {
      for (const keyword of info.keywords) {
        const role = guild.roles.cache.find((r: any) =>
          r.name.toLowerCase().includes(keyword)
        );
        if (role) {
          config[configKey] = role.id;
          findings.push(`✅ **${info.label}** → <@&${role.id}> (matched "${role.name}")`);
          break;
        }
      }
      if (!config[configKey]) {
        findings.push(`❌ **${info.label}** → Not found (searched: ${info.keywords.join(", ")})`);
      }
    }

    // Set legacy staffRoleId from manager
    if (config.managerRoleId) {
      config.staffRoleId = config.managerRoleId;
    }

    // ── Channel Detection ──
    const channelDetectMap: Record<string, { keywords: string[]; label: string }> = {
      newsChannelId: { keywords: ["announcement", "news", "broadcast"], label: "News Channel" },
      demandsChannelId: { keywords: ["demand", "transfer"], label: "Demands Channel" },
      appointmentsChannelId: { keywords: ["appointment", "staff", "management"], label: "Appointments Channel" },
      signingsChannelId: { keywords: ["signing", "transfer", "offer", "contract"], label: "Signings Channel" },
    };

    const textChannels = guild.channels.cache.filter((c: any) => c.isTextBased());
    for (const [configKey, info] of Object.entries(channelDetectMap)) {
      for (const keyword of info.keywords) {
        const channel = textChannels.find(
          (c: any) => c.name.toLowerCase().includes(keyword) && !config[configKey]
        );
        if (channel) {
          config[configKey] = channel.id;
          findings.push(`✅ **${info.label}** → <#${channel.id}> (matched "#${channel.name}")`);
          break;
        }
      }
      if (!config[configKey]) {
        findings.push(`❌ **${info.label}** → Not found (searched: ${info.keywords.join(", ")})`);
      }
    }

    // ── Save ──
    await prisma.guildConfig.upsert({
      where: { guildId: guild.id },
      update: config,
      create: config,
    });

    // ── Count results ──
    const foundRoles = [config.managerRoleId, config.assistantManagerRoleId, config.moderatorRoleId, config.refereeRoleId].filter(Boolean).length;
    const foundChannels = [config.newsChannelId, config.demandsChannelId, config.appointmentsChannelId, config.signingsChannelId].filter(Boolean).length;

    // ── Result embed ──
    const resultEmbed = new EmbedBuilder()
      .setTitle("✅ Auto-Setup Complete!")
      .setColor(BRAND.colors.success)
      .setDescription([
        `**Detected:** ${foundRoles} roles · ${foundChannels} channels`,
        "",
        ...findings.map(f => f),
      ].join("\n"))
      .setFooter({ text: `Use /setup to manually adjust any settings` })
      .setTimestamp();

    // ── Summary stats ──
    resultEmbed.addFields(
      { name: "📊 Summary", value: [
        `👑 Manager: ${config.managerRoleId ? "<@&" + config.managerRoleId + ">" : "❌"}`,
        `🤝 Asst Manager: ${config.assistantManagerRoleId ? "<@&" + config.assistantManagerRoleId + ">" : "❌"}`,
        `🛡️ Moderator: ${config.moderatorRoleId ? "<@&" + config.moderatorRoleId + ">" : "❌"}`,
        `⚖️ Referee: ${config.refereeRoleId ? "<@&" + config.refereeRoleId + ">" : "❌"}`,
      ].join("\n"), inline: true },
      { name: "📺 Channels", value: [
        `📢 News: ${config.newsChannelId ? "<#" + config.newsChannelId + ">" : "❌"}`,
        `📢 Demands: ${config.demandsChannelId ? "<#" + config.demandsChannelId + ">" : "❌"}`,
        `📅 Appointments: ${config.appointmentsChannelId ? "<#" + config.appointmentsChannelId + ">" : "❌"}`,
        `✍️ Signings: ${config.signingsChannelId ? "<#" + config.signingsChannelId + ">" : "❌"}`,
      ].join("\n"), inline: true },
    );

    await interaction.editReply({ embeds: [resultEmbed] });
  },
};

export default command;