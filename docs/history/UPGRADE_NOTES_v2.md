# Upgrade notes — advanced-features pass (September 2026)

This pass verified the V2 package end-to-end and then added the features
below. It was done by hand plus scripts (not the original generator), so it
is documented separately from `verification_v2.json`, which describes that
build's own pipeline and still applies to everything it covered.

## Verification performed on the original V2 package
- SHA-256 of every shipped file matched `SHA256SUMS.json` exactly: nothing
  was corrupted or altered before this pass began.
- All 128 inline `<script>` blocks across all 64 pages parsed with
  `node --check` (0 syntax errors).
- All 517+ local `href`/`src` references resolved to real files (0 broken
  links; the one flagged candidate was demo text inside a textarea, not an
  actual reference).
- 0 secrets, private keys, or hard-coded credentials found by pattern scan.
- 0 real third-party telemetry/analytics calls (one flagged candidate was
  the word "amplitude" used in its audio-signal sense, not the SDK).
- 0 runtime external dependencies outside three inert documentation links.
- noscript fallback, print stylesheet, `lang` attribute, viewport meta, skip
  link and a `<main>` landmark were already present on all 64/64 pages.
- Every one of the 64 pages was executed in a real DOM (jsdom + a real
  IndexedDB implementation, not a mock), with its "mark complete" control
  exercised, to catch runtime errors static checks can't see. This surfaced
  six real (pre-existing, minor) issues, fixed below.

## Fixed
- `labs/gpu.html`, `labs/images.html`, `labs/visualization.html`: each
  called `canvas.getContext('2d')` and used the result without checking it
  first. Always succeeds in a real browser, but now guarded (`if(!x)return`)
  rather than assumed.
- `labs/hosting.html`, `labs/pwa.html`, `labs/security.html`: referenced the
  bare `isSecureContext` global with no fallback if it's ever unavailable;
  now falls back to `location.protocol==='https:'`.

## Added (all 64 pages)
- A short Zero-Harm & Anti-Inversion note, as both an HTML comment near the
  top of the file and a visible line in the footer.
- Page state (completion, notes, HUD data) now persists to IndexedDB first,
  with an automatic, one-time migration of anyone's existing localStorage
  progress, and a transparent localStorage fallback/mirror if IndexedDB is
  unavailable. Verified with a real (fake) IndexedDB implementation across a
  fresh install, a legacy-data migration, and a second load reading from
  IndexedDB alone with localStorage cleared.
- A visit-streak tracker (local date comparison only) feeding the index
  page's HUD, updated from whichever page you actually open that day.
- A gentle client-side pacing guard on save/search/import controls.

## Added (index.html only)
- Animated, skippable splash screen; inert and instant under
  `prefers-reduced-motion`, never shown to no-JS visitors.
- An expanded gamification HUD: level (from existing XP), visit streak, and
  seven milestone badges, layered on the existing progress/XP mechanism.
- A constellation map: every one of the 64 pages as one star around a
  central hub, built from the page's own already-rendered listing (no extra
  fetch), color-coded by category and completion, keyboard-navigable, each
  star a real link.
- A long-form section built with a CSS-only (no JS) layered-parallax
  technique, flattened under `prefers-reduced-motion`, narrow viewports and
  print. Copy is addressed to the two audiences the rest of this project
  targets: procurement/policy readers and classroom use.
- Progress export/import now carries HUD data too (schema bumped to
  `atlas-progress/2`; old `atlas-progress/1` files still import correctly).

## Not changed / deliberately out of scope
- The 22 integrations' own record storage (each its own `localStorage`
  key) was left as-is. It already works, is internally consistent, and
  converting 22 independently-authored tools to IndexedDB safely is a
  larger, separately-verifiable piece of work than this pass; flag specific
  ones if you want that done next.
- No color/typography changes: this package's existing dark
  teal/mint/gold palette was kept rather than overwritten with a different
  house style, since nothing here asked for that and it already reads
  cleanly.
- `sw.js`'s cache name was bumped (`foster-navi-atlas-v2` →
  `foster-navi-atlas-v2-1`) purely so installed/offline users get all 64
  updated pages precached together on their next online visit, instead of
  one at a time as each is revisited. No other service-worker logic changed.

## Re-verification after the changes above
- Full corpus re-run of every check in the first section: still 0 syntax
  errors, 0 broken links, 0 secrets, 0 telemetry, 0 external runtime deps.
- All 64 pages re-executed in a real DOM with the completion checkbox
  exercised: 0 runtime errors.
- index.html specifically exercised further: search/filter, export,
  import (both schema versions), notes save, progress reset, and the
  splash-dismiss focus handoff — all behave as intended, including a race
  condition between two completion-tracking listeners that surfaced during
  this testing and was fixed (state-change is now event-driven off a
  successful save, rather than two independent listeners reading state on
  the same click).

