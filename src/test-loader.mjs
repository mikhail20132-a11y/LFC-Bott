import { readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const commandsPath = join(__dirname, "commands");
const entries = readdirSync(commandsPath);

let ok = 0, fail = 0;
for (const entry of entries) {
  const ep = join(commandsPath, entry);
  if (!statSync(ep).isDirectory()) continue;
  const files = readdirSync(ep).filter(f => f.endsWith(".ts") || f.endsWith(".js"));
  for (const file of files) {
    try {
      const fp = join(ep, file);
      const mod = await import(fp);
      if (mod.default?.data) {
        console.log(`✅  /${mod.default.data.name}  (${entry}/${file})`);
        ok++;
      } else {
        console.log(`⚠️  ${entry}/${file}: no data or execute`);
        fail++;
      }
    } catch (e) {
      console.log(`❌  ${entry}/${file}: ${e.message}`);
      fail++;
    }
  }
}
console.log(`\nResult: ${ok} OK, ${fail} FAILED`);
