// Harnais de rendu : ouvre l'appli dans Chromium, réseau coupé.
//   dépôt réel      → https://app.test   (pages.avant)
//   copie corrigée  → https://apres.test (pages.apres, si APRES=/chemin/de/la/copie)
// La bibliothèque page-lib.js (objet global CK) est injectée dans chaque page.
const fs = require('fs'), path = require('path');
function findRepo() {
    if (process.env.REPO) return process.env.REPO;
    const base = '/home/user';
    for (const d of fs.readdirSync(base)) if (fs.existsSync(path.join(base, d, 'js', 'montage.js'))) return path.join(base, d);
    throw new Error('dépôt introuvable : REPO=/chemin');
}
const REPO = findRepo();
const { chromium } = require(REPO + '/tests/node_modules/playwright');
const T = { '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.html': 'text/html', '.png': 'image/png', '.svg': 'image/svg+xml' };
function server(root) {
    return r => {
        const rel = decodeURIComponent(new URL(r.request().url()).pathname).replace(/^\/+/, '') || 'index.html', f = path.join(root, rel);
        const ok = f.startsWith(root) && fs.existsSync(f) && fs.statSync(f).isFile();
        return r.fulfill({ status: 200, contentType: T[path.extname(ok ? f : 'x.html')] || 'application/octet-stream', body: fs.readFileSync(ok ? f : path.join(root, 'index.html')) });
    };
}
async function open({ avant = REPO, apres = process.env.APRES || null, viewport = { width: 390, height: 844 } } = {}) {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
    const ctx = await b.newContext({ serviceWorkers: 'block', viewport, deviceScaleFactor: 2 });
    await ctx.route('https://app.test/**', server(avant));
    if (apres) await ctx.route('https://apres.test/**', server(apres));
    await ctx.route(u => !/^https:\/\/(app|apres)\.test\//.test(String(u)), r => r.abort());   // aucun appel réseau réel
    const lib = fs.readFileSync(path.join(__dirname, 'page-lib.js'), 'utf8');
    const pages = {};
    for (const [k, origin] of [['avant', 'https://app.test'], ['apres', 'https://apres.test']]) {
        if (k === 'apres' && !apres) continue;
        const p = await ctx.newPage();
        p.on('pageerror', e => console.log('ERREUR PAGE (' + k + ')', e.message));
        await p.goto(origin + '/index.html');
        await p.waitForFunction(() => typeof drawSticker === 'function' && typeof assembleVideo === 'function');
        await p.evaluate(lib);
        pages[k] = p;
    }
    return { b, ctx, pages };
}
const save = (file, dataUrl) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64')); return file; };
module.exports = { open, save, REPO };
