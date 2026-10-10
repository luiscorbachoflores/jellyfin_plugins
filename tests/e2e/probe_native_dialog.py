#!/usr/bin/env python3
"""Open a REAL native Jellyfin dialog (action sheet) in each theme and dump its classes/computed colours."""
import json, sys
from playwright.sync_api import sync_playwright
from jfe2e import Instance, USER, USER_PW
import browser
def main():
    inst = Instance(sys.argv[1], int(sys.argv[2])); out = sys.argv[3]
    tok, uid = inst.login(USER, USER_PW)
    it = browser.items(inst)
    for theme in ('dark', 'light', 'purplehaze'):
        with sync_playwright() as pw:
            s = browser.Session(pw, inst, 'desktop', shots=out, tag='native-' + theme).login()
            s.nav('#/mypreferencesdisplay?userId=' + uid, 3500)
            print('themes', s.js("[...document.querySelectorAll('#selectTheme option')].map(o=>o.value)"))
            s.js("(t) => { const e=document.querySelector('.mypreferencesdisplay:not(.hide) #selectTheme, #selectTheme'); e.value=t; e.dispatchEvent(new Event('change')); }", theme)
            s.click('.mypreferencesdisplay:not(.hide) .btnSave, .btnSave')
            s.settle(2500)
            s.page.reload(); s.settle(4000)
            print('themeLink', s.js("document.querySelector('link[href*=\"themes/\"]').href"))
            s.nav('#/details?id=' + it['m1'][0], 3000)
            s.click('.itemDetailPage:not(.hide) .btnMoreCommands')
            s.settle(800)
            s.shot('actionsheet')
            print(json.dumps(s.js("""() => { const d = document.querySelector('.actionSheet, .dialog'); if (!d) return null;
               const c = getComputedStyle(d); const bc = d.closest('.dialogContainer'); return {cls: d.className, tag: d.tagName, bg: c.backgroundColor, color: c.color, radius: c.borderRadius, shadow: c.boxShadow.slice(0,50),
               font: c.fontFamily.slice(0,30), parent: d.parentElement.className, container: bc && getComputedStyle(bc).backgroundColor,
               body: getComputedStyle(document.body).backgroundColor, html: getComputedStyle(document.documentElement).backgroundColor,
               bodyColor: getComputedStyle(document.body).color, htmlcls: document.documentElement.className, bodycls: document.body.className,
               btn: (()=>{const b=d.querySelector('button'); if(!b) return null; const bs=getComputedStyle(b); return {cls:b.className,bg:bs.backgroundColor,color:bs.color,pad:bs.padding,font:bs.fontSize}})()} }""")))
            s.close()
main()
