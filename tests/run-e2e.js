// Tests de bout en bout de Cartoon Instructeur — services simulés, aucune clé réelle.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'index.html');
const ORIGIN = 'https://app.test';
const RELAY = 'https://cartoon-instructeur.mendy-tamadouni2.workers.dev';
let failures = 0;
// Sert les fichiers de l'appli (index.html, css/, js/, sw.js) comme GitHub Pages
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };
function serveApp(route) {
    const rel = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\/+/, '') || 'index.html';
    const f = path.join(ROOT, rel);
    const file = f.startsWith(ROOT) && fs.existsSync(f) && fs.statSync(f).isFile() ? f : APP;
    return route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
}
const check = (ok, label) => { console.log((ok ? '  ✅ ' : '  ❌ ') + label); if (!ok) failures++; };

// Copie du serveur qui accepte l'origine de test (et, en option, des délais courts)
async function loadWorker(fast) {
    let src = fs.readFileSync(path.join(ROOT, 'relais', 'cloudflare-worker.js'), 'utf8')
        .replace("'https://mendytamadouni2-design.github.io'\n];", "'https://mendytamadouni2-design.github.io', '" + ORIGIN + "'\n];");
    if (fast) src = src.replace('const TICK_MS = 8000;', 'const TICK_MS = 400;').replace('const CREATE_INTERVAL_MS = 62000;', 'const CREATE_INTERVAL_MS = 1500;');
    const f = path.join(os.tmpdir(), 'cartoon-worker-' + (fast ? 'fast' : 'std') + '-' + Date.now() + '.mjs');
    fs.writeFileSync(f, src);
    return import(f);
}
// Durable Objects simulés (stockage en mémoire + réveils par minuterie)
function fakeDurableObjects(W) {
    const objects = new Map(); let seq = 0;
    const env = { JOBS: {
        newUniqueId() { const id = 'job' + (++seq) + 'xxxxxxxxxx'; return { toString: () => id }; },
        idFromName(n) { return { toString: () => 'name:' + n }; },
        idFromString(s) { if (!/^job/.test(s)) throw new Error('bad id'); return { toString: () => s }; },
        get(id) {
            const k = id.toString();
            if (!objects.has(k)) {
                const m = new Map(); let alarm = null;
                const storage = {
                    async get(x) { return Array.isArray(x) ? new Map(x.map(y => [y, m.get(y)])) : structuredClone(m.get(x)); },
                    async put(x, v) { m.set(x, structuredClone(v)); }, async delete(x) { (Array.isArray(x) ? x : [x]).forEach(y => m.delete(y)); },
                    async deleteAll() { m.clear(); },
                    async list({ prefix = '' } = {}) { return new Map([...m].filter(([x]) => x.startsWith(prefix)).map(([x, v]) => [x, structuredClone(v)])); }, async setAlarm(t) { clearTimeout(alarm); const d = t - Date.now(); if (d < 60000) alarm = setTimeout(() => o.alarm().catch(e => console.log('ALARME', e)), Math.max(0, d)); }, _m: m
                };
                const o = new W.VideoJob({ storage, id: { toString: () => k } }, env);
                objects.set(k, o);
            }
            const o = objects.get(k);
            return { fetch: (u, init) => o.fetch(new Request(u, init)) };
        }
    } };
    return { env, objects };
}
async function makeClips(page) {
    await page.goto('about:blank');
    const clips = await page.evaluate(async () => {
        const make = async (color, freq, silent) => {
            const c = document.createElement('canvas'); c.width = 640; c.height = 360; const g = c.getContext('2d');
            const ac = new AudioContext(); const osc = ac.createOscillator(); osc.frequency.value = freq; const gn = ac.createGain(); gn.gain.value = 0;
            const dst = ac.createMediaStreamDestination(); osc.connect(gn).connect(dst); osc.start();
            const st = new MediaStream([...c.captureStream(30).getVideoTracks(), ...dst.stream.getAudioTracks()]);
            const rec = new MediaRecorder(st, { mimeType: 'video/webm;codecs=vp8,opus' }); const ch = []; rec.ondataavailable = e => ch.push(e.data); const done = new Promise(r => rec.onstop = r);
            rec.start(200); const t0 = performance.now();
            await new Promise(res => { const f = () => { const t = (performance.now() - t0) / 1000; gn.gain.value = (!silent && t > 0.8 && t < 3.0) ? 0.3 * (0.6 + 0.4 * Math.sin(t * 20)) : 0; g.fillStyle = '#fff'; g.fillRect(0, 0, 640, 360); g.fillStyle = color; g.beginPath(); g.ellipse(115, 200, 55, 100 + Math.sin(t * 6) * 4, 0, 0, 7); g.fill(); if (t < 3.8) requestAnimationFrame(f); else res(); }; f(); });
            rec.stop(); await done; const b = new Uint8Array(await new Blob(ch).arrayBuffer()); let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s);
        };
        return [await make('#2d6cdf', 300), await make('#d0452f', 360, true), await make('#1f9d55', 420)];
    });
    return clips.map(b => Buffer.from(b, 'base64'));
}
async function photoBuffer(page) {
    const d = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 360; c.height = 640; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 360, 640); g.fillStyle = '#f07a3a'; g.beginPath(); g.ellipse(180, 330, 110, 190, 0, 0, 7); g.fill(); return c.toDataURL('image/png'); });
    return { name: 'perso.png', mimeType: 'image/png', buffer: Buffer.from(d.split(',')[1], 'base64') };
}
const mockStats = { drawChecks: 0, paths: 0, refChecks: 0, qa: 0, images: 0 };
function claudeMock(route) {
    const body = JSON.parse(route.request().postData());
    const props = body.output_config?.format?.schema?.properties || {};
    // consignes envoyées en bloc mis en cache
    const sys = body.system;
    if (sys !== undefined && !(Array.isArray(sys) && sys.length === 1 && sys[0].cache_control?.type === 'ephemeral' && sys[0].text)) mockStats.badSystem = (mockStats.badSystem || 0) + 1;
    if (process.env.SYSLEN && Array.isArray(sys)) console.log('SYSLEN', sys[0].text.length, JSON.stringify(body.messages[0].content).length, Object.keys(props).join(','));
    const content = body.messages?.[0]?.content;
    if (Array.isArray(content)) mockStats.images = Math.max(mockStats.images, content.filter(c => c.type === 'image').length);
    let out;
    if (props.score) { mockStats.qa++; out = { score: 7.5, summary: 'Personnage régulier, un dessin peu lisible.', issues: [{ scene: 2, kind: 'illustration', problem: 'le dessin ne montre pas la vapeur', action: 'redessiner' }] }; }
    else if (props.results) { mockStats.drawChecks++; out = { results: mockStats.drawChecks === 1 ? [{ k: 1, ok: false, why: 'trop vague' }] : [{ k: 1, ok: true, why: '' }] }; }
    else if (props.scenes && !props.setting) { mockStats.refChecks++; out = { scenes: [1, 2, 3].map(n => ({ scene: n, same: true, problem: '' })) }; }
    else if (props.videos?.items?.properties?.lines) out = { videos: [{ title: 'Les volcans', why: 'Spectaculaire', lines: ['Le soleil chauffe l\'eau.', 'Le soleil chauffe l\'eau.'] }, { title: 'La lune', why: 'Mystérieux', lines: ['Le soleil chauffe l\'eau.'] }] };
    else if (props.replies) out = { replies: [{ i: 0, reply: 'Merci beaucoup ! 😄' }] };
    else if (props.vocabulary) out = { title: 'Le cycle de l\'eau', objectives: ['Je sais expliquer l\'évaporation.'], summary: 'Le soleil chauffe l\'eau, qui monte et forme des nuages. Œuvre de la nature !', vocabulary: [{ word: 'Évaporation', definition: 'Passage de l\'eau liquide à la vapeur.' }], quiz: [{ question: 'Qui chauffe l\'eau ?', choices: ['Le soleil', 'La lune', 'Le vent'], answer: 0, explanation: 'C\'est la chaleur du soleil.' }], activity: 'Observe une casserole d\'eau chaude.' };
    else if (props.videos) out = { videos: [{ title: 'Le cycle de l\'eau', views: 1200, likes: 80, comments: 5, shares: 3, avg_watch_seconds: 11, full_watch_pct: 34, duration_seconds: 30, notes: 'décroche à 4 s' }] };
    else if (props.script_rules) out = { analysis: 'Bon début.', tips: ['Accroche plus courte'], ideas: ['Les volcans'], script_rules: 'Accroche en moins de 3 secondes.' };
    else if (props.hooks) out = { hooks: [{ text: 'Savais-tu que l\'eau voyage ?', why: 'question' }, { text: 'Un chiffre fou.', why: 'chiffre' }, { text: 'Tout est faux.', why: 'surprise' }] };
    else if (props.question) out = { question: 'Et toi, tu bois combien de verres par jour ?' };
    else if (props.hashtags) out = { caption: 'Le voyage de l\'eau en 30 s', hashtags: ['science', 'eau'] };
    else if (props.lines) out = { lines: ['Ligne modèle un.', 'Ligne modèle deux.'] };
    else if (props.issues) out = { issues: [{ line: 1, problem: 'imprécis', fix: 'Le soleil réchauffe l\'eau des océans.' }] };
    else if (props.paths && ++mockStats.paths) out = { paths: [
        { d: 'M 90 110 C 90 70 150 70 150 110 C 150 150 90 150 90 110 Z', color: 'orange', word: 'soleil' },
        { d: 'M 60 250 Q 120 230 180 250 Q 240 270 300 250', color: 'blue', word: 'eau' },
        { d: 'M 200 230 C 205 200 230 180 250 150', color: 'black', word: '' }] };
    else if (props.scenes) out = { setting: '', scenes: [
        { spoken: 'Le soleil chauffe l\'eau.', action: 'draws', camera: 'medium-wide shot', bubble: 'Le soleil', zoom: 'none', emphasis: '', section: '', shot: 'character', highlight: '100 °C', pose: 'main', narration: '', visual: 'un soleil au-dessus de la mer' },
        { spoken: 'Le soleil chauffe l\'eau.', action: 'points', camera: 'medium-wide shot', bubble: 'Évaporation', zoom: 'in', emphasis: 'chauffe', section: '', shot: 'board', highlight: '', pose: 'main', narration: 'L\'eau chaude devient une vapeur invisible qui monte vers le ciel.', visual: 'des flèches qui montent de la mer' },
        { spoken: 'Le soleil chauffe l\'eau.', action: 'waves', camera: 'medium-wide shot', bubble: 'Évaporation', zoom: 'none', emphasis: '', section: 'Les nuages', shot: 'character', highlight: '', pose: 'explique', narration: '', visual: 'un nuage' }] };
    else out = { text: 'EAU MAGIQUE' };
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify({ model: body.model, content: [{ type: 'text', text: JSON.stringify(out) }], stop_reason: 'end_turn', usage: { input_tokens: 1200, output_tokens: 400 } }) });
}
function toneWav() {
    const sr = 22050, n = sr * 2, b = Buffer.alloc(44 + n * 2);
    b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) { const t = i / sr; b.writeInt16LE(Math.round(((t > 0.2 && t < 1.8) ? Math.sin(2 * Math.PI * 500 * t) * 0.3 : 0) * 32767), 44 + i * 2); }
    return b;
}
async function commonRoutes(ctx, clipBufs, relayEnv, W, counters) {
    await ctx.route('https://cdnjs.cloudflare.com/ajax/libs/jspdf/**', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(require.resolve('jspdf/dist/jspdf.umd.min.js')) }));
    await ctx.route(ORIGIN + '/**', serveApp);
    await ctx.route('https://apihub.agnes-ai.com/v1/videos', r => { const b = JSON.parse(r.request().postData()); counters.agnes.push(b); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ video_id: 'v' + (counters.vid++) }) }); });
    await ctx.route('https://apihub.agnes-ai.com/agnesapi**', r => { const id = new URL(r.request().url()).searchParams.get('video_id'); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'completed', metadata: { url: 'https://cdn.test/' + id + '.webm' } }) }); });
    await ctx.route('https://api.anthropic.com/v1/messages', claudeMock);
    await ctx.route('https://api.elevenlabs.io/v1/text-to-speech/**', r => r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'audio/wav', body: toneWav() }));
    await ctx.route('https://api.elevenlabs.io/v1/speech-to-text', r => r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify({ words: [{ text: 'Le', start: 0.82, end: 1.0, type: 'word' }, { text: 'soleil', start: 1.05, end: 1.5, type: 'word' }, { text: 'chauffe', start: 1.55, end: 2.0, type: 'word' }, { text: 'l\'eau.', start: 2.05, end: 2.9, type: 'word' }] }) }));
    await ctx.route(RELAY + '/**', async r => {
        const q = r.request(), target = new URL(q.url()).searchParams.get('url');
        const real = globalThis.fetch;
        globalThis.fetch = async (u, o) => { u = String(u); if (u.startsWith('https://cdn.test/')) { const n = parseInt(u.match(/v(\d+)/)[1], 10); return new Response(clipBufs[counters.clipFor(n)], { headers: { 'Content-Type': 'video/webm' } }); } return counters.serverFetch ? counters.serverFetch(u, o) : real(u, o); };
        const resp = await W.default.fetch(new Request(q.url(), { method: q.method(), headers: q.headers(), body: ['GET', 'HEAD'].includes(q.method()) ? undefined : q.postDataBuffer() }), relayEnv);
        r.fulfill({ status: resp.status, headers: Object.fromEntries(resp.headers), body: Buffer.from(await resp.arrayBuffer()) });
    });
}
async function setup(page, extra) {
    await page.goto(ORIGIN + '/index.html');
    await page.evaluate(async extra => {
        localStorage.setItem('agnes_api_key', 'sk-test-agnes'); localStorage.setItem('claude_api_key', 'sk-ant-test-claude'); localStorage.setItem('elevenlabs_api_key', 'sk_test_eleven');
        localStorage.setItem('elevenlabs_voice_id', 'voice123'); localStorage.setItem('agnes_timing_cache_v11', JSON.stringify({ '153': [1000] }));
        const oc = new OfflineAudioContext(1, 44100 * 8, 44100); [220, 277, 330].forEach(f => { const o = oc.createOscillator(); o.frequency.value = f; const g = oc.createGain(); g.gain.value = 0.2; o.connect(g).connect(oc.destination); o.start(); });
        const buf = await oc.startRendering(); const d = buf.getChannelData(0); const ab = new ArrayBuffer(44 + d.length * 2), v = new DataView(ab);
        const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }; ws(0, 'RIFF'); v.setUint32(4, 36 + d.length * 2, true); ws(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 44100, true); v.setUint32(28, 88200, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); ws(36, 'data'); v.setUint32(40, d.length * 2, true);
        for (let i = 0; i < d.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, d[i])) * 32767, true);
        await idbPut('music', new Blob([ab], { type: 'audio/wav' })); localStorage.setItem('cartoon_music_name', 'test');
        const c = document.createElement('canvas'); c.width = 360; c.height = 640; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 360, 640); g.fillStyle = '#f07a3a'; g.fillRect(100, 150, 160, 340);
        await idbPut('poses', [{ id: 'explique', image: c.toDataURL('image/jpeg', 0.9) }]);
        localStorage.setItem('cartoon_settings', JSON.stringify(extra));
    }, extra);
    await page.reload();
    await page.waitForFunction(() => document.getElementById('proxy-status-text').textContent.includes('✅'), null, { timeout: 15000 });
}
async function fillProject(page) {
    await page.setInputFiles('#file-input', await photoBuffer(page));
    await page.evaluate(() => wizardGo(1));
    await page.fill('#theme-input', 'Le cycle de l\'eau');
    await page.fill('#script-input', 'Le soleil chauffe l\'eau.\nLe soleil chauffe l\'eau.\nLe soleil chauffe l\'eau.');
    await page.dispatchEvent('#script-input', 'input');
    await page.waitForFunction(() => !document.getElementById('generate-btn').disabled);
}

