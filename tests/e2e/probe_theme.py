#!/usr/bin/env python3
"""Probe the 12.x web client styling surface: CSS custom properties, theme stylesheets, computed styles of native components."""
import json, sys
from playwright.sync_api import sync_playwright
from jfe2e import Instance
import browser

JS_VARS = """() => {
  const vars = {};
  for (const sh of document.styleSheets) {
    let rules; try { rules = sh.cssRules; } catch (e) { continue; }
    for (const r of rules) {
      if (r.style && /^(:root|html|body)/.test(r.selectorText || '')) {
        for (const p of r.style) if (p.startsWith('--')) vars[p] = r.style.getPropertyValue(p).trim();
      }
    }
  }
  return vars;
}"""
JS_LINKS = "() => [...document.querySelectorAll('link[rel=stylesheet],style[id]')].map(l => (l.href||l.id)).slice(0,30)"
JS_COMP = """() => {
  const out = {};
  const cs = (el) => { const c = getComputedStyle(el); return {bg:c.backgroundColor, color:c.color, font:c.fontFamily.slice(0,60), size:c.fontSize, border:c.border, radius:c.borderRadius, pad:c.padding}; };
  out.body = cs(document.body);
  out.defined = ['emby-button','emby-input','emby-textarea','emby-select','emby-checkbox','paper-icon-button-light','emby-scroller'].map(n => n+':'+!!customElements.get(n));
  const mk = (html) => { const d = document.createElement('div'); d.innerHTML = html; d.style.cssText='position:fixed;left:0;top:0;opacity:0;'; document.body.appendChild(d); const r = d.firstElementChild; out[html.slice(0,40)] = cs(r); d.remove(); };
  mk('<button is="emby-button" class="raised button-submit">x</button>');
  mk('<button is="emby-button" class="raised">x</button>');
  mk('<button is="emby-button" class="button-flat">x</button>');
  mk('<textarea is="emby-textarea" class="txtx" label="l"></textarea>');
  mk('<input is="emby-input" type="text" label="l">');
  return out;
}"""

def main():
    inst = Instance(sys.argv[1], int(sys.argv[2]))
    with sync_playwright() as pw:
        s = browser.Session(pw, inst, 'desktop', user=sys.argv[3] if len(sys.argv) > 3 else 'ana', password=sys.argv[4] if len(sys.argv) > 4 else 'ana-test').login()
        s.nav('#/home', 2000)
        print('LINKS', json.dumps(s.js(JS_LINKS)))
        v = s.js(JS_VARS)
        print('VARS', len(v), json.dumps(v)[:3000])
        print('COMP', json.dumps(s.js(JS_COMP), indent=1)[:4000])
        print('classes', s.js("document.documentElement.className"), s.js("document.body.className"), s.js("document.documentElement.getAttribute('data-theme')"))
        s.close()
main()
