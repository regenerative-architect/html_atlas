#!/usr/bin/env python3
"""
Atlas build tool (Python 3.9+, standard library only).

WHAT IT DOES
  Every page in the atlas is one self-contained HTML file. The parts that are
  the same everywhere (design system, header, footer, dialogs, runtime script,
  the integration engine) live once in tools/shared/. This tool copies them
  into each page between clearly marked regions, so you can:
    * edit a shared file once and update all pages, and
    * still open, read and hand-edit any single page on its own.

  It also regenerates the files derived from catalog.json: the static
  "On this page" list, previous/next and related links, the service-worker
  precache list (with a content-hash version), and SHA256SUMS.json.
  Finally it audits every page (links, landmarks, privacy, secrets, ids).

USAGE
  python3 tools/atlas_build.py            # sync everything, then audit
  python3 tools/atlas_build.py --check    # report what would change; exit 1 if anything would
  python3 tools/atlas_build.py --audit    # audit only, change nothing

REGIONS IT OWNS (everything else in a page is yours and is never touched)
  <!-- atlas:head:start --> ... <!-- atlas:head:end -->
  <style id="atlas-css"> ... </style>
  <!-- atlas:top:start --> ... <!-- atlas:top:end -->
  <!-- atlas:sidebar:start --> ... <!-- atlas:sidebar:end -->
  <!-- atlas:actions:start --> ... <!-- atlas:actions:end -->        (optional)
  <!-- atlas:notes:start --> ... <!-- atlas:notes:end -->            (optional)
  <!-- atlas:pager:start --> ... <!-- atlas:pager:end -->            (optional)
  <!-- atlas:footer:start --> ... <!-- atlas:footer:end -->
  <!-- atlas:catalog|paths|glossary:start --> ... :end -->         (home page only)
  <span data-atlas-count="total|labs|tools">N</span>               (any page)
  <script id="atlas-runtime"> ... </script>
  <script id="integration-engine"> ... </script>                   (integrations)
"""
import hashlib, html, json, re, sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SHARED = ROOT / 'tools' / 'shared'

# The privacy lock. It tells the browser to refuse connections to any other
# website (trackers, analytics, fonts, CDNs). Inline code is allowed because
# every page is a single file. 'wasm-unsafe-eval' lets the WebAssembly lab run
# its own embedded module; blob: lets labs start local workers and previews.
CSP = ("default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; "
       "style-src 'self' 'unsafe-inline'; img-src 'self' file: data: blob:; "
       "media-src 'self' file: data: blob:; font-src 'self' data:; "
       "connect-src 'self' data: blob:; worker-src 'self' blob:; manifest-src 'self' file:; "
       "frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'")

COMMENT_REGIONS = ['head', 'top', 'sidebar', 'actions', 'notes', 'pager', 'footer', 'catalog', 'paths', 'glossary']
GLOSSARY = None
REQUIRED = ['head', 'top', 'sidebar', 'footer']


def read(p):
    return Path(p).read_text(encoding='utf-8')


def load_catalog():
    cat = json.loads(read(ROOT / 'catalog.json'))
    glossary = json.loads(read(ROOT / 'glossary.json'))
    return cat, glossary


def root_prefix(page_id):
    return '../' * page_id.count('/')