async function testPhoneMontage(browser) {
    console.log('\n▶ Montage complet sur le téléphone');
    const W = await loadWorker(false);
    const ctx = await browser.newContext({ serviceWorkers: 'block', ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage(); const errors = [], dialogs = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
    const clipBufs = await makeClips(page);
    const counters = { agnes: [], vid: 0, clipFor: n => (n === 1 ? 1 : n % 2 === 0 ? 0 : 2) };
    const { env } = fakeDurableObjects(W);
    env.TIKTOK_CLIENT_KEY = 'ttkey'; env.TIKTOK_CLIENT_SECRET = 'ttsecret';
    env.INSTAGRAM_APP_ID = 'igapp'; env.INSTAGRAM_APP_SECRET = 'igsecret';
    const tt = { uploaded: 0, inits: [], token: 0 }, ig = { fetched: 0, published: 0, caption: '' };
    counters.serverFetch = async (u, o) => {
        if (u.startsWith('https://graph.instagram.com/refresh_access_token')) return Response.json({ access_token: 'igt2', expires_in: 5184000 });
        if (u.startsWith('https://graph.instagram.com/v22.0/1789/media_publish')) { ig.published++; return Response.json({ id: 'm1' }); }
        if (u.startsWith('https://graph.instagram.com/v22.0/1789/media')) {
            const q = new URLSearchParams(String(o.body)); ig.caption = q.get('caption');
            const r = await W.default.fetch(new Request(q.get('video_url')), env);   // Instagram vient chercher la vidéo
            ig.fetched = r.ok ? (await r.arrayBuffer()).byteLength : -r.status;
            return Response.json({ id: 'c1' });
        }
        if (u.startsWith('https://graph.instagram.com/v22.0/c1')) return Response.json({ status_code: 'FINISHED' });
        const ok = data => Response.json({ data, error: { code: 'ok' } });
        if (u.includes('/oauth/token/')) { tt.token++; return Response.json({ access_token: 'tta' + tt.token, refresh_token: 'ttr', expires_in: 86400, refresh_expires_in: 3e7, open_id: 'o1' }); }
        if (u.includes('/video/list/')) return ok({ videos: [{ id: '71', title: 'Le cycle de l\'eau', view_count: 1500, like_count: 90, comment_count: 7, share_count: 4, duration: 30, create_time: 1790000000 }] });
        if (u.includes('/creator_info/')) return ok({ privacy_level_options: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'], creator_nickname: 'Prof Patate' });
        if (u.includes('/video/init/')) { tt.inits.push(JSON.parse(o.body)); return ok({ publish_id: 'pub1', upload_url: 'https://upload.tiktok.test/u' }); }
        if (u.startsWith('https://upload.tiktok.test/')) { tt.uploaded += o.body.length; return new Response(null, { status: 201 }); }
        if (u.includes('/status/fetch/')) return ok({ status: 'PUBLISH_COMPLETE' });
        throw new Error('appel inattendu ' + u);
    };
    const yt = [];
    await ctx.route('https://www.googleapis.com/upload/youtube/v3/videos**', r => { const b = r.request().postDataBuffer().toString('latin1'); const m = b.match(/\{"snippet".*?\}\}(?=\r\n)/s); yt.push(m ? JSON.parse(m[0]) : null); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'yt' + yt.length }) }); });
    await ctx.route('https://www.googleapis.com/upload/youtube/v3/captions**', r => { yt.captions = (yt.captions || 0) + 1; r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); });
    await ctx.route('https://www.googleapis.com/upload/youtube/v3/thumbnails/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    const replies = [];
    await ctx.route('https://www.googleapis.com/youtube/v3/channels**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [{ id: 'UCme', snippet: { title: 'Prof Patate' } }] }) }));
    await ctx.route('https://www.googleapis.com/youtube/v3/commentThreads**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [
        { id: 't1', snippet: { videoId: 'yt1', totalReplyCount: 0, canReply: true, topLevelComment: { snippet: { authorDisplayName: 'Léa', textOriginal: 'Trop bien cette vidéo !', authorChannelId: { value: 'UCx' } } } } },
        { id: 't2', snippet: { videoId: 'yt1', totalReplyCount: 1, canReply: true, topLevelComment: { snippet: { authorDisplayName: 'Tom', textOriginal: 'Déjà répondu', authorChannelId: { value: 'UCy' } } } } }] }) }));
    await ctx.route('https://www.googleapis.com/youtube/v3/comments**', r => { replies.push(JSON.parse(r.request().postData())); r.fulfill({ status: 200, contentType: 'application/json', body: '{"id":"r1"}' }); });
    await commonRoutes(ctx, clipBufs, env, W, counters);
    await setup(page, { voiceSource: 'fit', captionFont: 'impact', brandColor: '#00d2ff', genMode: 'phone', ...(process.env.STYLE ? { selectedStyle: process.env.STYLE } : {}) });
    if (process.env.STYLE) check(await page.evaluate(s => state.selectedStyle === s, process.env.STYLE), 'style testé : ' + process.env.STYLE);
    check(await page.evaluate(() => state.voiceSource === 'fit' && state.captionFont === 'impact' && state.poses.length === 1), 'réglages et poses retrouvés après rechargement');
    // Connexion TikTok (retour de TikTok avec ?code=…&state=…) + YouTube connecté
    await page.evaluate(() => { localStorage.setItem('cartoon_instagram_token', JSON.stringify({ token: 'igt', exp: Date.now() + 30 * 24 * 3600000, userId: '1789', username: 'profpatate' })); localStorage.setItem('cartoon_tiktok_oauth_state', 'st1'); localStorage.setItem('youtube_oauth_token', 'ytok'); localStorage.setItem('youtube_oauth_token_exp', String(Date.now() + 3600000)); });
    await page.goto(ORIGIN + '/index.html?code=abc&state=st1');
    await page.waitForFunction(() => !!localStorage.getItem('cartoon_tiktok_token'), null, { timeout: 20000 }).catch(() => {});
    check(await page.evaluate(() => !!getTikTokToken() && location.search === '' && document.getElementById('tiktok-status').textContent.includes('connecté')), 'connexion TikTok réussie (jeton gardé, adresse nettoyée)');
    await fillProject(page);
    await page.evaluate(() => navOpen('settings', 'set-brand'));
    await page.click('#ref-create-btn');
    await page.waitForFunction(() => !!referenceImage() && !!document.querySelector('#reference-box img'), null, { timeout: 60000 });
    check(counters.agnes.length === 1 && /Reference shot/.test(counters.agnes[0].prompt) && await page.evaluate(() => referenceImage().startsWith('data:image/jpeg') && !!document.querySelector('#reference-box img')), 'image de référence créée (une scène Agnes, image gardée)');
    await page.evaluate(() => wizardGo(1));
    await page.click('#wiz-next');
    await page.waitForSelector('#storyboard:not(.hidden) #sb-approve', { timeout: 60000 });
    check(counters.agnes.length === 1 && await page.evaluate(() => NAV.step === 2), 'étape Storyboard : affiché sans rien payer chez Agnes');
    check(mockStats.drawChecks >= 1 && mockStats.paths >= 4, 'dessins vérifiés par Claude, le dessin refusé est refait (' + mockStats.paths + ' dessins demandés)');
    check(await page.evaluate(() => scenePlanFor(1).narration.includes('vapeur') && !!document.querySelector('[data-sb-field="narration"][data-i="1"]')), 'scène riche : voix off prévue et modifiable au storyboard');
    await page.fill('[data-sb-field="bubble"][data-i="0"]', 'Chaleur !'); await page.dispatchEvent('[data-sb-field="bubble"][data-i="0"]', 'input');
    await page.click('#sb-approve');
    check(await page.evaluate(() => NAV.step === 3 && !state.isRunning), 'storyboard validé : étape Génération, rien lancé tout seul');
    await page.click('#generate-btn');
    await page.waitForSelector('#video-preview.visible', { timeout: 600000 });
    const r = await page.evaluate(async () => ({
        bubble: state.scenePlan.scenes[0].bubble, size: state.finalBlob.size, type: state.finalBlob.type,
        tl: state.timeline.filter(t => !t.narration).map(t => +t.duration.toFixed(2)), board: state.timeline.filter(t => t.narration).map(t => [t.sceneIndex, +t.duration.toFixed(2)]),
        prompts: [], refStart: null, fit: state.queue.map(q => !!q.fitBuffer), stt: state.queue.map(q => !!q.sttWords),
        journalHasKey: /sk-ant-test|sk-test|sk_test/.test(journalText())
    }));
    check(r.bubble === 'Chaleur !', 'modification du storyboard conservée');
    const scenePrompts = counters.agnes.slice(1);
    const ref = await page.evaluate(() => referenceImage());
    check(scenePrompts.length >= 3 && scenePrompts.every(b => b.prompt.includes('exact reference frame') && b.prompt.includes('returns to the same neutral pose') && b.image === ref), 'toutes les scènes partent de l\'image de référence, pose neutre au début et à la fin');
    check(r.board.length === 1 && r.board[0][0] === 1 && r.board[0][1] > 1.2, 'plan illustré commenté après la scène 2 (' + JSON.stringify(r.board) + ')');
    check(await page.evaluate(() => segmentsForScene(1)[0].text === scenePlanFor(1).spoken && /-->/.test(generateSRT()) && generateSRT().includes('vapeur')), 'sous-titres : réplique puis voix off');
    check(mockStats.refChecks >= 1, 'scènes comparées à l\'image de référence avant le montage');
    check(await page.evaluate(() => document.getElementById('voice-indicator').textContent.includes('ElevenLabs')), 'voix utilisée affichée (ElevenLabs)');
    await page.waitForFunction(() => !!state.qaReport, null, { timeout: 60000 }).catch(() => {});
    check(await page.evaluate(() => (state.qaFrames || []).length >= 8 && !!state.qaReport && document.getElementById('qa-report').textContent.includes('7.5')) && mockStats.images >= 8, 'contrôle par l\'IA : ' + mockStats.images + ' images analysées, rapport affiché');
    await page.evaluate(() => wizardGo(4));
    await page.click('[data-qa-redraw]');
    await page.waitForFunction(() => document.querySelector('[data-qa-redraw]')?.textContent.includes('refaites'), null, { timeout: 30000 });
    check(true, 'contrôle par l\'IA : illustration refaite en un appui');
    check(dialogs.some(d => /pas de voix|personnage muet/.test(d)), 'contrôle qualité : scène muette détectée et refaite');
    check(r.size > 100000, 'vidéo finale produite (' + r.type + ', ' + Math.round(r.size / 1024) + ' Ko)');
    check(r.tl.every(d => d > 2 && d < 3.2), 'blancs coupés (durées ' + r.tl.join(', ') + ' s)');
    check(r.fit.every(Boolean), 'voix ElevenLabs calée utilisée');
    check(r.stt.every(Boolean), 'sous-titres synchronisés au mot');
    check(!r.journalHasKey, 'journal sans aucune clé');
    check(counters.agnes[counters.agnes.length - 1].prompt.includes('No background music'), 'Agnes : voix seule (musique gérée par l\'appli)');
    check(await page.evaluate(() => NAV.step === 4), 'vidéo finie : étape Montage affichée');
    await page.evaluate(() => navOpen('videos', 'video'));
    await page.click('#download-square-btn');
    await page.waitForFunction(() => document.getElementById('download-square-btn').textContent.includes('Prêt'), null, { timeout: 300000 });
    const sq = await page.evaluate(async () => { const b = state.exportCache['fmt-square'].blob; const v = document.createElement('video'); v.src = URL.createObjectURL(b); await new Promise(r => v.onloadedmetadata = r); return [v.videoWidth, v.videoHeight]; });
    check(sq[0] === sq[1], 'version carrée ' + sq.join('×'));
    const thumb = await page.evaluate(async () => (await generateThumbnailImage()).size);
    check(thumb > 20000, 'miniature générée');

    // Sauvegarde Cloudflare des scènes + vidéo finale, bibliothèque
    await page.waitForFunction(() => state.queue.every(q => q.mediaKey), null, { timeout: 60000 }).catch(() => {});
    check(await page.evaluate(() => state.queue.every(q => q.mediaKey)), 'scènes sauvegardées sur Cloudflare');
    await page.click('#backup-final-btn');
    await page.waitForFunction(() => document.getElementById('backup-final-btn').textContent.includes('sauvegardée'), null, { timeout: 60000 });
    await page.waitForFunction(() => document.querySelectorAll('#library-list [data-lib-get]').length === 1, null, { timeout: 20000 }).catch(() => {});
    check(await page.evaluate(() => document.querySelectorAll('#library-list [data-lib-get]').length === 1), 'vidéo finale dans la bibliothèque');
    const restored = await page.evaluate(async () => { const it = state.queue[0]; const size = it.blob.size; delete it.blob; it.videoUrl = 'https://cdn.test/expired-v999.webm'; const b = await fetchClipBlob(it); return b.size === size; });
    check(restored, 'scène récupérée depuis la sauvegarde (lien Agnes expiré)');

    // Éditeur de montage + banque + aperçu
    check(await page.evaluate(() => document.querySelectorAll('#montage-editor .me-card').length === 3), 'éditeur de montage affiché (3 scènes)');
    await page.evaluate(() => wizardGo(4));
    await page.click('[data-me="skip"][data-i="1"]');
    await page.click('[data-me="up"][data-i="2"]');
    await page.fill('[data-me-field="caption"][data-i="0"]', 'Texte corrigé à la main'); await page.dispatchEvent('[data-me-field="caption"][data-i="0"]', 'input');
    await page.evaluate(async () => { await idbPut('bank:intro', { text: 'Salut !', blob: state.queue[1].blob, date: Date.now() }); await loadBank(); });
    const order = await page.evaluate(() => montageItems().map(i => i.sceneIndex));
    check(JSON.stringify(order) === JSON.stringify([-1, 0, 2]) || JSON.stringify(order) === JSON.stringify([-1, 2, 0]), 'ordre du montage : intro + scènes gardées (' + order.join(', ') + ')');
    check(await page.evaluate(() => segmentsForScene(0)[0].text === 'Texte corrigé à la main'), 'sous-titre corrigé utilisé');
    await page.click('#preview-btn');
    await page.waitForSelector('#preview-box canvas', { timeout: 60000 });
    await page.waitForFunction(() => !assembling, null, { timeout: 300000 });
    check(await page.evaluate(() => !!document.querySelector('#preview-box canvas') && state.finalBlob.size > 100000), 'aperçu joué sans rien enregistrer');

    // Version dans une autre langue
    await page.evaluate(() => navOpen('videos', 'video'));
    await page.selectOption('#lang-version-select', 'en-US');
    await page.click('#lang-version-btn');
    await page.waitForFunction(() => /Prêt|Réessayer/.test(document.getElementById('lang-version-btn').textContent), null, { timeout: 300000 });
    const lv = await page.evaluate(() => ({ ok: !!state.exportCache['lang:en-US'], lang: state.language, bank: state.bankUse, cap: segmentsForScene(0)[0].text }));
    check(lv.ok && lv.lang === 'fr-FR' && lv.bank && lv.cap === 'Texte corrigé à la main', 'version anglaise créée, projet français intact');

    // Assistant de script + mode simple
    await page.evaluate(() => wizardGo(1));
    await page.click('#factcheck-btn');
    await page.waitForSelector('#fc-apply', { timeout: 30000 });
    await page.click('#fc-apply');
    check((await page.inputValue('#script-input')).startsWith('Le soleil réchauffe'), 'vérification des faits : correction appliquée');
    await page.evaluate(() => navOpen('settings', 'settings')); await page.click('[data-push="set-keys"]');
    const navOk = await page.evaluate(() => !document.querySelector('[data-screen="set-keys"]').hidden && !document.getElementById('nav-back').hidden);
    await page.click('#nav-back');
    check(navOk && await page.evaluate(() => !document.querySelector('[data-screen="settings"]').hidden), 'onglets et pages de réglages (aller-retour)');
    // Stats TikTok (API + capture lue par Claude) et conseils
    await page.click('[data-tab="stats"]');
    await page.click('#ttstats-btn');
    await page.waitForFunction(() => (state.ttStats || []).length === 1, null, { timeout: 20000 });
    await page.setInputFiles('#tt-shot-input', await photoBuffer(page));
    await page.waitForFunction(() => state.ttStats?.[0]?.fullPct === 34, null, { timeout: 20000 }).catch(() => {});
    check(await page.evaluate(() => state.ttStats.length === 1 && state.ttStats[0].views === 1500 && state.ttStats[0].fullPct === 34), 'stats TikTok : API + capture réunies');
    await page.click('#platform-advice-btn');
    await page.waitForFunction(() => document.getElementById('platform-advice').textContent.includes('Appliqué'), null, { timeout: 20000 });
    check(await page.evaluate(() => scriptExtras().includes('moins de 3 secondes') && !document.getElementById('insights-line').classList.contains('hidden')), 'conseils : leçons appliquées aux prochains scripts');

    // Publication programmée (YouTube natif + TikTok via le serveur), puis publication immédiate sur TikTok
    await page.evaluate(() => wizardGo(5));
    const when = await page.evaluate(() => { const d = new Date(Date.now() + 2 * 3600000); const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); });
    await page.fill('#pub-at', when); await page.dispatchEvent('#pub-at', 'change');
    await page.check('#pub-yt'); await page.check('#pub-tt');
    await page.waitForFunction(() => document.getElementById('tt-caption').value.includes('#science') && document.querySelector('#pub-tt-privacy option[value="PUBLIC_TO_EVERYONE"]'), null, { timeout: 20000 });
    await page.selectOption('#pub-tt-format', 'final');
    check(await page.evaluate(() => document.getElementById('publish-btn').textContent.includes('Programmer')), 'bouton « Programmer » quand une date est choisie');
    await page.click('#publish-btn');
    await page.waitForFunction(() => (getJSON('cartoon_schedule', []) || []).length === 2 && !document.getElementById('publish-btn').dataset.busy, null, { timeout: 120000 });
    check(yt[0]?.status?.privacyStatus === 'private' && !!yt[0]?.status?.publishAt, 'YouTube : vidéo programmée (publishAt)');
    await page.waitForFunction(() => document.querySelectorAll('#schedule-list [data-unschedule]').length === 1, null, { timeout: 20000 });
    check(tt.uploaded === 0, 'TikTok : rien envoyé avant l\'heure');
    await page.click('[data-tab="home"]');
    await page.click('#schedule-list [data-unschedule]');
    await page.waitForFunction(() => document.getElementById('schedule-list').textContent.includes('Annulée'), null, { timeout: 20000 });
    check(true, 'TikTok : publication programmée annulée');
    await page.evaluate(() => wizardGo(5));
    await page.fill('#pub-at', ''); await page.dispatchEvent('#pub-at', 'change'); await page.uncheck('#pub-yt');
    await page.click('#publish-btn');
    await page.waitForFunction(() => (getJSON('cartoon_schedule', []) || []).length === 3 && !document.getElementById('publish-btn').dataset.busy, null, { timeout: 120000 });
    let pubOk = false;
    for (let i = 0; i < 20 && !pubOk; i++) { await new Promise(r => setTimeout(r, 1500)); await page.evaluate(() => renderSchedule()); pubOk = await page.evaluate(() => document.getElementById('schedule-list').textContent.includes('Publiée sur TikTok')); }
    const finalSize = await page.evaluate(() => state.finalBlob.size);
    check(pubOk && tt.uploaded === finalSize && tt.inits[0]?.post_info?.privacy_level === 'PUBLIC_TO_EVERYONE' && tt.inits[0]?.post_info?.title.includes('#science'), 'TikTok : vidéo publiée par le serveur (' + tt.uploaded + ' octets)' + (pubOk ? '' : ' [liste : ' + await page.evaluate(() => document.getElementById('schedule-list').textContent) + ']') + ' ' + JSON.stringify(tt.inits[0]?.post_info));

    // Sous-titres traduits sur YouTube, découpage, zones TikTok, accroches, question de fin, même structure, dépenses
    check(await page.evaluate(() => /-->/.test(state.langSrt?.['en-US'] || '')), 'sous-titres anglais prêts');
    await page.evaluate(() => navOpen('videos', 'video'));
    await page.click('#lang-yt-btn');
    await page.waitForFunction(() => document.getElementById('toast-text').textContent.includes('Sous-titres ajoutés'), null, { timeout: 20000 }).catch(() => {});
    check((yt.captions || 0) >= 2, 'sous-titres traduits ajoutés à la vidéo YouTube');
    check(await page.evaluate(() => computeParts(4).length > 1 && computeParts().length === 1 && safeZone(1080, 1920).on && !safeZone(1920, 1080).on), 'découpage en parties et zones TikTok');
    await page.evaluate(() => wizardGo(1));
    await page.click('#hooks-btn'); await page.waitForSelector('[data-hook="0"]', { timeout: 20000 }); await page.click('[data-hook="0"]');
    check((await page.inputValue('#script-input')).startsWith('Savais-tu'), 'accroche choisie appliquée');
    await page.click('#end-question-btn');
    await page.waitForFunction(() => document.getElementById('script-input').value.trim().endsWith('par jour ?'), null, { timeout: 20000 }).catch(() => {});
    check((await page.inputValue('#script-input')).trim().endsWith('par jour ?'), 'question de fin ajoutée');
    await page.evaluate(() => { document.getElementById('theme-input').value = 'Les volcans'; return sameStructure('Modèle.\nModèle.'); });
    check((await page.inputValue('#script-input')).startsWith('Ligne modèle un.'), 'nouveau script sur le même modèle');
    const costs = await page.evaluate(() => { const c = getJSON(STORAGE.COSTS); const m = c.months[new Date().toISOString().slice(0, 7)]; renderCosts(); return m; });
    check(costs.agnes > 0 && costs.claude > 0 && costs.elevenlabs > 0, 'dépenses suivies (Agnes, Claude, ElevenLabs)');

    // YouTube Shorts + Instagram Reels
    await page.evaluate(() => wizardGo(5));
    await page.fill('#pub-at', ''); await page.dispatchEvent('#pub-at', 'change');
    await page.uncheck('#pub-tt'); await page.check('#pub-ys'); await page.check('#pub-ig');
    await page.selectOption('#pub-tt-format', 'final');
    const ytBefore = yt.length;
    await page.click('#publish-btn');
    await page.waitForFunction(() => !document.getElementById('publish-btn').dataset.busy && (getJSON('cartoon_schedule', []) || []).some(p => p.platform === 'instagram'), null, { timeout: 120000 });
    check(yt.length === ytBefore + 1 && /#Shorts/.test(yt[yt.length - 1]?.snippet?.title || ''), 'YouTube Shorts publié (#Shorts)');
    for (let i = 0; i < 30 && !ig.published; i++) await new Promise(r => setTimeout(r, 1000));
    check(ig.published === 1 && ig.fetched === await page.evaluate(() => state.finalBlob.size) && ig.caption.length > 0, 'Instagram Reels : vidéo récupérée à l\'adresse signée et publiée (' + ig.fetched + ' octets)');
    const badSig = await W.default.fetch(new Request('https://relais.test/pub/post%2Fx?exp=' + (Date.now() + 1e6) + '&sig=faux'), env);
    check(badSig.status === 403, 'adresse publique refusée sans signature valide');

    // Projets : la vidéo est rangée, on en commence une autre, puis on la rouvre
    const proj = await page.evaluate(() => { const p = findProject(state.projectId); return p && { id: p.id, status: p.status, finalKey: p.finalKey, n: getProjects().length }; });
    check(proj && ['scheduled', 'published'].includes(proj.status) && proj.finalKey, 'projet enregistré (' + (proj && proj.status) + ', vidéo finale sauvegardée)');
    await page.click('[data-tab="home"]'); await page.click('#home-new-btn');
    check(await page.evaluate(() => !state.finalBlob && !state.queue.length && document.getElementById('script-input').value === '' && NAV.step === 1), 'nouvelle vidéo : espace de travail vide');
    await page.evaluate(() => navOpen('videos', 'videos'));
    await page.waitForSelector('[data-project="' + proj.id + '"]', { timeout: 20000 });
    await page.click('[data-project="' + proj.id + '"]');
    await page.waitForFunction(() => !!state.finalBlob, null, { timeout: 60000 });
    check(await page.evaluate(id => state.projectId === id && state.queue.filter(q => q.status === 'done').length === 3 && state.theme.length > 0 && !document.querySelector('[data-screen="video"]').hidden, proj.id), 'projet rouvert : scènes, vidéo finale et fiche retrouvées');

    // Fiche pédagogique PDF
    await page.click('#pdf-sheet-btn');
    await page.waitForFunction(() => /Prêt|Réessayer/.test(document.getElementById('pdf-sheet-btn').textContent), null, { timeout: 60000 });
    const pdf = await page.evaluate(async () => { const b = state.exportCache['pdf-sheet']?.blob; if (!b) return null; const t = new TextDecoder('latin1').decode(await b.arrayBuffer()); return { size: b.size, head: t.slice(0, 5), pages: (t.match(/\/Type \/Page\b/g) || []).length }; });
    check(pdf && pdf.head === '%PDF-' && pdf.pages >= 2, 'fiche pédagogique PDF créée (' + (pdf ? pdf.pages + ' pages' : 'échec') + ')');

    // Commentaires YouTube
    await page.click('[data-tab="stats"]'); await page.click('#comments-btn');
    await page.waitForFunction(() => document.querySelector('[data-comment-reply="0"]')?.value.includes('Merci'), null, { timeout: 30000 });
    check(await page.evaluate(() => state.comments.length === 1), 'commentaires sans réponse trouvés, réponse proposée par Claude');
    await page.click('[data-comment-send="0"]');
    await page.waitForFunction(() => !state.comments.length, null, { timeout: 20000 });
    check(replies.length === 1 && replies[0].snippet.parentId === 't1' && replies[0].snippet.textOriginal.startsWith('Merci'), 'réponse publiée sur YouTube');
    check(!mockStats.badSystem, 'consignes de Claude envoyées avec le cache (moins cher)');
    check(errors.length === 0, 'aucune erreur JavaScript' + (errors.length ? ' : ' + errors.join(' | ') : ''));
    await ctx.close();
}

