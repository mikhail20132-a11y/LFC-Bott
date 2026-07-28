import { REST, Routes } from "discord.js";
import "dotenv/config";
import { readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const commands: unknown[] = [];

async function loadCommandsForDeploy() {
  const commandsPath = join(__dirname, "commands");
  const categories = readdirSync(commandsPath);

  for (const category of categories) {
    const categoryPath = join(commandsPath, category);
    const stat = await import("fs").then((fs) => fs.promises.stat(categoryPath));

    if (!stat.isDirectory()) continue;

    const commandFiles = readdirSync(categoryPath).filter(
      (file) => file.endsWith(".ts") || file.endsWith(".js")
    );

    for (const file of commandFiles) {
      const filePath = join(categoryPath, file);
      try {
        const commandModule = await import(filePath);
        const command = commandModule.default;
        if (command?.data) {
          commands.push(command.data.toJSON());
          console.log(`[Deploy] Loaded /${command.data.name}`);
        }
      } catch (error) {
        console.error(`[Deploy] Failed to load ${file}:`, error);
      }
    }
  }
}

async function deploy() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID;

  if (!token || !clientId) {
    console.error("Missing DISCORD_TOKEN or CLIENT_ID in environment.");
    process.exit(1);
  }

  await loadCommandsForDeploy();

  const rest = new REST({ version: "10" }).setToken(token);

  try {
    console.log(`[Deploy] Registering ${commands.length} commands...`);

    let data: unknown;

    // Always register as GLOBAL commands (no guild ID needed, works in every server)
    // Global commands take a few minutes to appear, but only need to be done once
    data = await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands }
    );
    console.log(`[Deploy] Registered ${(data as unknown[]).length} GLOBAL commands.`);
    console.log("[Deploy] Commands will appear in ~5-60 minutes. Be patient!");
  } catch (error) {
    console.error("[Deploy] Failed:", error);
    process.exit(1);
  }
}

deploy();