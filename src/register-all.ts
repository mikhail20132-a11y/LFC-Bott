import { REST, Routes } from "discord.js";
import "dotenv/config";
import { readdirSync, statSync } from "fs";
import { join } from "path";

async function main() {
  const commandsPath = join(process.cwd(), "src", "commands");
  const commands: unknown[] = [];

  const entries = readdirSync(commandsPath);
  for (const entry of entries) {
    const ep = join(commandsPath, entry);
    if (!statSync(ep).isDirectory()) continue;
    const files = readdirSync(ep).filter(f => f.endsWith(".ts") || f.endsWith(".js"));
    for (const file of files) {
      try {
        const mod = await import(join(ep, file));
        if (mod.default?.data) {
          commands.push(mod.default.data.toJSON());
          console.log(`✅ /${mod.default.data.name}`);
        }
      } catch (e: any) {
        console.log(`❌ ${entry}/${file}: ${e?.message || e}`);
      }
    }
  }

  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;
  if (!token || !clientId) { console.error("Missing token"); return; }

  const rest = new REST({ version: "10" }).setToken(token);
  try {
    const result: any = await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log(`\n✅ Registered ${result.length} global commands!`);
  } catch (err: any) {
    console.error("FAILED:", err.message);
  }
}

main();
