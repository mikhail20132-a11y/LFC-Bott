import {
  SlashCommandBuilder,
  CommandInteraction,
  ChannelType,
  TextChannel,
} from "discord.js";
import { hasRole, RoleType } from "../../utils/permissions.js";
import { createErrorEmbed } from "../../utils/helpers.js";
import type { Command } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("gametime")
    .setDescription("Send an @everyone ping about an upcoming match")
    .addStringOption((opt) =>
      opt
        .setName("team")
        .setDescription("Your team name")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("opponent")
        .setDescription("Opposing team name")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("time")
        .setDescription("Match date and time")
        .setRequired(true)
    )
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("Channel to send the announcement (defaults to current)")
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText)
    ),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply({ ephemeral: true });

    const member = interaction.member as import("discord.js").GuildMember | null;
    if (
      !member ||
      (!hasRole(member, RoleType.Founder) &&
        !hasRole(member, RoleType.LeagueManagement) &&
        !hasRole(member, RoleType.Referee))
    ) {
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            "❌ Insufficient Permissions",
            "You need **Founder**, **League Management**, or **Referee** role to send match alerts."
          ),
        ],
      });
      return;
    }

    const team = interaction.options.getString("team", true);
    const opponent = interaction.options.getString("opponent", true);
    const time = interaction.options.getString("time", true);
    const channelOpt = interaction.options.getChannel("channel");
    const targetChannel: TextChannel | null =
      (channelOpt as TextChannel) ?? (interaction.channel as TextChannel);

    if (!targetChannel || !targetChannel.isTextBased()) {
      await interaction.editReply({
        embeds: [
          createErrorEmbed("❌ Invalid Channel", "Could not resolve a valid text channel."),
        ],
      });
      return;
    }

    try {
      const content = `@everyone ⚽ **MATCH STARTING!** ${team} vs ${opponent} at **${time}**!`;

      await targetChannel.send({ content });

      await interaction.editReply({
        content: `✅ Match alert sent to ${targetChannel}!`,
      });
    } catch (error) {
      console.error("[Gametime Error]", error);
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            "❌ Error",
            "Failed to send the match announcement. Make sure the bot has permission to send messages in that channel."
          ),
        ],
      });
    }
  },
};

export default command;
