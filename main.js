"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => VaultSyncPlugin
});
module.exports = __toCommonJS(main_exports);
var import_node_fs = require("node:fs");
var import_node_path = require("node:path");
var import_obsidian = require("obsidian");
var ALWAYS_EXCLUDED = ["Vanguard"];
var NEVER_SYNCED = [
  "workspace.json",
  // window layout, rewritten constantly
  "workspaces.json",
  "graph.json"
  // per-vault graph colours — one hue per vault, deliberately
];
var CREDENTIAL = /key|token|secret|api|password|credential/i;
var SYNCABLE_CONFIG = [
  "appearance.json",
  "app.json",
  "hotkeys.json",
  "core-plugins.json",
  "community-plugins.json"
];
var DEFAULT_SETTINGS = {
  targets: [],
  excluded: [...ALWAYS_EXCLUDED],
  configFiles: ["appearance.json", "hotkeys.json"],
  syncSnippets: true,
  syncThemes: false,
  clonePlugins: [],
  mergeCredentialsFor: []
};
function listDir(path) {
  try {
    return (0, import_node_fs.readdirSync)(path);
  } catch {
    return [];
  }
}
function isDir(path) {
  try {
    return (0, import_node_fs.statSync)(path).isDirectory();
  } catch {
    return false;
  }
}
function readJson(path) {
  try {
    const parsed = JSON.parse((0, import_node_fs.readFileSync)(path, "utf8"));
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}
var VaultSyncPlugin = class extends import_obsidian.Plugin {
  settings = { ...DEFAULT_SETTINGS };
  async onload() {
    await this.loadSettings();
    this.addRibbonIcon("copy", "Sync settings to sub-vaults", () => this.openPreview());
    this.addCommand({
      id: "preview-vault-sync",
      name: "Preview settings sync to sub-vaults",
      callback: () => this.openPreview()
    });
    this.addSettingTab(new VaultSyncSettingTab(this.app, this));
  }
  root() {
    return this.app.vault.adapter.basePath ?? "";
  }
  /** Immediate subfolders that are themselves vaults, minus anything excluded. */
  discoverVaults() {
    const root = this.root();
    const excluded = /* @__PURE__ */ new Set([...this.settings.excluded, ...ALWAYS_EXCLUDED]);
    return listDir(root).filter((name) => !name.startsWith(".")).filter((name) => !excluded.has(name)).filter((name) => isDir((0, import_node_path.join)(root, name, ".obsidian"))).sort();
  }
  /** Plugins installed in this umbrella vault, available to push downward. */
  availablePlugins() {
    return listDir((0, import_node_path.join)(this.root(), ".obsidian", "plugins")).filter((name) => (0, import_node_fs.existsSync)((0, import_node_path.join)(this.root(), ".obsidian", "plugins", name, "manifest.json"))).sort();
  }
  /** Work out every file that would be written, without writing anything. */
  plan() {
    const root = this.root();
    const source = (0, import_node_path.join)(root, ".obsidian");
    const writes = [];
    const chosen = this.settings.targets.length ? this.settings.targets : this.discoverVaults();
    const excluded = /* @__PURE__ */ new Set([...this.settings.excluded, ...ALWAYS_EXCLUDED]);
    for (const vault of chosen) {
      if (excluded.has(vault)) continue;
      const target = (0, import_node_path.join)(root, vault, ".obsidian");
      if (!isDir(target)) continue;
      for (const file of this.settings.configFiles) {
        if (NEVER_SYNCED.includes(file)) continue;
        const from = (0, import_node_path.join)(source, file);
        if (!(0, import_node_fs.existsSync)(from)) continue;
        const to = (0, import_node_path.join)(target, file);
        writes.push({
          vault,
          label: file,
          from,
          to,
          kind: (0, import_node_fs.existsSync)(to) ? "overwrite" : "new"
        });
      }
      for (const [enabled, folder] of [
        [this.settings.syncSnippets, "snippets"],
        [this.settings.syncThemes, "themes"]
      ]) {
        if (!enabled) continue;
        for (const entry of listDir((0, import_node_path.join)(source, folder))) {
          const from = (0, import_node_path.join)(source, folder, entry);
          if (isDir(from)) {
            for (const inner of listDir(from)) {
              const to = (0, import_node_path.join)(target, folder, entry, inner);
              writes.push({
                vault,
                label: `${folder}/${entry}/${inner}`,
                from: (0, import_node_path.join)(from, inner),
                to,
                kind: (0, import_node_fs.existsSync)(to) ? "overwrite" : "new"
              });
            }
          } else {
            const to = (0, import_node_path.join)(target, folder, entry);
            writes.push({
              vault,
              label: `${folder}/${entry}`,
              from,
              to,
              kind: (0, import_node_fs.existsSync)(to) ? "overwrite" : "new"
            });
          }
        }
      }
      for (const id of this.settings.clonePlugins) {
        for (const file of ["main.js", "manifest.json", "styles.css"]) {
          const from = (0, import_node_path.join)(source, "plugins", id, file);
          if (!(0, import_node_fs.existsSync)(from)) continue;
          const to = (0, import_node_path.join)(target, "plugins", id, file);
          writes.push({
            vault,
            label: `plugins/${id}/${file}`,
            from,
            to,
            kind: (0, import_node_fs.existsSync)(to) ? "overwrite" : "new"
          });
        }
      }
      for (const id of this.settings.mergeCredentialsFor) {
        const from = (0, import_node_path.join)(source, "plugins", id, "data.json");
        const sourceData = readJson(from);
        if (!sourceData) continue;
        const fields = Object.keys(sourceData).filter(
          (k) => CREDENTIAL.test(k) && typeof sourceData[k] === "string" && sourceData[k] !== ""
        );
        if (!fields.length) continue;
        const to = (0, import_node_path.join)(target, "plugins", id, "data.json");
        writes.push({
          vault,
          label: `plugins/${id}/data.json`,
          from,
          to,
          kind: "merge",
          detail: fields.join(", ")
        });
      }
    }
    return writes;
  }
  /** Apply a plan. Every overwrite is copied aside first. */
  apply(writes) {
    const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
    const failed = [];
    let done = 0;
    let backupRoot = "";
    for (const write of writes) {
      try {
        (0, import_node_fs.mkdirSync)((0, import_node_path.join)(write.to, ".."), { recursive: true });
        if ((0, import_node_fs.existsSync)(write.to)) {
          backupRoot = (0, import_node_path.join)(this.root(), write.vault, ".obsidian", ".vault-sync-backup", stamp);
          const backupTo = (0, import_node_path.join)(backupRoot, write.label);
          (0, import_node_fs.mkdirSync)((0, import_node_path.join)(backupTo, ".."), { recursive: true });
          (0, import_node_fs.copyFileSync)(write.to, backupTo);
        }
        if (write.kind === "merge") {
          const sourceData = readJson(write.from) ?? {};
          const targetData = readJson(write.to) ?? {};
          for (const key of Object.keys(sourceData)) {
            if (CREDENTIAL.test(key) && typeof sourceData[key] === "string" && sourceData[key] !== "") {
              targetData[key] = sourceData[key];
            }
          }
          (0, import_node_fs.writeFileSync)(write.to, `${JSON.stringify(targetData, null, 2)}
`);
        } else {
          (0, import_node_fs.copyFileSync)(write.from, write.to);
        }
        done++;
      } catch (error) {
        failed.push(`${write.vault}/${write.label}: ${error instanceof Error ? error.message : error}`);
      }
    }
    return { done, failed, backup: backupRoot };
  }
  openPreview() {
    const writes = this.plan();
    new VaultSyncPreviewModal(this.app, this, writes).open();
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    for (const name of ALWAYS_EXCLUDED) {
      if (!this.settings.excluded.includes(name)) this.settings.excluded.push(name);
    }
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
var VaultSyncPreviewModal = class extends import_obsidian.Modal {
  constructor(app, plugin, writes) {
    super(app);
    this.plugin = plugin;
    this.writes = writes;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("vault-sync-modal");
    contentEl.createEl("h3", { text: "Sync settings to sub-vaults" });
    if (!this.writes.length) {
      contentEl.createEl("p", {
        text: "Nothing to sync. Pick target vaults and what to copy in Vault Sync settings."
      });
      return;
    }
    const byVault = /* @__PURE__ */ new Map();
    for (const write of this.writes) {
      const list2 = byVault.get(write.vault) ?? [];
      list2.push(write);
      byVault.set(write.vault, list2);
    }
    const overwrites = this.writes.filter((w) => w.kind === "overwrite").length;
    const summary = contentEl.createDiv({ cls: "vault-sync-summary" });
    summary.setText(
      `${this.writes.length} file(s) across ${byVault.size} vault(s) \xB7 ${overwrites} would be overwritten (backed up first)`
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
          cls: `vault-sync-kind vault-sync-${item.kind}`
        });
      }
    }
    const warning = contentEl.createDiv({ cls: "vault-sync-warning" });
    warning.setText(
      "Close these vaults in Obsidian before applying \u2014 an open vault rewrites its own .obsidian files and will overwrite what you copy in."
    );
    const buttons = contentEl.createDiv({ cls: "vault-sync-buttons" });
    const apply = buttons.createEl("button", { text: `Apply to ${byVault.size} vault(s)`, cls: "mod-cta" });
    apply.addEventListener("click", () => {
      apply.disabled = true;
      apply.setText("Applying\u2026");
      const result = this.plugin.apply(this.writes);
      if (result.failed.length) {
        new import_obsidian.Notice(`Synced ${result.done}, ${result.failed.length} failed:
${result.failed.slice(0, 3).join("\n")}`, 12e3);
      } else {
        new import_obsidian.Notice(`Synced ${result.done} file(s). Backups in .obsidian/.vault-sync-backup/`, 8e3);
      }
      this.close();
    });
    const cancel = buttons.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());
  }
  onClose() {
    this.contentEl.empty();
  }
};
var VaultSyncSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    const found = this.plugin.discoverVaults();
    new import_obsidian.Setting(containerEl).setName("Target vaults").setDesc(
      found.length ? `Found: ${found.join(", ")}. Untick to skip one. Vanguard is permanently excluded.` : "No sub-vaults found. This plugin belongs in the umbrella vault that contains the others."
    ).setHeading();
    for (const vault of found) {
      new import_obsidian.Setting(containerEl).setName(vault).addToggle(
        (toggle) => toggle.setValue(
          this.plugin.settings.targets.length === 0 || this.plugin.settings.targets.includes(vault)
        ).onChange(async (value) => {
          const set = new Set(
            this.plugin.settings.targets.length ? this.plugin.settings.targets : found
          );
          if (value) set.add(vault);
          else set.delete(vault);
          this.plugin.settings.targets = [...set];
          await this.plugin.saveSettings();
        })
      );
    }
    new import_obsidian.Setting(containerEl).setName("What to copy").setHeading();
    for (const file of SYNCABLE_CONFIG) {
      new import_obsidian.Setting(containerEl).setName(file).setDesc(
        file === "community-plugins.json" ? "The list of ENABLED plugins. Only useful if the same plugins are installed everywhere." : file === "app.json" ? "Editor and file preferences." : ""
      ).addToggle(
        (toggle) => toggle.setValue(this.plugin.settings.configFiles.includes(file)).onChange(async (value) => {
          const set = new Set(this.plugin.settings.configFiles);
          if (value) set.add(file);
          else set.delete(file);
          this.plugin.settings.configFiles = [...set];
          await this.plugin.saveSettings();
        })
      );
    }
    new import_obsidian.Setting(containerEl).setName("CSS snippets").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.syncSnippets).onChange(async (value) => {
        this.plugin.settings.syncSnippets = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Themes").setDesc("Larger files; only needed if a sub-vault is missing your theme.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.syncThemes).onChange(async (value) => {
        this.plugin.settings.syncThemes = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Never copied").setDesc(
      `${NEVER_SYNCED.join(", ")} \u2014 window layout is per-vault, and graph.json holds each vault's own graph colours.`
    );
    new import_obsidian.Setting(containerEl).setName("Plugins").setHeading();
    for (const id of this.plugin.availablePlugins()) {
      new import_obsidian.Setting(containerEl).setName(id).setDesc("Copy the plugin itself into each target vault.").addToggle(
        (toggle) => toggle.setValue(this.plugin.settings.clonePlugins.includes(id)).onChange(async (value) => {
          const set = new Set(this.plugin.settings.clonePlugins);
          if (value) set.add(id);
          else set.delete(id);
          this.plugin.settings.clonePlugins = [...set];
          await this.plugin.saveSettings();
        })
      ).addToggle(
        (toggle) => toggle.setValue(this.plugin.settings.mergeCredentialsFor.includes(id)).onChange(async (value) => {
          const set = new Set(this.plugin.settings.mergeCredentialsFor);
          if (value) set.add(id);
          else set.delete(id);
          this.plugin.settings.mergeCredentialsFor = [...set];
          await this.plugin.saveSettings();
        })
      );
    }
    new import_obsidian.Setting(containerEl).setDesc(
      "Left toggle copies the plugin. Right toggle merges only its API-key-ish fields into the target's existing data.json, leaving that vault's other settings alone."
    );
    new import_obsidian.Setting(containerEl).setName("Run").setHeading();
    new import_obsidian.Setting(containerEl).setName("Preview and apply").setDesc("Shows every file that would change before anything is written.").addButton(
      (button) => button.setButtonText("Preview sync").setCta().onClick(() => this.plugin.openPreview())
    );
  }
};
