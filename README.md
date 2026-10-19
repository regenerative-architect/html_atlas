# Next-Generation HTML Atlas

**Version 3.0 · October 2026 · by Foster + Navi · MIT licence**

A portable, offline-first atlas of the modern web, made for people and the planet. It has **69 pages**: a home page, **44 topic labs** that explain one web technology each with a live demonstration, and **24 working tools** you can use for real community, field and public work. Every page is a single HTML file that runs on your own device, keeps working without a connection, and keeps what you type private.

> **Zero Harm & Anti-Coercion.** The atlas is built to inform and empower. It never tracks you, never pressures you, and never sends anything anywhere unless you choose to. Using it to manipulate, surveil, coerce or harass anyone goes against its purpose.

---

## Start in a minute

1. Unzip the folder anywhere: your computer, a USB stick, a shared drive.
2. Open **`index.html`** in any modern browser (Chrome, Edge, Firefox or Safari).
3. Pick a learning path, browse the catalog, or press **Ctrl K** (**⌘ K** on a Mac) to search everything, including the meaning of technical words.

That is all. There is no account, no installation and no internet requirement.

**Want the full offline copy?** Serve the folder from a web address (any static host, or `python3 -m http.server 8000` on your own computer, then open `http://localhost:8000/`). The atlas then saves every page in your browser so it opens even with the network switched off. Opened straight from files, each page still works; only the "save everything for offline" feature needs a web address.

---

## What is inside

| Part | Count | What it is |
|---|---|---|
| Home page (`index.html`) | 1 | Learning paths, a living map of the atlas, your progress dashboard, a searchable catalog, a 67-term plain-language glossary, a learning-circle exchange, and a field guide. |
| Topic labs (`labs/`) | 44 | One technology each: a plain-language guide ("what it is, why it matters, try it in three steps"), a live demonstration, worked examples, checks, limits and a ready-to-use prompt for building it yourself. |
| Working tools (`integrations/`) | 24 | Local-first record keepers with a purpose-built workbench each: from an edible garden planner and a field survey to a mutual aid board and a compassionate message studio. |

**New in version 3:** labs on Web Components, background threads and WebAssembly, and sustainable low-carbon web design; tools for compassionate (nonviolent) communication and mutual aid. Every existing lab was rewritten with a plain-language guide and a fresh, working demonstration. See [CHANGELOG.md](CHANGELOG.md).

### Seven learning paths

| Path | For |
|---|---|
| Web foundations for everyone | Curious beginners, volunteers, anyone who wants to understand good web pages |
| Teacher and classroom | Teachers, students and youth leaders |
| Field researcher and land steward | Restoration crews, citizen scientists, gardeners with patchy connections |
| Community organizer and mutual aid | Neighbourhood groups, co-ops and mutual-aid networks |
| Policy, procurement and public service | People who choose, buy, audit or oversee digital tools for the public |
| Responsible AI and knowledge | Anyone using or evaluating AI tools |
| Builder: the modern platform | Developers and makers building fast, resilient, dependency-free tools |

---

## Privacy and safety, built in

