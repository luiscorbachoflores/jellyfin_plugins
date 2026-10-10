#!/usr/bin/env python3
"""Experiment: does native dialog markup (dialogContainer/dialog/formDialog) get themed in 12.x without module imports?"""
import sys
from playwright.sync_api import sync_playwright
from jfe2e import Instance
import browser
HTML = """<div class="dialogContainer" id="probeDlg" style="position:fixed;inset:0;z-index:9999"><div class="dialog dialog-fixedSize dialog-centeredY formDialog opened" style="width:30em;max-width:92vw" role="dialog" aria-modal="true">
<div class="formDialogHeader"><h3 class="formDialogHeaderTitle">Pedir pelicula o serie</h3></div>
<div class="formDialogContent smoothScrollY" style="padding:1em"><div class="dialogContentInner"><p>Texto de ejemplo</p>
<textarea class="emby-textarea" rows="4" style="width:100%"></textarea>
<div class="formDialogFooter"><button type="button" class="raised button-cancel">Cancelar</button><button type="button" class="raised button-submit">Enviar</button></div></div></div></div></div>"""
def main():
    inst = Instance(sys.argv[1], int(sys.argv[2])); out = sys.argv[3]
    with sync_playwright() as pw:
        s = browser.Session(pw, inst, sys.argv[4] if len(sys.argv) > 4 else 'desktop', shots=out, tag='probe').login()
        for th in ('dark', 'light', 'purplehaze'):
            s.page.evaluate("""async (theme) => { const link = document.querySelector('link[href*="themes/"]');
              await new Promise(r => { link.addEventListener('load', r, {once:true}); link.href = '/web/themes/' + theme + '/theme.css'; setTimeout(r, 2500); }); }""", th)
            s.page.evaluate("h => { document.getElementById('probeDlg')?.remove(); const d=document.createElement('div'); d.innerHTML=h; document.body.appendChild(d.firstElementChild); }", HTML)
            s.settle(500)
            s.shot('dialog-' + th)
            print(th, s.js("(() => { const d=document.querySelector('#probeDlg .dialog'); const c=getComputedStyle(d); return [c.backgroundColor,c.color,c.borderRadius,c.boxShadow.slice(0,30)] })()"))
        s.close()
main()
