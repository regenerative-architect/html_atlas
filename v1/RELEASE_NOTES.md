# V2 release — purpose-built functionality

## Observed original limitation
The earlier 22 integrations reused a generic CRUD form and a misleading visualization that displayed cumulative row count, regardless of the domain data.

## Implemented changes
- Added 22 purpose-specific analysis/workflow panels with distinct calculations and real controls. See each page's “Purpose-built instrument.”
- Replaced the pretend activity graphic with saved numeric values, statuses or date counts. Each individual workbench provides further domain interpretation.
- Preserved user-controlled JSON import/export, real edit/delete and safe rendering. Hardened import validation, date bounds and write-failure rollback.
- Improved master index descriptions so each application's actual capability is searchable.
- Allowed service-worker registration on HTTPS and loopback hosts; successful installation precaches all 64 HTML pages and supporting manifest/icons/catalog.
- Added portable Python/Playwright browser smoke tests and documented limitations.

## What remains deliberately out of scope
No server-backed real-time collaboration, remote authentication, full GIS mapping/navigation, integrated LLM runtime, scientific measurement certification or legal/compliance certification. Browser policy blocked direct file and localhost navigation during automated testing, so hosted PWA installation/offline reload and real-origin persistence must be tested in the target deployment. Every user-entered source/review/status is a claim, not independent verification.

## How to rerun tests
Install Playwright for Python and its Chromium browser, then run tests/test_topics.py, tests/test_integrations.py, tests/test_workflows.py from the extracted archive. Tests intentionally inject page HTML into a controlled browser document and mock localStorage, so they test UI workflows but not real-origin persistence or service-worker behavior. Review TESTING.md for additional manual scenarios. Node.js is used for syntax checking during package validation but is not needed to run the website.
