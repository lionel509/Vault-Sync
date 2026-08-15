# Vault Sync

An Obsidian plugin for an **umbrella vault** — a vault whose folder physically contains
other vaults — that pushes settings, snippets, plugins and plugin credentials *downward*
into the vaults nested inside it. Configure a preference once instead of seven times.

The umbrella folder is the one place that can see every vault at once, so it's the
natural place to configure from.

## Safety, because this writes into other vaults

This plugin's whole risk profile is that it writes into vaults you aren't looking at. So:

- **Nothing happens without a preview.** A modal lists every file, marked `new` /
  `overwrite` / `merge`, before anything is written.
- **Every overwrite is backed up first**, to
  `<vault>/.obsidian/.vault-sync-backup/<timestamp>/`.
- **Everything lands inside `<vault>/.obsidian/`.** No planned write escapes that path.
- **Vaults can be excluded permanently.** The exclusion list is checked inside `plan()`,
  not merely defaulted in settings — naming an excluded vault as an explicit target still
  produces zero writes. Verified by test. Edit `ALWAYS_EXCLUDED` in `src/main.ts` to set
  your own.
- **Some files are never copied** — `workspace.json` and `workspaces.json` (window
  layout), and `graph.json`, since a vault's graph colours are usually its own.

> **Close the target vaults first.** An open vault rewrites its own `.obsidian` files
> from memory, so syncing into a vault that's currently open is silently undone.

## What it can copy

| Item | Notes |
|---|---|
| `appearance.json` | theme, fonts |
| `hotkeys.json` | keyboard shortcuts |
| `app.json` | editor and file preferences |
| `core-plugins.json` | which built-ins are on |
| `community-plugins.json` | which community plugins are **enabled** — only useful where the same plugins are installed |
| CSS snippets | the whole folder |
| Themes | off by default, large |
| Plugin bundles | `main.js` / `manifest.json` / `styles.css` per selected plugin |
| Plugin credentials | merged, not overwritten — see below |

### Credentials are merged, not overwritten

Copying a whole `data.json` would replace the target vault's settings for that plugin.
Instead, only fields whose names look like credentials — `key`, `token`, `secret`, `api`,
`password`, `credential` — and which hold a non-empty string are merged in. Everything
else in the target file is left alone.

Note the direction of travel: this pushes *down* from the umbrella, so a key that lives
in a leaf vault has to be copied up before it can be distributed.

## Build and install

`main.js` is committed, so nothing needs installing to use the plugin.

```bash
npm ci                                   # exact restore from package-lock.json
OBSIDIAN_VAULT=/path/to/umbrella npm run install-local
```

`install.mjs` installs to the umbrella vault **only** — the plugin is meaningless in a
leaf vault, since it has nothing below it to push to. `OBSIDIAN_VAULT` overrides the
target; without it the script falls back to the author's own path.

Then reload the vault and enable **Vault Sync** in Community Plugins.

## Layout

| Path | What |
|---|---|
| `src/main.ts` | the whole plugin — discovery, planning, apply, preview modal, settings |
| `install.mjs` | installs to the umbrella vault |
| `esbuild.config.mjs` | bundler config |

## Known gaps

- **Push only.** Copying *up* from a leaf vault would make the umbrella the source of
  truth; right now sync is one-directional.
- **No diffing.** A file is marked `overwrite` whether or not its contents actually
  differ. Comparing first would make previews much quieter.
- **Enabled-plugin lists are risky.** Syncing `community-plugins.json` into a vault that
  lacks one of those plugins leaves it referencing something that isn't installed.

## License

MIT
