#!/usr/bin/env python3
"""Print palette-ish CSS custom properties of every bundled theme + whether they are defined at :root, plus native class styles."""
import json, sys
from playwright.sync_api import sync_playwright
from jfe2e import Instance
import browser
JS = """async (theme) => {
  const link = document.querySelector('link[href*="themes/"]');
  await new Promise(r => { link.addEventListener('load', r, {once:true}); link.href = '/web/themes/' + theme + '/theme.css'; setTimeout(r, 2500); });
  const cs = getComputedStyle(document.documentElement);
  const names = [];
  for (const sh of document.styleSheets) { let rules; try { rules = sh.cssRules } catch(e) { continue }
    for (const r of rules) if (r.style && /^(:root|html|body)/.test(r.selectorText||'')) for (const p of r.style) if (p.startsWith('--') && !names.includes(p)) names.push(p); }
  const pick = names.filter(n => /palette|font|text|background|divider|action|primary|focus/i.test(n) && !/shadows|zIndex/.test(n));
  const o = {}; for (const n of pick) o[n] = cs.getPropertyValue(n).trim();
  o['body.color'] = getComputedStyle(document.body).color;
  o['body.bg'] = getComputedStyle(document.body).backgroundColor;
  o['html.bg'] = cs.backgroundColor;
  o['bodyfont'] = getComputedStyle(document.body).fontFamily.slice(0,40);
  return {count: names.length, all: names.filter(n=>!/shadows/.test(n)).join(' ').slice(0,2500), o};
}"""
def main():
    inst = Instance(sys.argv[1], int(sys.argv[2]))
    with sync_playwright() as pw:
        s = browser.Session(pw, inst, 'desktop').login()
        for th in sys.argv[3:]:
            r = s.js_arg = s.page.evaluate(JS, th)
            print('==', th, r['count'])
            if th == sys.argv[3]: print(r['all'])
            print(json.dumps(r['o']))
        s.close()
main()
