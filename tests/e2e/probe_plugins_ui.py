#!/usr/bin/env python3
"""Minimal UI probe for ANY build of the plugins (baseline, hotfix, new): does each injected script load, does the FAB / widget appear,
can a review be posted, edited and deleted from the UI?   python3 probe_plugins_ui.py <name> <port> [base_path]"""
import sys
from playwright.sync_api import sync_playwright
from jfe2e import Instance
import browser

inst = Instance(sys.argv[1], int(sys.argv[2]), base_path=sys.argv[3] if len(sys.argv) > 3 else '')
it = browser.items(inst)
with sync_playwright() as pw:
    s = browser.Session(pw, inst, 'desktop').login()
    s.settle(2000)
    print('JellyAsk script loaded :', s.js('!!window.__jellyAskLoaded'), '| FAB visible:', s.visible('.jellyAskFab'))
    print('Reviews script loaded  :', s.js('!!window.__reviewsPluginLoaded'))
    print('LanguageBadges loaded  :', s.js('!!window.__languageBadgesLoaded'), '| chips on home:', s.count('.card .lb-badges'))
    print('WeeklyPick script      :', s.js('!!window.__weeklyPickLoaded'))
    s.nav('#/details?id=' + it['m3'][0], 3500)
    W = '.itemDetailPage:not(.hide) .reviewsWidget'
    print('Reviews widget on movie:', s.count(W))
    if s.count(W):
        n0 = s.count(W + ' .reviewItem')
        s.page.fill(W + ' textarea', 'probe %s' % sys.argv[1])
        s.click(W + ' .reviewsSubmit')
        s.settle(2000)
        print('posted from UI         :', s.count(W + ' .reviewItem') == n0 + 1, '| status:', s.js("document.querySelector('.itemDetailPage:not(.hide) .reviewsStatus').textContent"))
        print('Edit/Delete buttons    :', s.count(W + ' .reviewEditBtn'), s.count(W + ' .reviewDeleteBtn'))
    errs = [e for e in s.errors if 'chromecast' not in e]
    print('console/network errors :', errs[:5])
    s.close()
