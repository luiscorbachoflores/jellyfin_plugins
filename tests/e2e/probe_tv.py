import sys, json
from playwright.sync_api import sync_playwright
from jfe2e import *
import browser
i=Instance(); it=browser.items(i)
with sync_playwright() as pw:
    for key in ('layout','appLayout'):
        s=browser.Session(pw,i,'desktop')
        s.ctx.add_init_script("localStorage.setItem('%s','tv')" % key)
        s.login()
        print(key, s.js("document.documentElement.className"))
        s.close()
