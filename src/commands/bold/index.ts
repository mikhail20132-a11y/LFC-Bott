import {
  SlashCommandBuilder,
  CommandInteraction,
} from "discord.js";
import type { Command } from "../../types/index.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("bold")
    .setDescription("Echo text in bold")
    .addStringOption((opt) =>
      opt
        .setName("text")
        .setDescription("Text to echo in bold")
        .setRequired(true)
    ),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;

    const text = interaction.options.getString("text", true);

    try {
      await interaction.reply(`**${text}**`);
    } catch (error) {
      console.error("[Bold Error]", error);
      // Fallback — attempt to reply anyway
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply(`**${text}**`);
      } else {
        await interaction.reply(`**${text}**`);
      }
    }
  },
};

export default command;
