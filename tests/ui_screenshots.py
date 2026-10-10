#!/usr/bin/env python3
"""Headless check of the Language Badges client script + a real UI search for Search Notifier.
   JF_ADMIN=admin JF_ADMIN_PW=admin python3 ui_screenshots.py http://localhost:8096 /tmp/shots"""
import os
import sys
import time

from playwright.sync_api import sync_playwright

BASE, OUT = sys.argv[1].rstrip('/'), sys.argv[2]
USER, PW = os.environ.get('JF_ADMIN', 'jfadmin'), os.environ.get('JF_ADMIN_PW', 'jfadmin-test')
os.makedirs(OUT, exist_ok=True)

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 1400, 'height': 900})
    pg.on('console', lambda m: 'LanguageBadges' in m.text and print('console:', m.text))
    pg.goto(BASE + '/web/#/login')
    pg.wait_for_timeout(3000)
    pg.wait_for_selector('#txtManualName:visible, .btnManual:visible', timeout=90000)
    if not pg.locator('#txtManualName').is_visible() and pg.locator('.btnManual').is_visible():
        pg.click('.btnManual')  # 10.11 shows public user tiles first
    pg.fill('#txtManualName', USER)
    pg.fill('#txtManualPassword', PW)
    pg.click('button.button-submit')
    pg.wait_for_timeout(5000)

    def nav(hash_):
        # client-side navigation (page.goto would reload and drop the non-remembered session)
        pg.evaluate('h => { location.hash = h; }', hash_)
    print('script loaded:', pg.evaluate('!!window.__languageBadgesLoaded'))

    nav('#/home')
    pg.wait_for_timeout(4000)
    pg.screenshot(path=OUT + '/1-home.png')
    print('badges on home:', pg.locator('.lb-badges').count())

    lib = pg.evaluate("""() => { const c = [...document.querySelectorAll('.card[data-type="CollectionFolder"]')]
        .find(x => /movie|pel/i.test(x.textContent)); return c && c.getAttribute('data-id'); }""")
    if lib:
        nav('#/movies?topParentId=' + lib)
        pg.wait_for_timeout(5000)
        pg.screenshot(path=OUT + '/2-movies.png')
        print('badges on movies library:', pg.locator('.lb-badges').count(),
              pg.eval_on_selector_all('.lb-badges', 'els => els.map(e => e.textContent)'))

    # Detail page of the first Movie card
    mid = pg.evaluate("() => { const c = document.querySelector('.card[data-type=\"Movie\"]'); return c && c.getAttribute('data-id'); }")
    if mid:
        nav('#/details?id=' + mid)
        pg.wait_for_timeout(5000)
        pg.screenshot(path=OUT + '/3-detail.png')
        print('detail row:', pg.eval_on_selector_all('.lb-detail', 'els => els.map(e => e.textContent)'))

    # Real search through the UI (what Search Notifier must catch)
    nav('#/search')
    pg.wait_for_timeout(3000)
    box = pg.locator('input[type="search"], .searchfields-txtSearch').first
    for ch in 'coco':
        box.type(ch)
        pg.wait_for_timeout(250)
    pg.wait_for_timeout(4000)
    pg.screenshot(path=OUT + '/4-search.png')
    print('badges on search results:', pg.locator('.lb-badges').count())
    b.close()
