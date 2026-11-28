'use strict';
// Utilidades comunes de las pruebas de extremo a extremo del Blog contra la instancia de pruebas.
// Uso: NODE_PATH=<carpeta con playwright>/node_modules node tests/blog-js/<script>.js
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = process.env.BLOG_BASE || 'http://localhost:8097';
const SHOTS = process.env.BLOG_SHOTS || path.join(os.tmpdir(), 'blog-shots');
fs.mkdirSync(SHOTS, { recursive: true });

async function api(method, p, { body, token, dev = 'x', form } = {}) {
    const auth = `MediaBrowser Client="e2e", Device="cli", DeviceId="e2e-${dev}", Version="1.0"` + (token ? `, Token="${token}"` : '');
    const headers = { Authorization: auth };
    let data;
    if (form) { data = form; } else if (body !== undefined) { headers['Content-Type'] = 'application/json'; data = JSON.stringify(body); }
    const r = await fetch(BASE + p, { method, headers, body: data });
    const txt = await r.text();
    let json = null;
    try { json = txt.trim() ? JSON.parse(txt) : null; } catch (e) { json = txt; }
    return { status: r.status, body: json };
}

async function login(user, pw) {
    const r = await api('POST', '/Users/AuthenticateByName', { body: { Username: user, Pw: pw }, dev: user });
    if (r.status !== 200) { throw new Error('login ' + user + ' ' + r.status); }
    return { token: r.body.AccessToken, id: r.body.User.Id };
}

async function movies(token) {
    const r = await api('GET', '/Items?Recursive=true&IncludeItemTypes=Movie&Fields=ProductionYear', { token });
    const out = {};
    r.body.Items.forEach((m) => { out[m.Name] = m; });
    return out;
}

// Inicia sesion en jellyfin-web con el formulario real de login.
async function uiLogin(page, user, pw) {
    await page.goto(BASE + '/web/#/login.html');
    await page.waitForSelector('#txtManualName', { state: 'visible', timeout: 120000 });
    await page.fill('#txtManualName', user);
    await page.fill('#txtManualPassword', pw);
    await page.locator('button[type=submit]').first().click();
    await page.waitForFunction(() => window.ApiClient && window.ApiClient.accessToken && window.ApiClient.accessToken(), null, { timeout: 30000 });
    await page.waitForTimeout(2500);
    return login(user, pw);
}

module.exports = { BASE, SHOTS, api, login, movies, uiLogin };
