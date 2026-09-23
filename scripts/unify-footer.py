#!/usr/bin/env python3
"""Keep public footer assets canonical without rewriting page content or SEO fallbacks.

The shared runtime owns the footer markup. Static legacy footers and local links
remain available before enhancement and with JavaScript disabled.
Run after generating public HTML; --check verifies without writing.
"""
from pathlib import Path
import argparse
import re

ROOT = Path(__file__).resolve().parent.parent
VERSION = 'gf5a'
# Application, authentication and redirect screens deliberately retain their UI.
EXCLUDED = {
    'admin.html', 'auth.html', 'artisan.html', 'confirmation.html',
    'dashboard-artisan.html', 'dashboard-artisan-v2.html',
    'dashboard-client.html', 'dashboard-client-v1.html', 'dashboard-client-v2.html',
    'onboarding-artisan.html', 'payment-cancel.html', 'payment-success.html',
    'rafi-v2-preview.html', 'suivi.html', 'suivi-demande.html',
}
CSS = f'  <link rel="stylesheet" href="/css/fixeo-footer-global.css?v={VERSION}">\n'
JS = f'  <script src="/js/fixeo-footer-global.js?v={VERSION}" defer></script>\n'


def public_pages():
    return sorted(p for p in [*ROOT.glob('*.html'), *ROOT.glob('blog/*.html')]
                  if p.name not in EXCLUDED)


def canonical_assets(text):
    text = re.sub(r'(fixeo-footer-global\.(?:css|js)\?v=)[A-Za-z0-9-]+', r'\g<1>' + VERSION, text)
    if 'fixeo-footer-global.css' not in text:
        text = text.replace('</head>', CSS + '</head>', 1)
    if 'fixeo-footer-global.js' not in text:
        text = text.replace('</body>', JS + '</body>', 1)
    return text


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    stale = []
    for path in public_pages():
        before = path.read_text()
        after = canonical_assets(before)
        if before != after:
            stale.append(str(path.relative_to(ROOT)))
            if not args.check:
                path.write_text(after)
    print(f'{len(public_pages())} public pages checked; {len(stale)} ' + ('outdated' if args.check else 'updated'))
    if args.check and stale:
        print('\n'.join(stale))
        raise SystemExit(1)


if __name__ == '__main__':
    main()
