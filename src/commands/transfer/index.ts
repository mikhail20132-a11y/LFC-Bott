import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { prisma } from "../../database/prisma.js";
import { playerService } from "../../services/playerService.js";
import { teamService } from "../../services/teamService.js";
import { newsService } from "../../services/newsService.js";
import { hasRole, RoleType } from "../../utils/permissions.js";
import { createErrorEmbed } from "../../utils/helpers.js";
import type { Command, ExtendedClient } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("transfer")
    .setDescription("Transfer commands — create, complete, and list")
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("Create a transfer request (Manager/Assistant Manager only)")
        .addUserOption((opt) =>
          opt
            .setName("player")
            .setDescription("Player to transfer")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("to_team")
            .setDescription("Destination team")
            .setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("fee")
            .setDescription("Transfer fee (in millions)")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("complete")
        .setDescription("Complete a pending transfer")
        .addStringOption((opt) =>
          opt
            .setName("transfer_id")
            .setDescription("Transfer ID to complete")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("View recent completed transfers")
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case "create":
        return handleCreate(interaction);
      case "complete":
        return handleComplete(interaction);
      case "list":
        return handleList(interaction);
      default:
        await interaction.reply({ content: "❌ Unknown subcommand.", ephemeral: true });
    }
  },
};

async function handleCreate(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const member = interaction.member;
  if (
    !hasRole(member as never, RoleType.Manager) &&
    !hasRole(member as never, RoleType.AssistantManager)
  ) {
    await interaction.editReply({
      embeds: [
        createErrorEmbed(
          "❌ Insufficient Permissions",
          "Only **Manager** or **Assistant Manager** can create transfers."
        ),
      ],
    });
    return;
  }

  const targetUser = interaction.options.getUser("player", true);
  const toTeamName = interaction.options.getString("to_team", true);
  const fee = interaction.options.getInteger("fee");

  try {
    const player = await playerService.getPlayer(targetUser.id);
    if (!player) {
      await interaction.editReply({
        embeds: [createErrorEmbed("❌ Player Not Found", `${targetUser.username} is not registered.`)],
      });
      return;
    }

    const toTeam = await teamService.getTeamByName(toTeamName);
    if (!toTeam) {
      await interaction.editReply({
        embeds: [createErrorEmbed("❌ Team Not Found", `Team **${toTeamName}** not found.`)],
      });
      return;
    }

    const transfer = await prisma.transfer.create({
      data: {
        playerId: player.id,
        fromTeamId: player.teamId,
        fromTeamName: player.team?.name ?? "Free Agent",
        toTeamId: toTeam.id,
        toTeamName: toTeam.name,
        fee,
        status: "Pending",
      },
    });

    const embed = new EmbedBuilder()
      .setTitle("🔄 Transfer Request Created")
      .setColor("#FFAA00")
      .addFields(
        { name: "👤 Player", value: `<@${targetUser.id}>`, inline: true },
        { name: "➡️ Destination", value: toTeam.name, inline: true },
        { name: "💰 Fee", value: fee ? `$${fee}M` : "Free Transfer", inline: true },
        { name: "📋 Status", value: "⏳ Pending", inline: true },
        { name: "🔢 Transfer ID", value: transfer.id.slice(0, 8), inline: true }
      )
      .setFooter({ text: "Use /transfer complete to finalize" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("[Transfer Create Error]", error);
    await interaction.editReply({
      content: "❌ An error occurred while creating the transfer.",
    });
  }
}

async function handleComplete(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const member = interaction.member;
  if (
    !hasRole(member as never, RoleType.Manager) &&
    !hasRole(member as never, RoleType.AssistantManager)
  ) {
    await interaction.editReply({
      embeds: [
        createErrorEmbed(
          "❌ Insufficient Permissions",
          "Only **Manager** or **Assistant Manager** can complete transfers."
        ),
      ],
    });
    return;
  }

  const transferId = interaction.options.getString("transfer_id", true);

  try {
    const transfer = await prisma.transfer.findUnique({
      where: { id: transferId },
      include: { player: { include: { user: true } } },
    });

    if (!transfer) {
      await interaction.editReply({
        embeds: [createErrorEmbed("❌ Transfer Not Found", `Transfer ID **${transferId}** not found.`)],
      });
      return;
    }

    if (transfer.status !== "Pending") {
      await interaction.editReply({
        embeds: [createErrorEmbed("❌ Invalid Status", `This transfer is already **${transfer.status}**.`)],
      });
      return;
    }

    // Update the player's team
    if (transfer.toTeamId) {
      await teamService.addPlayerToTeam(transfer.playerId, transfer.toTeamId);
    } else {
      await teamService.removePlayerFromTeam(transfer.playerId);
    }

    // Mark transfer as completed
    await prisma.transfer.update({
      where: { id: transferId },
      data: {
        status: "Completed",
        completedAt: new Date(),
      },
    });

    // ── Auto-post transfer news ──
    try {
      if (interaction.guild) {
        await newsService.announceTransfer(
          interaction.client as ExtendedClient,
          {
            guildId: interaction.guild.id,
            playerName: transfer.player.user.username,
            fromTeam: transfer.fromTeamName ?? "Free Agent",
            toTeam: transfer.toTeamName ?? "Free Agent",
            fee: transfer.fee ? `$${transfer.fee}M` : undefined,
          }
        );
      }
    } catch (newsError) {
      console.error("[Transfer News Error]", newsError);
      // Non-fatal
    }

    const embed = new EmbedBuilder()
      .setTitle("✅ Transfer Completed!")
      .setColor("#00AA00")
      .addFields(
        { name: "👤 Player", value: transfer.player.user.username, inline: true },
        { name: "➡️ From", value: transfer.fromTeamName ?? "Free Agent", inline: true },
        { name: "🏠 To", value: transfer.toTeamName ?? "Free Agent", inline: true },
        { name: "💰 Fee", value: transfer.fee ? `$${transfer.fee}M` : "Free Transfer", inline: true }
      )
      .setFooter({ text: "Legacy Football Championship" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("[Transfer Complete Error]", error);
    await interaction.editReply({
      content: "❌ An error occurred while completing the transfer.",
    });
  }
}

async function handleList(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  try {
    const transfers = await prisma.transfer.findMany({
      where: { status: "Completed" },
      include: {
        player: { include: { user: true } },
      },
      orderBy: { completedAt: "desc" },
      take: 10,
    });

    if (transfers.length === 0) {
      await interaction.editReply({
        content: "📋 No completed transfers yet.",
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("🔄 Recent Transfers")
      .setColor("#00AA00")
      .setDescription(
        transfers
          .map(
            (t, i) =>
              `${i + 1}. **${t.player.user.username}**` +
              `: ${t.fromTeamName ?? "Free Agent"} → ${t.toTeamName ?? "Free Agent"}` +
              (t.fee ? ` ($${t.fee}M)` : " (Free)")
          )
          .join("\n")
      )
      .setFooter({ text: "Legacy Football Championship" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("[Transfers List Error]", error);
    await interaction.editReply({
      content: "❌ An error occurred while fetching transfers.",
    });
  }
}

export default command;
