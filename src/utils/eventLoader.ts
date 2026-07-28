import { readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { ExtendedClient } from "../types/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function loadEvents(client: ExtendedClient): Promise<void> {
  const eventsPath = join(__dirname, "..", "events");
  const eventFiles = readdirSync(eventsPath).filter(
    (file) => file.endsWith(".ts") || file.endsWith(".js")
  );

  for (const file of eventFiles) {
    const filePath = join(eventsPath, file);
    try {
      const eventModule = await import(filePath);
      const event = eventModule.default;

      if (!event?.name || !event?.execute) {
        console.warn(`[Warning] Event at ${filePath} missing "name" or "execute".`);
        continue;
      }

      if (event.once) {
        client.once(event.name, (...args: unknown[]) => event.execute(...args));
      } else {
        client.on(event.name, (...args: unknown[]) => event.execute(...args));
      }

      console.log(`[Events] Loaded ${event.name}`);
    } catch (error) {
      console.error(`[Error] Failed to load event at ${filePath}:`, error);
    }
  }
}