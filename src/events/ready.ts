import { Events, ActivityType } from "discord.js";
import type { ExtendedClient } from "../types/index.js";

const event = {
  name: Events.ClientReady,
  once: true,
  execute(client: ExtendedClient) {
    if (!client.user) return;

    console.log(`[Bot] ${client.user.tag} is online!`);
    console.log(`[Bot] Serving ${client.guilds.cache.size} guilds`);

    // Set bot activity
    client.user.setActivity("Legacy Football Championship", {
      type: ActivityType.Watching,
    });

    // Set bot status
    client.user.setStatus("online");
  },
};

export default event;