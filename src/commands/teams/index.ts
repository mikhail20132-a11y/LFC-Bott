import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { teamService } from "../../services/teamService.js";
import { prisma } from "../../database/prisma.js";
import { createErrorEmbed, BRAND } from "../../utils/helpers.js";
import type { Command } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("teams")
    .setDescription("Browse all registered teams in the league")
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("View all teams with managers, roster size, and trophies")
    )
    .addSubcommand((sub) =>
      sub
        .setName("top")
        .setDescription("View top teams by trophies")
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const sub = interaction.options.getSubcommand();

    try {
      switch (sub) {
        case "list":
          return handleList(interaction);
        case "top":
          return handleTop(interaction);
        default:
          await interaction.editReply({ content: "❌ Unknown subcommand." });
      }
    } catch (error) {
      console.error("[Teams Error]", error);
      await interaction.editReply({
        embeds: [createErrorEmbed("❌ Error", "Failed to load teams.")],
      });
    }
  },
};

async function handleList(interaction: ChatInputCommandInteraction): Promise<void> {
  // Admin only — teams list shows controlled franchise info
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.editReply({
      embeds: [createErrorEmbed("❌ Admin Only", "Only administrators can view the teams list.")]
    });
    return;
  }

  const teams = await prisma.team.findMany({
    include: {
      manager: true,
      _count: { select: { players: true } },
    },
    orderBy: { name: "asc" },
  });

  if (!teams || teams.length === 0) {
    await interaction.editReply({
      embeds: [createErrorEmbed("📭 No Teams", "No teams have been created yet! Use `/team create` to start.")],
    });
    return;
  }

  // Split into pages of 10
  const pageSize = 10;
  const pages = Math.ceil(teams.length / pageSize);
  let currentPage = 0;

  function buildPage(page: number) {
    const slice = teams.slice(page * pageSize, (page + 1) * pageSize);

    const embed = new EmbedBuilder()
      .setTitle("🏟️ Franchise Owners")
      .setColor(BRAND.colors.primary)
      .setDescription([
        `**Active Franchises — ${teams.length}**`,
        pages > 1 ? `Page **${page + 1}/${pages}**` : "",
      ].filter(Boolean).join("\n"))
      .setFooter({ text: BRAND.footer })
      .setTimestamp();

    for (const team of slice) {
      const emoji = team.emoji || "🏟️";
      const rosterCount = team._count.players;
      const managerStr = team.manager
        ? `<@${team.manager.discordId}>`
        : "`No FO`";

      const fieldVal = [
        `\`${rosterCount}/30\``,
        `👤 ${managerStr}`,
      ];

      if (team.trophies && team.trophies > 0) {
        fieldVal.push(`🏆 **${team.trophies}**`);
      }

      embed.addFields({
        name: `${emoji} ${team.shortName ? `**${team.shortName}**` : `**${team.name}**`}`,
        value: fieldVal.join("　·　"),
        inline: false,
      });
    }

    return embed;
  }

  const msg = await interaction.editReply({
    embeds: [buildPage(0)],
    components: [],
  });

  if (pages <= 1) return;
}

async function handleTop(interaction: ChatInputCommandInteraction): Promise<void> {
  const teams = await prisma.team.findMany({
    include: {
      manager: true,
      _count: { select: { players: true } },
    },
    orderBy: { trophies: "desc" },
    take: 10,
  });

  if (!teams || teams.length === 0) {
    await interaction.editReply({
      embeds: [createErrorEmbed("📭 No Teams", "No teams yet!")],
    });
    return;
  }

  const medals = ["🥇", "🥈", "🥉", "4⃣", "5⃣", "6⃣", "7⃣", "8⃣", "9⃣", "🔟"];

  const embed = new EmbedBuilder()
    .setTitle("🏆 Trophy Leaders")
    .setColor(BRAND.colors.gold)
    .setDescription("**Most decorated franchises in LFC history**")
    .setFooter({ text: BRAND.footer })
    .setTimestamp();

  for (let i = 0; i < teams.length; i++) {
    const team = teams[i];
    const emoji = team.emoji || "🏟️";
    const rosterCount = team._count.players;
    const managerStr = team.manager
      ? `<@${team.manager.discordId}>`
      : "`No FO`";

    embed.addFields({
      name: `${medals[i]} ${emoji} **${team.name}**`,
      value: [
        `🏆 **${team.trophies}** trophy${team.trophies !== 1 ? "ies" : "y"}`,
        `👤 ${managerStr}`,
        `\`${rosterCount}/30\``,
      ].join(" · "),
      inline: false,
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

export default command;