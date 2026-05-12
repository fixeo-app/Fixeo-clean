#!/usr/bin/env python3
"""
gf2 — Global Footer Unification
Replaces all non-canonical footer variants with global footer JS injection.
Strategy:
  1. Remove existing <footer>...</footer> block
  2. Add <link> for fixeo-footer-global.css in <head> (after last CSS link)
  3. Add <script defer> for fixeo-footer-global.js before </body>
  Guard: JS already checks for .fixeo-footer-v1 and injects canonical footer.
"""

import re
import sys
import os

FOOTER_CSS_TAG = '  <link rel="stylesheet" href="css/fixeo-footer-global.css?v=gf2">\n'
FOOTER_JS_TAG  = '  <script src="js/fixeo-footer-global.js?v=gf2" defer></script>\n'

# Pages to process: (filename, remove_footer: bool, css_anchor, js_anchor)
# css_anchor: the CSS link line after which we inject footer CSS
# js_anchor: pattern before which we inject footer JS

PAGES = [
    # Public pages with old native footer
    'artisans.html',
    'services.html',
    'comment-ca-marche.html',
    'rejoindre-fixeo.html',
    'faq.html',
    'cgu.html',
    'confidentialite.html',
    'contact.html',
    'whatsapp.html',
    # Pages without any footer, need global footer
    'service-seo.html',
    'onboarding-artisan.html',
    'payment-cancel.html',
    'payment-success.html',
]

def process_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content
    changes = []

    # 1. Remove existing <footer>...</footer> block (any variant)
    footer_pattern = re.compile(r'[ \t]*<footer\b[^>]*>.*?</footer>', re.DOTALL)
    if footer_pattern.search(content):
        content = footer_pattern.sub('', content)
        changes.append('removed old footer')

    # 2. Add fixeo-footer-global.css if not already present
    if 'fixeo-footer-global.css' not in content:
        # Insert after auth-global.css or fixeo-header-global.css or last stylesheet
        css_anchors = [
            'css/auth-global.css',
            'css/fixeo-header-global.css',
            'css/header-unified.css',
            'css/main.css',
        ]
        inserted = False
        for anchor in css_anchors:
            if anchor in content:
                # Find end of the line containing this anchor
                idx = content.index(anchor)
                line_end = content.index('\n', idx)
                content = content[:line_end+1] + FOOTER_CSS_TAG + content[line_end+1:]
                changes.append(f'added footer CSS after {anchor}')
                inserted = True
                break
        if not inserted:
            # Insert before </head>
            content = content.replace('</head>', FOOTER_CSS_TAG + '</head>', 1)
            changes.append('added footer CSS before </head>')

    # 3. Add fixeo-footer-global.js before </body> if not already present
    if 'fixeo-footer-global.js' not in content:
        content = content.replace('</body>', FOOTER_JS_TAG + '</body>', 1)
        changes.append('added footer JS before </body>')

    # 4. Remove stale .fx-footer CSS references (if present inline)
    # Nothing to do here — .fx-footer in main.css is harmless

    if content != original:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f'  ✅  {path}: {", ".join(changes)}')
    else:
        print(f'  ⚠️  {path}: no changes needed')

    return content != original


def main():
    os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    print(f'Working in: {os.getcwd()}')
    total_changed = 0
    for page in PAGES:
        if os.path.exists(page):
            changed = process_file(page)
            if changed:
                total_changed += 1
        else:
            print(f'  ❌  {page}: NOT FOUND')
    print(f'\nDone: {total_changed}/{len(PAGES)} files updated')


if __name__ == '__main__':
    main()
