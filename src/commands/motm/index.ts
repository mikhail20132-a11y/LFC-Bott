import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType } from "discord.js";
import { prisma } from "../../database/prisma.js";
import { hasRole, RoleType } from "../../utils/permissions.js";
import { createErrorEmbed } from "../../utils/helpers.js";
import type { Command } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("motm")
    .setDescription("Start a Man of the Match poll in the match thread")
    .addStringOption((o) => o.setName("match_id").setDescription("Match ID").setRequired(true)),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply();

    if (!hasRole(interaction.member as never, RoleType.Manager) && !hasRole(interaction.member as never, RoleType.AssistantManager) && !hasRole(interaction.member as never, RoleType.Referee)) {
      await interaction.editReply({ embeds: [createErrorEmbed("❌ Permissions", "Staff only.")] }); return;
    }

    const matchId = interaction.options.getString("match_id", true);
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        homeTeam: { include: { players: { include: { user: true } } } },
        awayTeam: { include: { players: { include: { user: true } } } },
      },
    });
    if (!match) { await interaction.editReply({ content: "❌ Match not found." }); return; }

    const allPlayers = [...match.homeTeam.players, ...match.awayTeam.players];
    if (allPlayers.length === 0) { await interaction.editReply({ content: "❌ No players in this match." }); return; }

    // Create poll
    const poll = await prisma.motmPoll.create({ data: { matchId } });

    const select = new StringSelectMenuBuilder()
      .setCustomId("motm_vote").setPlaceholder("Vote for Man of the Match...")
      .addOptions(
        allPlayers.map((p) => ({
          label: p.user.username,
          value: p.id,
          description: `${p.position} — ${(p as any).team?.name ?? "Unknown"}`,
          emoji: getPosEmoji(p.position),
        }))
      );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
    const embed = new EmbedBuilder()
      .setTitle("🏆 Man of the Match")
      .setColor("#FFD700")
      .setDescription(`**${match.homeTeam.name}** vs **${match.awayTeam.name}**\n\nVote for your MOTM below!`)
      .setFooter({ text: "Voting closes in 2 minutes • Legacy Football Championship" }).setTimestamp();

    const reply = await interaction.editReply({ embeds: [embed], components: [row] });

    const collector = reply.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 120_000 });
    const votes = new Map<string, number>();

    collector.on("collect", async (si) => {
      const votedPlayerId = si.values[0];
      // Check if already voted
      const existing = await prisma.motmVote.findUnique({
        where: { pollId_voterId: { pollId: poll.id, voterId: si.user.id } },
      });
      if (existing) {
        await si.reply({ content: "❌ You already voted!", ephemeral: true });
        return;
      }
      await prisma.motmVote.create({ data: { pollId: poll.id, playerId: votedPlayerId, voterId: si.user.id } });
      votes.set(votedPlayerId, (votes.get(votedPlayerId) ?? 0) + 1);
      await si.reply({ content: `✅ Vote counted for **${allPlayers.find((p) => p.id === votedPlayerId)?.user.username}**!`, ephemeral: true });
    });

    collector.on("end", async () => {
      // Find winner
      let winnerId = "";
      let maxVotes = 0;
      for (const [pid, count] of votes) {
        if (count > maxVotes) { maxVotes = count; winnerId = pid; }
      }

      if (winnerId) {
        const winner = allPlayers.find((p) => p.id === winnerId);
        await prisma.matchMvp.upsert({
          where: { matchId },
          update: { playerId: winnerId, reason: "Man of the Match (Fan Vote)" },
          create: { matchId, playerId: winnerId, reason: "Man of the Match (Fan Vote)" },
        });
        await prisma.player.update({ where: { id: winnerId }, data: { mvps: { increment: 1 } } });

        await prisma.motmPoll.update({ where: { id: poll.id }, data: { isActive: false } });

        const resultEmbed = new EmbedBuilder()
          .setTitle(`🏆 Man of the Match: ${winner?.user.username ?? "Unknown"}`)
          .setColor("#FFD700")
          .setDescription(`**${winner?.user.username}** won with **${maxVotes}** vote${maxVotes > 1 ? "s" : ""}!`)
          .setFooter({ text: "Legacy Football Championship" }).setTimestamp();

        const disabledRow = ActionRowBuilder.from<StringSelectMenuBuilder>(row);
        disabledRow.components.forEach((c) => c.setDisabled(true));
        await interaction.editReply({ embeds: [resultEmbed], components: [disabledRow] });
      } else {
        await interaction.editReply({ embeds: [embed.setDescription("No votes were cast.")], components: [] });
      }
    });
  },
};

function getPosEmoji(pos: string): string {
  const map: Record<string, string> = { Goalkeeper: "🧤", Defender: "🛡️", Midfielder: "🎯", Forward: "⚽" };
  return map[pos] ?? "👤";
}

export default command;