---

# Upgrade notes — navigation & examples pass (September 2026, cont.)

## Added (all 64 pages)
- A sticky sidebar table of contents, built at load time by scanning each
  page's own `section > h2` headings \u2014 no page needed hand-authored TOC
  data, and a page gains a new sidebar entry automatically the moment a
  new `<section><h2>\u2026` is added to it (this is how the six enriched labs
  below picked up a "More worked examples" entry with no extra wiring).
  Includes scroll-spy highlighting (IntersectionObserver) and collapses to
  a toggle button below 900px width; hidden in print.
- A "Jump to a page" menu in the top bar (native `<select>`, grouped into
  Topic labs / Integrations), populated from an embedded page list so any
  page can link straight to any other without returning to the index grid.
  Relative paths are computed from the existing `data-sw` attribute rather
  than hard-coded, so the one shared script works unmodified at both the
  root and one directory deep.
- A between-page transition: clicking an internal link shows a brief
  (380ms) canvas-drawn starfield-and-nebula overlay with drifting,
  twinkling particles before navigating, instead of an instant blank
  reload. This is a procedural canvas effect, not an embedded photograph
  \u2014 keeping every page dependency-free and this addition to only a few
  KB per file. Skipped entirely under `prefers-reduced-motion` (instant,
  ordinary navigation instead), and falls back to immediate navigation if
  canvas is unavailable for any reason \u2014 the link always still works.
  Only intercepts left-clicks on same-origin links to a different page;
  same-page `#anchor` clicks (including the new sidebar's own links),
  modified clicks, and `target="_blank"` links are all left alone.
- `index.html`'s layout was restructured to a sidebar+main flex layout to
  match; its own eight top-level sections (dashboard, constellation,
  guide, field guide, search, labs, integrations, about) now populate the
  same sidebar mechanism.

## Added (six labs, as a first batch)
`semantic-html`, `css-layout`, `cryptography`, `storage`, `accessibility`
and `agents` each gained a new "More worked examples" section: three
additional, distinct, technically-checked code examples per lab (a native
`<dialog>`/accessible table/breadcrumb for semantic HTML; a holy-grail
grid/auto-fit card grid/container query for CSS layout; SHA-256/AES-GCM/
HMAC for cryptography; versioned IndexedDB migration/quota estimation/
BroadcastChannel sync for storage; a custom switch/live region/focus
management for accessibility; a planner-executor loop/structured-output
validation/human-confirmation gate for agents), each in a collapsible
`<details>` with a short explanation and an expected outcome. These are
reference code shown in `<pre><code>` \u2014 like the rest of this section \u2014
not additional live interactive widgets layered onto the existing demo.
Chosen to span foundational HTML, styling, security, data, accessibility
and emerging/agentic topics; the remaining 35 labs have not been touched
yet and are the natural next batch if you want the same treatment there.

## Verification performed
- Every new HTML insertion point (top-bar nav, sidebar wrapper open/close,
  style-block boundary) was confirmed present exactly once, consistently,
  across all 64 files before any file was changed, the same way the
  Zero-Harm pass was verified last time.
- Re-ran the full static audit (link/secret/telemetry/syntax scan) and a
  from-scratch HTML tag-balance parse across all 64 files: clean.
- Re-executed all 64 pages in a real DOM (jsdom + real fake-IndexedDB),
  this time also asserting every page has a populated sidebar, a 60+
  option jump menu, and the transition overlay element: all present, 0
  runtime errors.
- Separately mocked a working `CanvasRenderingContext2D` to exercise the
  actual paint path the browser will use (jsdom itself has no real canvas
  implementation) and confirmed the overlay activates and draws via
  `createRadialGradient`/`arc` calls as designed.
- Re-ran the turn-1 test suite (HUD, constellation, splash, IndexedDB
  migration, a second load reading IndexedDB alone) unchanged: still 0
  errors, confirming this pass did not regress the previous one.
- Checked the 13 new global identifiers this pass introduces against
  every page's own bespoke second script for name collisions (a risk
  `node --check` cannot catch, since it validates each `<script>` block
  independently rather than as the combined global scope a real page
  actually runs in): 0 collisions.

---

# Upgrade notes — full example coverage (September 2026, cont.)

## Added
The remaining 35 topic labs (everything except the six covered in the
previous pass \u2014 semantic-html, css-layout, cryptography, storage,
accessibility, agents) each received the same "More worked examples"
treatment: three additional, technically-checked, distinct examples in
collapsible `<details>`, with a short explanation and expected outcome
each. All 41 topic labs now have this section; the 22 integrations do
not (their existing interactive tool already serves that role).

