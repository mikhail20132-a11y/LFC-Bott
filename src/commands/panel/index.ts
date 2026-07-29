import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import type { Command } from "../../types/index.js";
import { BRAND } from "../../utils/helpers.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("panel")
    .setDescription("Open the LFC configuration panel"),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.isChatInputCommand()) return;

    const embed = new EmbedBuilder()
      .setTitle("🔄 Panel Has Moved!")
      .setColor(BRAND.colors.warning)
      .setDescription([
        "The configuration panel has moved to a new command!",
        "",
        "📋 **Use `/setup` instead**",
        "",
        "The `/setup` command has a cleaner interface with:",
        "• 📺 **Channels** — Set news, demands, appointments, signings channels",
        "• 🎭 **Roles** — Map Discord roles to Manager, Asst Manager, Moderator, Referee",
        "• ⚙️ **Settings** — Roster cap, signings toggle, signing method",
        "• 🔄 **Auto Setup** — One-click full server setup",
        "",
        "Also available: `/autosetup` — Scans your server and auto-detects roles & channels",
      ].join("\n"))
      .setFooter({ text: BRAND.footer })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

export default command;