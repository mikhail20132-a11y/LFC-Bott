import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { leagueService } from "../../services/leagueService.js";
import { createErrorEmbed } from "../../utils/helpers.js";
import type { Command } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("standings")
    .setDescription("View the current league table"),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply();

    try {
      const activeSeason = await leagueService.getActiveSeason();
      if (!activeSeason) {
        await interaction.editReply({
          embeds: [createErrorEmbed("📭 No Active Season", "No active season. An admin can start one with `/admin season start`.")],
        });
        return;
      }

      const standings = await leagueService.getStandings(activeSeason.id);
      if (!standings || standings.length === 0) {
        await interaction.editReply({
          embeds: [createErrorEmbed("📭 No Standings", "No teams have played any matches yet this season.")],
        });
        return;
      }

      const medal = ["🥇", "🥈", "🥉"];
      const embed = new EmbedBuilder()
        .setTitle(`🏆 ${activeSeason.name} — League Table`)
        .setColor("#FFD700")
        .setDescription(`Current standings after ${standings[0]?.played || 0} matchdays`)
        .setTimestamp();

      standings.slice(0, 12).forEach((s: any, i: number) => {
        const rank = medal[i] || `**${i + 1}.**`;
        const gd = (s.goalsFor || 0) - (s.goalsAgainst || 0);
        const form = gd > 0 ? `(+${gd})` : gd < 0 ? `(${gd})` : "(0)";
        embed.addFields({
          name: `${rank} ${s.teamName || s.team?.name || "Unknown"}`,
          value: `📊 ${s.played}P | ${s.wins}W / ${s.draws}D / ${s.losses}L | ⚽ ${s.goalsFor}GF / ${s.goalsAgainst}GA ${form} | **${s.points} pts**`,
          inline: false,
        });
      });

      embed.setFooter({ text: "Legacy Football Championship" });
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("[Standings Error]", error);
      await interaction.editReply({ embeds: [createErrorEmbed("❌ Error", "Failed to load standings.")] });
    }
  },
};

export default command;