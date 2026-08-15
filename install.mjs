/** Vault Sync belongs ONLY in the umbrella vault — it is the thing that pushes
 *  settings downward, and it has no meaning inside a leaf vault. */
import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

/** Override the umbrella vault with OBSIDIAN_VAULT. */
const UMBRELLA = process.env.OBSIDIAN_VAULT ?? "/Users/lionelweng/Documents";
const TARGET = join(UMBRELLA, ".obsidian/plugins/vault-sync");

await mkdir(TARGET, { recursive: true });
for (const file of ["main.js", "manifest.json", "styles.css"]) {
  await copyFile(file, join(TARGET, file));
  console.log(`installed ${file}`);
}
console.log(`\n-> ${TARGET}`);
console.log("Reload the umbrella vault, then enable 'Vault Sync' in Community Plugins.");
