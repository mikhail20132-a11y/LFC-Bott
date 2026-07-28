import { REST, Routes } from "discord.js";
import "dotenv/config";
import { readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const commandsPath = join(__dirname, "commands");
  const commands = [];

  const entries = readdirSync(commandsPath);
  for (const entry of entries) {
    const entryPath = join(commandsPath, entry);
    if (!statSync(entryPath).isDirectory()) continue;

    const files = readdirSync(entryPath).filter(f => f.endsWith(".ts") || f.endsWith(".js"));
    for (const file of files) {
      try {
        const mod = await import(join(entryPath, file));
        if (mod.default?.data) {
          commands.push(mod.default.data.toJSON());
        }
      } catch (e) {
        console.log(`❌ ${entry}/${file}: ${e.message}`);
      }
    }
  }

  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;
  if (!token || !clientId) {
    console.error("Missing DISCORD_TOKEN or CLIENT_ID");
    return;
  }

  const rest = new REST({ version: "10" }).setToken(token);
  try {
    const result = await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log(`\n✅ Registered ${result.length} global commands!`);
    console.log("Commands:", result.map(c => `/${c.name}`).join(", "));
  } catch (err) {
    console.error("Failed:", err.message);
  }
}

main();
