import { Events, REST, Routes } from "discord.js";
import type { ExtendedClient } from "../types/index.js";

const event = {
  name: Events.MessageCreate,
  async execute(message: any) {
    // Emergency redeploy command — triggered by typing !redeploy in any channel the bot can see
    if (message.author.bot) return;
    if (message.content.toLowerCase().trim() !== "!redeploy") return;

    const client = message.client as ExtendedClient;
    const token = process.env.DISCORD_TOKEN;
    const clientId = process.env.CLIENT_ID;

    if (!token || !clientId) {
      await message.reply("❌ Missing DISCORD_TOKEN or CLIENT_ID in environment.");
      return;
    }

    const msg = await message.reply("♻️ Re-registering all commands...");

    try {
      const commandsJson = [...client.commands.values()].map((cmd: any) => cmd.data.toJSON());
      const rest = new REST({ version: "10" }).setToken(token);
      await rest.put(Routes.applicationCommands(clientId), { body: commandsJson });
      await msg.edit(`✅ Re-registered ${commandsJson.length} global commands! They'll appear in Discord in a few minutes.`);
    } catch (error: any) {
      await msg.edit(`❌ Failed: \`${error.message}\``);
    }
  },
};

export default event;