// Chaque style : les règles corrigées sont bien envoyées à l'IA vidéo, et le montage suit le bon chemin
async function testStyles(browser) {
    console.log('\n▶ Tous les styles');
    const ctx = await browser.newContext({ serviceWorkers: 'block', ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
    await ctx.route(ORIGIN + '/**', serveApp);
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(ORIGIN + '/index.html');
    const res = await page.evaluate(() => {
        const lines = ['Bonjour à tous !', 'Le soleil chauffe l\'eau.', 'Merci et à bientôt !'];
        document.getElementById('script-input').value = lines.join('\n'); updateScriptStats();
        state.pedagoFx = ['arrows', 'bubbles', 'highlight', 'schemas', 'progress'];
        return CARTOON_STYLES.map(st => {
            state.selectedStyle = st.id;
            const wb = isWhiteboard();
            const plan = fallbackScenePlan(lines);
            state.scenePlan = { ...plan, setting: wb ? '' : 'a calm, simple classroom corner' };
            const prompts = lines.map((t, i) => buildScenePrompt({ sceneIndex: i, sceneText: t }));
            const bg = buildScenePrompt({ sceneIndex: 1, sceneText: lines[1] }, { total: 3, setting: '{{SETTING}}', plan: { spoken: '{{SPOKEN}}', action: '{{ACTION}}', camera: '{{CAMERA}}' } });
            const req = planRequestFor(lines);
            const problems = [];
            prompts.forEach((p, i) => {
                if (!p.includes('MUST stay IDENTICAL')) problems.push('identité');
                if (!p.includes('STRICTLY NO TEXT')) problems.push('pas de texte');
                if (!p.includes('says (spoken audio only, never written): "' + lines[i].replace(/"/g, "'") + '"')) problems.push('réplique exacte');
                if (effectiveMusicMode() !== 'agnes' && !p.includes('No background music')) problems.push('voix seule');
                if (!p.includes(st.prompt)) problems.push('style');
                if (/diagram|progress bar/i.test(p)) problems.push('effets qui écrivent du faux texte');
                if (wb ? !p.includes('pure plain white') : !(p.includes('a calm, simple classroom corner') && p.includes('Background: simple and uncluttered'))) problems.push('décor');
                if (wb ? !p.includes('locked-off static') : !/No zoom-in at the start|locked-off static/.test(p)) problems.push('caméra');
                if (!p.includes('starts exactly on the input image') || !p.includes('returns to the same neutral pose')) problems.push('raccords (pose neutre)');
            });
            if (!bg.includes(wb ? 'pure plain white' : 'Background: simple and uncluttered')) problems.push('décor en arrière-plan');
            if (!req.prompt.includes('SIMPLE et épuré')) problems.push('décor simple demandé à Claude');
            if (wb !== req.prompt.includes('MODE TABLEAU BLANC')) problems.push('règles tableau blanc');
            if (/writing|lettering|numbers/i.test(st.prompt) && !/never|no /i.test(st.prompt)) problems.push('style qui pousse au texte');
            // avec une image de référence : le style et le décor viennent de l'image, rien n'est redessiné
            state.reference = { image: 'data:image/jpeg;base64,AAAA', sig: photoSig(), style: st.id };
            const rp = buildScenePrompt({ sceneIndex: 1, sceneText: lines[1] });
            if (!rp.includes('exact reference frame') || rp.includes(st.prompt) || !rp.includes('same framing as the input image') && !rp.includes('locked-off static')) problems.push('image de référence');
            if (imageForScene(1) !== state.reference.image) problems.push('départ depuis la référence');
            state.reference = null;
            // mode écran vert : fond vert uni demandé, décor de l'appli dessiné, plans illustrés sans erreur
            state.greenScreen = true;
            const gp = buildScenePrompt({ sceneIndex: 1, sceneText: lines[1] });
            if (!gp.includes('chroma-key green') || gp.includes('pure plain white') || gp.includes('classroom corner')) problems.push('fond vert');
            if (!referencePrompt().includes('chroma-key green')) problems.push('référence fond vert');
            const c = document.createElement('canvas'); c.width = 320; c.height = 180; const g = c.getContext('2d');
            try {
                drawDecor(g, 320, 180);
                ['counter', 'bars', 'list', 'compare'].forEach(type => drawBoardShot(g, 320, 180, 1.5, 4, { backdrop: c, drawing: null, sched: null, title: '', presenter: c, graphic: normalizeGraphic({ type, title: 'T', unit: 'kg', items: [{ label: 'A', value: 12 }, { label: 'B', value: 3.5 }] }), words: [] }));
            } catch (e) { problems.push('plan illustré : ' + e.message); }
            state.greenScreen = false;
            return { id: st.id, wb, problems: [...new Set(problems)] };
        });
    });
    const tm = await page.evaluate(() => {
        const input = document.getElementById('script-input');
        input.value = Array.from({ length: 10 }, (_, i) => 'Phrase ' + (i + 1) + '.').join('\n');
        document.getElementById('test-mode-toggle').click();
        const scenes = state.scenes.slice();
        writeSceneLines(['Nouveau début.', scenes[1], scenes[2]]); updateScriptStats();
        const kept = splitScriptIntoScenes(input.value).length;
        document.getElementById('test-mode-toggle').click();
        return { scenes, kept, first: input.value.split('\n')[0], after: state.scenes.length };
    });
    check(tm.scenes.join('|') === 'Phrase 1.|Phrase 6.|Phrase 10.' && tm.kept === 10 && tm.first === 'Nouveau début.' && tm.after === 10, 'mode test : 3 scènes (début, milieu, fin), script complet conservé');
    res.forEach(r => check(!r.problems.length, 'style ' + r.id + (r.wb ? ' (tableau blanc : dessins de l\'appli)' : '') + (r.problems.length ? ' : ' + r.problems.join(', ') : '')));
    check(errors.length === 0, 'aucune erreur JavaScript' + (errors.length ? ' : ' + errors.join(' | ') : ''));
    await ctx.close();
}

async function testCompositor(browser) {
    console.log('\n▶ Image : fond vert, couleurs, graphiques, pause du montage');
    const ctx = await browser.newContext({ serviceWorkers: 'block', ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
    await ctx.route(ORIGIN + '/**', serveApp);
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(ORIGIN + '/index.html');
    const r = await page.evaluate(async () => {
        // image de test : fond vert + personnage orange à gauche
        const src = document.createElement('canvas'); src.width = 320; src.height = 180; const sg = src.getContext('2d');
        sg.fillStyle = '#00B140'; sg.fillRect(0, 0, 320, 180); sg.fillStyle = '#f07a3a'; sg.fillRect(60, 40, 60, 140);
        const proc = createVideoProcessor();
        const out = proc.process(src, { key: true, grade: { gain: [1, 1, 1], off: [0, 0, 0] } });
        const rd = document.createElement('canvas'); rd.width = 320; rd.height = 180; const rg = rd.getContext('2d'); rg.drawImage(out, 0, 0, 320, 180);
        const alpha = (x, y) => rg.getImageData(x, y, 1, 1).data[3];
        const keyed = { bg: alpha(250, 30), fg: alpha(90, 120) };
        const st = sampleStats(src, true);
        const warm = sampleStats((() => { const c = document.createElement('canvas'); c.width = 320; c.height = 180; const g = c.getContext('2d'); g.drawImage(src, 0, 0); g.fillStyle = 'rgba(255,120,0,0.35)'; g.fillRect(0, 0, 320, 180); return c; })(), false);
        const gr = gradeTowards(warm, sampleStats(src, false));
        const al = alignTransform({ bbox: { x: 0.3, y: 0.3, w: 0.2, h: 0.5 } }, { bbox: { x: 0.2, y: 0.2, w: 0.2, h: 0.6 } });
        proc.dispose();
        // graphiques animés dans les deux formats
        const bad = [];
        for (const [W, H] of [[640, 360], [360, 640]]) for (const type of ['counter', 'bars', 'list', 'compare']) {
            const c = document.createElement('canvas'); c.width = W; c.height = H;
            try { drawBoardShot(c.getContext('2d'), W, H, 2, 4, { backdrop: c, drawing: null, sched: null, title: 'Titre', presenter: null, graphic: normalizeGraphic({ type, title: 'Évaporation', unit: 'km³', items: [{ label: 'Océans', value: 500000 }, { label: 'Continents', value: 70000 }, { label: 'Lacs et rivières', value: 1200 }] }), words: [] }); }
            catch (e) { bad.push(type + ' ' + W + 'x' + H + ' : ' + e.message); }
        }
        const ng = normalizeGraphic({ type: 'bars', items: [{ label: 'x', value: 'abc' }, { label: 'y', value: 2 }] });
        const none = normalizeGraphic({ type: 'n\'importe', items: [] });
        // pause du montage : le temps passé en arrière-plan n'est pas compté
        let hid = false; Object.defineProperty(document, 'hidden', { configurable: true, get: () => hid });
        Object.assign(montagePause, { on: false, since: 0, total: 0, rec: null, actx: getAudioCtx(), resuming: null });
        const w0 = performance.now();
        setTimeout(() => { hid = true; document.dispatchEvent(new Event('visibilitychange')); }, 400);
        setTimeout(() => { hid = false; document.dispatchEvent(new Event('visibilitychange')); }, 1400);
        const played = await runFrames(1.2, () => {});
        const wall = (performance.now() - w0) / 1000;
        Object.assign(montagePause, { on: false, actx: null });
        return { keyed, bbox: st.bbox, gr, al, bad, ng, none: none.type, played, wall };
    });
    // image de référence fournie (personnage sur fond vert) : importée, détourée, le nœud papillon vert garde sa couleur
    await page.evaluate(() => { state.greenScreen = true; state.images = [{ dataUri: 'data:image/png;base64,iVBORw0KGgo=' }]; navOpen('set-brand'); renderReference(); });
    await page.setInputFiles('#ref-import-input', path.join(__dirname, 'fixtures', 'ref-vert.png'));
    await page.waitForFunction(() => !!referenceImage(), null, { timeout: 10000 });
    const ri = await page.evaluate(async () => {
        const img = await loadImageEl(referenceImage()), proc = createVideoProcessor();
        const out = proc.process(img, { key: true });
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(out, 0, 0);
        const px = (fx, fy) => Array.from(g.getImageData(Math.round(fx * img.width), Math.round(fy * img.height), 1, 1).data);
        const stored = await idbGet(refStorageKey());
        proc.dispose(); state.greenScreen = false;
        // nœud papillon : premier pixel turquoise de l'image d'origine
        const s = document.createElement('canvas'); s.width = img.width; s.height = img.height; const sg = s.getContext('2d', { willReadFrequently: true }); sg.drawImage(img, 0, 0);
        const d = sg.getImageData(0, 0, img.width, img.height).data; let bow = null;
        for (let i = 0; i < d.length && !bow; i += 4) if (d[i] < 30 && d[i + 1] > 160 && d[i + 2] > 110 && d[i + 2] < 180) bow = [(i / 4) % img.width, Math.floor(i / 4 / img.width)];
        const bo = bow ? Array.from(g.getImageData(bow[0], bow[1], 1, 1).data) : null, bi = bow ? Array.from(sg.getImageData(bow[0], bow[1], 1, 1).data) : null;
        return { corner: px(0.02, 0.02), bo, bi, green: stored && stored.green && stored.imported };
    });
    check(ri.green && ri.corner[3] < 20, 'image de référence fond vert importée et détourée');
    check(ri.bo && ri.bo[3] > 240 && Math.abs(ri.bo[1] - ri.bi[1]) < 12, 'accessoire vert du personnage conservé (' + JSON.stringify([ri.bi, ri.bo]) + ')');
    check(r.keyed.bg < 20 && r.keyed.fg > 235, 'fond vert retiré, personnage conservé (' + JSON.stringify(r.keyed) + ')');
    check(r.bbox && Math.abs(r.bbox.x - 60 / 320) < 0.03 && Math.abs(r.bbox.w - 60 / 320) < 0.03, 'silhouette du personnage repérée');
    check(r.gr && r.gr.off[0] < 0 && r.gr.off[2] > 0, 'couleurs d\'une scène trop chaude ramenées vers la référence');
    check(r.al && r.al.s > 1 && r.al.dx < 0, 'personnage recalé (taille et position) d\'une scène à l\'autre');
    check(!r.bad.length, 'graphiques animés (compteur, barres, liste, comparaison) en paysage et vertical' + (r.bad.length ? ' : ' + r.bad.join(' | ') : ''));
    check(r.ng.items[0].value === 0 && r.none === 'none', 'graphiques invalides neutralisés');
    check(r.played > 1.1 && r.wall > 2, 'montage en pause quand l\'appli passe en arrière-plan, puis reprise (' + r.played.toFixed(2) + ' s joués en ' + r.wall.toFixed(2) + ' s)');
    check(errors.length === 0, 'aucune erreur JavaScript' + (errors.length ? ' : ' + errors.join(' | ') : ''));
    await ctx.close();
}

async function testBackground(browser) {
    console.log('\n▶ Génération en arrière-plan');
    const W = await loadWorker(true);
    const { env, objects } = fakeDurableObjects(W);
    const ctx = await browser.newContext({ serviceWorkers: 'block', ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
    const clipBufs = await makeClips(page);
    const counters = { agnes: [], vid: 0, clipFor: n => n % 2 === 0 ? 0 : 2 };
    // côté serveur : Agnes et Claude simulés
    counters.serverFetch = async (u, o) => {
        if (u.startsWith('https://api.elevenlabs.io/v1/text-to-speech/')) { counters.tts = (counters.tts || 0) + 1; return new Response(toneWav(), { headers: { 'Content-Type': 'audio/wav' } }); }
        if (u.endsWith('/v1/videos')) { counters.agnes.push(JSON.parse(o.body)); return Response.json({ video_id: 'v' + (counters.vid++) }); }
        if (u.includes('agnesapi')) { const id = new URL(u).searchParams.get('video_id'); return Response.json({ status: 'completed', metadata: { url: 'https://cdn.test/' + id + '.webm' } }); }
        throw new Error('appel inattendu ' + u);
    };
    await commonRoutes(ctx, clipBufs, env, W, counters);
    await setup(page, { genMode: 'background', storyboardOn: true });
    await fillProject(page);
    await page.click('#wiz-next');
    await page.waitForSelector('#storyboard:not(.hidden) #sb-approve', { timeout: 60000 });
    await page.click('#sb-approve');
    await page.click('#generate-btn');
    await page.waitForFunction(() => document.getElementById('bg-text').textContent.includes('éteindre'), null, { timeout: 30000 });
    check(true, 'projet envoyé au serveur');
    await page.close();                                   // « téléphone éteint »
    await new Promise(r => setTimeout(r, 9000));
    const page2 = await ctx.newPage(); page2.on('pageerror', e => errors.push(e.message)); page2.on('dialog', d => d.accept());
    await page2.goto(ORIGIN + '/index.html');
    await page2.waitForSelector('#home-finish-btn', { timeout: 60000 });
    check(await page2.evaluate(() => state.images.length === 1), 'à la réouverture : Accueil « Terminer la vidéo », photo du personnage gardée');
    check(counters.agnes.length === 3 && counters.agnes[2].image.startsWith('data:image/jpeg'), 'pose choisie par Claude envoyée pour la scène 3');
    await page2.click('#home-finish-btn');
    await page2.waitForSelector('#video-preview.visible', { timeout: 300000 });
    check(await page2.evaluate(() => state.finalBlob.size > 100000), 'vidéo finale assemblée après la génération en arrière-plan');
    check(await page2.evaluate(() => state.queue.every(q => q.mediaKey && q.mediaKey.startsWith('job/'))), 'scènes copiées sur Cloudflare par le serveur');
    check(counters.tts >= 1 && await page2.evaluate(() => !!state.queue[1].narrKey && state.timeline.some(t => t.narration)), 'voix off créée par le serveur (téléphone éteint) et utilisée au montage');
    // Scène ratée refaite en arrière-plan, récupérée au montage suivant
    const beforeUrl = await page2.evaluate(() => state.queue[0].videoUrl);
    await page2.evaluate(() => redoInBackground([state.queue[0]]));
    check(await page2.evaluate(() => { const p = findProject(state.projectId); return !!p.redo?.jobId && p.status === 'generating'; }), 'scène ratée renvoyée au serveur (nouvelle prise en arrière-plan)');
    let redoReady = false;
    for (let i = 0; i < 40 && !redoReady; i++) { await new Promise(r => setTimeout(r, 1500)); redoReady = await page2.evaluate(async () => { await refreshProjects(true); return findProject(state.projectId).status === 'ready'; }); }
    await page2.evaluate(() => { unlockAudio(); return runAssembly(); });
    check(redoReady && await page2.evaluate(url => state.queue[0].videoUrl !== url && !findProject(state.projectId).redo && !!state.finalBlob, beforeUrl), 'nouvelle prise récupérée et vidéo remontée');
    // Série entière en arrière-plan
    await page2.evaluate(() => wizardGo(1)); await page2.click('[data-sheet]');
    await page2.fill('#series-input', 'Épisode A\nLe soleil chauffe l\'eau.\nLe soleil chauffe l\'eau.\n\nÉpisode B\nLe soleil chauffe l\'eau.\nLe soleil chauffe l\'eau.');
    await page2.dispatchEvent('#series-input', 'input');
    await page2.setInputFiles('#file-input', await photoBuffer(page2));
    await page2.waitForFunction(() => state.images.length > 0);
    await page2.click('#launch-series-btn');
    await page2.click('#sheet-close'); await page2.click('[data-tab="home"]');
    await page2.waitForFunction(() => document.querySelectorAll('#series-jobs .series-item').length === 2, null, { timeout: 60000 });
    check(true, 'série : 2 épisodes envoyés en arrière-plan');
    let ready = 0;
    for (let i = 0; i < 40 && ready < 2; i++) { await new Promise(r => setTimeout(r, 1500)); await page2.click('#series-refresh-btn'); await new Promise(r => setTimeout(r, 400)); ready = await page2.evaluate(() => document.querySelectorAll('[data-series-finish]').length); }
    check(ready === 2, 'série : les 2 épisodes sont prêts à terminer');
    // Pilote automatique : Claude prépare la semaine, le serveur génère, « Tout monter »
    await page2.evaluate(() => navOpen('home', 'autopilot'));
    await page2.selectOption('#ap-count', '2');
    await page2.uncheck('#ap-yt'); await page2.uncheck('#ap-tt');
    await page2.click('#ap-prepare-btn');
    await page2.waitForSelector('#ap-launch-btn:not(.hidden)', { timeout: 30000 });
    const slots = await page2.evaluate(() => state.apPlan.map(v => new Date(v.at)).map(d => [d.getDay(), d.getHours()]));
    check(slots.length === 2 && slots.every(([d, h]) => [1, 3, 5].includes(d) && h === 18), 'semaine préparée : 2 vidéos aux créneaux choisis');
    await page2.click('#ap-launch-btn');
    await page2.waitForFunction(() => getProjects().filter(p => p.auto && p.status === 'generating' && p.jobId).length === 2, null, { timeout: 60000 });
    check(true, 'pilote : 2 vidéos envoyées au serveur');
    let apReady = 0;
    for (let i = 0; i < 60 && apReady < 2; i++) { await new Promise(r => setTimeout(r, 1500)); apReady = await page2.evaluate(async () => { await refreshProjects(true); renderAutopilotProjects(); return getProjects().filter(p => p.auto && p.status === 'ready').length; }); }
    check(apReady === 2, 'pilote : les 2 vidéos sont prêtes à monter');
    await page2.click('#ap-finish-btn');
    await page2.waitForFunction(() => document.getElementById('ap-report').textContent.includes('Bilan'), null, { timeout: 600000 });
    check(await page2.evaluate(() => getProjects().filter(p => p.auto && p.status === 'done').length === 2 && document.getElementById('ap-report').textContent.includes('Les volcans') && getProjects().filter(p => p.auto).every(p => p.plan?.at)), 'pilote : « Tout monter » a monté les 2 vidéos');

    const keys = [...[...objects.values()].find(o => o.storage?._m?.has('job')).storage._m.keys()];
    check(!keys.includes('secrets') && !keys.includes('image'), 'clés et photo effacées du serveur (' + keys.join(', ') + ')');
    check(errors.length === 0, 'aucune erreur JavaScript' + (errors.length ? ' : ' + errors.join(' | ') : ''));
    await ctx.close();
}

(async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--autoplay-policy=no-user-gesture-required'] });
    try {
        if (!process.env.ONLY || process.env.ONLY === 'styles') await testStyles(browser);
        if (!process.env.ONLY || process.env.ONLY === 'compositor') await testCompositor(browser);
        if (!process.env.ONLY || process.env.ONLY === 'phone') await testPhoneMontage(browser);
        if (!process.env.ONLY || process.env.ONLY === 'background') await testBackground(browser);
    }
    catch (e) { console.log('❌ Erreur du test : ' + e.message); failures++; }
    finally { await browser.close(); }
    console.log(failures ? '\n❌ ' + failures + ' vérification(s) en échec' : '\n✅ Tous les tests passent');
    process.exit(failures ? 1 : 0);
})();
