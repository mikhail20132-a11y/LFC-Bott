import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { contractService } from "../../services/contractService.js";
import { hasRole, RoleType } from "../../utils/permissions.js";
import { createErrorEmbed } from "../../utils/helpers.js";
import type { Command, TeamRole } from "../../types/index.js";

const POSITIONS = [
  { name: "🧤 Goalkeeper", value: "Goalkeeper" },
  { name: "🛡️ Defender", value: "Defender" },
  { name: "🎯 Midfielder", value: "Midfielder" },
  { name: "⚽ Forward", value: "Forward" },
];

const ROLES = [
  { name: "👑 Captain", value: "Captain" },
  { name: "⭐ Vice Captain", value: "Vice Captain" },
  { name: "🏃 Starter", value: "Starter" },
  { name: "🔄 Sub", value: "Sub" },
  { name: "📚 Academy", value: "Academy" },
];

const REGIONS = [
  { name: "🌍 Europe", value: "Europe" },
  { name: "🌏 Asia", value: "Asia" },
  { name: "🌍 Africa", value: "Africa" },
  { name: "🌎 North America", value: "North America" },
  { name: "🌎 South America", value: "South America" },
  { name: "🌏 Oceania", value: "Oceania" },
];

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("offer")
    .setDescription("Offer a contract to a player and auto-nickname them (Management only)")
    .addUserOption((opt) =>
      opt.setName("player").setDescription("Player to offer contract").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("team").setDescription("Team name").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("position").setDescription("Position").setRequired(true)
        .addChoices(...POSITIONS)
    )
    .addStringOption((opt) =>
      opt.setName("region").setDescription("Region").setRequired(true)
        .addChoices(...REGIONS)
    )
    .addStringOption((opt) =>
      opt.setName("role").setDescription("Team role").setRequired(false)
        .addChoices(...ROLES)
    )
    .addStringOption((opt) =>
      opt.setName("roblox").setDescription("Roblox username").setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName("nickname").setDescription("Server nickname to assign").setRequired(false)
    ),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply();

    if (!hasRole(interaction.member as never, RoleType.Founder) &&
        !hasRole(interaction.member as never, RoleType.LeagueManagement)) {
      await interaction.editReply({
        embeds: [createErrorEmbed("❌ Insufficient Permissions","You need **Founder** or **League Management** role.")],
      });
      return;
    }

    const target = interaction.options.getUser("player", true);
    const teamName = interaction.options.getString("team", true);
    const position = interaction.options.getString("position", true);
    const region = interaction.options.getString("region", true);
    const role = interaction.options.getString("role") as TeamRole | null;
    const roblox = interaction.options.getString("roblox");
    const nickname = interaction.options.getString("nickname");

    try {
      const { player, contract, team } = await contractService.offerContract({
        discordId: target.id,
        username: target.username,
        teamName,
        position,
        region,
        robloxUsername: roblox ?? undefined,
        roleInTeam: role ?? undefined,
        nickname: nickname ?? undefined,
      });

      // Auto-nickname if provided
      let nicknameResult = "None";
      if (nickname && interaction.guild) {
        try {
          const member = await interaction.guild.members.fetch(target.id);
          await member.setNickname(nickname);
          nicknameResult = `✅ Set to **${nickname}**`;
        } catch {
          nicknameResult = "⚠️ Could not set nickname (check bot permissions)";
        }
      }

      const embed = new EmbedBuilder()
        .setTitle("📝 Contract Offered!")
        .setColor("#00AA00")
        .setDescription(`**${target.username}** has joined **${team.name}**!`)
        .addFields(
          { name: "👤 Player", value: `<@${target.id}>`, inline: true },
          { name: "🏟️ Team", value: team.name, inline: true },
          { name: "⚽ Position", value: position, inline: true },
          { name: "🌍 Region", value: region, inline: true },
          { name: "🎭 Role", value: role ?? "Starter", inline: true },
          { name: "🆔 LFC ID", value: player.lfcId, inline: true },
          { name: "🎮 Roblox", value: roblox ?? "Not set", inline: true },
          { name: "📛 Nickname", value: nicknameResult, inline: false },
        )
        .setFooter({ text: `Contract ID: ${contract.id.slice(0, 8)} • Legacy Football Championship` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      await interaction.editReply({ content: `❌ ${msg}` });
    }
  },
};

export default command;