# Next-Generation HTML Atlas — 64 working HTML pages

**Foster + Navi · September 2026 · educational software prototype**

## Contents and count
- `index.html`: 1 master navigable index, full-text search across the catalog, local progress and JSON backup.
- `labs/*.html`: 41 individually themed technology demonstrations with runnable source, acceptance checks, limits and implementation prompts.
- `integrations/*.html`: 22 applications with independently distinct specialist workflows (e.g., a spatial distance calculator, unit-aware uncertainty, publishing metadata gate, expiry monitoring, source backlinks, a stage-based task board, and a user-entered release gate). All retain local editing and portable backups; charts now reflect saved numeric values or categories rather than fake sequential growth. The geographic app exports GeoJSON; the audio journal can optionally record a microphone clip as a separate local download; story and estimation labs add specialist controls.
- `sw.js`, `manifest.webmanifest`, icon assets: enhanced installable hosted/offline mode.
- `catalog.json`: reusable machine-readable map of all 64 pages.
- `LICENSE`, `README.md`, `TESTING.md`, `verification.json` (generated during package build).

## Start with the files
Unzip, open `index.html` in a browser and choose a lab. All HTML documents embed their own CSS and JavaScript; they do not need a CDN or an account. Most labs also work when opened independently. Individual browser APIs may require HTTPS/localhost, permission, modern browser support or external services. The files never pretend to provide unavailable hardware, network multiplayer, server-backed authentication or model inference.

## Test the enhanced PWA mode
From this folder, run `python -m http.server 8000`, then visit `http://localhost:8000/`. Service workers work on localhost in major browsers; production should use HTTPS. The enhanced worker pre-caches all 64 HTML pages, the manifest, icons and catalog on a successful first installation. Verify installation finishes before going offline. It uses network-first updates with cached responses; it may still cache additional visited same-origin resources. Individual HTML files themselves require no network resources after being downloaded.

## Storage, privacy and limitations
Integrations persist data with `localStorage` for simple portable demos. The storage lab demonstrates true IndexedDB separately. Local browser storage can be deleted, evicted, unavailable, or origin-isolated; use JSON export for backups. No remote requests, third-party telemetry, external dependencies, prepackaged model weights or server functionality are included. Source code is viewable on every page. `file://` pages cannot register standard service workers. The demonstration's simplified calculations are explicitly labeled illustrative, not safety, scientific or policy advice. Do not use any lab as an audited production component without a full threat model, accessibility test, domain review and deployment testing.

## How to customize
Each lab contains a complete AI upgrade prompt and source-code inspection pane. Copy an integration file, edit `INTEGRATION_CONFIG` and preserve the application logic, or change a focused lab's source and run the tests listed inside. Keep field identifiers unique, preserve schema compatibility and test backup restoration before upgrading. Changing a storage schema without a migration can make existing records unreadable.

## Attributions & licenses
Collection code is newly generated for this educational package; no third-party code libraries or icon fonts are bundled. The code is distributed under the included MIT License. Names of standards and libraries are descriptive references, not endorsement or copied source. Helpful external references: [MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web), [Web Platform Tests](https://web-platform-tests.org/), [W3C WAI/WCAG](https://www.w3.org/WAI/standards-guidelines/wcag/), [OWASP](https://owasp.org/www-project-top-ten/), [web.dev](https://web.dev/). Individual external documentation links are optional and not used at runtime.

## Design constraints
The 64-page count applies exactly to `.html` files. Support files are intentional and do not change the count. Source files include no trackers and no external JavaScript runtime dependencies. Each page includes skip link, semantic landmarks, keyboard-operable controls, reduced-motion safeguards, printable styles, and a no-script explanation. The educational prototype is neither an exhaustive test of every feature listed in the wider technology atlas nor a replacement for production engineering.

## Version 2: original critique and changes
The first edition used the same record-management interface for all 22 integrations and drew a misleading cumulative-count graphic that simply increased with each row. This edition keeps the reusable editing/storage core but adds 22 genuinely different specialist workbenches and replaces the chart with real record values or category counts. Each specialist has its own validation and acceptance expectations. The 41 separate topic demonstrations are already distinct bounded browser API examples; they do not implement every technology mentioned in the larger reference atlas.

This remains an educational suite, not a production-ready implementation of every web technology: real remote collaboration, on-device ML, geospatial routing, scientific validation, browser hardware and server authentication are outside scope. Never interpret self-entered governance, verification or QA fields as independently verified findings.

Source regeneration: the original generator is intentionally excluded from this release because it would overwrite the new purpose-built workbenches. Each HTML file is self-contained and editable. The V2 files, catalog and test documents are authoritative.