Examples span each lab's actual subject rather than a generic template:
native `inert`/popover/datalist for html-attributes and native-interaction;
FormData/custom-validity/staged-fieldset validation for advanced-forms;
OKLCH scales/`light-dark()`/`@property` for visual-styling; Web
Animations/reduced-motion wrapping/View Transitions for motion; a finite
state machine/custom events/`structuredClone` for javascript-architecture;
connectivity events/an outbox queue/flush-on-reconnect for offline-first;
`beforeinstallprompt`/standalone detection/update banners for pwa; the
File System Access API/drag-drop validation/minimal schema checks for
file-portability; SHA-256 drift detection/hash-chaining for integrity;
term-frequency ranking/safe highlight rendering for search; backlink
indexing/fact-vs-hypothesis tagging/graph traversal for knowledge;
circular layout/keyboard nav/text-equivalent lists for graph-navigation;
canvas resize-to-blob/`createImageBitmap` for images; oscillator tones/
MediaRecorder/device enumeration for audio-video; error bars/paired data
tables/linear regression for visualization; capability-tiered fallback/
delta-time animation loops for gpu; CSS 3D flips/`matrix3d()`/WebXR
detection for spatial; Prompt-API availability checks/deterministic
fallback for local-ai; overlapping chunking/keyword retrieval/explicit
"insufficient evidence" declines for rag; missing-alt-text/complexity/
dead-function heuristics for ai-maintenance; BroadcastChannel presence/
last-writer-wins/non-clobbering merges for collaboration; content
addressing/exchange packages/integrity verification for decentralization;
safe message rendering/debounced drafts/flag-for-human-review (never
auto-delete) for communication; haversine distance/GeoJSON/flat-map
projection for geospatial; consent-framed geolocation/Permissions-API
pre-check/orientation fallback for sensors; unit conversion/quality
flagging/moving-average smoothing for field-science; Trusted Types/secure-
context guards for security; consent records/retention purge/data
minimization for privacy; `performance.mark`/budget checks/idle-time
chunking for performance; backoff retry/abortable timeout/circuit breaker
for reliability; title-description-canonical/JSON-LD/robots meta for seo;
`Intl` date/currency/relative-time formatting for i18n; print page-break
control/printed URLs/structured citations for publishing; and hosting-
context detection/deployment-version checks/a security-headers reference
for hosting.

## Verification performed
Same method as every prior pass, run again across the full, now-complete
corpus: the insertion anchor was confirmed present exactly once in all 35
files before any were touched; every new JS snippet was syntax-checked in
isolation before insertion; a full static audit and a from-scratch HTML
tag-balance parse ran clean across all 64 files afterward; and all 63
spoke pages were re-executed in a real DOM (jsdom, real fake-IndexedDB),
confirming 0 runtime errors and a populated sidebar, jump menu, and
transition overlay on every one \u2014 not just the six from the previous
pass. Spot-checked several of the newly enriched pages individually to
confirm their new section is picked up by the sidebar automatically, with
no per-page wiring, exactly as designed.

## Scope note
These are reference code examples in `<pre><code>` \u2014 read, copy, and
adapt \u2014 not additional live interactive widgets layered onto each lab's
existing hands-on demo, consistent with the first six and with how this
section was scoped from the start.

---

# Upgrade notes — integration example scenarios (September 2026, cont.)

## Added
All 22 integrations gained a "More example scenarios" section \u2014 the
parallel enrichment to the labs' worked-code-examples, in a format that
actually fits what integrations are. Labs teach a web-platform concept, so
their examples are runnable code. Integrations are finished practical
tools (a record editor with specific fields), so their examples are three
realistic usage scenarios each: a short narrative of who is using the
tool and why, concrete sample values for that tool's actual fields (not
generic placeholders \u2014 checked against each tool's real `<label>` text
first), and a closing note on what the scenario demonstrates or how to
extend it. This is deliberately more detailed than the existing one-click
"Add illustrative example" button already on every integration, which
just fills every field with a generic "<label> sample" placeholder.

Scenarios consistently draw on the same real-world contexts this
project's other platforms target \u2014 citizen-scientists, land managers,
policy researchers, educators, small civic and cooperative teams \u2014 rather
than generic business examples, so the atlas reads as one coherent body
of work rather than 63 unrelated demos. A few scenarios deliberately
cross-reference a different integration or lab where the real workflow
would actually continue there (e.g. offline-archive's claim-vs-observation
scenario points to evidence-ledger for the verification step).

