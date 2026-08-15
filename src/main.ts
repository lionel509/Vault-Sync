import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { App, Modal, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";

/**
 * Vault Sync — push settings from this umbrella vault down into the nested ones.
 *
 * Runs from ~/Documents, which physically contains every other vault as a
 * subfolder. Everything it writes lands inside <vault>/.obsidian/ and nowhere
 * else, every overwrite is backed up first, and nothing happens without a
 * preview you confirm.
 */

/** Never written to. Vanguard is off-limits; the rest are structural. */
const ALWAYS_EXCLUDED = ["Vanguard"];

/** Per-vault by nature — copying these would do damage, not save work. */
const NEVER_SYNCED = [
  "workspace.json", // window layout, rewritten constantly
  "workspaces.json",
  "graph.json", // per-vault graph colours — one hue per vault, deliberately
];

const CREDENTIAL = /key|token|secret|api|password|credential/i;

interface VaultSyncSettings {
  targets: string[];
  excluded: string[];
  configFiles: string[];
  syncSnippets: boolean;
  syncThemes: boolean;
  /** Plugin ids whose bundle (main.js/manifest.json/styles.css) is copied. */
  clonePlugins: string[];
  /** Plugin ids whose credential fields are merged into the target's data.json. */
  mergeCredentialsFor: string[];
}

const SYNCABLE_CONFIG = [
  "appearance.json",
  "app.json",
  "hotkeys.json",
  "core-plugins.json",
  "community-plugins.json",
];

const DEFAULT_SETTINGS: VaultSyncSettings = {
  targets: [],
  excluded: [...ALWAYS_EXCLUDED],
  configFiles: ["appearance.json", "hotkeys.json"],
  syncSnippets: true,
  syncThemes: false,
  clonePlugins: [],
  mergeCredentialsFor: [],
};

interface PlannedWrite {
  vault: string;
  label: string;
  from: string;
  to: string;
  kind: "new" | "overwrite" | "merge";
  detail?: string;
}

function listDir(path: string): string[] {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function readJson(path: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export default class VaultSyncPlugin extends Plugin {
  settings: VaultSyncSettings = { ...DEFAULT_SETTINGS };

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addRibbonIcon("copy", "Sync settings to sub-vaults", () => this.openPreview());

    this.addCommand({
      id: "preview-vault-sync",
      name: "Preview settings sync to sub-vaults",
      callback: () => this.openPreview(),
    });

    this.addSettingTab(new VaultSyncSettingTab(this.app, this));
  }

  root(): string {
    return (this.app.vault.adapter as unknown as { basePath?: string }).basePath ?? "";
  }

  /** Immediate subfolders that are themselves vaults, minus anything excluded. */
  discoverVaults(): string[] {
    const root = this.root();
    const excluded = new Set([...this.settings.excluded, ...ALWAYS_EXCLUDED]);
    return listDir(root)
      .filter((name) => !name.startsWith("."))
      .filter((name) => !excluded.has(name))
      .filter((name) => isDir(join(root, name, ".obsidian")))
      .sort();
  }

  /** Plugins installed in this umbrella vault, available to push downward. */
  availablePlugins(): string[] {
    return listDir(join(this.root(), ".obsidian", "plugins"))
      .filter((name) => existsSync(join(this.root(), ".obsidian", "plugins", name, "manifest.json")))
      .sort();
  }

  /** Work out every file that would be written, without writing anything. */
  plan(): PlannedWrite[] {
    const root = this.root();
    const source = join(root, ".obsidian");
    const writes: PlannedWrite[] = [];
    const chosen = this.settings.targets.length ? this.settings.targets : this.discoverVaults();
    const excluded = new Set([...this.settings.excluded, ...ALWAYS_EXCLUDED]);

    for (const vault of chosen) {
      if (excluded.has(vault)) continue;
      const target = join(root, vault, ".obsidian");
      if (!isDir(target)) continue;

      for (const file of this.settings.configFiles) {
        if (NEVER_SYNCED.includes(file)) continue;
        const from = join(source, file);
        if (!existsSync(from)) continue;
        const to = join(target, file);
        writes.push({
          vault,
          label: file,
          from,
          to,
          kind: existsSync(to) ? "overwrite" : "new",
        });
      }

      for (const [enabled, folder] of [
        [this.settings.syncSnippets, "snippets"],
        [this.settings.syncThemes, "themes"],
      ] as [boolean, string][]) {
        if (!enabled) continue;
        for (const entry of listDir(join(source, folder))) {
          const from = join(source, folder, entry);
          if (isDir(from)) {
            for (const inner of listDir(from)) {
              const to = join(target, folder, entry, inner);
              writes.push({
                vault,
                label: `${folder}/${entry}/${inner}`,
                from: join(from, inner),
                to,
                kind: existsSync(to) ? "overwrite" : "new",
              });
            }
          } else {
            const to = join(target, folder, entry);
            writes.push({
              vault,
              label: `${folder}/${entry}`,
              from,
              to,
              kind: existsSync(to) ? "overwrite" : "new",
            });
          }
        }
      }

      for (const id of this.settings.clonePlugins) {
        for (const file of ["main.js", "manifest.json", "styles.css"]) {
          const from = join(source, "plugins", id, file);
          if (!existsSync(from)) continue;
          const to = join(target, "plugins", id, file);
          writes.push({
            vault,
            label: `plugins/${id}/${file}`,
            from,
            to,
            kind: existsSync(to) ? "overwrite" : "new",
          });
        }
      }

      for (const id of this.settings.mergeCredentialsFor) {
        const from = join(source, "plugins", id, "data.json");
        const sourceData = readJson(from);
        if (!sourceData) continue;
        const fields = Object.keys(sourceData).filter(
          (k) => CREDENTIAL.test(k) && typeof sourceData[k] === "string" && sourceData[k] !== "",
        );
        if (!fields.length) continue;
        const to = join(target, "plugins", id, "data.json");
        writes.push({
          vault,
          label: `plugins/${id}/data.json`,
          from,
          to,
          kind: "merge",
          detail: fields.join(", "),
        });
      }
    }

    return writes;
  }

  /** Apply a plan. Every overwrite is copied aside first. */
  apply(writes: PlannedWrite[]): { done: number; failed: string[]; backup: string } {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const failed: string[] = [];
    let done = 0;
    let backupRoot = "";

    for (const write of writes) {
      try {
        mkdirSync(join(write.to, ".."), { recursive: true });

        if (existsSync(write.to)) {
          backupRoot = join(this.root(), write.vault, ".obsidian", ".vault-sync-backup", stamp);
          const backupTo = join(backupRoot, write.label);
          mkdirSync(join(backupTo, ".."), { recursive: true });
          copyFileSync(write.to, backupTo);
        }

        if (write.kind === "merge") {
          const sourceData = readJson(write.from) ?? {};
          const targetData = readJson(write.to) ?? {};
          for (const key of Object.keys(sourceData)) {
            if (CREDENTIAL.test(key) && typeof sourceData[key] === "string" && sourceData[key] !== "") {
              targetData[key] = sourceData[key];
            }
          }
          writeFileSync(write.to, `${JSON.stringify(targetData, null, 2)}\n`);
        } else {
          copyFileSync(write.from, write.to);
        }
        done++;
      } catch (error) {
        failed.push(`${write.vault}/${write.label}: ${error instanceof Error ? error.message : error}`);
      }
    }

    return { done, failed, backup: backupRoot };
  }

  openPreview(): void {
    const writes = this.plan();
    new VaultSyncPreviewModal(this.app, this, writes).open();
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    // Excluding Vanguard is not negotiable through saved settings.
    for (const name of ALWAYS_EXCLUDED) {
      if (!this.settings.excluded.includes(name)) this.settings.excluded.push(name);
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}

class VaultSyncPreviewModal extends Modal {
  constructor(
    app: App,
    private plugin: VaultSyncPlugin,
    private writes: PlannedWrite[],
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("vault-sync-modal");

    contentEl.createEl("h3", { text: "Sync settings to sub-vaults" });

    if (!this.writes.length) {
      contentEl.createEl("p", {
        text: "Nothing to sync. Pick target vaults and what to copy in Vault Sync settings.",
      });
      return;
    }

    const byVault = new Map<string, PlannedWrite[]>();
    for (const write of this.writes) {
      const list = byVault.get(write.vault) ?? [];
      list.push(write);
      byVault.set(write.vault, list);
    }

    const overwrites = this.writes.filter((w) => w.kind === "overwrite").length;
    const summary = contentEl.createDiv({ cls: "vault-sync-summary" });
    summary.setText(
      `${this.writes.length} file(s) across ${byVault.size} vault(s) · ${overwrites} would be overwritten (backed up first)`,
    );

    const list = contentEl.createDiv({ cls: "vault-sync-list" });
    for (const [vault, items] of [...byVault.entries()].sort()) {
      list.createEl("h4", { text: vault });
      const ul = list.createEl("ul");
      for (const item of items) {
        const li = ul.createEl("li");
        li.createEl("span", { text: item.label, cls: "vault-sync-label" });
        li.createEl("span", {
          text: item.kind === "merge" ? ` merge: ${item.detail}` : ` ${item.kind}`,
          cls: `vault-sync-kind vault-sync-${item.kind}`,
        });
      }
    }

    const warning = contentEl.createDiv({ cls: "vault-sync-warning" });
    warning.setText(
      "Close these vaults in Obsidian before applying — an open vault rewrites its own .obsidian files and will overwrite what you copy in.",
    );

    const buttons = contentEl.createDiv({ cls: "vault-sync-buttons" });
    const apply = buttons.createEl("button", { text: `Apply to ${byVault.size} vault(s)`, cls: "mod-cta" });
    apply.addEventListener("click", () => {
      apply.disabled = true;
      apply.setText("Applying…");
      const result = this.plugin.apply(this.writes);
      if (result.failed.length) {
        new Notice(`Synced ${result.done}, ${result.failed.length} failed:\n${result.failed.slice(0, 3).join("\n")}`, 12000);
      } else {
        new Notice(`Synced ${result.done} file(s). Backups in .obsidian/.vault-sync-backup/`, 8000);
      }
      this.close();
    });

    const cancel = buttons.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class VaultSyncSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: VaultSyncPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    const found = this.plugin.discoverVaults();

    new Setting(containerEl)
      .setName("Target vaults")
      .setDesc(
        found.length
          ? `Found: ${found.join(", ")}. Untick to skip one. Vanguard is permanently excluded.`
          : "No sub-vaults found. This plugin belongs in the umbrella vault that contains the others.",
      )
      .setHeading();

    for (const vault of found) {
      new Setting(containerEl).setName(vault).addToggle((toggle) =>
        toggle
          .setValue(
            this.plugin.settings.targets.length === 0 || this.plugin.settings.targets.includes(vault),
          )
          .onChange(async (value) => {
            const set = new Set(
              this.plugin.settings.targets.length ? this.plugin.settings.targets : found,
            );
            if (value) set.add(vault);
            else set.delete(vault);
            this.plugin.settings.targets = [...set];
            await this.plugin.saveSettings();
          }),
      );
    }

    new Setting(containerEl).setName("What to copy").setHeading();

    for (const file of SYNCABLE_CONFIG) {
      new Setting(containerEl)
        .setName(file)
        .setDesc(
          file === "community-plugins.json"
            ? "The list of ENABLED plugins. Only useful if the same plugins are installed everywhere."
            : file === "app.json"
              ? "Editor and file preferences."
              : "",
        )
        .addToggle((toggle) =>
          toggle.setValue(this.plugin.settings.configFiles.includes(file)).onChange(async (value) => {
            const set = new Set(this.plugin.settings.configFiles);
            if (value) set.add(file);
            else set.delete(file);
            this.plugin.settings.configFiles = [...set];
            await this.plugin.saveSettings();
          }),
        );
    }

    new Setting(containerEl)
      .setName("CSS snippets")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.syncSnippets).onChange(async (value) => {
          this.plugin.settings.syncSnippets = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Themes")
      .setDesc("Larger files; only needed if a sub-vault is missing your theme.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.syncThemes).onChange(async (value) => {
          this.plugin.settings.syncThemes = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Never copied")
      .setDesc(
        `${NEVER_SYNCED.join(", ")} — window layout is per-vault, and graph.json holds each vault's own graph colours.`,
      );

    new Setting(containerEl).setName("Plugins").setHeading();

    for (const id of this.plugin.availablePlugins()) {
      new Setting(containerEl)
        .setName(id)
        .setDesc("Copy the plugin itself into each target vault.")
        .addToggle((toggle) =>
          toggle.setValue(this.plugin.settings.clonePlugins.includes(id)).onChange(async (value) => {
            const set = new Set(this.plugin.settings.clonePlugins);
            if (value) set.add(id);
            else set.delete(id);
            this.plugin.settings.clonePlugins = [...set];
            await this.plugin.saveSettings();
          }),
        )
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.mergeCredentialsFor.includes(id))
            .onChange(async (value) => {
              const set = new Set(this.plugin.settings.mergeCredentialsFor);
              if (value) set.add(id);
              else set.delete(id);
              this.plugin.settings.mergeCredentialsFor = [...set];
              await this.plugin.saveSettings();
            }),
        );
    }

    new Setting(containerEl).setDesc(
      "Left toggle copies the plugin. Right toggle merges only its API-key-ish fields into the target's existing data.json, leaving that vault's other settings alone.",
    );

    new Setting(containerEl).setName("Run").setHeading();

    new Setting(containerEl)
      .setName("Preview and apply")
      .setDesc("Shows every file that would change before anything is written.")
      .addButton((button) =>
        button
          .setButtonText("Preview sync")
          .setCta()
          .onClick(() => this.plugin.openPreview()),
      );
  }
}
