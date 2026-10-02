# MOSAIC Debug
<<<<<<< HEAD
=======

A local triage tool for people investigating Mosaic issue reports. Open a `mosaic-debug-*.json` dump to inspect the reported environment, mod and plugin inventory, diagnostic signals and changes against an older dump. Signals are leads to compare with symptoms and other debugging evidence, not instructions for players to fix their setup.

Everything runs in the browser. No upload, no account, no server.

Every check runs against the dump you choose. Load a Mosaic debug dump from any platform or setup. Missing or mistyped sections never abort the read — they are reported as schema cautions next to everything that could still be parsed, and invalid JSON is reported with its line, column and nearby text.

## What it helps investigate

- **Overview** — a triage summary of potential leads, the dump context and the inventory.
- **Triage signals** — potential leads with their match rationale, possible relevance, evidence and related entries.
- **Mods** / **Plugins** — the full inventory: search, filter by signal, sort, and open any row for its complete record and related entries flagged by the triage checks.
- **Environment** — application, system, configuration, paths and a plugin checklist.
- **CSS Editor** — persisted files, import metadata, visible and hidden characters. Select a character to inspect its details and costume slots in a dialog. Available with `Alt` + `8`; older dumps show an unavailable state.
- **Raw dump** — the parsed JSON, searchable, with copyable paths.
- **Compare** — load a second dump to see exactly what was added, removed or changed.

Checks currently cover: dump integrity, batch-import duplicates, duplicate folder and mod names, folder collisions, missing or placeholder metadata, free-text categories, run-mode, suspicious paths and the expected `ultimate/mods` and `01006A800016E000/romfs/skyline` folder layouts, the plugin checklist, RAM/CPU/platform and dump staleness.

## Run it locally

The page uses ES modules, so it needs to be served over HTTP (opening `index.html` from the file system will not work).

```bash
node serve.mjs
```

Then open <http://127.0.0.1:4173>. Any static server works, for example `npx serve .` or `python -m http.server 4173`.

## Check the reader

```bash
node tools/selftest.mjs
```

Runs the whole pipeline — normalise, analyse, report and diff — over six deliberately different synthetic fixtures: another app and platform, a minimal dump, wrong types, a JSON array, an empty object and plain text. It prints diagnostic signal counts, and exits non-zero if anything throws, leaks `undefined` into the report or reports two unrelated dumps as identical.

## Publish it

The project has no build step: the folder is the site, and all paths are relative, so it works from a sub-path.

**GitHub Pages** — push the folder to a repository, then *Settings → Pages → Deploy from a branch*, pick your branch and `/root`. The included `.nojekyll` file keeps GitHub from processing the files.

**Codeberg Pages** — push the same folder and serve it from a branch named `pages`; Codeberg publishes it at `https://<user>.codeberg.page/<repo>/`.

Both hosts only need the repository files: `index.html`, `styles/`, `src/`, `assets/`, `data/` and `.nojekyll`.

## Keyboard

| Key | Action |
| --- | --- |
| `/` | Focus the search field of the current view |
| `?` | Help |
| `Alt` + `1…8` | Switch view |
| `J` / `K` | Move between rows |
| `Enter` | Open the focused row |
| `Esc` | Close a dialog or the navigation drawer |

## Project layout

```
index.html            app shell, import map and dialogs
styles/tokens.css     Material 3 tokens: colour roles, shape, motion, elevation
styles/app.css        layout and components
src/model.js          dump normalisation, derived signals and formatting
src/analysis.js       the check engine and diagnostic signal summary
src/diff.js           two-dump comparison
src/report.js         Markdown report generator
src/theme.js          dynamic colour scheme from the seed
src/filters.js        search, filter and sort helpers
src/store.js          state, hash router and load actions
src/ui/               views, dialogs and shared render helpers
serve.mjs             zero-dependency local static server
tools/selftest.mjs    checks six independent synthetic fixtures
```

## Customise

- **Palette** — change `SEED` in `src/theme.js`. The whole scheme (light, dark, contrast levels, surface containers, severity colours) is generated from it with `@material/material-color-utilities`.
- **Checks** — add a rule to `buildFindings` in `src/analysis.js`. A finding is `{ id, rule, family, severity, title, summary, why, impact, count, subjects, evidence, groups }`; `subjects` links to related mods or plugins, `groups` renders a per-group breakdown. Signals are investigative leads, not confirmed causes or player-facing repair instructions.
- **Severity vocabulary** — `critical`, `warning`, `info` and `ok` map to `--mi-crit`, `--mi-warn`, `--mi-info` and `--mi-ok` in `styles/tokens.css`.
>>>>>>> e237efa (Add other files support for mods and plugins, Add entry for CSS editor)

