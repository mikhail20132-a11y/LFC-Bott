import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
} from "discord.js";
import type { Command, ExtendedClient } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("debug")
    .setDescription("Show loaded commands (diagnostic)"),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    
    const client = interaction.client as ExtendedClient;
    const commands = [...client.commands.entries()]
      .map(([name]) => `/${name}`)
      .sort();

    const embed = new EmbedBuilder()
      .setTitle("🔧 Debug — Loaded Commands")
      .setColor("#FFD700")
      .setDescription(`**${commands.length} commands loaded:**\n${commands.join("\n")}`)
      .setFooter({ text: "If numbers don't match, some commands failed to load" });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

export default command;