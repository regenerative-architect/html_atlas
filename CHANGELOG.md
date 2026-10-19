# Changelog

All notable changes to the Next-Generation HTML Atlas. Earlier notes are kept in [`docs/history/`](docs/history/).

## 3.0 · October 2026

A comprehensive rebuild of every page, focused on plain language, real working demonstrations, privacy by design, accessibility and calm, human-centred design. Your version 2 progress, notes and tool records carry over automatically: the storage names did not change.

### At a glance

- **69 pages** (was 64): 44 topic labs (was 41) and 24 working tools (was 22), plus the home page.
- **Every lab rewritten** with a plain-language guide and a new working demonstration.
- **Privacy lock on every page**: a Content Security Policy that blocks connections to any other website.
- **New shared design system**, command palette, comfort settings, privacy panel, offline copy, notes, Undo and a breathing pause on every page.
- **New build tool and test suites**, with an automated audit and an accessibility scan of every page.

### New pages

- **Web Components & reusable elements** (lab): a seed-card custom element built from a template with shadow DOM and slots, a form-associated leaf rating made with ElementInternals (value, validation, reset, keyboard radio-group pattern), and a component written in plain HTML with declarative shadow DOM.
- **Background threads & WebAssembly** (lab): the same job on the page or in a Web Worker, in JavaScript or a 129-byte WebAssembly module whose SHA-256 fingerprint is checked before it runs; a heartbeat measures the longest freeze.
- **Sustainable, low-carbon web design** (lab): measures the page with Resource Timing, models a page's make-up, and estimates energy and emissions with the Sustainable Web Design Model (version 4), with adjustable grid intensity and ranked advice.
- **Compassionate message studio** (tool): writes messages from an observation, a feeling, a need and a request; a kindness check flags threats, labels, absolutes, demands and shouting; practice with a rough draft and its kinder rewrite.
- **Mutual aid offers & needs board** (tool): suggests matches by category, area and shared words; flags ended entries; checks for phone numbers, addresses and health details; exports a minimal list that leaves names out unless everyone agreed.

### Rewritten topic labs

Every lab now opens with "Start here, in plain language" (what it is, why it matters for people and planet, three steps to try, real-world uses), followed by a live demonstration built for that topic, worked examples, what the lab covers, how to check it works, limits and safety, and a prompt for building it with an AI assistant. Highlights:

- Security: an injection attack made harmless, with an inert analysis of what `innerHTML` would have run and a readout of the page's own security policy.
- Privacy: an honest consent centre with opt-in purposes, dated history, expiry and one-step withdrawal.
- Cryptography: lock a note with a passphrase (AES-GCM with PBKDF2, 600,000 iterations), tamper detection, fingerprints and unguessable codes.
- Accessibility: live announcements, a contrast checker with example pairs, focus management after deletion, and text that reflows.
- Performance: freeze versus flow, counting screen updates during a long task and the same work in slices.
- Reliability: bounded retries with backoff, jitter, time limits and cancellation, plus a circuit breaker.
- Internationalisation: dates, money, plural rules (up to six forms), collation and right-to-left layout in twelve languages.
- Search, knowledge, RAG and local AI: ranked, explainable search; linked notes; answers with citations or an honest "not found"; a transparent topic sorter.
- Publishing: a printable field guide with structured citations, licences and "print just this guide".
- Hosting: checks the headers a server really sends and writes matching settings for six hosting setups.
- Also rebuilt: semantic HTML, attributes, native pop-ups, forms, layout, colour, motion, architecture, offline drafts and outbox, PWA, storage, file portability, integrity, graph navigation, images, sound, charts, GPU, spatial, agents, AI maintenance, collaboration, decentralisation, communication, maps, sensors, field science and SEO.

### Working tools

- Each tool has a tailored plain-language guide, realistic samples (each click adds the next), checks, limits and an AI prompt.
- **Fixed:** records disappeared from the table after a reload in version 2. They now render on load.
- Saved twice on the device: an instant copy plus an IndexedDB copy that restores records if the quick copy is cleared.
- Delete and "delete all" offer Undo; a storage health panel shows where data lives and when it was last backed up, and can ask the browser to keep it.
- Strict backup restore: checks the tool, record count, field types, dropdown values, dates, ranges and required fields, and changes nothing if anything is wrong.
- Spreadsheet export with a byte-order mark and protection against formula injection.
- Quest completions now travel inside backups. Sample dates can be relative (`today+14`) so examples stay meaningful.
- Example scenarios now use values that exist in each tool's form, and the emergency kit accepts items that do not expire.

### Home page

- A living map of the atlas: every page as a point of light in a sunflower spiral, one Tab stop with arrow-key navigation, glowing when complete, with the followed path drawn as a trail.
- Seven learning paths, a progress dashboard with a gentle learning rhythm (rest days never erase anything), optional badges and levels, an overview of your page notes, and progress backup, restore and reset with Undo.
- A searchable catalog with everyday synonyms and filters for audience and progress; a 67-term glossary with links to the page that demonstrates each term; a learning-circle exchange; a field guide.
- The loading splash screen is gone; a short entrance plays once per visit and never under calm motion.

### On every page

- **Canopy light design:** Night, Day and High contrast themes; frosted or solid panels; ambient fireflies and soft light drawn on a canvas, paused while the tab is hidden and still under calm motion; serif headings; checked colour contrast.
- **Command palette** (Ctrl K or ⌘ K): pages, sections, glossary meanings and actions.
- **Comfort settings:** theme, motion, ambient light, surfaces, four text sizes, relaxed reading spacing, and the option to hide game elements. Applied before the page paints.
- **Privacy panel:** shows the privacy lock, a live count of outside connections (zero), the offline copy, and "erase everything".
- Page notes, a completion checkbox, print or save as PDF, previous and next links, related pages, a one-minute breathing pause, and "look under the hood" to read the page's own code.
- Native page transitions where supported, skipped under calm motion.
- Plain-language page descriptions for search results and link previews.

### Accessibility

- One `h1` and logical heading order on every page; skip link and landmarks; visible focus; live regions for results; text alternatives and data tables for charts.
- Fixed from version 2: a duplicate title on the home page, `aria-controls` pointing at missing elements, navigation triggered by changing a dropdown, a 63-stop keyboard trap in the home map (now a single stop), tables forced to `display:block`, and generic labels.
- axe-core reports no violations on any page in Night and Day themes, nor on the home page in High contrast.

### Privacy, safety and anti-coercion

- Content Security Policy on every page, working from files and from web addresses (including Web Workers and WebAssembly); `no-referrer` on every page; no inline event handlers.
- The footer note is now titled **Zero Harm & Anti-Coercion** (was "Anti-Inversion").
- Tools that hold information about other people minimise it by design, and every tool says plainly what it cannot do.

### Offline and installable

- Service worker: fresh pages first, a saved copy after 3.5 seconds on a poor connection, a cache named after a hash of the content so updates arrive automatically, respect for data-saver mode, and a user-controlled offline copy in the privacy panel.
- Manifest with a stable id, separate "any" and "maskable" icons (SVG and PNG), shortcuts and categories.

### For builders

- `tools/atlas_build.py` keeps shared parts identical across pages, regenerates the catalog-driven parts, the offline list and checksums, and audits every page (`--check`, `--audit`).
- `catalog.json` (schema `html-atlas/3`) adds groups, numbers, audiences and plain-language summaries; `glossary.json` is new.
- New Playwright suites (`tests/`) serve the atlas over HTTP with the real security policy: pages, tools, workflows (including offline use) and accessibility. See [TESTING.md](TESTING.md).
