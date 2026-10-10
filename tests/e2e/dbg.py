import sys
from playwright.sync_api import sync_playwright
from jfe2e import *
import browser
i=Instance(); it=browser.items(i)
with sync_playwright() as pw:
    s=browser.Session(pw,i,'desktop').login()
    s.nav('#/details?id='+it['m1'][0],3500)
    W='.itemDetailPage:not(.hide) .reviewsWidget'
    print('items before', s.count(W+' .reviewItem'))
    s.page.fill(W+' textarea','prueba borrar')
    s.click(W+' .reviewsSubmit'); s.settle(1500)
    print('after post', s.count(W+' .reviewItem'), s.js("document.querySelector('.reviewsStatus').textContent"))
    print(s.js("[...document.querySelectorAll('.reviewItem')].map(e=>e.innerText.replace(/\\n/g,' | '))"))
    s.click(W+' .reviewDeleteBtn'); s.click(W+' .reviewDeleteBtn'); s.settle(1500)
    print('after delete', s.count(W+' .reviewItem'), s.js("document.querySelector('.reviewsStatus').textContent"), s.errors[-3:])
    s.close()
