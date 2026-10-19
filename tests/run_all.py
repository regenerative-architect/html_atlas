"""Run every test suite and write tests/results_summary.json.

Usage:  python3 tests/run_all.py            (set AXE_PATH to include the axe scan)
Needs:  pip install playwright   (and a Chromium; set CHROMIUM_PATH if needed)
"""
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SUITES = ['test_pages.py', 'test_tools.py', 'test_workflows.py', 'test_a11y.py']
summary, failed = [], 0
for suite in SUITES:
    print('\n=== ' + suite, flush=True)
    name = suite[5:-3]
    result = HERE / ('results_%s.json' % name)
    result.unlink(missing_ok=True)          # never report a stale result
    code = subprocess.call([sys.executable, str(HERE / suite)], cwd=str(HERE))
    data = json.loads(result.read_text()) if result.exists() and code in (0, 1) else None
    summary.append({'suite': name, 'exit_code': code,
                    'total': data['total'] if data else None,
                    'passed': data['passed'] if data else None,
                    'failed': data['failed'] if data else None})
    failed += 1 if code else 0
(HERE / 'results_summary.json').write_text(json.dumps(summary, indent=2) + '\n', encoding='utf-8')
print('\nSummary')
for s in summary:
    print('  %-10s %s' % (s['suite'], 'skipped' if s['total'] is None and s['exit_code'] == 0 else
                          '%s passed, %s failed' % (s['passed'], s['failed'])))
sys.exit(1 if failed else 0)
