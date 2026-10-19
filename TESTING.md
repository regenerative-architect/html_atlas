# Testing the atlas

This page explains how the atlas is tested, what the 3.0 release checks found, and the checks that still need a person. Automated tests catch only part of what matters, so please read the last two sections too.

## Run the tests yourself

You need Python 3.9 or newer and Playwright with Chromium:

```sh
pip install playwright
python3 -m playwright install chromium      # or set CHROMIUM_PATH to an existing Chrome or Chromium
npm install axe-core                         # optional, for the accessibility scan
AXE_PATH=node_modules/axe-core/axe.min.js python3 tests/run_all.py
```

Each suite serves the atlas folder on a private local port (127.0.0.1 only), opens pages in headless Chromium with the real privacy lock in force, and writes its results to `tests/results_*.json`. `run_all.py` also writes `tests/results_summary.json`. Nothing contacts the internet. Without `AXE_PATH`, the accessibility scan is skipped with a notice.

| Suite | Checks | What it covers |
|---|---|---|
| `test_pages.py` | 73 | Every page loads over HTTP with no page errors, no console errors and no requests to other sites; one `h1` and one `main`; privacy lock and Zero Harm note present; labs have a demonstration and a completion checkbox; tools render their records; the home page lists 68 cards. Four pages are also opened straight from disk (`file://`). |
| `test_tools.py` | 47 | All 24 tools: a sample is saved, analysed by the workbench and still there after a reload. Edit, delete and Undo; JSON backup, delete all and restore; strict import refusals; CSV formula protection; recovery from the IndexedDB copy after the quick store is cleared. One specialist check per workbench (garden yields, 0 °C → 32 °F, a great-circle distance of about 111 km per degree at the equator, unit-aware averages, release gate, expiry window, mutual aid matching and minimal export, the kindness check, and more). The security lab shows hostile markup as plain text. |
| `test_workflows.py` | 14 | Home counts and the 68-point map; catalog search with synonyms and filters; the command palette (pages and glossary terms); comfort settings that persist across pages; the device's reduced-motion preference; the privacy panel; page notes and completion reaching the dashboard, including rapid toggling; 20 concurrent progress writes; progress backup, reset and restore; following a learning path; the breathing pause; print styles; and the offline copy (pages open with the network switched off). |
| `test_a11y.py` | 139 | axe-core on all 69 pages in the Night and Day themes, plus the home page in High contrast. |

## Release verification for 3.0

Run on 19 October 2026 in headless Chromium 141 (Playwright 1.56, Python 3.13), against the final files in this folder.

| Check | Result |
|---|---|
| Build audit (`python3 tools/atlas_build.py --audit`) | 0 errors, 0 warnings across 69 pages |
| Build is in sync (`--check`) | no changes pending |
| `SHA256SUMS.json` | recomputed and matching for every file |
| `test_pages.py` | 73 of 73 passed |
| `test_tools.py` | 47 of 47 passed |
| `test_workflows.py` | 14 of 14 passed |
| `test_a11y.py` (axe-core 4.10) | 139 of 139 passed, 0 violations |
| Interaction sweep: every button and disclosure on all 69 pages pressed in turn (1,047 controls, Night theme, 1280 px) | 0 page errors, 0 console errors from the atlas, 0 failed clicks, 0 axe violations |
| Phone width (390 px, Night and Day, 138 page views) | no sideways scrolling, nothing sticking out, no errors |
| Visual review | screenshots of the home page, the five new pages and the rewritten demonstrations, reviewed at desktop width, with the home page and new pages also at phone width in both themes |

Notes on the sweep: the only browser message was "Failed to create WebGPU Context Provider", which headless Chromium prints when the graphics lab checks for WebGPU on a machine without a graphics chip; the lab reports that no WebGPU adapter was offered and keeps working with WebGL 2 and Canvas 2D. A handful of buttons legitimately produce the same result when pressed twice (for example re-checking an unchanged page); the result now glows briefly, or shows a still outline under calm motion, so people can see it ran.

## Checks that still need a person

Please try these before relying on the atlas for a group, a class or a public service:

1. **Keyboard only.** Tab through a lab, a tool and the home page. Every control should be reachable, focus always visible, and dialogs should return focus where it started.
2. **Screen readers.** NVDA or JAWS with Firefox or Chrome on Windows, VoiceOver with Safari on macOS and iOS, TalkBack on Android: listen to the plain-language guide, a demonstration's live results, a tool's saved records table and the home map.
3. **Zoom and text size.** 200% and 400% browser zoom, and the Extra large text setting: nothing should overlap or need sideways scrolling.
4. **Forced colours.** Windows High Contrast (forced colours) and the atlas's own High contrast theme.
5. **Other browsers.** Firefox and Safari, on desktop and phone. The automated runs use Chromium only.
6. **Real devices.** An older, low-cost phone on a slow connection; the performance, workers and sustainable web labs are good tests.
7. **Offline.** Serve the folder, open the home page once, switch the network off, and open pages you have not visited yet.
8. **Permissions.** In the sensors, maps and sound labs, deny each permission and confirm the page explains what happened and asks nothing again by itself.
9. **Printing.** Print a lab and the field guide in the publishing lab, or save them as PDF, and check page breaks.
10. **Your own content.** Replace the samples with real records, export a backup, erase everything from the privacy panel, and restore the backup.

## What this testing does not cover

- Browsers other than Chromium, and real assistive technologies.
- Hardware features that headless browsers cannot provide: WebGPU, WebXR headsets, motion and light sensors, Bluetooth, USB and serial devices, cameras and microphones, and built-in browser AI models. Their labs detect support and explain fallbacks; the fallbacks are what the automated runs exercise.
- Security assurance. The security, privacy and cryptography labs are teaching tools, not audited components.
- Hosting. Headers depend on your host; use the hosting lab to check a live site.

Found a problem? Note the page, the browser and what you expected, export your data if it matters, and share the steps to reproduce it.