# ---------------------------------------------------------------- TOC parser
class SectionScanner(HTMLParser):
    """Collects (id, heading text) for every <section> whose own h2 we see."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []      # open sections: dict(id, classes, h2done)
        self.in_h2 = None
        self.found = []
        self.in_main = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'main':
            self.in_main = True
        if not self.in_main:
            return
        if tag == 'section':
            self.stack.append({'id': a.get('id'), 'cls': a.get('class', ''), 'done': False,
                               'hidden': 'hidden' in a})
        elif tag == 'h2' and self.stack and not self.stack[-1]['done']:
            self.in_h2 = {'sec': self.stack[-1], 'text': ''}

    def handle_endtag(self, tag):
        if tag == 'main':
            self.in_main = False
        if tag == 'h2' and self.in_h2:
            sec = self.in_h2['sec']
            sec['done'] = True
            if sec['id'] and 'js-only' not in sec['cls'] and not sec['hidden']:
                self.found.append((sec['id'], ' '.join(self.in_h2['text'].split())))
            self.in_h2 = None
        elif tag == 'section' and self.stack:
            self.stack.pop()

    def handle_data(self, data):
        if self.in_h2:
            self.in_h2['text'] += data


def static_toc(page_html):
    s = SectionScanner()
    s.feed(page_html)
    return ''.join('<li><a href="#%s">%s</a></li>' % (html.escape(i), html.escape(t)) for i, t in s.found)


# ---------------------------------------------------------------- pager
def words(p):
    text = (p.get('tags', '') + ' ' + p.get('title', '') + ' ' + p.get('summary', '')).lower()
    stop = {'and', 'the', 'of', 'a', 'to', 'with', 'for', 'in', 'on', 'or', 'local', 'html', 'web'}
    return {w for w in re.findall(r'[a-z][a-z0-9-]{2,}', text) if w not in stop}


def related_for(page, pages, paths):
    mine = words(page)
    in_paths = {s for path in paths if page['id'] in path['steps'] for s in path['steps']}
    scored = []
    for other in pages:
        if other['id'] in (page['id'], 'index.html'):
            continue
        ow = words(other)
        jac = len(mine & ow) / (len(mine | ow) or 1)
        bonus = 0.12 if other['id'] in in_paths else 0
        scored.append((jac + bonus, other['title'], other))
    scored.sort(key=lambda x: (-x[0], x[1]))
    return [o for _, _, o in scored[:4]]


def pager_html(page, ordered, pages, paths):
    prefix = root_prefix(page['id'])
    i = ordered.index(page['id'])
    by = {p['id']: p for p in pages}
    prev_id = ordered[i - 1] if i > 0 else 'index.html'
    next_id = ordered[i + 1] if i + 1 < len(ordered) else 'index.html'
    def link(pid, cls, label, rel):
        title = 'Atlas home' if pid == 'index.html' else by[pid]['title']
        return '<a class="%s" href="%s%s" rel="%s"><small>%s</small>%s</a>' % (
            cls, prefix, pid, rel, label, html.escape(title))
    rel = related_for(page, pages, paths)
    links = ''.join('<a href="%s%s">%s</a>' % (prefix, r['id'], html.escape(r['title'])) for r in rel)
    return ('<nav class="pager no-print" aria-label="Previous and next pages">%s%s</nav>'
            '<section class="panel no-print" id="related"><h2>Related pages</h2>'
            '<p class="muted">Pages that share ideas with this one, picked from the catalog and learning paths.</p>'
            '<div class="related">%s</div></section>') % (
        link(prev_id, 'prev', 'Previous', 'prev'), link(next_id, 'next', 'Next', 'next'), links)


# ---------------------------------------------------------------- home page blocks
def group_label(p):
    return ('Topic lab %d' % p['number']) if p['group'] == 'labs' else ('Working tool %d' % p['number'])


def card_html(p):
    search = ' '.join([p['id'], p['title'], p.get('summary', ''), p.get('plain', ''), p.get('tags', ''),
                       p.get('purpose_workbench', ''), p.get('specialty', ''), ' '.join(p.get('audiences', [])),
                       group_label(p)]).lower()
    return ('<article class="card" data-id="%s" data-group="%s" data-audiences="%s" data-search="%s">'
            '<div class="card-meta"><span>%s</span><span class="pill" data-state="%s">Not started</span></div>'
            '<h4><a href="%s">%s</a></h4><p>%s</p></article>') % (
        p['id'], p['group'], html.escape('|'.join(p.get('audiences', [])), quote=True),
        html.escape(' '.join(search.split()), quote=True), group_label(p), p['id'], p['id'],
        html.escape(p['title']), html.escape(p.get('plain') or p.get('summary', '')))


def catalog_block(cat):
    labs = [p for p in cat['pages'] if p['group'] == 'labs']
    tools = [p for p in cat['pages'] if p['group'] == 'integrations']
    return ('<h3 id="categories">Topic labs <span class="muted">(%d)</span></h3>'
            '<p class="muted">One web technology each, with a live demonstration you can change.</p>'
            '<div class="grid" id="lab-grid">%s</div>'
            '<h3 id="integrations">Working tools <span class="muted">(%d)</span></h3>'
            '<p class="muted">Complete local-first applications for real community, field and public work.</p>'
            '<div class="grid" id="tool-grid">%s</div>') % (
        len(labs), ''.join(card_html(p) for p in labs), len(tools), ''.join(card_html(p) for p in tools))


def paths_block(cat):
    by = {p['id']: p for p in cat['pages']}
    out = []
    for path in cat.get('paths', []):
        steps = ''.join('<li><a href="%s">%s</a> <span class="step-state" data-state="%s"></span></li>' % (
            s, html.escape(by[s]['title']), s) for s in path['steps'])
        first = path['steps'][0]
        out.append(('<article class="path-card" data-path="%s" id="path-%s">'
                    '<h3>%s</h3><p class="muted">%s</p><p><strong>Where it leads:</strong> %s</p>'
                    '<div class="meter" role="progressbar" aria-label="Progress on %s" aria-valuemin="0" aria-valuemax="%d" aria-valuenow="0"><div class="fill"></div></div>'
                    '<p class="fineprint path-progress-text">%d steps</p>'
                    '<details class="path-steps-wrap"><summary>See the %d steps</summary><ol class="path-steps">%s</ol></details>'
                    '<div class="toolbar"><button type="button" class="btn-primary js-only" data-follow="%s">Follow this path</button>'
                    '<a class="btn" data-continue="%s" href="%s">Start with %s</a></div></article>') % (
            path['id'], path['id'], html.escape(path['title']), html.escape(path['who']), html.escape(path['outcome']),
            html.escape(path['title']), len(path['steps']), len(path['steps']), len(path['steps']), steps,
            path['id'], path['id'], first, html.escape(by[first]['title'])))
    return '<div class="paths-grid">%s</div>' % ''.join(out)


def glossary_block(glossary, cat):
    by = {p['id']: p for p in cat['pages']}
    items = []
    for g in sorted(glossary['terms'], key=lambda x: x['term'].lower()):
        slug = re.sub(r'[^a-z0-9]+', '-', g['term'].lower()).strip('-')
        link = ''
        if g.get('page') in by:
            link = ' <a href="%s">Try it: %s</a>' % (g['page'], html.escape(by[g['page']]['title']))
        items.append('<div class="term" id="term-%s" data-search="%s"><dt>%s</dt><dd>%s%s</dd></div>' % (
            slug, html.escape((g['term'] + ' ' + g.get('aka', '') + ' ' + g['definition']).lower(), quote=True),
            html.escape(g['term']), html.escape(g['definition']), link))
    return '<dl class="glossary-list">%s</dl>' % ''.join(items)


# ---------------------------------------------------------------- runtime data
def runtime_data(cat, glossary):
    pages = []
    for p in cat['pages']:
        pages.append({'id': p['id'], 't': p['title'], 'g': p['group'], 'n': p.get('number', 0),
                      's': p.get('summary', ''), 'k': p.get('tags', ''),
                      'a': ', '.join(p.get('audiences', []))})
    paths = [{'id': x['id'], 'title': x['title'], 'steps': x['steps']} for x in cat.get('paths', [])]
    gl = [{'term': g['term'], 'def': g['definition'], 'aka': g.get('aka', ''), 'page': g.get('page', '')}
          for g in glossary['terms']]
    counts = {'total': len(cat['pages']),
              'labs': sum(p['group'] == 'labs' for p in cat['pages']),
              'tools': sum(p['group'] == 'integrations' for p in cat['pages'])}
    data = {'version': cat['version'], 'pages': pages, 'paths': paths, 'glossary': gl, 'counts': counts}
    blob = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    blob = blob.replace('</', '<\\/')  # never let data close the <script> element
    return ('/* Generated by tools/atlas_build.py from catalog.json and glossary.json. '
            'Do not edit here. */\nconst ATLAS_DATA=' + blob + ';\n'), counts


# ---------------------------------------------------------------- region sync
def replace_comment_region(text, name, content, page_id):
    pat = re.compile(r'(<!-- atlas:%s:start -->)(.*?)(<!-- atlas:%s:end -->)' % (name, name), re.S)
    if not pat.search(text):
        if name in REQUIRED:
            raise SystemExit('%s: missing required region atlas:%s' % (page_id, name))
        return text
    return pat.sub(lambda m: m.group(1) + '\n' + content.strip('\n') + '\n' + m.group(3), text, count=1)


def replace_element(text, tag, el_id, content, page_id, required=True):
    pat = re.compile(r'(<%s id="%s"[^>]*>)(.*?)(</%s>)' % (tag, el_id, tag), re.S)
    if not pat.search(text):
        if required:
            raise SystemExit('%s: missing <%s id="%s">' % (page_id, tag, el_id))
        return text
    return pat.sub(lambda m: m.group(1) + '\n' + content.strip('\n') + '\n' + m.group(3), text, count=1)


def fill(template, values):
    out = template
    for k, v in values.items():
        out = out.replace('{{%s}}' % k, v)
    left = re.findall(r'\{\{[A-Z_]+\}\}', out)
    if left:
        raise SystemExit('Unfilled placeholders: %s' % left)
    return out


def build_page(page, cat, shared, data_js, counts, ordered):
    pid = page['id']
    path = ROOT / pid
    text = read(path)
    prefix = root_prefix(pid)
    values = {'ROOT': prefix, 'CSP': CSP, 'BOOT_JS': shared['boot'].strip(),
              'COUNT_TOTAL': str(counts['total']), 'VERSION': cat['version']}
    text = replace_comment_region(text, 'head', fill(shared['head'], values), pid)
    text = replace_element(text, 'style', 'atlas-css', shared['css'], pid)
    text = replace_comment_region(text, 'top', fill(shared['top'], values), pid)
    actions = shared['actions']
    if '<!-- atlas:notes:start -->' not in text:
        actions = actions.replace('<a class="btn btn-quiet" href="#your-notes">My notes</a>\n', '')
    text = replace_comment_region(text, 'actions', actions, pid)
    text = replace_comment_region(text, 'notes', shared['notes'], pid)
    if pid != 'index.html':
        text = replace_comment_region(text, 'pager', pager_html(page, ordered, cat['pages'], cat.get('paths', [])), pid)
    text = replace_comment_region(text, 'footer', fill(shared['footer'], values), pid)
    if pid == 'index.html':
        text = replace_comment_region(text, 'catalog', catalog_block(cat), pid)
        text = replace_comment_region(text, 'paths', paths_block(cat), pid)
        text = replace_comment_region(text, 'glossary', glossary_block(GLOSSARY, cat), pid)
    for key, val in (('total', counts['total']), ('labs', counts['labs']), ('tools', counts['tools'])):
        text = re.sub(r'(<span data-atlas-count="%s">)[^<]*(</span>)' % key, lambda m: m.group(1) + str(val) + m.group(2), text)
    runtime = data_js + shared['js']
    text = replace_element(text, 'script', 'atlas-runtime', runtime, pid)
    if page['group'] == 'integrations':
        text = replace_element(text, 'script', 'integration-engine', shared['engine'], pid)
    # The static table of contents is computed last, from the final page.
    toc = static_toc(text)
    text = replace_comment_region(text, 'sidebar', fill(shared['sidebar'], {'TOC': toc}), pid)
    # Body attributes the runtime relies on.
    body = re.search(r'<body[^>]*>', text).group(0)
    want = '<body data-page="%s" data-root="%s" data-group="%s" data-sw="sw.js">' % (pid, prefix, page['group'])
    text = text.replace(body, want, 1)
    return text


# ---------------------------------------------------------------- derived files
def build_sw(cat, page_texts):
    template = read(SHARED / 'sw.js')
    digest = hashlib.sha256(''.join(page_texts[k] for k in sorted(page_texts)).encode()).hexdigest()[:10]
    pages = ['./' + p['id'] for p in cat['pages']]
    core = ['./index.html', './manifest.webmanifest', './catalog.json', './glossary.json',
            './assets/icon.svg', './assets/icon-192.png', './assets/icon-512.png',
            './assets/icon-maskable-512.png', './README.md', './LICENSE']
    return fill(template, {'VERSION': cat['version'] + '-' + digest,
                           'CORE': json.dumps(core), 'PAGES': json.dumps(pages)})


def build_sums():
    files = {}
    for p in sorted(ROOT.rglob('*')):
        if p.is_file() and p.name != 'SHA256SUMS.json' and '__pycache__' not in p.parts \
                and not p.name.startswith('results_') and p.suffix != '.pyc':
            files[p.relative_to(ROOT).as_posix()] = hashlib.sha256(p.read_bytes()).hexdigest()
    return json.dumps({'algorithm': 'SHA-256', 'note': 'Regenerate with python3 tools/atlas_build.py',
                       'files': files}, indent=2) + '\n'


# ---------------------------------------------------------------- audit
class IdScanner(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids, self.refs, self.handlers, self.counts = [], [], [], {'h1': 0, 'main': 0}
        self.ext = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in self.counts:
            self.counts[tag] += 1
        if 'id' in a:
            self.ids.append(a['id'])
        for k, v in attrs:
            if k.startswith('on'):
                self.handlers.append('%s %s' % (tag, k))
        for k in ('href', 'src'):
            if k in a and a[k] is not None:
                self.refs.append((tag, k, a[k]))
        if tag == 'script' and a.get('src', '').startswith(('http:', 'https:', '//')):
            self.ext.append(a['src'])
        if tag == 'link' and a.get('rel') == 'stylesheet' and a.get('href', '').startswith(('http:', 'https:', '//')):
            self.ext.append(a['href'])


SECRET_PATTERNS = [
    (r'-----BEGIN [A-Z ]*PRIVATE KEY-----', 'private key block'),
    (r'AKIA[0-9A-Z]{16}', 'AWS access key id'),
    (r'(?i)\b(api[_-]?key|secret|token|password)\s*[:=]\s*["\'][A-Za-z0-9_\-]{16,}["\']', 'hard-coded credential'),
    (r'[A-Za-z0-9._%+-]+@(?!example\.(?:com|org|net)\b)[A-Za-z0-9.-]+\.(?:com|org|net|io|ca|dev)\b', 'email address'),
    (r'gh[pousr]_[A-Za-z0-9]{30,}', 'GitHub token'),
]
TELEMETRY_PATTERNS = [r'google-analytics', r'googletagmanager', r'\bgtag\(', r'\bga\(\s*[\'"]', r'mixpanel',
                      r'segment\.(io|com)', r'hotjar', r'connect\.facebook', r'doubleclick', r'plausible\.io',
                      r'clarity\.ms', r'navigator\.sendBeacon\(']


def audit(cat, page_texts):
    errors, warnings = [], []
    listed = {p['id'] for p in cat['pages']}
    on_disk = {p.relative_to(ROOT).as_posix() for p in ROOT.glob('*.html')} | \
              {p.relative_to(ROOT).as_posix() for g in ('labs', 'integrations') for p in (ROOT / g).glob('*.html')}
    for missing in sorted(listed - on_disk):
        errors.append('catalog lists a page that does not exist: ' + missing)
    for extra in sorted(on_disk - listed):
        errors.append('page exists but is not in catalog.json: ' + extra)
    for pid, text in sorted(page_texts.items()):
        s = IdScanner()
        s.feed(text)
        if s.counts['h1'] != 1:
            errors.append('%s: expected one <h1>, found %d' % (pid, s.counts['h1']))
        if s.counts['main'] != 1:
            errors.append('%s: expected one <main>, found %d' % (pid, s.counts['main']))
        dup = sorted({i for i in s.ids if s.ids.count(i) > 1})
        if dup:
            errors.append('%s: duplicate ids %s' % (pid, dup))
        if s.handlers:
            errors.append('%s: inline event handlers %s (use addEventListener)' % (pid, s.handlers[:5]))
        if s.ext:
            errors.append('%s: external script or stylesheet %s' % (pid, s.ext))
        if not re.search(r'<html lang="[a-z]', text):
            errors.append(pid + ': missing <html lang>')
        if not re.search(r'<title>[^<]{3,}</title>', text):
            errors.append(pid + ': missing <title>')
        if 'name="description"' not in text:
            errors.append(pid + ': missing meta description')
        if 'Zero Harm &amp; Anti-Coercion' not in text:
            errors.append(pid + ': missing Zero Harm & Anti-Coercion note')
        if 'http-equiv="Content-Security-Policy"' not in text:
            errors.append(pid + ': missing privacy lock (CSP)')
        base = (ROOT / pid).parent
        ids = set(s.ids)
        for tag, attr, ref in s.refs:
            if ref.startswith(('http://', 'https://', 'mailto:', 'data:', 'blob:', 'tel:')) or ref == '':
                continue
            if ref.startswith('javascript:'):
                errors.append('%s: javascript: URL in %s' % (pid, tag))
                continue
            target, _, frag = ref.partition('#')
            if target == '':
                if frag and frag not in ids:
                    errors.append('%s: link to missing anchor #%s' % (pid, frag))
                continue
            dest = (base / target.split('?')[0]).resolve()
            if not dest.exists():
                errors.append('%s: broken link %s' % (pid, ref))
        for pat, label in SECRET_PATTERNS:
            for m in re.finditer(pat, text):
                errors.append('%s: possible %s: %s' % (pid, label, m.group(0)[:40]))
        for pat in TELEMETRY_PATTERNS:
            if re.search(pat, text):
                errors.append('%s: telemetry pattern %s' % (pid, pat))
        for sid in ('atlas-runtime', 'demo-script', 'integration-engine', 'integration-config'):
            m = re.search(r'<script id="%s"[^>]*>(.*?)</script>' % sid, text, re.S)
            if m and re.search(r'<!--|<script', m.group(1)):
                warnings.append('%s: <script id=%s> contains "<!--" or "<script"; check it cannot break parsing' % (pid, sid))
        if len(text.encode()) > 400_000:
            warnings.append('%s: page is %d KB' % (pid, len(text.encode()) // 1024))
    return errors, warnings


# ---------------------------------------------------------------- main
def main(argv):
    check = '--check' in argv
    audit_only = '--audit' in argv
    global GLOSSARY
    cat, glossary = load_catalog()
    GLOSSARY = glossary
    shared = {name: read(SHARED / fname) for name, fname in [
        ('head', 'head.html'), ('css', 'atlas.css'), ('top', 'top.html'), ('sidebar', 'sidebar.html'),
        ('actions', 'actions.html'), ('notes', 'notes.html'), ('footer', 'footer.html'),
        ('js', 'atlas.js'), ('boot', 'boot.js'), ('engine', 'engine.js')]}
    for name in ('js', 'engine', 'boot'):
        if re.search(r'</script', shared[name], re.I):
            raise SystemExit('tools/shared: "</script" inside %s would end the inline script early' % name)
    data_js, counts = runtime_data(cat, glossary)
    ordered = [p['id'] for p in cat['pages'] if p['id'] != 'index.html']
    changed, page_texts = [], {}
    for page in cat['pages']:
        path = ROOT / page['id']
        if audit_only:
            page_texts[page['id']] = read(path)
            continue
        new = build_page(page, cat, shared, data_js, counts, ordered)
        page_texts[page['id']] = new
        if new != read(path):
            changed.append(page['id'])
            if not check:
                path.write_text(new, encoding='utf-8')
    if not audit_only:
        sw = build_sw(cat, page_texts)
        if sw != (read(ROOT / 'sw.js') if (ROOT / 'sw.js').exists() else ''):
            changed.append('sw.js')
            if not check:
                (ROOT / 'sw.js').write_text(sw, encoding='utf-8')
    errors, warnings = audit(cat, page_texts)
    if not audit_only and not check:
        (ROOT / 'SHA256SUMS.json').write_text(build_sums(), encoding='utf-8')
    print('Pages: %d (%d topic labs, %d working tools, 1 home)' % (counts['total'], counts['labs'], counts['tools']))
    if audit_only:
        print('Audit only: no files changed.')
    elif check:
        print('Would change %d file(s)%s' % (len(changed), (': ' + ', '.join(changed[:8])) if changed else ''))
    else:
        print('Updated %d file(s); SHA256SUMS.json regenerated.' % len(changed))
    for w in warnings:
        print('WARNING', w)
    for e in errors:
        print('ERROR', e)
    print('Audit: %d error(s), %d warning(s).' % (len(errors), len(warnings)))
    if errors or (check and changed):
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
