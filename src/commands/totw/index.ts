import { SlashCommandBuilder, CommandInteraction, EmbedBuilder } from "discord.js";
import { prisma } from "../../database/prisma.js";
import { leagueService } from "../../services/leagueService.js";
import { newsService } from "../../services/newsService.js";
import { hasRole, RoleType } from "../../utils/permissions.js";
import { createErrorEmbed } from "../../utils/helpers.js";
import type { Command, ExtendedClient } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("totw")
    .setDescription("Award Team of the Week (Management only)")
    .addStringOption((o) => o.setName("team").setDescription("Team name").setRequired(true))
    .addIntegerOption((o) => o.setName("week").setDescription("Week number").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(false)),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply();
    if (!hasRole(interaction.member as never, RoleType.Founder) && !hasRole(interaction.member as never, RoleType.LeagueManagement)) {
      await interaction.editReply({ embeds: [createErrorEmbed("❌ Permissions", "Management only.")] }); return;
    }
    const teamName = interaction.options.getString("team", true);
    const week = interaction.options.getInteger("week", true);
    const reason = interaction.options.getString("reason");
    const season = await leagueService.getActiveSeason();
    if (!season) { await interaction.editReply({ content: "❌ No active season." }); return; }
    const team = await prisma.team.findUnique({ where: { name: teamName }, include: { manager: true } });
    if (!team) { await interaction.editReply({ content: "❌ Team not found." }); return; }

    await prisma.weeklyAward.create({
      data: { type: "totw", teamId: team.id, seasonId: season.id, weekNumber: week, reason },
    });

    if (interaction.guild) {
      await newsService.announceBroadcast(interaction.client as ExtendedClient, {
        guildId: interaction.guild.id,
        title: `🏅 Team of the Week (GW${week})`,
        message: `**${team.name}** has been awarded **Team of the Week** for GW${week}!${reason ? `\n\n📝 ${reason}` : ""}`,
        authorName: interaction.user.username,
        color: "#FFD700",
      });
    }

    const embed = new EmbedBuilder()
      .setTitle("🏅 Team of the Week!")
      .setColor("#FFD700")
      .setDescription(`**${team.name}** is the Team of the Week for **GW${week}**!`)
      .addFields(
        { name: "🏟️ Team", value: team.name, inline: true },
        { name: "👤 Manager", value: `<@${team.manager.discordId}>`, inline: true },
        { name: "📝 Reason", value: reason ?? "Outstanding team performance", inline: false },
      )
      .setFooter({ text: `Week ${week} • Legacy Football Championship` }).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  },
};
export default command;