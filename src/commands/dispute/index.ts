import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
  ChannelType,
} from "discord.js";
import { prisma } from "../../database/prisma.js";
import { createErrorEmbed } from "../../utils/helpers.js";
import type { Command } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("dispute")
    .setDescription("Open a dispute ticket for admin review of a match incident")
    .addStringOption((o) => o.setName("match_id").setDescription("Match ID").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("What are you disputing?").setRequired(true))
    .addStringOption((o) => o.setName("evidence").setDescription("Link to clip/screenshot evidence").setRequired(false)),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply({ ephemeral: true });

    const matchId = interaction.options.getString("match_id", true);
    const reason = interaction.options.getString("reason", true);
    const evidence = interaction.options.getString("evidence");

    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: { homeTeam: true, awayTeam: true },
    });
    if (!match) {
      await interaction.editReply({ content: "❌ Match not found." });
      return;
    }

    // Create dispute in DB
    const dispute = await prisma.dispute.create({
      data: {
        matchId,
        reporterId: interaction.user.id,
        reason,
        evidenceUrl: evidence ?? null,
        status: "Open",
      },
    });

    // Try to create a private thread
    let threadInfo = "";
    if (interaction.channel && interaction.channel.type === ChannelType.GuildText) {
      try {
        const thread = await interaction.channel.threads.create({
          name: `🚩 Dispute: ${match.homeTeam.name} vs ${match.awayTeam.name}`,
          reason: `Dispute ticket #${dispute.id.slice(0, 6)}`,
          type: ChannelType.PrivateThread,
        });
        await thread.send({
          content: `🚩 **New Dispute Opened**\n👤 **Reporter:** <@${interaction.user.id}>\n⚽ **Match:** ${match.homeTeam.name} vs ${match.awayTeam.name}\n📝 **Reason:** ${reason}${evidence ? `\n🔗 **Evidence:** ${evidence}` : ""}\n\n🛠️ **Admins:** Please review and use \`/resolve\` when done.`,
        });
        await prisma.dispute.update({
          where: { id: dispute.id },
          data: { ticketChannelId: thread.id },
        });
        threadInfo = `📝 Ticket created: ${thread}`;
      } catch {
        threadInfo = "⚠️ Could not create ticket thread.";
      }
    }

    const embed = new EmbedBuilder()
      .setTitle("🚩 Dispute Filed")
      .setColor("#FF6600")
      .setDescription(`Your dispute for **${match.homeTeam.name} vs ${match.awayTeam.name}** has been submitted.`)
      .addFields(
        { name: "📝 Reason", value: reason, inline: false },
        { name: "🔢 Dispute ID", value: dispute.id.slice(0, 8), inline: true },
        { name: "📋 Status", value: "🟡 Under Review", inline: true },
      );
    if (threadInfo) embed.addFields({ name: "📎 Thread", value: threadInfo, inline: false });

    embed.setFooter({ text: "Legacy Football Championship • Disputes" }).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  },
};
export default command;