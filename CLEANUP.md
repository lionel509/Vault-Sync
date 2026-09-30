# Cleanup — Vault Sync

What this repo leaves behind while you work on it, and how to put the working tree
back to what a fresh `git clone` gives you. Companion to the `.gitignore` coverage
added in #1.

Nothing here touches files git tracks. `main.js`, `package-lock.json`, `src/`, the
docs and `styles.css` all stay.

## What this project leaves behind

| path / thing | created by | size note |
|---|---|---|
| `node_modules/` | `npm ci` / `npm install` | ~40–80 MB — esbuild, typescript, `obsidian` typings |
| `graphify-out/` | `graphify update .` in this folder | grows with the repo being graphed |
| `/*— Project Hub.md` | this folder doubles as a note folder in a private vault | one file |
| `.env`, `.env.*` | you, by hand (`OBSIDIAN_VAULT`) | tiny — **kept on purpose**, see Secrets |
| `*.log`, `logs/` | redirected output while building | safe to drop |
| `.tsbuildinfo`, `coverage/` | `tsc --incremental` or a coverage run if you add one | `npm run build` emits neither today |
| `.venv/`, `__pycache__/` | only if a Python helper is added | none exists now |
| `.DS_Store`, `.idea/`, `.vscode/`, `*.swp` | Finder / editors | tiny |

`main.js` is **not** ignored: it is committed on purpose — Obsidian loads it straight
off disk, so a user installs by copying three files and never runs `npm install`.

## Preview

Lists every ignored file the clean below would remove, keeping your secrets:

```bash
git clean -ndX -e '!.env' -e '!.env.*'
```

## Clean the repo

```bash
git clean -fdX -e '!.env' -e '!.env.*'
```

That is everything `git clean` can see. Everything this plugin is *for* happens
outside the repo — three separate things, all manual:

**1 — the umbrella install.** `npm run install-local` copies `main.js`,
`manifest.json` and `styles.css` into `<umbrella>/.obsidian/plugins/vault-sync/`:

```bash
rm -rf ~/Documents/.obsidian/plugins/vault-sync
```

(Use your umbrella's real path if it is not `/Users/lionelweng/Documents`.) Then
remove `"vault-sync"` from the umbrella's `.obsidian/community-plugins.json` and
reload Obsidian.

**2 — what the plugin pushed into the leaf vaults.** Sync writes `appearance.json`,
`hotkeys.json`, `app.json`, `core-plugins.json`, `community-plugins.json`, CSS
snippets, themes, plugin bundles and **merged credential fields** into each target
vault's `.obsidian/`. Removing those means restoring each vault's own prior files —
which is what the backups are for. Nothing in this file deletes them; a sync you
regret is undone file by file, by hand.

**3 — the backups it made while doing so.** Every overwrite is copied first to
`<vault>/.obsidian/.vault-sync-backup/<timestamp>/`, one directory per sync, and they
accumulate. They are the safety net, so treat them as data:

```bash
# list first — never blind-delete these
ls -d ~/Documents/*/.obsidian/.vault-sync-backup/*/ 2>/dev/null
```

When you are confident a sync was fine and you do not need to roll it back:

```bash
rm -rf ~/Documents/<Vault>/.obsidian/.vault-sync-backup
```

Those directories hold copies of `data.json`, i.e. **credential material**. They are
inside your vault, which is the right place for them — but do not zip a vault and
share it without checking that folder.

After a clean, restore dependencies with `npm ci` and rebuild with `npm run build`.

## Outside the repo

| thing | exact command | shared? |
|---|---|---|
| `<umbrella>/.obsidian/plugins/vault-sync/` | `rm -rf` the path in step 1 | yours alone; the umbrella is not shared with other projects. |
| `.vault-sync-backup/<timestamp>/` in each target vault | list, then `rm -rf` per vault (step 3) | **per-vault, manual, optional — and deliberately not automated.** |
| pushed settings/snippets/credentials in leaf vaults' `.obsidian/` | restore per file, by hand | never automated — undoing a sync is a judgement call. |
| npm's download cache, filled by `npm ci` | `npm cache clean --force` | **shared — every Node project on this Mac uses it.** Only worth it for the disk; it costs a re-download next time. |

Nothing else. No pip packages, no model weights, no Playwright browsers, no Docker
images, no launchd plists: the build installs into `node_modules/` only.

## Secrets

`.env`, `.env.*`, `*.key`, `*.pem`, `credentials.json` and `secrets.json` are ignored
**and deliberately kept** by both commands above — the `-e '!.env' -e '!.env.*'`
exceptions mean `git clean` skips them. Your local secrets survive a cleanup.

Worth being blunt about in this repo in particular: **Vault Sync's whole job is
moving credentials between vaults.** The credential fields it merges
(`/key|token|secret|api|password|credential/i` over non-empty strings) live in each
vault's plugin `data.json`, under `.obsidian/` — never here. This repo should hold no
credential at all. If you ever find one in a tracked file, rotate it first and open an
issue; deleting the line is not enough, because it is in history.

If you truly mean to get rid of a secret file, remove it yourself and mean it:

```bash
rm -f .env .env.*
```

Never run that inside a vault.