## Verification performed
Same method as every prior pass: the insertion anchor was confirmed
present exactly once in all 22 files before any were touched; a full
static audit and from-scratch HTML tag-balance parse ran clean across all
64 files afterward; all 63 spoke pages were re-executed in a real DOM,
confirming 0 runtime errors; and the sidebar was spot-checked to confirm
"More example scenarios" is picked up automatically in the correct
document position on multiple integrations, with no per-page wiring \u2014
the same generic heading-scan mechanism built in an earlier pass, now
exercised by a second, differently-shaped kind of content with no changes
needed to make it work.

## Current state
Every one of the 64 pages (41 labs, 22 integrations, 1 index) now carries
a substantive examples/scenarios section discoverable through the sidebar
this project added earlier \u2014 full symmetric coverage across the entire
atlas.

---

# Upgrade notes — real-browser QA pass (October 2026)

Earlier passes tested in a simulated DOM (jsdom), which has no layout, no real canvas, no print rendering and no service worker, and never ran this project's own test suites. This pass used a real headless Chromium (153) over HTTP, axe-core, and the project's own Playwright suites. It found real defects, listed here with how each was confirmed.

## Fixed
- **Hub: the "Skip to content" link stayed visible over the header for every visitor.** After the splash screen closed, focus was handed to the skip link, and `.skip:focus` is what reveals it. Focus now goes to `<main tabindex="-1">` (without scrolling). Confirmed by screenshot, and by asserting the link is off-screen and `<main>` holds focus.
- **Print output was unreadable on all 64 pages (a defect in the original package).** `.callout`, form controls, `.meter` and `.chart` use hard-coded dark backgrounds, so the print override that flips the theme colours turned their text dark on a still-dark background. Added print overrides; verified with print emulation and computed colours.
- **Hub: the constellation `<svg>` was marked `role="img"` while containing clickable links** (axe: nested-interactive, serious). It is now `role="group"` and its label says each star is a link.
- **`labs/images.html`: an unescaped `<img>` in one of the worked-example headings I wrote earlier was parsed as a real, empty image** (axe: image-alt, critical). Escaped. A scan of every authored heading and paragraph in all 63 pages found no other case.
- **Search lagged by 150 ms on the first keystroke** (a trailing-edge debounce added in an earlier pass; surfaced by this project's own `master index cross-lab specialty search` test). Replaced by a leading-plus-trailing coalescer: the first input filters at once, a burst of typing collapses into one extra pass.
- **The completion checkbox could disagree with saved state.** A second change inside the 300 ms rate-limit window was silently dropped, so a quick double click left the box unchecked while storage (and the progress bar) said the page was complete. The same coalescer now guarantees the final action wins. Affected all 64 pages.
- **Overlapping read-modify-write cycles on the shared state could erase each other** (20 concurrent writers left 1 survivor in an unlocked baseline). All state writes, including the hub's import, save-notes and reset handlers, now run through a small serialising lock; a failing task does not block the queue. With the lock, all 20 writes plus the streak update survive.

## Shipped test suite
- All three scripts crashed on every run at their final line (`Path(...)/'x.json'.write_text(...)` calls `write_text` on a string), so results were never saved, two of them never printed their summary, and each exited non-zero even when everything passed. Fixed.
- `JSON backup export clear restore` raced the asynchronous import (it counted rows a few milliseconds before the import finished, so it failed randomly: 1 in 12 runs on the original package, more often on a slower machine). It now waits for the state it asserts; 4 consecutive clean runs.
- `CHROMIUM_PATH` environment variable added so the suites run on machines without `/usr/bin/chromium`.
- Added two regression tests for the checkbox and lock fixes, and an optional axe-core test (`tests/test_a11y.py`). Each new test was shown to fail when its bug is put back in a scratch copy.

## Verified (final package)
All 64 pages in real Chromium: no console or page errors, 0 axe-core violations, completion checkbox persists and un-persists correctly on every page, no image without alt text. Hub: splash then focus on `<main>`, skip link off-screen, 63-star constellation, instant search, rapid-toggle convergence, state lock stress test, service worker active with 69 precached entries, reload and page-to-page navigation fully offline, print emulation readable, page transition lands on the clicked page in about 0.4 s. Project suites: topics 41/41, integrations 32/32, workflows 19/19 (four consecutive runs), accessibility 64/64.

## Checked and not a defect
`labs/hosting.html` shows an aborted `HEAD` request in DevTools. The lab reads the response correctly (status 200, content type, CSP "not reported"): DevTools marks any body-less `HEAD` fetch as aborted, and the service worker deliberately ignores non-GET requests. The original package behaves identically.

## Limits of this verification
One browser engine (headless Chromium 153). Firefox and Safari were not tested. axe-core detects only part of what accessibility problems exist, and no screen-reader testing was done.
