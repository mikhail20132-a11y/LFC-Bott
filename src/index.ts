import { Client, GatewayIntentBits, Collection, Events, REST, Routes } from "discord.js";
import "dotenv/config";
import { prisma } from "./database/prisma.js";
import { loadCommands } from "./utils/commandLoader.js";
import { loadEvents } from "./utils/eventLoader.js";
import type { ExtendedClient } from "./types/index.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
}) as ExtendedClient;

client.commands = new Collection();

async function registerSlashCommands(client: ExtendedClient) {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;
  if (!token || !clientId) {
    console.error("[Register] Missing DISCORD_TOKEN or CLIENT_ID.");
    return;
  }

  const commandsJson = [...client.commands.values()].map((cmd: any) => cmd.data.toJSON());
  const rest = new REST({ version: "10" }).setToken(token);

  // GUILD-BASED REGISTRATION (instant) — falls back to global
  const guildId = process.env.GUILD_ID;
  if (guildId) {
    try {
      console.log(`[Register] Registering ${commandsJson.length} commands to guild ${guildId}...`);
      const data = await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commandsJson }
      );
      console.log(`[Register] ✅ Registered ${(data as any[]).length} commands to guild (instant!).`);
    } catch (error) {
      console.error(`[Register] Guild registration failed:`, error);
    }
  }

  // GLOBAL REGISTRATION (slow, propagates over time)
  try {
    console.log(`[Register] Registering ${commandsJson.length} global commands...`);
    const data = await rest.put(Routes.applicationCommands(clientId), { body: commandsJson });
    console.log(`[Register] ✅ Registered ${(data as any[]).length} commands globally.`);
    console.log("[Register] They may take a few minutes to appear in Discord.");
  } catch (error) {
    console.error("[Register] Failed:", error);
  }
}

async function bootstrap() {
  try {
    // Connect to database
    await prisma.$connect();
    console.log("[Database] Connected to PostgreSQL successfully.");

    // Load commands into collection
    await loadCommands(client);
    console.log("[Commands] All commands loaded.");

    // Register commands on Discord (global)
    await registerSlashCommands(client);
    console.log("[Register] Command registration complete.");

    // Load events
    await loadEvents(client);
    console.log("[Events] All events loaded.");

    // Login to Discord
    await client.login(process.env.DISCORD_TOKEN);
    console.log(`[Bot] Logged in as ${client.user?.tag}`);
  } catch (error) {
    console.error("[Fatal] Failed to start bot:", error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n[Shutdown] Shutting down gracefully...");
  await prisma.$disconnect();
  client.destroy();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n[Shutdown] Shutting down gracefully...");
  await prisma.$disconnect();
  client.destroy();
  process.exit(0);
});

bootstrap();