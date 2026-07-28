import { readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { ExtendedClient, Command } from "../types/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function loadCommands(client: ExtendedClient): Promise<void> {
  const commandsPath = join(__dirname, "..", "commands");
  let allEntries: string[] = [];
  try {
    allEntries = readdirSync(commandsPath);
    console.log(`[Commands] Scanning ${allEntries.length} entries in commands/`);
  } catch (e) {
    console.error(`[Commands] Failed to read commands directory:`, e);
    return;
  }

  let loaded = 0;
  let failed = 0;

  for (const entry of allEntries) {
    const entryPath = join(commandsPath, entry);

    // Check if directory
    let isDir = false;
    try {
      const { stat } = await import("fs/promises");
      const stats = await stat(entryPath);
      isDir = stats.isDirectory();
    } catch {
      continue;
    }

    if (!isDir) continue;

    // List .ts files
    let files: string[] = [];
    try {
      files = readdirSync(entryPath).filter(
        (f) => f.endsWith(".ts") || f.endsWith(".js")
      );
    } catch {
      console.warn(`[Commands] Cannot read ${entry}/`);
      continue;
    }

    if (files.length === 0) {
      console.warn(`[Commands] No .ts files in ${entry}/`);
    }

    for (const file of files) {
      const filePath = join(entryPath, file);
      try {
        const commandModule = await import(filePath);
        const command = commandModule.default as Command;

        if (!command?.data?.name || !command?.execute) {
          console.warn(`[Commands] ${entry}/${file}: missing "data" or "execute"`);
          failed++;
          continue;
        }

        client.commands.set(command.data.name, command);
        console.log(`[Commands] ✅ /${command.data.name} (${entry})`);
        loaded++;
      } catch (error: any) {
        console.error(`[Commands] ❌ ${entry}/${file}: ${error?.message || error}`);
        failed++;
      }
    }
  }

  console.log(`[Commands] Finished: ${loaded} loaded, ${failed} failed`);
}