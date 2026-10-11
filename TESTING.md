# Browser acceptance and regression tests

1. Unzip and open `index.html`; verify 41 topic links, 22 integration links, and index = 64 HTML pages.
2. Search `privacy`, filter to integration labs, then clear the query; verify correct visibility/count.
3. Mark a page complete, return to index, verify progress count increases. Export progress JSON and import it into a freshly reset index.
4. Open `labs/advanced-forms.html`, try invalid input, then valid input; verify structured FormData.
5. Open `labs/storage.html`; write and read an IndexedDB record (file:// behavior can vary).
6. Open `labs/security.html`; supply `<img src=x onerror=alert(1)>` and verify it is shown as text, never executed.
7. Open `integrations/offline-archive.html`; create, edit, search, export, reload, delete and re-import a record.
8. Open `integrations/map-notebook.html`; save valid coordinates, verify an SVG marker, export GeoJSON and check `[lon, lat]` order.
9. Run `python -m http.server 8000`, open `http://localhost:8000/`, wait for service worker to control navigation, visit any lab, disconnect network, reload the visited lab.
10. Test each page at 320px width, 200% zoom and with keyboard-only navigation; test Windows high-contrast and reduced-motion when available.
11. Test protected APIs with denied permissions; verify clear errors and no automatic requests.
12. Inspect network requests for unexpected third-party calls; verify exports, imports and updates remain local.

Static validation and JavaScript syntax checks are generated in `verification.json` by the build pipeline; manual cross-browser tests are still required. WebXR, hardware integrations, browser built-in AI, actual remote networking, full application security and screen-reader usability are *not* automatically validated by those checks.

## V2 specialty workflows to check
Every integration now provides one functional, domain-specific workbench. Check: archive backlinks, garden area scenarios, quest completion, unit-aware field surveys, evidence review, inventory priority, governance stage filtering, map distances, motif analysis, transcript export, uncertainty grouping, accessibility failure triage, privacy minimization, signed-if-available exchange manifest, Kanban transitions, paired monitoring changes, deterministic unit conversion, AI evaluation denominator, deployment evidence gating, supply expiry, skill crosswalk and publication metadata gating. Browser automation test results are summarized in verification_v2.json; a separate full accessibility, security, and cross-browser audit is still needed.

## Automated suites (`tests/`)

Needs `pip install playwright` and a Chromium: either `/usr/bin/chromium` or set `CHROMIUM_PATH=/path/to/chromium`. Each script exits 0 on success, 1 on any failure, and writes `tests/results_*.json`.

| Command | What it checks |
| --- | --- |
| `python3 tests/test_topics.py` | every one of the 41 topic labs loads, runs its demonstration and raises no page error |
| `python3 tests/test_integrations.py` | all 22 integrations (load, sample record, save) plus 10 domain workflows and the safe-rendering XSS check: 32 checks |
| `python3 tests/test_workflows.py` | 19 deeper workflows, including backup export / clear / restore, hub search, and two regression tests: the completion checkbox must agree with saved state after rapid toggling, and concurrent writers must not overwrite each other |
| `AXE_PATH=node_modules/axe-core/axe.min.js python3 tests/test_a11y.py` | axe-core accessibility scan of all 64 pages (optional; skips with a notice when `AXE_PATH` is not set, because the atlas itself ships no dependencies) |

These suites load each page with `set_content` from a blank origin and a stubbed `localStorage`, so they exercise the storage-fallback path. Real IndexedDB, the service worker, offline reloads, the print stylesheet and the page transition need an HTTP origin: run `python3 -m http.server 8000` and use the manual steps above (9 in particular).

The suites were last run together against the final package, alongside a real-browser sweep of all 64 pages served over HTTP (console and page errors, completion checkbox persistence, axe-core, offline reload, print emulation). See `UPGRADE_NOTES.md` for what that found. Not covered by any of this: Firefox and Safari, assistive-technology behaviour, and the many accessibility problems automated tools cannot detect.