- **Privacy lock on every page.** Each page carries a Content Security Policy that tells your browser to refuse connections to any other website. The privacy panel (the lock in each page's footer) shows the policy is on and how many outside connections the page has made since it opened: zero.
- **No tracking of any kind.** No analytics, cookies, accounts, fonts or scripts from elsewhere. Outside reference links only open when you click them and send no referrer.
- **Your data stays with you.** Progress, notes, settings and tool records live in this browser on this device. Every tool exports a JSON backup and a spreadsheet (CSV, with protection against spreadsheet formula tricks), and restores backups only after strict checks.
- **You stay in control.** "Erase everything" in the privacy panel removes all atlas data from the browser, including the offline copy. Deleting a record or resetting progress offers Undo.
- **Care for other people's data.** Tools that hold information about others minimise it. The mutual aid board asks for a general area instead of an address and a first name or initials, puts an end date on every entry, checks notes for phone numbers and addresses, and shares lists without names unless everyone agreed. The field survey asks for site labels, never private addresses, and the privacy workbench helps you decide what not to collect at all.
- **Honest limits.** Every page says what it cannot do. Labs on security, privacy and cryptography are teaching tools, not audited software.

## Comfort and accessibility

Open **Comfort settings** (the sliders icon at the top of every page) to choose:

- Night, Day or High contrast themes (or match your device)
- Calm motion, which stops animations and page transitions
- Ambient light on, gentle or off (the drifting fireflies behind the glass)
- Frosted or solid surfaces
- Four text sizes and relaxed reading spacing
- Whether to show the progress game (levels, badges, learning rhythm). Rest days never erase anything.

Every page has a skip link, landmarks, one main heading, keyboard access to every control, visible focus, live announcements for results, text alternatives for charts, print styles, and a one-minute breathing pause. Automated scans (axe-core) report no violations on any page in the Night and Day themes, or on the home page in High contrast; see [TESTING.md](TESTING.md) for what automation cannot check.

---

## For builders: how the bundle works

Each page is self-contained, yet the parts shared by every page live once in `tools/shared/`:

| File | What it holds |
|---|---|
| `atlas.css` | The "Canopy light" design system: tokens, themes, glass panels, components, print styles |
| `atlas.js` | The runtime: storage, command palette, comfort settings, privacy panel, notes, toasts, ambient light, learning paths |
| `boot.js` | A tiny first script that applies saved settings before the page paints (no flash of the wrong theme) |
| `engine.js` | The record engine shared by all 24 tools: saving (localStorage plus an IndexedDB copy), edit, Undo, import checks, CSV, storage health |
| `head.html`, `top.html`, `sidebar.html`, `actions.html`, `notes.html`, `footer.html` | Shared markup regions |
| `sw.js` | The service worker template (network-first, with a saved copy for offline use) |

`tools/atlas_build.py` (Python 3.9+, standard library only) copies those shared parts into every page between marked regions, regenerates the "On this page" lists, previous/next and related links, the home page catalog, paths and glossary, the offline list with a content-hash version, and `SHA256SUMS.json`. It then audits every page: one `h1` and one `main`, unique ids, no inline event handlers, no external scripts, working local links, the privacy lock, the Zero Harm note, and no secrets or telemetry.

```sh
python3 tools/atlas_build.py            # sync shared parts, regenerate, audit
python3 tools/atlas_build.py --check    # show what would change (exit 1 if anything would)
python3 tools/atlas_build.py --audit    # audit only
```

**Editing a page.** Change anything outside the marked regions directly in the page; the build tool never touches it. Change shared parts in `tools/shared/` and run the build.

**Adding a lab or a tool.** Copy a similar page, give it a new file name, add an entry to `catalog.json` (id, title, summary, tags, audiences, a plain-language `plain` line), then run the build. For a tool, edit its `INTEGRATION_CONFIG` (fields and samples) and its workbench script. Sample dates may be written `today+14` so examples stay current.

**Data formats.** Tool backups use `atlas-integration/1`, progress files `atlas-progress/3`, learning-circle cards `atlas-circle-card/1`. Version 2 data carries over: the storage names did not change.

## Testing

Four Playwright suites in `tests/` serve the atlas locally and check every page, tool and feature in a real browser: page loading (73 checks), the tools and their workbenches (47), atlas-wide workflows including offline use (14), and an axe-core accessibility scan of every page in two themes (139). Run them with `python3 tests/run_all.py`. Details, results and the manual checks that still matter are in [TESTING.md](TESTING.md).

## Folder map

```
index.html                 the home page
labs/                      44 topic labs
integrations/              24 working tools
assets/                    icons (SVG and PNG, including maskable)
catalog.json               every page, path and audience (schema html-atlas/3)
glossary.json              plain-language glossary (html-atlas-glossary/1)
manifest.webmanifest       install details for the app version
sw.js                      offline helper (generated)
SHA256SUMS.json            checksums for every file (generated)
tools/                     build tool and shared parts
tests/                     automated test suites and their latest results
docs/history/              notes from version 2
README.md  CHANGELOG.md  TESTING.md  LICENSE  verification_v3.json
```

## Licence and credits

Original educational code and writing by Foster + Navi under the [MIT licence](LICENSE). No third-party code is bundled. Standards and browser features are named descriptively. The compassionate message studio is inspired by Nonviolent Communication, developed by Marshall B. Rosenberg. The sustainable web lab uses the published Sustainable Web Design Model (version 4) and links to the W3C Web Sustainability Guidelines.

This is an educational reference, not certified professional software. Browser storage is not a backup, so export anything that matters.
