#!/usr/bin/env python3
"""Anchor survey: which DOM hooks used by the plugins exist on each 12.x page type (desktop + mobile).
   python3 explore_dom.py <name> <port> <shotsdir>   (instance must be up, plugins optional)"""
import json, sys
from playwright.sync_api import sync_playwright
from jfe2e import Instance
import browser

ANCHORS = ['.itemDetailPage', '#itemDetailPage', '.overview-controls', '.overview', '.detailPageContent', '.itemMiscInfo-primary',
           '.itemMiscInfo', '.nameContainer', '.detailPagePrimaryContainer', '.detailSection', '.mainDetailButtons',
           '.card[data-id][data-type]', '.listItem[data-id][data-type]', '.cardScalable', '.cardImageContainer',
           '.listItemBody', '.listItemBodyText', '.mainDrawer-scrollContainer', '.skinHeader', '.headerRight',
           '.searchFields', '.searchResults', '.libraryPage', '.homePage', '.page:not(.hide)', '.reviewsWidget', '.lb-badges', '.lb-detail',
           '.jellyAskFab', '.videoOsdBottom', '#videoOsdPage']


def main():
    inst = Instance(sys.argv[1], int(sys.argv[2]))
    shots = sys.argv[3]
    it = browser.items(inst)
    print(sorted(it))
    with sync_playwright() as pw:
        for prof in ('desktop', 'mobile'):
            s = browser.Session(pw, inst, prof, shots=shots, tag='explore').login()
            print('== profile', prof, 'html classes:', s.js('document.documentElement.className'), 'lang', s.js('document.documentElement.lang'))
            pages = {
                'home': '#/home',
                'movie': '#/details?id=' + it['m1'][0],
                'series': '#/details?id=' + it['series'][0],
                'season': '#/details?id=' + it['season1'][0],
                'episode': None,
                'movies-lib': '#/movies?topParentId=' + it['lib_movies'][0],
                'tv-lib': '#/tv?topParentId=' + it['lib_shows'][0],
                'search': '#/search',
                'userprefs': '#/mypreferencesmenu',
            }
            pages['episode'] = '#/details?id=' + it['ep1'][0]
            for name, h in pages.items():
                if not h:
                    continue
                s.nav(h, 3500)
                found = {a: s.count(a) for a in ANCHORS}
                print(name, h[:40], {k: v for k, v in found.items() if v})
                s.shot(name)
            print('errors', s.errors[:10])
            s.close()


if __name__ == '__main__':
    main()
