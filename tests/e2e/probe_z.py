import sys, json
from playwright.sync_api import sync_playwright
from jfe2e import *
import browser
i=Instance(); it=browser.items(i)
with sync_playwright() as pw:
    s=browser.Session(pw,i,'desktop').login()
    s.nav('#/details?id='+it['m1'][0],3000)
    s.click('.itemDetailPage:not(.hide) .btnMoreCommands'); s.settle(800)
    print(json.dumps(s.js("""() => { const z = e => e ? getComputedStyle(e).zIndex + ' ' + getComputedStyle(e).position : null;
      return {container: z(document.querySelector('.dialogContainer')), backdrop: z(document.querySelector('.dialogBackdrop')), dialog: z(document.querySelector('.dialog')), header: z(document.querySelector('.skinHeader')), dock: z(document.getElementById('jfp-fab-dock')), cls: [...document.querySelectorAll('body > *')].map(e => e.tagName + '.' + e.className.toString().slice(0,40) + ':' + getComputedStyle(e).zIndex)} }""")))
    s.close()
