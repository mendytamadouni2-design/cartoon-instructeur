// Tests de bout en bout de Cartoon Instructeur — services simulés, aucune clé réelle.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'index.html');
const ORIGIN = 'https://app.test';
const RELAY = 'https://cartoon-instructeur.mendy-tamadouni2.workers.dev';
let failures = 0;
// Sert les fichiers de l'appli (index.html, css/, js/, sw.js) comme GitHub Pages
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.ttf': 'font/ttf' };
// Emojis 3D (jsDelivr / GitHub) : une image locale pour tous, les tests ne dépendent pas d'internet
const EMOJI_PNG = fs.readFileSync(path.join(__dirname, 'fixtures', 'emoji3d.png'));
function routeEmoji(ctx) { return ctx.route(/cdn\.jsdelivr\.net|raw\.githubusercontent\.com/, r => { mockStats.emoji = (mockStats.emoji || 0) + 1; return r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'image/png', body: EMOJI_PNG }); }); }
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
    mockStats.models = mockStats.models || new Set(); mockStats.models.add(body.model);
    mockStats.efforts = mockStats.efforts || {}; mockStats.efforts[Object.keys(props).join(',')] = body.output_config?.effort;
    if (process.env.SYSLEN && Array.isArray(sys)) console.log('SYSLEN', sys[0].text.length, JSON.stringify(body.messages[0].content).length, Object.keys(props).join(','));
    const content = body.messages?.[0]?.content;
    if (Array.isArray(content)) mockStats.images = Math.max(mockStats.images, content.filter(c => c.type === 'image').length);
    let out;
    if (props.score) { mockStats.qa++; out = { score: 7.5, summary: 'Personnage régulier, un dessin peu lisible.', issues: [{ scene: 2, kind: 'illustration', problem: 'le dessin ne montre pas la vapeur', action: 'redessiner' }] }; }
    else if (props.results) { mockStats.drawChecks++; out = { results: mockStats.drawChecks === 1 ? [{ k: 1, ok: false, why: 'trop vague' }] : [{ k: 1, ok: true, why: '' }] }; }
    else if (props.scenes && !props.setting) { mockStats.refChecks++; mockStats.refPrompt = Array.isArray(body.messages[0].content) ? (body.messages[0].content.find(c => c.type === 'text')?.text || '') : String(body.messages[0].content); out = { scenes: [1, 2, 3].map(n => ({ scene: n, same: !(n === 2 && mockStats.refChecks === 1 && mockStats.flagScene2 !== false), problem: n === 2 ? 'lunettes perdues' : '' })) }; }
    else if (props.traits) { mockStats.identity = (mockStats.identity || 0) + 1; out = { traits: 'orange bean-shaped body; round purple glasses; black round eyes; green bow tie; no clothing' }; }
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
    else if (props.elements && ++mockStats.paths) out = { link: 'arrow', elements: [
        { label: 'Soleil', word: 'soleil', paths: [{ d: 'M 60 100 C 60 60 140 60 140 100 C 140 140 60 140 60 100 Z', color: 'orange' }, { d: 'M 100 20 L 100 45', color: 'orange' }] },
        { label: 'Évaporation', word: 'eau', paths: [{ d: 'M 20 170 Q 60 150 100 170 Q 140 190 180 170', color: 'blue' }, { d: 'M 100 150 C 105 120 90 90 100 60', color: 'black' }] }] };
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
    // compte sans Agnes Image : l'appli doit passer à la méthode vidéo
    await ctx.route('https://apihub.agnes-ai.com/v1/images/generations', r => { counters.images = (counters.images || 0) + 1; r.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"model not found"}' }); });
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
    await routeEmoji(ctx);
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
    // 8.1 : l'image de référence est rangée dans « Avancé », repliée : on l'ouvre comme un utilisateur
    await page.evaluate(() => { const sec = document.getElementById('section-reference'); if (!sec.classList.contains('open')) sec.querySelector('.section-header').click(); });
    await page.waitForTimeout(400);
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
    check(mockStats.identity === 1 && scenePrompts.every(b => b.prompt.includes('Character identity') && b.prompt.includes('round purple glasses') && b.prompt.includes('holds nothing') && !/Effects:/.test(b.prompt)) && mockStats.refPrompt.includes('round purple glasses'), 'fiche d\'identité du personnage dans chaque scène, rien dans les mains, aucun effet demandé à Agnes');
    check(scenePrompts.length === 5 && await page.evaluate(() => state.queue[1].autoRedone === true), 'scène au personnage différent refaite automatiquement avant le montage (une seule fois) ' + JSON.stringify([scenePrompts.length, mockStats.refChecks, scenePrompts.map(b => (b.prompt.match(/says[^"]*"([^"]{0,25})/) || [])[1])]));
    check(await page.evaluate(() => state.drawings.filter(Boolean).every(d => d.labels.length === 2 && d.labels[0].text === 'Soleil') && state.drawings.some(Boolean)), 'illustrations rangées en cases avec leur mot-clé écrit dessous');
    check(await page.evaluate(() => document.getElementById('voice-indicator').textContent.includes('ElevenLabs')), 'voix utilisée affichée (ElevenLabs)');
    await page.waitForFunction(() => !!state.qaReport, null, { timeout: 60000 }).catch(() => {});
    check(await page.evaluate(() => (state.qaFrames || []).length >= 8 && !!state.qaReport && document.getElementById('qa-report').textContent.includes('7.5')) && mockStats.images >= 8, 'contrôle par l\'IA : ' + mockStats.images + ' images analysées, rapport affiché');
    await page.evaluate(() => wizardGo(4));
    await page.click('[data-qa-redraw]');
    await page.waitForFunction(() => document.querySelector('[data-qa-redraw]')?.textContent.includes('refaites'), null, { timeout: 30000 });
    check(true, 'contrôle par l\'IA : illustration refaite en un appui');
    check(await page.evaluate(() => /Scènes refaites automatiquement[^\n]*(pas de voix|personnage muet)/.test(journalText())), 'contrôle qualité : scène muette détectée et refaite');
    check(r.size > 100000, 'vidéo finale produite (' + r.type + ', ' + Math.round(r.size / 1024) + ' Ko)');
    check(await page.evaluate(() => state.finalExt === 'mp4' && /Montage image par image : \d+ images/.test(journalText())), 'montage fait image par image (WebCodecs) : ' + (await page.evaluate(() => (journalText().match(/Montage image par image[^\n]*/) || [''])[0])));
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
    await page.evaluate(() => document.querySelectorAll('details.fold').forEach(d => { d.open = true; }));   // volets « Améliorer avec Claude »… ouverts comme par l'utilisateur
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
    await page.evaluate(() => document.querySelectorAll('details.fold').forEach(d => { d.open = true; }));   // volets « Améliorer avec Claude »… ouverts comme par l'utilisateur
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
    const ef = mockStats.efforts;
    check([...mockStats.models].join() === 'claude-opus-5-5', 'Claude Opus 5.5 par défaut (moins cher)');
    check(ef['setting,scenes'] === 'high' && ef['lines'] === 'high' && ef['elements,link'] === 'high' && ef['caption,hashtags'] === 'low' && ef['replies'] === 'low', 'effort adapté à chaque tâche (' + JSON.stringify(ef) + ')');
    check(errors.length === 0, 'aucune erreur JavaScript' + (errors.length ? ' : ' + errors.join(' | ') : ''));
    await ctx.close();
}

// Chaque style : les règles corrigées sont bien envoyées à l'IA vidéo, et le montage suit le bon chemin
async function testStyles(browser) {
    console.log('\n▶ Tous les styles');
    const ctx = await browser.newContext({ serviceWorkers: 'block', ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
    await routeEmoji(ctx);
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
                if (!p.includes('No text anywhere')) problems.push('pas de texte');
                if (!p.includes('says in French: "' + lines[i].replace(/"/g, "'") + '"')) problems.push('réplique exacte');
                // 8.3 : consigne « à la façon LTX » : l'action principale en premier, moins de ~230 mots
                if (!p.startsWith('The cartoon character from the input image talks directly to the camera') || p.split(/\s+/).length > 210) problems.push('format LTX (' + p.split(/\s+/).length + ' mots)');
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
    await routeEmoji(ctx);
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
        await loadIcons();
        for (const [W, H] of [[640, 360], [360, 640]]) for (const type of ['counter', 'bars', 'list', 'compare', 'timeline', 'chain', 'beforeafter']) {
            const c = document.createElement('canvas'); c.width = W; c.height = H;
            try { drawBoardShot(c.getContext('2d'), W, H, 2, 4, { backdrop: c, drawing: null, sched: null, title: 'Titre', presenter: null, graphic: normalizeGraphic({ type, title: 'Évaporation', unit: 'km³', items: [{ label: 'Océans', value: 500000, icon: 'waves-horizontal' }, { label: 'Continents', value: 70000, icon: 'mountain' }, { label: 'Lacs et rivières', value: 1200, icon: 'droplet' }] }), words: [] }); }
            catch (e) { bad.push(type + ' ' + W + 'x' + H + ' : ' + e.message); }
        }
        // illustration de Claude : icônes de la bibliothèque + dessin libre, mots-clés dessous
        const laid = layoutDrawing({ link: 'arrow', elements: [{ label: 'Roi', word: '', icon: 'king, crown', paths: [] }, { label: 'Peuple', word: '', icon: 'people', paths: [] }, { label: 'Libre', word: '', icon: '', paths: [{ d: 'm10 10 l 80 80', color: 'red' }] }] });
        const iconDrawing = { names: [findIcon(['king'])?.name, findIcon(['water drop'])?.name], paths: laid.paths.length, labels: laid.labels.map(l => l.text).join(','), arrows: laid.paths.filter(p => p.d.includes('M') && p.color === 'black').length };
        // emojis 3D pour les styles colorés, traits pour le tableau blanc
        state.selectedStyle = 'pixar'; state.iconStyle = 'auto';
        const loaded = await preloadVideoIcons(['crown', 'scale, justice', 'vote']);
        const e3 = resolveIcon('crown'), rawE = { link: 'arrow', elements: [{ label: 'Roi', word: '', icon: 'crown', paths: [] }, { label: 'Vote', word: '', icon: 'vote', paths: [] }] };
        await prepareDrawingIcons(rawE);
        const cE = compileDrawing(layoutDrawing(rawE));
        const c3 = document.createElement('canvas'); c3.width = 400; c3.height = 300; drawSketch(c3.getContext('2d'), { x: 0, y: 0, w: 400, h: 300 }, cE, 1, 1);
        let opaque = 0; const px = c3.getContext('2d').getImageData(0, 0, 400, 300).data; for (let i = 3; i < px.length; i += 4) if (px[i] > 200) opaque++;
        state.selectedStyle = 'whiteboard';
        const wbIcon = resolveIcon('crown');
        const emoji = { loaded, kind: e3?.kind, name: e3?.name, images: cE.images.length, ghosts: cE.strokes.filter(x => x.ghost).length, opaque, wb: wbIcon?.kind || 'line' };
        state.selectedStyle = 'pixar';
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
        return { keyed, bbox: st.bbox, gr, al, bad, ng, none: none.type, played, wall, iconDrawing, emoji };
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
    check(!r.bad.length, 'graphiques animés (compteur, barres, liste, comparaison, frise, chaîne, avant/après) en paysage et vertical' + (r.bad.length ? ' : ' + r.bad.join(' | ') : ''));
    check(r.iconDrawing.names.join() === 'crown,droplet' && r.iconDrawing.labels === 'Roi,Peuple,Libre' && r.iconDrawing.paths > 6, 'illustration : icônes de la bibliothèque + dessin libre (commandes relatives acceptées), mots-clés dessous (' + JSON.stringify(r.iconDrawing) + ')');
    check(r.ng.items[0].value === 0 && r.none === 'none', 'graphiques invalides neutralisés');
    check(r.emoji.loaded === 3 && r.emoji.kind === 'emoji' && r.emoji.name === 'crown' && r.emoji.images === 2 && r.emoji.ghosts === 2 && r.emoji.opaque > 2000 && r.emoji.wb === 'line', 'icônes : emojis 3D pour les styles colorés (graphiques et illustrations), traits pour le tableau blanc (' + JSON.stringify(r.emoji) + ')');
    check(r.played > 1.1 && r.wall > 2, 'montage en pause quand l\'appli passe en arrière-plan, puis reprise (' + r.played.toFixed(2) + ' s joués en ' + r.wall.toFixed(2) + ' s)');
    // montage image par image : encodage MP4 puis relecture image par image par le décodeur (chaque image a sa couleur)
    const wc = await page.evaluate(async () => {
        if (!webcodecsAvailable()) return { skipped: true };
        const W = 320, H = 180, se = await createOfflineSession({ W, H, bitrate: 1e6, sampleRate: 48000 });
        const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
        for (let f = 0; f < 60; f++) { g.fillStyle = 'rgb(' + (f * 4) + ',' + (f * 4) + ',' + (f * 4) + ')'; g.fillRect(0, 0, W, H); await se.frame(c, f / 30); }
        const ab = new AudioBuffer({ numberOfChannels: 2, length: 96000, sampleRate: 48000 });
        for (let ch = 0; ch < 2; ch++) { const d = ab.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] = Math.sin(i / 10) * 0.4; }
        const blob = await se.finish(ab);
        const src = await openFrameSource({ blob, sceneIndex: 0 }, null);
        const red = async t => { await src.at(t); return src.canvas.getContext('2d').getImageData(10, 10, 1, 1).data[0]; };
        const reds = [await red(0), await red(0.5), await red(1.0), await red(1.9)];
        src.close();
        const dec = await new AudioContext().decodeAudioData(await blob.arrayBuffer());
        let e = 0; const d = dec.getChannelData(0); for (let i = 0; i < d.length; i++) e += d[i] * d[i];
        return { kind: src.kind, reds, audio: Math.sqrt(e / d.length), dur: dec.duration, codec: se.codec };
    });
    check(wc.skipped || (wc.kind === 'decoder' && Math.abs(wc.reds[1] - 60) < 6 && Math.abs(wc.reds[2] - 120) < 6 && Math.abs(wc.reds[3] - 228) < 6 && wc.reds[0] < 6),
        'montage image par image : MP4 encodé puis relu à l\'image près (' + JSON.stringify(wc.reds) + ', ' + wc.codec + ')');
    check(wc.skipped || (wc.audio > 0.2 && Math.abs(wc.dur - 2) < 0.1), 'montage image par image : son mixé et encodé (' + (wc.audio || 0).toFixed(2) + ')');
    const cut = await page.evaluate(() => { state.trimMode = 'auto'; return sceneCutAuto({ sttWords: [{ text: 'Bonjour', start: 0.9, end: 1.3 }, { text: 'toi', start: 1.4, end: 2.6 }], speech: { silent: false, start: 0.2, end: 5.8, coverage: 0.99 } }, 6, 1); });
    check(Math.abs(cut.tin - 0.78) < 0.01 && Math.abs(cut.tout - 2.9) < 0.01, 'scène coupée juste avant le premier mot et juste après le dernier (pas de blanc entre les scènes)');
    const ind = await page.evaluate(() => { localStorage.setItem('elevenlabs_api_key', 'sk_x'); elevenlabsSelectedVoiceId = 'v1'; state.voiceSource = 'premium'; state.ttsEngine = 'elevenlabs'; updateVoiceIndicator(); return document.getElementById('voice-indicator')?.textContent || ''; });
    check(ind.includes('ElevenLabs'), 'voix premium ElevenLabs bien affichée (' + ind.slice(0, 40) + ')');
    // Budget ElevenLabs : compteur, phrases en mémoire jamais repayées, quota épuisé détecté
    const budget = await page.evaluate(async () => {
        const realFetch = window.fetch; let tts = 0, quotaHit = false;
        window.fetch = async (u, o) => {
            u = String(u);
            if (u.endsWith('/user/subscription')) return new Response(JSON.stringify({ character_count: 9200, character_limit: 10000, next_character_count_reset_unix: 1790000000 }), { status: 200 });
            if (u.includes('/text-to-speech/')) { tts++; if (quotaHit) return new Response('{"detail":{"status":"quota_exceeded"}}', { status: 401 }); return new Response(new Blob([new Uint8Array(64)], { type: 'audio/mpeg' })); }
            return realFetch(u, o);
        };
        try {
            localStorage.removeItem(STORAGE.ELEVEN_EXHAUSTED);
            await refreshElevenQuota();
            const line = elevenQuotaLine(), left = elevenRemaining();
            await generateElevenLabsAudio('Bonjour à tous, phrase de test.', 'v1', 'eleven_multilingual_v2', '0.5', '0.75', 1);
            await new Promise(r => setTimeout(r, 200));
            await generateElevenLabsAudio('Bonjour à tous, phrase de test.', 'v1', 'eleven_multilingual_v2', '0.5', '0.75', 1);
            const afterCache = tts, leftAfter = elevenRemaining();
            quotaHit = true;
            let msg = '';
            try { await generateElevenLabsAudio('Une autre phrase jamais dite.', 'v1', 'eleven_multilingual_v2', '0.5', '0.75', 1); } catch (e) { msg = e.message; }
            const before = tts; let blocked = '';
            try { await generateElevenLabsAudio('Encore une autre phrase.', 'v1', 'eleven_multilingual_v2', '0.5', '0.75', 1); } catch (e) { blocked = e.message; }
            state.scenes = ['Une phrase de script assez longue pour compter.']; state.voiceSource = 'fit';
            const need = elevenCharsNeeded();
            return { line, left, afterCache, leftAfter, msg, noCall: tts === before, blocked, need, exhaustedLine: elevenQuotaLine() };
        } finally { window.fetch = realFetch; localStorage.removeItem(STORAGE.ELEVEN_EXHAUSTED); }
    });
    check(budget.left === 800 && budget.line.includes('800 caractères restants'), 'ElevenLabs : caractères restants du mois affichés (' + budget.line.slice(0, 60) + ')');
    check(budget.afterCache === 1 && budget.leftAfter === 800 - 'Bonjour à tous, phrase de test.'.length, 'ElevenLabs : une phrase déjà dite est reprise de la mémoire, jamais repayée');
    check(/épuisé/.test(budget.msg) && budget.noCall && /épuisé/.test(budget.blocked) && /épuisé/.test(budget.exhaustedLine), 'ElevenLabs : quota épuisé détecté, plus aucun appel inutile');
    check(budget.need >= 40, 'ElevenLabs : caractères nécessaires estimés avant de lancer (' + budget.need + ')');
    // 8.0 : Shorts / TikTok (pas de cartons, accroche, rythme), charte, mode objectif, recherche internet, images perso
    const v8 = await page.evaluate(async () => {
        const r = {};
        state.target = 'shorts'; state.introOn = true; state.outroOn = true; state.sectionCards = true; state.theme = 'Test';
        const it = { sceneIndex: 0 }, it2 = { sceneIndex: 1 };
        r.shortSegs = buildSegments([it, it2], Infinity).map(s => s.type).join(',');
        r.ytSegs = buildSegments([it, it2], Infinity, 'landscape').map(s => s.type).join(',');
        r.format = outputFormat();
        const words = [0.2, 0.8, 1.5, 2.3, 3.1, 3.9, 4.6, 5.4].map((t, i) => ({ text: 'm' + i, start: t, end: t + 0.5 }));
        r.cuts = punchSchedule(words, 7);
        r.zoomAfter = punchZoom(r.cuts, r.cuts[0] + 0.5);
        const c = document.createElement('canvas'); c.width = 360; c.height = 640; const g = c.getContext('2d');
        g.fillStyle = '#000'; g.fillRect(0, 0, 360, 640);
        drawHookTitle(g, 360, 640, 'Tu savais ça ?', 0.8);
        r.hookPixels = g.getImageData(0, 100, 360, 60).data.some((v, i) => i % 4 === 0 && v > 150);
        setJSON(STORAGE.CHARTER, { name: 'Prof Patate', voice: 'direct', energy: 'punchy' });
        r.ctx = claudeContext();
        r.energyCuts = punchSchedule(words, 7).length;
        // callClaude : recherche internet avec reprise après une pause (pause_turn)
        const realFetch = window.fetch; const bodies = [];
        window.fetch = async (u, o) => {
            if (String(u).includes('api.anthropic.com')) {
                bodies.push(JSON.parse(o.body));
                const paused = bodies.length === 1;
                return new Response(JSON.stringify({ model: 'claude-opus-5-5', stop_reason: paused ? 'pause_turn' : 'end_turn', content: [{ type: 'text', text: paused ? 'Fait 1. ' : 'Fait 2.' }], usage: { input_tokens: 10, output_tokens: 10, server_tool_use: { web_search_requests: 2 } } }), { status: 200 });
            }
            return realFetch(u, o);
        };
        const oldKey = localStorage.getItem(STORAGE.CLAUDE_KEY); localStorage.setItem(STORAGE.CLAUDE_KEY, 'sk-ant-test');
        try { r.research = await callClaude({ prompt: 'x', webSearch: 3 }); } finally { window.fetch = realFetch; }
        r.tool = bodies[0].tools?.[0]?.type; r.resent = bodies.length === 2 && bodies[1].messages.length === 2;
        // mode objectif : pas de question → script écrit directement, avec les faits trouvés
        const realCall = window.callClaude, calls = [];
        window.callClaude = async o => { calls.push(o); if (o.webSearch) return 'Fait vérifié (source)'; if (o.schema?.properties?.questions) return { questions: [] }; return { title: 'Les intérêts composés', lines: ['Ton argent peut travailler pour toi ?', 'Oui, grâce aux intérêts composés.'] }; };
        try {
            document.getElementById('objective-input').value = 'expliquer les intérêts composés';
            document.getElementById('objective-research').checked = true;
            await startObjective();
        } finally { window.callClaude = realCall; if (oldKey === null) localStorage.removeItem(STORAGE.CLAUDE_KEY); else localStorage.setItem(STORAGE.CLAUDE_KEY, oldKey); }
        r.script = document.getElementById('script-input').value; r.theme = document.getElementById('theme-input').value;
        r.usedNotes = calls.some(o => /Fait vérifié/.test(o.prompt || '')) && calls.some(o => o.webSearch);
        // images perso : champ « image » dans la mise en scène et carte animée au montage
        setJSON(STORAGE.USER_IMAGES, [{ id: 'imgA', name: 'logo', desc: 'le logo de la chaîne' }]);
        r.schemaImg = planSchema().properties.scenes.items.properties.image?.enum.join(',');
        r.planLine = /imgA/.test(planRequestFor(['a', 'b']).prompt);
        const img = document.createElement('canvas'); img.width = 200; img.height = 100; img.getContext('2d').fillStyle = '#f00'; img.getContext('2d').fillRect(0, 0, 200, 100);
        g.fillStyle = '#000'; g.fillRect(0, 0, 360, 640);
        drawUserImage(g, 360, 640, img, 1, 4);
        r.imgPixels = g.getImageData(0, 64, 360, 220).data.some((v, i) => i % 4 === 0 && v > 200);
        localStorage.removeItem(STORAGE.CHARTER); localStorage.removeItem(STORAGE.USER_IMAGES);
        return r;
    });
    check(v8.shortSegs === 'scene,scene' && v8.ytSegs.startsWith('intro') && v8.ytSegs.endsWith('outro') && v8.format === 'portrait', 'Shorts : vertical, aucun carton de titre ni de fin (la version YouTube les garde)');
    check(v8.cuts.length >= 2 && v8.zoomAfter > 1.05 && v8.hookPixels, 'Shorts : accroche écrite en gros + recadrage toutes les 2 à 3 s (' + v8.cuts.map(x => x.toFixed(1)).join(', ') + ')');
    check(/Prof Patate/.test(v8.ctx) && /direct/.test(v8.ctx) && v8.energyCuts >= v8.cuts.length, 'charte de la chaîne relue par Claude, rythme « percutant » appliqué');
    check(v8.tool === 'web_search_20260209' && v8.resent && v8.research === 'Fait 1. Fait 2.', 'recherche internet : outil web de Claude, reprise après pause');
    check(/intérêts composés/.test(v8.script) && v8.theme === 'Les intérêts composés' && v8.usedNotes, 'mode objectif : infos cherchées sur internet puis script et titre écrits');
    check(v8.schemaImg === 'none,imgA' && v8.planLine && v8.imgPixels, 'tes images : proposées à Claude pour la mise en scène et affichées en carte animée');
    // 8.0 : personnage stable (poses validées, détourées, animées ; bouche calée sur la voix ; montage sans scène Agnes)
    const pup = await page.evaluate(async () => {
        const mk = open => { const c = document.createElement('canvas'); c.width = 360; c.height = 640; const g = c.getContext('2d'); g.fillStyle = '#00B140'; g.fillRect(0, 0, 360, 640); g.fillStyle = '#ff7a00'; g.fillRect(130, 160, 100, 380); g.fillStyle = '#222'; g.fillRect(160, 230, 40, open ? 30 : 6); return c.toDataURL('image/jpeg', 0.95); };
        const closed = mk(false), open = mk(true);
        state.cast = { sig: castSig(), poses: [{ id: 'main', closed, open, mid: null, approved: true, date: 1 }, { id: 'salue', closed, open: null, mid: null, approved: true, date: 2 }] };
        const r = { ready: castReady(), active: stableActive() };
        const sp = await loadPuppetSprites(), s = sp.main;
        const d = s.closed.getContext('2d').getImageData(0, 0, s.closed.width, s.closed.height).data;
        let clear = 0, solid = 0; for (let i = 3; i < d.length; i += 4) { if (d[i] < 20) clear++; else solid++; }
        r.keyed = clear > 0 && solid > clear * 3;   // silhouette recadrée, fond vert retiré sur les bords
        const ac = new OfflineAudioContext(1, 48000, 48000), b = ac.createBuffer(1, 48000, 48000), ch = b.getChannelData(0);
        for (let i = 24000; i < 48000; i++) ch[i] = 0.5 * Math.sin(i / 10);
        const e = voiceEnvelope(b);
        const c = document.createElement('canvas'); c.width = 360; c.height = 640; const g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, 360, 640);
        r.mQuiet = drawPuppet(g, 360, 640, { sprite: s, t: 1, env: e, bufTime: 0.2 });
        r.mLoud = drawPuppet(g, 360, 640, { sprite: s, t: 1, env: e, bufTime: 0.8 });
        const px = g.getImageData(178, 470, 1, 1).data; r.body = px[0] > 200 && px[1] > 80 && px[1] < 170 && px[2] < 80;
        // montage complet : 2 répliques, voix ElevenLabs simulée, aucune vidéo Agnes
        const wav = (() => { const n = 24000, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf); const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
            w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 24000, true); v.setUint32(28, 48000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
            for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, (i > 4000 && i < 20000 ? Math.sin(i / 8) * 12000 : 0), true); return buf; })();
        const realFetch = window.fetch; let agnes = 0;
        window.fetch = async (u, o) => { u = String(u); if (u.includes('/text-to-speech/')) return new Response(new Blob([wav], { type: 'audio/wav' })); if (u.includes('agnes')) agnes++; return realFetch(u, o); };
        const keep = { scenes: state.scenes, plan: state.scenePlan, queue: state.queue, voice: state.voiceSource };
        try {
            localStorage.setItem('elevenlabs_api_key', 'sk_test'); elevenlabsSelectedVoiceId = 'v1'; localStorage.removeItem(STORAGE.ELEVEN_EXHAUSTED); elevenQuota = null;
            state.scenes = ['Bonjour à tous.', 'À bientôt.']; state.scenePlan = fallbackScenePlan(state.scenes); state.scenePlan.scenes[1].pose = 'salue';
            r.only = puppetOnly();
            state.queue = state.scenes.map((t, i) => ({ sceneIndex: i, sceneText: t, status: 'done', puppet: true, videoUrl: 'puppet:' + i }));
            const out = await assembleVideo({ label: 'Test' });
            r.video = out.blob.size > 1000; r.timeline = out.timeline.length; r.agnes = agnes; r.dur = out.timeline.reduce((a, x) => a + x.duration, 0);
        } finally { window.fetch = realFetch; Object.assign(state, { scenes: keep.scenes, scenePlan: keep.plan, queue: keep.queue, voiceSource: keep.voice }); state.cast = null; puppetCache = { key: '', sprites: null }; }
        return r;
    });
    check(pup.ready && pup.active && pup.keyed && pup.body, 'personnage stable : poses validées détourées et posées sur le décor');
    check(pup.mQuiet === 'closed' && pup.mLoud === 'open', 'personnage stable : la bouche s\'ouvre quand la voix parle, se ferme dans les silences');
    // casting : une vidéo Agnes (simulée) → images bouche fermée / ouverte choisies d'après la voix, vérifiées par Claude, refaite si refusée
    const cast = await page.evaluate(async () => {
        const mkClip = async () => {
            const c = document.createElement('canvas'); c.width = 360; c.height = 640; const g = c.getContext('2d');
            const ac = new AudioContext(), osc = ac.createOscillator(), gn = ac.createGain(), dst = ac.createMediaStreamDestination();
            osc.frequency.value = 300; gn.gain.value = 0; osc.connect(gn).connect(dst); osc.start();
            const rec = new MediaRecorder(new MediaStream([...c.captureStream(30).getVideoTracks(), ...dst.stream.getAudioTracks()]), { mimeType: 'video/webm;codecs=vp8,opus' });
            const ch = []; rec.ondataavailable = e => ch.push(e.data); const done = new Promise(r => rec.onstop = r); rec.start(200);
            const t0 = performance.now();
            await new Promise(res => { const f = () => { const t = (performance.now() - t0) / 1000, talk = t > 1.6 && Math.sin(t * 9) > 0;
                gn.gain.value = talk ? 0.5 : 0;
                g.fillStyle = '#00B140'; g.fillRect(0, 0, 360, 640); g.fillStyle = '#ff7a00'; g.fillRect(130, 160, 100, 380); g.fillStyle = '#222'; g.fillRect(160, 230, 40, talk ? 30 : 6);
                if (t < 3.2) requestAnimationFrame(f); else res(); }; f(); });
            rec.stop(); await done; ac.close(); return new Blob(ch, { type: 'video/webm' });
        };
        const clip = await mkClip();
        const saved = { cv: window.createVideoTask, pv: window.pollVideo, fc: window.fetchClipBlob, cc: window.callClaude, ei: window.ensureIdentity };
        let created = 0, checks = 0, prompt = '';
        window.createVideoTask = async (img, p) => { created++; prompt = p; return 'v' + created; };
        window.pollVideo = async () => 'https://cdn.test/cast.webm';
        window.fetchClipBlob = async () => clip;
        window.ensureIdentity = async () => {};
        window.callClaude = async o => { checks++; return checks === 1 ? { ok: false, why: 'mains différentes' } : { ok: true, why: '' }; };
        castCreateInterval = 0; agnesImageUnsupported = true;   // 1er essai : méthode vidéo (secours)
        const r = {};
        try {
            state.images = [{ id: 'p', dataUri: document.createElement('canvas').toDataURL('image/png') }]; state.cast = null;
            localStorage.setItem('agnes_api_key', 'sk-test'); localStorage.setItem(STORAGE.CLAUDE_KEY, 'sk-ant-test');
            await runCasting('main');
            const p = state.cast?.poses?.find(x => x.id === 'main');
            r.created = created; r.checks = checks; r.hasOpen = !!(p && p.closed && p.open); r.green = /chroma-key green/.test(prompt) && /Previous attempt was rejected because: mains différentes/.test(prompt);
            r.approved = p?.approved;
            document.querySelector('[data-cast-ok="main"]')?.click(); await new Promise(res => setTimeout(res, 300));
            r.approvedAfter = state.cast.poses.find(x => x.id === 'main').approved;
            // 8.2 : casting en images (Agnes Image) — bouche fermée d'après la photo, puis la même image bouche ouverte
            agnesImageUnsupported = false; const before = created, imgCalls = [];
            const mkImg = open => { const c = document.createElement('canvas'); c.width = 360; c.height = 640; const g = c.getContext('2d'); g.fillStyle = '#00B140'; g.fillRect(0, 0, 360, 640); g.fillStyle = '#ff7a00'; g.fillRect(130, 160, 100, 380); g.fillStyle = '#222'; g.fillRect(160, 230, 40, open ? 30 : 6); return c.toDataURL('image/png'); };
            const savedImg = window.agnesImage;
            window.agnesImage = async (pr, imgs, size) => { imgCalls.push({ pr, n: (imgs || []).length, size }); return mkImg(imgCalls.length === 2); };
            window.callClaude = async () => ({ ok: true, why: '' });
            try { await runCasting('salue'); } finally { window.agnesImage = savedImg; }
            const sp = state.cast.poses.find(x => x.id === 'salue');
            r.img = { video: created - before, calls: imgCalls.length, closed: !!sp?.closed, open: !!sp?.open, pose: /Pose: the character waves/.test(imgCalls[0]?.pr || '') && !/24fps/.test(imgCalls[0]?.pr || ''), edit: /mouth is open/.test(imgCalls[1]?.pr || '') && imgCalls[1]?.n === 1, size: imgCalls[0]?.size };
        } finally { Object.assign(window, { createVideoTask: saved.cv, pollVideo: saved.pv, fetchClipBlob: saved.fc, callClaude: saved.cc, ensureIdentity: saved.ei }); castCreateInterval = CREATE_INTERVAL_MIN; state.cast = null; agnesImageUnsupported = false; }
        return r;
    });
    check(cast.img && cast.img.video === 0 && cast.img.calls === 2 && cast.img.closed && cast.img.open && cast.img.pose && cast.img.edit && cast.img.size === '720x1280', 'casting en images Agnes : pose bouche fermée puis la même image bouche ouverte, sans aucune vidéo (' + JSON.stringify(cast.img) + ')');
    // 8.2 : demandes Agnes (consigne négative, format vertical natif, images clés + repli), réponse d'Agnes Image
    const ag = await page.evaluate(async () => {
        const realFetch = window.fetch, bodies = []; let refuse = false;
        const vert = (() => { const c = document.createElement('canvas'); c.width = 360; c.height = 640; return c.toDataURL('image/png'); })();
        window.fetch = async (u, o) => {
            u = String(u);
            if (u.endsWith('/v1/videos')) { const b = JSON.parse(o.body); bodies.push(b); if (refuse && b.extra_body) return new Response('{"error":"bad mode"}', { status: 400 }); return new Response(JSON.stringify({ video_id: 'v' + bodies.length }), { status: 200 }); }
            if (u.endsWith('/v1/images/generations')) { bodies.push(JSON.parse(o.body)); return new Response(JSON.stringify({ data: [{ b64_json: vert.split(',')[1] }] }), { status: 200 }); }
            return realFetch(u, o);
        };
        const r = {};
        try {
            localStorage.setItem('agnes_api_key', 'sk-test'); keyframesUnsupported = false; agnesImageUnsupported = false;
            await createVideoTask(vert, 'test');
            r.neg = /extra fingers/.test(bodies[0].negative_prompt || ''); r.dims = bodies[0].width === 720 && bodies[0].height === 1280;
            refuse = true;
            await createVideoTask(vert, 'test', { endImage: vert });
            r.kf = bodies[1].extra_body?.mode === 'keyframes' && bodies[1].extra_body.image.length === 2 && !bodies[1].image;
            r.fallback = bodies[2] && bodies[2].image === vert && !bodies[2].extra_body && keyframesUnsupported;
            const img = await agnesImage('pose', [vert], '720x1280');
            const ib = bodies[3];
            r.image = /^data:image\/png;base64,/.test(img) && ib.model === 'agnes-image-2.1-flash' && ib.extra_body.image.length === 1 && ib.extra_body.response_format === 'b64_json' && !ib.image;
            r.refPrompt = !/24fps|does not speak/.test(referenceImagePrompt()) && /Pose:/.test(referenceImagePrompt()) && /Framing:/.test(referenceImagePrompt());
        } finally { window.fetch = realFetch; keyframesUnsupported = false; }
        return r;
    });
    check(ag.neg && ag.dims, 'Agnes vidéo : consigne « à éviter » (doigts, couleurs, texte) et format vertical 9:16 natif');
    check(ag.kf && ag.fallback, 'enchaînement parfait : début et fin imposés (images clés), demande simple si Agnes refuse');
    check(ag.image && ag.refPrompt, 'Agnes Image : image créée à partir de la photo (image de référence et casting en quelques secondes)');
    check(cast.created === 2 && cast.checks === 2 && cast.green, 'casting : pose sur fond vert, refusée par Claude puis refaite avec la raison');
    check(cast.hasOpen && cast.approved === false && cast.approvedAfter === true, 'casting : bouche fermée et ouverte extraites de la vidéo, validation par un appui');
    // 8.0 : brouillon animé, retouches en discutant, un sujet → série de Shorts, 3 miniatures
    const dir = await page.evaluate(async () => {
        const r = {}, realCall = window.callClaude, realAssembly = window.runAssembly, realFetch = window.fetch;
        let agnes = 0; window.fetch = async (u, o) => { if (String(u).includes('agnes')) agnes++; return realFetch(u, o); };
        const keep = { scenes: state.scenes, plan: state.scenePlan, queue: state.queue, voice: state.voiceSource, music: state.musicVolume };
        try {
            const c = document.createElement('canvas'); c.width = 300; c.height = 400; const g = c.getContext('2d'); g.fillStyle = '#9cf'; g.fillRect(0, 0, 300, 400); g.fillStyle = '#f07a3a'; g.fillRect(100, 100, 100, 250);
            state.images = [{ id: 'p', dataUri: c.toDataURL('image/png') }]; state.cast = null; state.voiceSource = 'agnes';
            state.scenes = ['Salut.', 'On y va.', 'Fin.']; state.scenePlan = fallbackScenePlan(state.scenes);
            const box = document.createElement('div'); box.id = 'animatic-box'; document.body.appendChild(box);
            await runAnimatic();
            r.animatic = !!box.querySelector('canvas') && !assembling && agnes === 0;
            box.remove();
            // retouches
            state.queue = state.scenes.map((t, i) => ({ sceneIndex: i, sceneText: t, status: 'done', puppet: true, videoUrl: 'puppet:' + i }));
            let assembled = 0; window.runAssembly = async () => { assembled++; return true; };
            window.callClaude = async o => {
                if (o.schema?.properties?.scenes) return { scenes: [{ index: 0, action: 'keep', text: '' }, { index: 1, action: 'rewrite', text: 'Nouvelle phrase.' }, { index: 2, action: 'remove', text: '' }], hook: 'Accroche neuve', energy: 'punchy', music: 'quieter', message: 'Plus court et plus rythmé.' };
                if (o.schema?.properties?.episodes) return { episodes: [{ title: 'Épisode A', lines: ['Un.', 'Deux.'] }, { title: 'Épisode B', lines: ['Trois.', 'Quatre.'] }, { title: 'Épisode C', lines: ['Cinq.'] }] };
                if (o.schema?.properties?.text) return { text: 'Test' };
                return 'Test';
            };
            localStorage.setItem(STORAGE.CLAUDE_KEY, 'sk-ant-test');
            state.musicVolume = 0.4;
            document.getElementById('retouch-input').value = 'plus court et plus dynamique';
            await applyRetouch();
            r.retouch = state.scenePlan.scenes[1].spoken === 'Nouvelle phrase.' && state.queue[2].edit?.skip === true && state.scenePlan.scenes[0].hook === 'Accroche neuve' && charterEnergy() === 'punchy' && state.musicVolume < 0.4 && assembled === 1;
            // série
            document.getElementById('series-topic').value = 'les bases de la bourse';
            await seriesFromTopic();
            r.series = /Épisode 1 : Épisode A/.test(document.getElementById('series-input').value) && state.seriesEpisodes.length === 3;
            // miniatures
            await showThumbnailChoices();
            r.thumbs = document.querySelectorAll('#thumb-choices img').length === 3 && state.thumbChoices[0].height === 1920;
        } finally {
            window.callClaude = realCall; window.runAssembly = realAssembly; window.fetch = realFetch;
            Object.assign(state, { scenes: keep.scenes, scenePlan: keep.plan, queue: keep.queue, voiceSource: keep.voice, musicVolume: keep.music });
            localStorage.removeItem(STORAGE.CHARTER);
        }
        return r;
    });
    check(dir.animatic, 'brouillon animé : toute la vidéo jouée sans rien demander à Agnes');
    check(dir.retouch, 'retouches en discutant : phrase réécrite, scène enlevée, accroche, rythme et musique, puis remontage');
    check(dir.series && dir.thumbs, 'un sujet → série de Shorts écrite ; 3 miniatures verticales au choix');
    // 8.4 : 30 transitions, autocollants, carte « Suivre », 7 styles de sous-titres, rythme serré, contrôle des coupes
    const hab = await page.evaluate(async () => {
        const r = { badTx: [], badSt: [], badCap: [] };
        const W = 270, H = 480, mk = col => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.fillStyle = col; g.fillRect(0, 0, W, H); g.fillStyle = '#fff'; g.fillRect(90, 140, 90, 200); return c; };
        const A = mk('#d22'), B = mk('#22d'), out = document.createElement('canvas'); out.width = W; out.height = H; const og = out.getContext('2d');
        const avg = () => { const d = og.getImageData(0, 0, W, H).data; let rr = 0, bb = 0; for (let i = 0; i < d.length; i += 16) { rr += d[i]; bb += d[i + 2]; } return { rr, bb }; };
        r.count = TRANSITION_NAMES.length; r.gl = TRANSITION_NAMES.filter(n => TRANSITIONS[n].gl).length;
        const sheet = document.createElement('canvas'); sheet.width = 6 * 90; sheet.height = Math.ceil(r.count / 6) * 160; const sg = sheet.getContext('2d');
        TRANSITION_NAMES.forEach((n, k) => {
            try {
                og.clearRect(0, 0, W, H); renderTransition(n, og, A, B, 0.02, W, H); const a0 = avg();
                og.clearRect(0, 0, W, H); renderTransition(n, og, A, B, 0.98, W, H); const a1 = avg();
                og.clearRect(0, 0, W, H); renderTransition(n, og, A, B, 0.5, W, H);
                sg.drawImage(out, (k % 6) * 90, Math.floor(k / 6) * 160, 90, 160);
                if (!(a0.rr > a0.bb && a1.bb > a1.rr)) r.badTx.push(n);
            } catch (e) { r.badTx.push(n + ' : ' + e.message); }
        });
        r.sheet = sheet.toDataURL('image/png');
        // sens de l'image (WebGL) : le haut du plan reste en haut
        const T2 = document.createElement('canvas'); T2.width = W; T2.height = H; const t2 = T2.getContext('2d'); t2.fillStyle = '#e00'; t2.fillRect(0, 0, W, H / 2); t2.fillStyle = '#0c0'; t2.fillRect(0, H / 2, W, H / 2);
        r.flipped = TRANSITION_NAMES.filter(n => TRANSITIONS[n].gl).filter(n => { og.clearRect(0, 0, W, H); renderTransition(n, og, T2, T2, 0.001, W, H); const top = og.getImageData(W / 2, 30, 1, 1).data; return !(top[0] > 150 && top[1] < 100); });
        r.glOk = !!transitionGl() && !!transitionProgram('ridged-burn');
        // autocollants + carte « Suivre »
        const blank = () => { og.fillStyle = '#888'; og.fillRect(0, 0, W, H); return og.getImageData(0, 0, W, H).data.slice(); };
        const changed = before => { const d = og.getImageData(0, 0, W, H).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - before[i]) > 30) n++; return n; };
        STICKER_NAMES.forEach(k => { const b0 = blank(); try { drawSticker(og, W, H, k, k === 'didyouknow' ? 'Une fourmi ne dort jamais vraiment' : '70 %', 1.2, 3); if (changed(b0) < 50) r.badSt.push(k + ' invisible'); } catch (e) { r.badSt.push(k + ' : ' + e.message); } });
        state.followCard = 'instagram'; let b0 = blank(); drawFollowCard(og, W, H, 1.5, A); r.follow = changed(b0) > 500;
        state.followCard = 'tiktok';
        // styles de sous-titres
        const words = [{ text: 'Le', start: 0, end: 0.3 }, { text: 'soleil', start: 0.3, end: 0.7 }, { text: 'brûle', start: 0.7, end: 1 }, { text: 'tout', start: 1, end: 1.3 }];
        CAPTION_STYLES_X.forEach(st => { const b1 = blank(); try { drawStyledCaptions(og, W, H, { words }, 0.5, st); if (changed(b1) < 30) r.badCap.push(st + ' invisible'); } catch (e) { r.badCap.push(st + ' : ' + e.message); } });
        r.caps2 = styledGroups({ words }, 'caps2').map(g => g.words.length).join(',');
        r.emoji = captionEmojiFor([{ text: 'soleil' }]);
        // rythme serré : 0,5 s de silence au milieu de la phrase → ramené à 0,14 s
        const ac = new OfflineAudioContext(1, 48000, 48000), bf = ac.createBuffer(1, 48000, 48000), ch = bf.getChannelData(0);
        for (let i = 0; i < 48000; i++) { const t = i / 48000; ch[i] = (t > 0.05 && t < 0.35) || (t > 0.85 && t < 0.98) ? 0.4 * Math.sin(i / 7) : 0; }
        const rg = silenceKeepRanges(bf, 0, 1), mp = rg && rangeMapper(rg);
        r.tight = mp ? +mp.total.toFixed(2) : 0; r.map = mp ? +mp.out(0.9).toFixed(2) + '/' + +mp.src(mp.out(0.9)).toFixed(2) : '';
        // Claude : champs « transition » et « sticker » dans la mise en scène
        state.transition = 'smart'; state.stickersOn = true;
        const sch = planSchema().properties.scenes.items, req = planRequestFor(['Un.', 'Deux.']);
        r.schema = sch.properties.transition.enum.length === 31 && sch.properties.sticker.enum.includes('didyouknow') && sch.required.includes('stickerText');
        r.prompt = /"transition"/.test(req.prompt) && /ridged-burn/.test(req.prompt) && /"sticker"/.test(req.prompt);
        const realCall = window.callClaude;
        window.callClaude = async () => ({ setting: '', scenes: [{ spoken: 'Un.', transition: 'glitch', sticker: 'badge', stickerText: 'TOP' }, { spoken: 'Deux.', transition: 'glitch', sticker: 'nope', stickerText: 'x' }] });
        try { const pl = await planScenesWithClaude(['Un.', 'Deux.']); r.norm = pl.scenes[0].transition + ',' + pl.scenes[1].transition + ',' + pl.scenes[0].sticker + ',' + pl.scenes[1].sticker; } finally { window.callClaude = realCall; }
        r.auto = [sceneTransitionFor({}, 1, null), sceneTransitionFor({}, 2, null), sceneTransitionFor({ transition: 'none' }, 1, null), sceneTransitionFor({ transition: 'glitch' }, 3, 'glitch') !== 'glitch'].join(',');
        // montage complet (personnage stable + voix simulée avec un silence au milieu) : transitions, autocollants, fin « Suivre »
        const mkp = () => { const c = document.createElement('canvas'); c.width = 360; c.height = 640; const g = c.getContext('2d'); g.fillStyle = '#00B140'; g.fillRect(0, 0, 360, 640); g.fillStyle = '#ff7a00'; g.fillRect(130, 160, 100, 380); return c.toDataURL('image/jpeg', 0.95); };
        const pose = mkp();
        state.cast = { sig: castSig(), poses: [{ id: 'main', closed: pose, open: pose, mid: null, approved: true, date: 1 }, { id: 'salue', closed: pose, open: null, mid: null, approved: true, date: 2 }] };
        const wav = (() => { const n = 36000, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf); const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
            w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 24000, true); v.setUint32(28, 48000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
            for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, ((i > 2000 && i < 12000) || (i > 24000 && i < 34000) ? Math.sin(i / 8) * 12000 : 0), true); return buf; })();
        const realFetch = window.fetch, used = { tx: new Set(), st: new Set(), follow: 0 };
        const rt = window.renderTransition, ds = window.drawSticker, df = window.drawFollowCard;
        window.renderTransition = (n, ...a) => { used.tx.add(n); return rt(n, ...a); };
        window.drawSticker = (ctx, w, h, k, ...a) => { used.st.add(k); return ds(ctx, w, h, k, ...a); };
        window.drawFollowCard = (...a) => { used.follow++; return df(...a); };
        window.fetch = async (u, o) => { u = String(u); if (u.includes('/text-to-speech/')) return new Response(new Blob([wav], { type: 'audio/wav' })); return realFetch(u, o); };
        const keep = { scenes: state.scenes, plan: state.scenePlan, queue: state.queue, trim: state.trimMode, sub: state.subtitlesStyle, qa: state.qaOn };
        try {
            localStorage.setItem('elevenlabs_api_key', 'sk_test'); elevenlabsSelectedVoiceId = 'v1'; localStorage.removeItem(STORAGE.ELEVEN_EXHAUSTED); elevenQuota = null; puppetCache = { key: '', sprites: null };
            state.trimMode = 'tight'; state.subtitlesStyle = 'pill'; state.qaOn = true;
            state.scenes = ['Bonjour, voici le soleil.', 'Il brûle, vraiment.', 'Abonne-toi.']; state.scenePlan = fallbackScenePlan(state.scenes);
            Object.assign(state.scenePlan.scenes[1], { transition: 'whip-pan', sticker: 'check', stickerText: 'Vrai' });
            Object.assign(state.scenePlan.scenes[2], { transition: 'push-left', sticker: 'didyouknow', stickerText: 'Le soleil a 4,6 milliards d\'années', narration: 'Merci de ton attention !' });
            state.queue = state.scenes.map((t, i) => ({ sceneIndex: i, sceneText: t, status: 'done', puppet: true, videoUrl: 'puppet:' + i }));
            const res = await assembleVideo({ label: 'Montage' });
            r.mVideo = res.blob.size > 1000; r.mTight = res.timeline.filter(x => x.tightened).length; r.mDur = res.timeline.reduce((a, x) => a + x.duration, 0);
            r.cuts = state.cutReport ? state.cutReport.checked + '/' + state.cutReport.issues.length : 'aucun';
            r.mEndsBoard = !!res.timeline[res.timeline.length - 1]?.narration; r.mFollowBoard = used.follow;
            // même Short sans voix off finale : la carte arrive sur la dernière scène ; contrôle des coupes même sans contrôle par l'IA
            used.follow = 0; state.scenePlan.scenes[2].narration = ''; state.qaOn = false;
            state.queue = state.scenes.map((t, i) => ({ sceneIndex: i, sceneText: t, status: 'done', puppet: true, videoUrl: 'puppet:' + i }));
            const res2 = await assembleVideo({ label: 'Montage' });
            r.mFollowScene = used.follow; r.mEndsScene = !res2.timeline[res2.timeline.length - 1]?.narration;
            r.cutsNoQa = state.cutReport ? state.cutReport.checked : 0; r.framesNoQa = (state.qaFrames || []).length;
        } catch (e) { r.mErr = e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 4).join(' ').replace(/https:\/\/app.test\//g, ''); }
        finally {
            window.fetch = realFetch; window.renderTransition = rt; window.drawSticker = ds; window.drawFollowCard = df;
            Object.assign(state, { scenes: keep.scenes, scenePlan: keep.plan, queue: keep.queue, trimMode: keep.trim, subtitlesStyle: keep.sub, qaOn: keep.qa }); state.cast = null; puppetCache = { key: '', sprites: null };
        }
        r.mTx = [...used.tx].join(','); r.mSt = [...used.st].join(','); r.mFollow = used.follow;
        return r;
    });
    try { fs.writeFileSync(path.join(os.tmpdir(), 'transitions-sheet.png'), Buffer.from(hab.sheet.split(',')[1], 'base64')); } catch (e) {}
    check(hab.count === 30 && hab.gl === 14 && hab.glOk && hab.badTx.length === 0 && hab.flipped.length === 0, '30 transitions (14 WebGL HyperFrames + 16 dessinées), partent du plan A et arrivent au plan B' + (hab.badTx.length || hab.flipped.length ? ' : ' + hab.badTx.concat(hab.flipped.map(n => n + ' à l\'envers')).join(' | ') : ''));
    check(hab.badSt.length === 0 && hab.follow, 'autocollants animés (8) et carte « Suivre » visibles' + (hab.badSt.length ? ' : ' + hab.badSt.join(' | ') : ''));
    check(hab.badCap.length === 0 && hab.caps2 === '2,2' && hab.emoji === '☀️', '7 nouveaux styles de sous-titres (dont 2 mots en MAJUSCULES et emoji)' + (hab.badCap.length ? ' : ' + hab.badCap.join(' | ') : ''));
    check(hab.tight > 0.55 && hab.tight < 0.75 && /\/0\.9$/.test(hab.map), 'rythme serré : le silence au milieu de la phrase est raccourci (' + hab.tight + ' s au lieu de 1 s, ' + hab.map + ')');
    check(hab.schema && hab.prompt && hab.norm === 'none,glitch,none,none' && hab.auto === 'push-left,,,true', 'Claude choisit la transition et l\'autocollant de chaque réplique (' + hab.norm + ' · ' + hab.auto + ')');
    check(!hab.mErr && hab.mVideo && hab.mTx === 'whip-pan,push-left' && /check/.test(hab.mSt) && /didyouknow/.test(hab.mSt) && hab.mFollow > 0, 'montage : transitions choisies, autocollants et carte « Suivre » à la fin (' + (hab.mErr || hab.mTx + ' · ' + hab.mSt + ' · ' + hab.mFollow) + ')');
    check(hab.mEndsBoard && hab.mFollowBoard > 0 && hab.mEndsScene && hab.mFollowScene > 0, 'carte « Suivre » aussi quand le Short finit sur un plan illustré (' + hab.mFollowBoard + ' / ' + hab.mFollowScene + ' images)');
    check(hab.cutsNoQa >= 4 && hab.framesNoQa === 0, 'contrôle des coupes toujours fait (gratuit), aucune image envoyée à Claude sans le contrôle par l\'IA (' + hab.cutsNoQa + ' contrôles)');
    check(hab.mTight >= 1 && /^\d+\/0$/.test(hab.cuts) && +hab.cuts.split('/')[0] >= 4, 'montage : silences coupés au milieu des phrases (' + hab.mTight + ' scènes, ' + (hab.mDur || 0).toFixed(1) + ' s), chaque coupe vérifiée (' + hab.cuts + ')');
    // 8.5 : correctifs trouvés par le relecteur
    const fix = await page.evaluate(async () => {
        const r = {}, W = 540, H = 960, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
        // textes fixes dans la langue de la vidéo (pas en français dans une vidéo anglaise)
        const drawn = [], ft = g.fillText.bind(g); g.fillText = (t, ...a) => { drawn.push(String(t)); return ft(t, ...a); };
        const keepLang = state.language; state.language = 'en-US';
        localStorage.removeItem(STORAGE.CHARTER);
        drawSticker(g, W, H, 'didyouknow', 'Ants never really sleep', 1.2, 3); drawSticker(g, W, H, 'cross', 'Myth', 1.2, 3);
        state.followCard = 'tiktok'; drawFollowCard(g, W, H, 0.5, null); drawFollowCard(g, W, H, 1.6, null);
        state.language = keepLang;
        const all = drawn.join(' | ');
        r.lang = /Did you know\?/.test(all) && /FALSE/.test(all) && /Follow for more/.test(all) && /Following ✓/.test(all) && !/savais|FAUX|Suivre|Abonn/.test(all);
        // jamais de pseudo inventé ; le pseudo exact de Ma chaîne quand il est saisi
        r.noFakeHandle = !/@cartooninstructeur/.test(all) && !/@/.test(all);
        drawn.length = 0; setJSON(STORAGE.CHARTER, { name: 'Prof Patate', handle: '@prof.patate' });
        drawFollowCard(g, W, H, 0.5, null); r.handle = drawn.includes('@prof.patate');
        localStorage.removeItem(STORAGE.CHARTER); g.fillText = ft;
        // emojis : mots entiers seulement
        const em = w => captionEmojiFor([{ text: w }]);
        r.emojiBad = ['sont', 'Merci', 'été', 'château', 'forcément', 'fourmi', 'chocolat', 'heureux', 'feuille', 'son', 'terrible', 'lunettes'].filter(w => em(w));
        r.emojiGood = [em("l'eau"), em('soleil'), em('cœur'), em('chats'), em('Feu !')].join('');
        // storyboard : « Choix automatique » quand le plan n'impose pas de transition
        const keep = { scenes: state.scenes, plan: state.scenePlan, tr: state.transition };
        state.transition = 'smart'; state.scenes = ['Un.', 'Deux.', 'Trois.']; state.scenePlan = fallbackScenePlan(state.scenes);
        renderStoryboard();
        const sel = document.querySelector('[data-sb-field="transition"][data-i="1"]');
        r.sbAuto = !!sel && sel.value === '' && /automatique/.test(sel.options[sel.selectedIndex].textContent);
        document.getElementById('storyboard')?.classList.add('hidden');
        Object.assign(state, { scenes: keep.scenes, scenePlan: keep.plan, transition: keep.tr });
        // WebGL : après une perte de contexte, les effets reviennent (au lieu de coupes sèches)
        const mk = col => { const k = document.createElement('canvas'); k.width = W; k.height = H; const kg = k.getContext('2d'); kg.fillStyle = col; kg.fillRect(0, 0, W, H); return k; };
        const A = mk('#ff0000'), B = mk('#0000ff'), px = () => Array.from(g.getImageData(W / 2, H / 2, 1, 1).data.slice(0, 3)).join(',');
        renderTransition('flash-through-white', g, A, B, 0.5, W, H); r.before = px();
        txGl.gl.getExtension('WEBGL_lose_context')?.loseContext();
        renderTransition('flash-through-white', g, A, B, 0.5, W, H); r.after = px();
        r.highp = TX_H.includes('GL_FRAGMENT_PRECISION_HIGH');
        // tableau blanc : la note (autocollant ou bulle) s'écrit sous le dessin DANS sa zone (dessous : tête du personnage,
        // sous-titres), sur la place laissée par le dessin réduit ; jamais sur l'encre, jamais coupée
        const keepStyle = state.selectedStyle; state.selectedStyle = 'whiteboard'; await loadIcons();
        const dr = compileDrawing(layoutDrawing({ link: 'arrow', elements: [{ label: 'Fourmi', word: '', icon: 'bug', paths: [] }, { label: 'Sieste', word: '', icon: 'moon', paths: [] }] }));
        const area = { x: 60, y: 120, w: 420, h: 300 }, bad = [];
        STICKER_NAMES.filter(k => k !== 'confetti').concat(['bubble']).forEach(k => {
            const txt = k === 'didyouknow' ? 'Une fourmi fait deux cent cinquante siestes par jour' : k === 'bubble' ? 'siestes très courtes' : 'Vrai';
            const note = boardNoteLayout(g, area, k, txt, true);
            const ink = document.createElement('canvas'); ink.width = W; ink.height = H; drawSketch(ink.getContext('2d'), note ? note.draw : area, dr, 1, 1);
            const st = document.createElement('canvas'); st.width = W; st.height = H; const sg = st.getContext('2d'), said = [];
            const sft = sg.fillText.bind(sg); sg.fillText = (x, ...a) => { said.push(String(x)); return sft(x, ...a); };
            if (k === 'bubble') drawBoardLabel(sg, area, note, 1); else drawBoardSticker(sg, area, k, txt, 1.5, 3, W, H, note);
            const A = ink.getContext('2d').getImageData(0, 0, W, H).data, B = sg.getImageData(0, 0, W, H).data; let on = 0, out = 0;
            for (let i = 3; i < A.length; i += 4) if (B[i] > 60) { const q = (i - 3) / 4, x = q % W, y = (q / W) | 0; if (A[i] > 60) on++; if (y >= area.y + area.h || x < area.x || x >= area.x + area.w) out++; }
            const whole = k !== 'didyouknow' || /jour/.test(said.join(' '));
            if (!note || on || out || !whole) bad.push(k + (note ? '' : ' sansNote') + (on ? ' surDessin=' + on : '') + (out ? ' horsZone=' + out : '') + (whole ? '' : ' texteCoupé'));
        });
        state.selectedStyle = keepStyle;
        r.board = bad.join(' | ') || 'OK';
        r.ink = boardInk('#ffd23f') === INK.blue && boardInk('#1f3a5f') === '#1f3a5f';
        // japonais / chinois (sans espaces) : coupés entre deux caractères au lieu de déborder
        g.font = '600 30px ' + UI_FONT;
        const jl = wrapText(g, 'アリは一日に二百五十回も短い昼寝をすることが知られています', 200);
        r.cjk = jl.length >= 2 && jl.every(l => g.measureText(l).width <= 200);
        // carte « Suivre » en 9:16 : jamais sous la colonne de boutons de TikTok (x > 83 %)
        const fc = document.createElement('canvas'); fc.width = 1080; fc.height = 1920; const fg = fc.getContext('2d');
        state.followCard = 'tiktok'; drawFollowCard(fg, 1080, 1920, 0.6, null);
        const fd = fg.getImageData(0, 0, 1080, 1920).data; let maxX = 0;
        for (let i = 3; i < fd.length; i += 4) if (fd[i] > 200) maxX = Math.max(maxX, ((i - 3) / 4) % 1080);
        r.followRight = maxX;
        // contrôle par l'IA : image « début » prise après la transition ; sans contrôle, aucune image gardée
        const q1 = createQa(3, { frames: true }), info = { name: 'scène 2', settle: 0.6 };
        q1.tick(c, 1.25, 0.25, 3, info); const early = q1.frames.some(f => /début/.test(f.label));
        q1.tick(c, 1.7, 0.7, 3, info); r.qaSettle = !early && q1.frames.some(f => /début/.test(f.label));
        const q2 = createQa(3, { frames: false }), info2 = { name: 'scène 1' };
        q2.tick(c, 0.1, 0.1, 3, info2); q2.tick(c, 1.0, 1.0, 3, info2); q2.tick(c, 2.95, 2.95, 3, info2);
        r.qaNoFrames = q2.frames.length === 0 && q2.cuts.checked === 2;
        // une seule fonction loadScript (plus de message « bibliothèque PDF » pour le ZIP ou Firebase) ; traduction complète
        r.loadScript = /loadScriptOnce/.test(loadScript.toString()) && !/PDF/.test(loadScript.toString());
        r.translate = /stickerText/.test(buildLanguageVersion.toString()) && /hook/.test(buildLanguageVersion.toString());
        r.charterField = CHARTER_FIELDS.includes('handle') && !!document.getElementById('charter-handle');
        return r;
    });
    check(fix.lang, 'textes des autocollants et de la carte « Suivre » dans la langue de la vidéo (anglais ici)');
    check(fix.noFakeHandle && fix.handle && fix.charterField, 'carte « Suivre » : jamais de pseudo inventé, le pseudo exact de Ma chaîne quand il est saisi');
    check(fix.emojiBad.length === 0 && fix.emojiGood === '💧☀️❤️🐾🔥', 'emojis des sous-titres : mots entiers seulement (« sont », « merci », « a été »… sans emoji)' + (fix.emojiBad.length ? ' : ' + fix.emojiBad.join(', ') : ' · ' + fix.emojiGood));
    check(fix.sbAuto, 'storyboard : « Choix automatique » affiché quand l\'appli choisit la transition');
    check(fix.before === '255,255,255' && fix.after === '255,255,255' && fix.highp, 'transitions WebGL : reviennent après une perte de contexte, haute précision sur iPhone (' + fix.before + ' → ' + fix.after + ')');
    check(fix.board === 'OK' && fix.ink, 'tableau blanc : autocollants et bulle écrits sous le dessin, dans sa zone (jamais sur la tête du personnage ni les sous-titres), feutre lisible (' + fix.board + ')');
    check(fix.cjk && fix.followRight > 0 && fix.followRight <= 1080 * 0.83, 'japonais coupé proprement ; carte « Suivre » hors de la colonne de boutons TikTok (bord droit ' + fix.followRight + ' px)');
    check(fix.qaSettle && fix.qaNoFrames, 'contrôle par l\'IA : image de début prise après la transition ; contrôle des coupes sans envoyer d\'images');
    check(fix.loadScript && fix.translate, 'une seule fonction loadScript ; la version traduite traduit aussi l\'accroche et les autocollants');
    // 8.6 : volume aux normes (ITU-R BS.1770 / EBU R128, méthode reprise de FilmCraft)
    const loud = await page.evaluate(() => {
        const tone = (amp, ch = 1, sec = 3, f = 997, spikes = 0) => { const b = new AudioBuffer({ numberOfChannels: ch, length: 48000 * sec, sampleRate: 48000 });
            for (let c = 0; c < ch; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = amp * Math.sin(2 * Math.PI * f * i / 48000) + (spikes && i % 24000 === 0 ? spikes : 0); } return b; };
        const r = {};
        r.mono = +measureLoudness(tone(0.1)).lufs.toFixed(2);            // référence de la norme : -23,01 LUFS
        r.stereo = +measureLoudness(tone(0.1, 2)).lufs.toFixed(2);       // deux canaux : +3 dB → -20,0
        const sil = new AudioBuffer({ numberOfChannels: 2, length: 48000, sampleRate: 48000 });
        r.silence = measureLoudness(sil).lufs === -Infinity && normalizeLoudness(sil).gain === 0;
        const q = tone(0.02, 2), n1 = normalizeLoudness(q), m1 = measureLoudness(q);
        r.norm = [+n1.after.toFixed(2), +m1.lufs.toFixed(2), +m1.peak.toFixed(2)].join(' / ');
        const sp = tone(0.02, 2, 3, 997, 0.9), n2 = normalizeLoudness(sp), m2 = measureLoudness(sp);   // crêtes isolées : le gain s'arrête à -1 dBFS
        r.peakCap = m2.peak <= -1.49 && m2.lufs < -14.5;
        const v1 = tone(0.05), v2 = tone(0.3), g1 = voiceGainFor({}, null, v1), g2 = voiceGainFor({}, null, v2);
        r.voices = [measureLoudness(v1).lufs + 20 * Math.log10(g1), measureLoudness(v2).lufs + 20 * Math.log10(g2)].map(x => +x.toFixed(1)).join(' / ');
        const hiss = tone(0.003); r.silentGain = voiceGainFor({ speech: { silent: true } }, null, hiss);   // pas de parole : gain 1
        const tail = tone(0.05, 1, 1.05); tail.getChannelData(0).fill(0.99, tail.length - 960); r.tailPeak = +measureLoudness(tail).peak.toFixed(2);
        r.montage = state.lastLoudness ? [state.lastLoudness.before, state.lastLoudness.after, state.lastLoudness.peak].map(x => +(+x).toFixed(1)).join(' → ') : 'aucun';
        r.montageOk = !!state.lastLoudness && (Math.abs(state.lastLoudness.after + 14) < 0.2 || Math.abs(state.lastLoudness.peak + 1.5) < 0.1) && state.lastLoudness.peak <= -1.49;
        return r;
    });
    check(Math.abs(loud.mono + 23.01) < 0.15 && Math.abs(loud.stereo + 20) < 0.15 && loud.silence, 'mesure du volume conforme à la norme EBU R128 (1 kHz à -20 dBFS : ' + loud.mono + ' LUFS, stéréo ' + loud.stereo + ')');
    check(loud.silentGain === 1 && loud.tailPeak > -0.1, 'scène sans parole jamais amplifiée ; crête mesurée jusqu\'à la dernière milliseconde (' + loud.silentGain + ', ' + loud.tailPeak + ' dBFS)');
    check(/^-14 \/ -14 \/ /.test(loud.norm) && +loud.norm.split(' / ')[2] <= -1.5 && loud.peakCap, 'vidéo mise à -14 LUFS (niveau YouTube / TikTok) sans jamais dépasser -1,5 dBFS (' + loud.norm + ')');
    check(loud.voices === '-19 / -19', 'chaque voix au même niveau, quelle que soit sa source (' + loud.voices + ' LUFS)');
    check(loud.montageOk, 'montage complet : volume final réglé automatiquement (' + loud.montage + ')');
    // 8.7 : voix étirée sans changer sa hauteur (WSOLA, repris de SoundCraft) + vraie police feutre
    const v87 = await page.evaluate(async () => {
        const r = {}, sr = 48000;
        const tone = (f, sec) => { const b = new AudioBuffer({ numberOfChannels: 1, length: Math.round(sr * sec), sampleRate: sr }), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = 0.5 * Math.sin(2 * Math.PI * f * i / sr); return b; };
        const freq = b => { const d = b.getChannelData(0), a = Math.floor(d.length * 0.2), z = Math.floor(d.length * 0.8); let first = -1, last = -1, n = 0;   // passages par zéro interpolés : précision < 0,1 Hz
            for (let i = a + 1; i < z; i++) if (d[i - 1] < 0 && d[i] >= 0) { const t = i - 1 + d[i - 1] / (d[i - 1] - d[i]); if (first < 0) first = t; last = t; n++; } return (n - 1) / ((last - first) / sr); };
        const rmsSpread = b => { const d = b.getChannelData(0), w = 2400, v = []; for (let i = 4800; i + w < d.length - 4800; i += w) { let s = 0; for (let k = i; k < i + w; k++) s += d[k] * d[k]; v.push(Math.sqrt(s / w)); } return Math.min(...v) / Math.max(...v); };
        const src = tone(440, 1);
        const long = stretchBuffer(src, 1.25), short = stretchBuffer(src, 0.8);
        r.lens = [long.duration, short.duration].map(x => +x.toFixed(3)).join(' / ');
        r.freqs = [freq(long), freq(short)].map(x => Math.round(x)).join(' / ');
        r.even = Math.min(rmsSpread(long), rmsSpread(short));   // aucun trou ni à-coup de volume
        // voix calée sur les lèvres : une seule prise ElevenLabs, étirée sur le téléphone
        const wav = (() => { const n = 24000 * 1.8, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf); const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
            w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 24000, true); v.setUint32(28, 48000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
            for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, (i > 2400 && i < 38400 ? Math.sin(i / 8) * 12000 : 0), true); return buf; })();
        const realGen = window.generateElevenLabsAudio; let calls = 0;
        window.generateElevenLabsAudio = async () => { calls++; return new Blob([wav], { type: 'audio/wav' }); };
        try {
            localStorage.setItem('elevenlabs_api_key', 'sk_test'); elevenlabsSelectedVoiceId = 'v1';
            const item = { sceneIndex: 0, sceneText: 'Bonjour à tous.', speech: { silent: false, start: 0.2, end: 2.2 } };   // Agnes parle 2,0 s
            await prepareFitVoice(item);
            r.calls = calls; r.stretch = +item.fitStretch.toFixed(2); r.fitDur = +(item.fitSpeech.end - item.fitSpeech.start).toFixed(2);
            // étirement en panne (vieil iPhone, mémoire) : la prise payée est gardée à sa vitesse, jamais perdue
            const realStretch = window.stretchBuffer; window.stretchBuffer = () => { throw new Error('panne simulée'); };
            const item2 = { sceneIndex: 0, sceneText: 'Bonjour à tous.', speech: { silent: false, start: 0.2, end: 2.2 } };
            try { await prepareFitVoice(item2); } finally { window.stretchBuffer = realStretch; }
            r.fallback = item2.fitStretch === 1 && !!item2.fitBuffer && Math.abs(item2.fitBuffer.duration - 1.8) < 0.01 && calls === 2;
        } catch (e) { r.err = e.message; } finally { window.generateElevenLabsAudio = realGen; }
        // police feutre chargée et réellement utilisée
        r.font = await ensureMarkerFont();
        const c = document.createElement('canvas').getContext('2d');
        c.font = '900 60px ' + MARKER_FONT; const wMarker = c.measureText('Le savais-tu ? éàç').width;
        c.font = '900 60px "Comic Sans MS", sans-serif'; const wFallback = c.measureText('Le savais-tu ? éàç').width;
        r.fontUsed = Math.abs(wMarker - wFallback) > 2 && document.fonts.check('40px "Permanent Marker"');
        // ponctuation française jamais seule en début de ligne (titres, bulles, notes)
        c.font = '900 120px ' + MARKER_FONT; const wl = wrapLines(c, 'Pourquoi le ciel est bleu ?', c.measureText('Pourquoi le ciel est bleu').width + 5);
        r.punct = wl.every(l => !/^[?!:;»]/.test(l)) && wl.length >= 2;
        return r;
    });
    check(v87.lens === '1.25 / 0.8' && v87.freqs === '440 / 440' && v87.even > 0.9, 'voix étirée ou resserrée sans changer sa hauteur (durées ' + v87.lens + ' s, ' + v87.freqs + ' Hz, régularité ' + (+v87.even).toFixed(2) + ')');
    check(!v87.err && v87.calls === 1 && v87.stretch === 1.33 && Math.abs(v87.fitDur - 2) < 0.1, 'voix calée sur les lèvres : une seule prise ElevenLabs, étirée sur le téléphone (' + (v87.err || v87.calls + ' appel, ×' + v87.stretch + ', ' + v87.fitDur + ' s pour 2 s') + ')');
    check(!v87.err && v87.fallback, 'étirement en panne : la voix ElevenLabs déjà payée est gardée à sa vitesse (' + (v87.err || v87.fallback) + ')');
    check(v87.font && v87.fontUsed && v87.punct, 'vraie police feutre (Permanent Marker) chargée et utilisée ; « ? » jamais seul en début de ligne');

    // 8.8 : image → traits de feutre (traceur repris de VectorCraft), illustrations Agnes Image retracées, image de l'utilisateur
    const v88 = await page.evaluate(async () => {
        const r = {}, keep = { drawings: state.drawings, scenes: state.scenes, plan: state.scenePlan, trace: state.traceDrawings, unsup: agnesImageUnsupported, agnes: localStorage.getItem('agnes_api_key') };
        const realFetch = window.fetch, realClaude = window.callClaude;
        const lensOf = paths => paths.map(d => Math.round(measurePath(d).len));
        try {
            // 1. formes connues : anneau, carré plein (son seul bord), 8 tirets, poussières ignorées
            const c = document.createElement('canvas'); c.width = c.height = 240; const g = c.getContext('2d');
            g.fillStyle = '#fff'; g.fillRect(0, 0, 240, 240); g.strokeStyle = g.fillStyle = '#111'; g.lineWidth = 5; g.lineCap = 'round';
            g.beginPath(); g.arc(70, 70, 40, 0, Math.PI * 2); g.stroke();
            g.fillRect(140, 30, 70, 70);
            for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; g.beginPath(); g.moveTo(120 + Math.cos(a) * 60, 175 + Math.sin(a) * 50); g.lineTo(120 + Math.cos(a) * 72, 175 + Math.sin(a) * 62); g.stroke(); }
            g.fillRect(20, 220, 2, 2); g.fillRect(220, 220, 2, 2);
            const shapes = traceLineArt(g.getImageData(0, 0, 240, 240).data, 240, 240), sl = lensOf(shapes);
            r.shapes = shapes.length + ' traits, anneau ' + sl[0] + '/193, bord ' + sl[1] + '/209, tirets ' + sl.slice(2).join(',');
            r.shapesOk = shapes.length === 10 && Math.abs(sl[0] - 193) < 10 && Math.abs(sl[1] - 209) < 12 && sl.slice(2).every(l => l >= 8 && l <= 20);
            // 2. illustration : l'objet sans icône est dessiné par Agnes Image puis retracé ; l'élément avec icône la garde
            const art = document.createElement('canvas'); art.width = art.height = 960; const a = art.getContext('2d');
            a.fillStyle = '#fff'; a.fillRect(0, 0, 960, 960); a.strokeStyle = a.fillStyle = '#141414'; a.lineWidth = 12; a.lineCap = 'round';
            a.strokeRect(300, 120, 360, 760); a.beginPath(); a.moveTo(300, 300); a.lineTo(660, 240); a.stroke();
            a.beginPath(); a.arc(480, 640, 60, 0, Math.PI * 2); a.stroke(); a.fillRect(320, 140, 320, 60);
            const png = art.toDataURL('image/png').split(',')[1];
            let agnesCalls = 0, prompt = '';
            window.fetch = async (u, o) => {
                u = String(u);
                if (u.includes('/images/generations')) { agnesCalls++; prompt = JSON.parse(o.body).prompt; return r.agnes404 ? new Response('nope', { status: 404 }) : new Response(JSON.stringify({ data: [{ b64_json: png }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }); }
                return realFetch(u, o);
            };
            window.callClaude = async () => ({ elements: [
                { label: 'Guillotine', word: '', icon: '', draw: 'a guillotine', paths: [{ d: 'M 20 20 L 180 180', color: 'black' }] },
                { label: 'Roi', word: '', icon: 'crown', draw: '', paths: [] }], link: 'arrow' });
            localStorage.setItem('agnes_api_key', 'sk-test'); agnesImageUnsupported = false; state.traceDrawings = true;
            state.scenes = ['La guillotine remplace le roi.']; state.scenePlan = null;
            const d1 = await generateDrawing(state.scenes[0], 0, 1);
            const traced = d1.strokes.filter(st => st.lw === TRACE_LINE);
            const inBox = d1.strokes.every(st => { const b = st.el.getBBox(); return b.x >= -1 && b.y >= -1 && b.x + b.width <= 401 && b.y + b.height <= 301; });
            r.illus = agnesCalls + ' appel Agnes, ' + traced.length + ' traits retracés sur ' + d1.strokes.length + ', icône gardée : ' + !d1.raw.elements[1].traced;
            r.illusOk = agnesCalls === 1 && /a guillotine/.test(prompt) && /line drawing/.test(prompt) && /no text/.test(prompt) && traced.length >= 4 && Array.isArray(d1.raw.elements[0].traced) && !d1.raw.elements[1].traced && inBox && d1.labels.length >= 2;
            // rechargé depuis le projet : les traits enregistrés suffisent ; même objet redemandé : pris dans le cache
            const d1b = await compileStoredDrawing(JSON.parse(JSON.stringify(d1.raw)));
            const d1c = await generateDrawing(state.scenes[0], 0, 1);
            r.reload = d1b.strokes.length === d1.strokes.length && Array.isArray(d1c.raw.elements[0].traced) && agnesCalls === 1 && !!(await traceCacheGet('a guillotine'));
            // jamais plus de 3 objets dessinés (l'affichage n'en garde que 3)
            agnesCalls = 0;
            await traceDrawingElements({ elements: ['a cat', 'a dog', 'a cow', 'a hen', 'a pig'].map(draw => ({ label: draw, word: '', icon: '', draw, paths: [] })), link: 'none' });
            r.max3 = agnesCalls;
            // génération en arrière-plan : dessins du serveur retracés pendant le travail, puis repris du cache au retour
            agnesCalls = 0;
            traceBackgroundDrawings('job-test', [{ elements: [{ label: 'Renard', word: '', icon: '', draw: 'a fox', paths: [] }], link: 'none' }]);
            for (let k = 0; k < 50 && !(await traceCacheGet('a fox')); k++) await new Promise(res => setTimeout(res, 100));
            const back = { elements: [{ label: 'Renard', word: '', icon: '', draw: 'a fox', paths: [] }, { label: 'Loup', word: '', icon: '', draw: 'a wolf', paths: [] }], link: 'none' };
            await traceDrawingElements(back, { deadline: Date.now() - 1 });   // délai dépassé : cache seulement
            r.bg = agnesCalls === 1 && Array.isArray(back.elements[0].traced) && !back.elements[1].traced;
            // envoyé au serveur sans les traits retracés (repris du cache), sauf ceux d'une image de l'utilisateur
            const srv = drawingForServer({ link: 'none', elements: [{ label: 'Renard', draw: 'a fox', traced: ['M 1 1 L 9 9', 'M 2 2 L 8 8'] }, { label: 'Moi', traced: ['M 1 1 L 5 5', 'M 3 3 L 4 4'], fromImage: true }] });
            r.srv = !('traced' in srv.elements[0]) && srv.elements[0].draw === 'a fox' && srv.elements[1].traced.length === 2 && drawingForServer(null) === null;
            // 3. replis : réglage coupé → aucun appel ; Agnes Image refusée → dessin de Claude gardé, casting de poses pas coupé
            state.traceDrawings = false; agnesCalls = 0;
            const d2 = await generateDrawing(state.scenes[0], 0, 1);
            state.traceDrawings = true; r.agnes404 = true; await idbDel(traceCacheKey('a guillotine'));
            const d3 = await generateDrawing(state.scenes[0], 0, 1);
            r.fallback = agnesCalls === 1 && !d2.raw.elements[0].traced && !d3.raw.elements[0].traced && [d2, d3].every(d => d.strokes.length >= 2 && !d.strokes.some(st => st.lw === TRACE_LINE)) && agnesImageUnsupported === false && traceUnsupported === true;
            // 4. image de l'utilisateur (photo) → illustration de la scène, mot-clé gardé, sans aucun appel payant
            agnesCalls = 0; state.drawings = [d1];
            const photo = document.createElement('canvas'); photo.width = 640; photo.height = 480; const ph = photo.getContext('2d');
            const gr = ph.createLinearGradient(0, 0, 640, 480); gr.addColorStop(0, '#7ab'); gr.addColorStop(1, '#246'); ph.fillStyle = gr; ph.fillRect(0, 0, 640, 480);
            ph.fillStyle = '#f2c94c'; ph.beginPath(); ph.arc(320, 220, 130, 0, Math.PI * 2); ph.fill(); ph.fillStyle = '#222'; ph.beginPath(); ph.arc(270, 190, 18, 0, Math.PI * 2); ph.arc(370, 190, 18, 0, Math.PI * 2); ph.fill();
            ph.lineWidth = 10; ph.strokeStyle = '#222'; ph.beginPath(); ph.arc(320, 240, 70, 0.2 * Math.PI, 0.8 * Math.PI); ph.stroke();
            const d4 = await drawingFromImage(0, photo.toDataURL('image/jpeg', 0.85));
            r.photo = d4.strokes.length + ' traits, mot-clé « ' + (d4.labels[0]?.text || '') + ' »';
            r.photoOk = state.drawings[0] === d4 && d4.strokes.length >= 3 && d4.strokes.length <= TRACE_MAX_STROKES && d4.labels[0]?.text === 'Guillotine' && d4.raw.elements[0].fromImage && agnesCalls === 0;
        } catch (e) { r.err = e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 4).join(' ').replace(/https:\/\/app\.test\//g, ''); }
        finally {
            window.fetch = realFetch; window.callClaude = realClaude;
            Object.assign(state, { drawings: keep.drawings, scenes: keep.scenes, scenePlan: keep.plan, traceDrawings: keep.trace });
            traceUnsupported = false; traceSizeRefused = false;
            for (const k of ['a guillotine', 'a cat', 'a dog', 'a cow', 'a hen', 'a pig', 'a fox']) await idbDel(traceCacheKey(k)).catch(() => {});
            agnesImageUnsupported = keep.unsup; if (keep.agnes === null) localStorage.removeItem('agnes_api_key'); else localStorage.setItem('agnes_api_key', keep.agnes);
        }
        return r;
    });
    // 8.9 : bords du fond vert démêlés (Color to Alpha de PhotoCraft) — mèches gardées, plus de liseré vert, WebGL et repli 2D
    const v89 = await page.evaluate(async () => {
        const r = {};
        try {
            const W = 720, H = 1280, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
            g.fillStyle = '#00B140'; g.fillRect(0, 0, W, H);
            const fg = document.createElement('canvas'); fg.width = W; fg.height = H; const f = fg.getContext('2d');
            f.fillStyle = '#f0f0ee'; f.beginPath(); f.ellipse(360, 1000, 230, 330, 0, 0, Math.PI * 2); f.fill();
            f.fillStyle = '#e9b48f'; f.beginPath(); f.ellipse(360, 520, 150, 190, 0, 0, Math.PI * 2); f.fill();
            f.fillStyle = '#3a2416'; f.beginPath(); f.ellipse(360, 400, 170, 120, 0, Math.PI, 0); f.fill();
            f.strokeStyle = '#3a2416'; f.lineCap = 'round';
            for (let k = 0; k < 40; k++) { const a = Math.PI + k / 39 * Math.PI, x0 = 360 + Math.cos(a) * 165, y0 = 400 + Math.sin(a) * 115; f.lineWidth = 1 + (k % 3) * 0.6; f.beginPath(); f.moveTo(x0, y0); f.quadraticCurveTo(x0 + Math.cos(a) * 30, y0 + Math.sin(a) * 30 - 10, x0 + Math.cos(a) * 55 + (k % 5 - 2) * 6, y0 + Math.sin(a) * 50); f.stroke(); }
            const sp = document.createElement('canvas'); sp.width = W; sp.height = H; const s2 = sp.getContext('2d');
            s2.filter = 'blur(6px)'; s2.drawImage(fg, 0, 0); s2.filter = 'none'; s2.globalCompositeOperation = 'source-in'; s2.fillStyle = '#00B140'; s2.fillRect(0, 0, W, H);
            g.save(); g.filter = 'blur(0.8px)'; g.drawImage(fg, 0, 0); g.restore();
            g.save(); g.globalCompositeOperation = 'source-atop'; g.globalAlpha = 0.18; g.drawImage(sp, 0, 0); g.restore();   // reflet vert
            const img = await new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = c.toDataURL('image/jpeg', 0.72); });   // compression vidéo
            const truth = f.getImageData(0, 0, W, H).data;
            for (const mode of ['webgl', '2d']) {
                let proc;
                if (mode === 'webgl') proc = createVideoProcessor();
                else { const orig = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, o) { return t === 'webgl' ? null : orig.call(this, t, o); }; try { proc = createVideoProcessor(); } finally { HTMLCanvasElement.prototype.getContext = orig; } }
                const layer = proc.process(img, { key: true });
                const comp = document.createElement('canvas'); comp.width = W; comp.height = H; const cg = comp.getContext('2d');
                cg.fillStyle = '#5a6478'; cg.fillRect(0, 0, W, H); cg.drawImage(layer, 0, 0, W, H);
                const cd = cg.getImageData(0, 0, W, H).data;
                const lc = document.createElement('canvas'); lc.width = W; lc.height = H; const lg = lc.getContext('2d'); lg.drawImage(layer, 0, 0, W, H); const la = lg.getImageData(0, 0, W, H).data;
                let fringe = 0, kept = 0, strands = 0, holes = 0;
                const T = (i, dx, dy) => truth[i + (dy * W + dx) * 4 + 3];
                for (let y = 14; y < H - 14; y++) for (let x = 14; x < W - 14; x++) {
                    const i = (y * W + x) * 4, t = truth[i + 3];
                    // bord visible : à 2 pixels ou moins de la limite du personnage
                    const edge = t > 0 ? (T(i, 2, 0) === 0 || T(i, -2, 0) === 0 || T(i, 0, 2) === 0 || T(i, 0, -2) === 0) : (T(i, 2, 0) > 0 || T(i, -2, 0) > 0 || T(i, 0, 2) > 0 || T(i, 0, -2) > 0);
                    if (edge && la[i + 3] > 25 && cd[i + 1] - Math.max(cd[i], cd[i + 2]) > 12) fringe++;
                    if (y < 400 && t > 120 && (x < 200 || x > 520 || y < 290)) { strands++; if (la[i + 3] > 128) kept++; }
                    if (t > 200 && [[12, 0], [-12, 0], [0, 12], [0, -12], [9, 9], [-9, 9], [9, -9], [-9, -9]].every(([dx, dy]) => T(i, dx, dy) > 200) && la[i + 3] < 250) holes++;
                }
                // vêtements verts collés au fond (sarcelle, vert forêt, olive) : restent pleins et de leur couleur
                const acc = document.createElement('canvas'); acc.width = 400; acc.height = 100; const ag = acc.getContext('2d');
                ag.fillStyle = '#00B140'; ag.fillRect(0, 0, 400, 100);
                const cols = [[0, 176, 144], [30, 120, 60], [110, 140, 40]];
                cols.forEach((c, k) => { ag.fillStyle = 'rgb(' + c.join(',') + ')'; ag.fillRect(20 + k * 95, 20, 70, 60); });
                const accImg = await new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = acc.toDataURL('image/png'); });
                const al = proc.process(accImg, { key: true }), A2 = document.createElement('canvas'); A2.width = 400; A2.height = 100; const a2 = A2.getContext('2d'); a2.drawImage(al, 0, 0, 400, 100); const ad = a2.getImageData(0, 0, 400, 100).data;
                const accOk = cols.every((c, k) => [0, 1].every(dx => { const i = (50 * 400 + 20 + k * 95 + dx) * 4; return ad[i + 3] > 240 && (dx === 0 || Math.max(Math.abs(ad[i] - c[0]), Math.abs(ad[i + 1] - c[1]), Math.abs(ad[i + 2] - c[2])) < 8); }));
                r[mode] = { webgl: proc.webgl, fringe, strands: +(kept / strands).toFixed(2), holes, accOk };
                // contexte WebGL perdu (retour d'arrière-plan sur iPhone) : null → la vidéo s'affiche, jamais un calque vide
                if (mode === 'webgl') { proc.canvas.getContext('webgl').getExtension('WEBGL_lose_context').loseContext(); r.lost = proc.process(img, { key: true }) === null; }
                proc.dispose();
            }
        } catch (e) { r.err = e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' '); }
        return r;
    });
    check(!v89.err && v89.webgl.accOk && v89['2d'].accOk, 'fond vert : un vêtement vert, sarcelle ou olive au bord du personnage reste plein et de sa couleur (WebGL et repli)');
    check(!v89.err && v89.lost, 'fond vert : contexte WebGL perdu → la vidéo s\'affiche au lieu d\'un personnage vide');
    check(!v89.err && v89.webgl.webgl && v89.webgl.fringe < 3000 && v89.webgl.strands >= 0.7 && v89.webgl.holes === 0, 'fond vert (WebGL) : mèches de cheveux gardées, liseré vert nettement réduit, aucun trou (' + (v89.err || JSON.stringify(v89.webgl)) + ' ; avant 8.9 : liseré 4100, mèches 0,58)');
    check(!v89.err && !v89['2d'].webgl && v89['2d'].fringe < 3000 && v89['2d'].strands >= 0.65 && v89['2d'].holes === 0, 'fond vert (repli sans WebGL) : liseré vert nettement réduit, mèches gardées, aucun trou (' + (v89.err || JSON.stringify(v89['2d'])) + ' ; avant 8.9 : liseré 7774)');
    // 9.0 : personnage vivant — maillage « aussi rigide que possible » (porté d'EffectCraft), pieds tenus, tête qui bouge
    const v90 = await page.evaluate(async () => {
        const r = {}, keepDeform = state.puppetDeform;
        try {
            const rect = (W, H, nx, ny) => { const v = [], t = []; for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) v.push([W * i / nx, H * j / ny]); const id = (i, j) => j * (nx + 1) + i; for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { t.push([id(i, j), id(i + 1, j + 1), id(i + 1, j)]); t.push([id(i, j), id(i, j + 1), id(i + 1, j + 1)]); } return { v, t }; };
            const near = (v, q) => v.reduce((b, p, k) => Math.hypot(p[0] - q[0], p[1] - q[1]) < Math.hypot(v[b][0] - q[0], v[b][1] - q[1]) ? k : b, 0);
            const pts = o => Array.from(o.x, (x, i) => [x, o.y[i]]);
            // justesse (mêmes cas que les tests d'EffectCraft)
            let m = rect(100, 60, 10, 6), pins = [near(m.v, [0, 0]), near(m.v, [100, 60])];
            let d = pts(arapDeform(arapPrepare(m.v, m.t, pins), pins.map(i => m.v[i]), 2));
            r.identity = Math.max(...d.map((p, k) => Math.hypot(p[0] - m.v[k][0], p[1] - m.v[k][1])));
            m = rect(100, 40, 10, 4);
            const a = near(m.v, [0, 20]), b = near(m.v, [100, 20]), c = [(m.v[a][0] + m.v[b][0]) / 2, (m.v[a][1] + m.v[b][1]) / 2], ang = Math.PI / 6;
            const rot = p => [c[0] + (p[0] - c[0]) * Math.cos(ang) - (p[1] - c[1]) * Math.sin(ang), c[1] + (p[0] - c[0]) * Math.sin(ang) + (p[1] - c[1]) * Math.cos(ang)];
            d = pts(arapDeform(arapPrepare(m.v, m.t, [a, b]), [rot(m.v[a]), rot(m.v[b])], 0));
            r.rotation = Math.max(...d.map((p, k) => { const q = rot(m.v[k]); return Math.hypot(p[0] - q[0], p[1] - q[1]); }));
            m = rect(120, 360, 8, 24);
            const feet = m.v.map((p, k) => p[1] >= 359 ? k : -1).filter(k => k >= 0), head = m.v.map((p, k) => p[1] <= 1 ? k : -1).filter(k => k >= 0);
            d = pts(arapDeform(arapPrepare(m.v, m.t, feet.concat(head)), feet.concat(head).map(i => head.includes(i) ? [m.v[i][0] + 70, m.v[i][1] + 10] : m.v[i]), 1));
            const cross = (p, q, s) => (q[0] - p[0]) * (s[1] - p[1]) - (q[1] - p[1]) * (s[0] - p[0]);
            r.flipped = m.t.filter(t => Math.sign(cross(d[t[0]], d[t[1]], d[t[2]])) !== Math.sign(cross(m.v[t[0]], m.v[t[1]], m.v[t[2]]))).length;
            // une pose : personnage simulé (tête ronde, corps, pieds) sur fond transparent
            const sp = document.createElement('canvas'); sp.width = 300; sp.height = 700; const g = sp.getContext('2d');
            g.fillStyle = '#e9b48f'; g.beginPath(); g.arc(150, 110, 90, 0, Math.PI * 2); g.fill();
            g.fillStyle = '#2b6cd4'; g.fillRect(80, 200, 140, 330); g.fillStyle = '#333'; g.fillRect(90, 530, 45, 150); g.fillRect(165, 530, 45, 150);
            state.puppetDeform = true;
            const M = puppetMeshFor(sp);
            r.mesh = M ? M.rest.length + ' points, ' + M.tris.length + ' triangles' : 'aucun';
            const frame = t => { const o = deformedPuppet(sp, sp, t, 0.6); const c2 = document.createElement('canvas'); c2.width = o.canvas.width; c2.height = o.canvas.height; c2.getContext('2d').drawImage(o.canvas, 0, 0); return { d: c2.getContext('2d').getImageData(0, 0, c2.width, c2.height).data, w: c2.width, h: c2.height, pad: o.pad }; };
            const A = frame(0.2), B = frame(1.5);
            const diff = (y0, y1) => { let n = 0; for (let y = y0; y < y1; y++) for (let x = 0; x < A.w; x++) { const i = (y * A.w + x) * 4 + 3; if (Math.abs(A.d[i] - B.d[i]) > 40) n++; } return n; };
            r.feetMoved = diff(A.pad + 560, A.pad + 680); r.headMoved = diff(A.pad, A.pad + 200);
            const t0 = performance.now(); for (let k = 0; k < 30; k++) deformedPuppet(sp, sp, k / 30, 0.5); r.ms = +((performance.now() - t0) / 30).toFixed(2);
            // dessiné par le vrai drawPuppet, puis réglage « rigide »
            const cv = document.createElement('canvas'); cv.width = 540; cv.height = 960; const cg = cv.getContext('2d');
            drawPuppet(cg, 540, 960, { sprite: { closed: sp }, t: 1, env: null, bufTime: 0 });
            r.drawn = cg.getImageData(0, 0, 540, 960).data.filter((v, i) => i % 4 === 3 && v > 0).length;
            state.puppetDeform = false; r.rigid = deformedPuppet(sp, sp, 1, 0) === null;
            state.puppetDeform = true; disposePuppetRenderer();
            // correctifs de l'équipe : maillage dans l'image, trait fin détaché gardé, contexte perdu, temps du montage, préparation, brouillon rigide
            r.inside = Math.max(...M.rest.map(p => p[0])) <= sp.width + 0.01;
            const sp2 = document.createElement('canvas'); sp2.width = 300; sp2.height = 700; const g2 = sp2.getContext('2d'); g2.drawImage(sp, 0, 0);
            g2.fillStyle = '#000'; g2.fillRect(280, 300, 2, 120);   // baguette fine, loin du corps
            const lone = deformedPuppet(sp2, sp2, 0, 0); const lc = document.createElement('canvas'); lc.width = lone.canvas.width; lc.height = lone.canvas.height; lc.getContext('2d').drawImage(lone.canvas, 0, 0);
            const ld = lc.getContext('2d').getImageData(0, 0, lc.width, lc.height).data; let thin = 0;
            for (let y = lone.pad + 280; y < lone.pad + 440; y++) for (let x = lone.pad + 255; x < lc.width; x++) if (ld[(y * lc.width + x) * 4 + 3] > 100) thin++;
            r.thin = thin;
            const R0 = puppetGlRenderer(); R0.gl.getExtension('WEBGL_lose_context').loseContext();
            const afterLoss = deformedPuppet(sp, sp, 0.5, 0), next = deformedPuppet(sp, sp, 0.6, 0);
            r.lost = (afterLoss === null || afterLoss.canvas !== R0.canvas) && !!next && puppetGlRenderer() !== R0;
            const pix = (o) => { const c3 = document.createElement('canvas'); c3.width = 540; c3.height = 960; const g3 = c3.getContext('2d'); drawPuppet(g3, 540, 960, o); return g3.getImageData(0, 0, 540, 960).data; };
            const same = (A1, B1) => { for (let i = 3; i < A1.length; i += 4) if (Math.abs(A1[i] - B1[i]) > 40) return false; return true; };
            r.tAbs = !same(pix({ sprite: { closed: sp }, t: 0, tAbs: 0 }), pix({ sprite: { closed: sp }, t: 0, tAbs: 2.2 }));
            const sp3 = document.createElement('canvas'); sp3.width = 300; sp3.height = 700; sp3.getContext('2d').drawImage(sp, 0, 0);
            await prewarmPuppet({ main: { closed: sp3 } }); r.prewarm = puppetMeshes.has(sp3);
            const card = { closed: sp, rigid: true };
            const live1 = pix({ sprite: card, t: 1, tAbs: 1 }); state.puppetDeform = false; const rigid1 = pix({ sprite: card, t: 1, tAbs: 1 }); state.puppetDeform = true;
            r.draftRigid = same(live1, rigid1);
            // garde-fou : appareil trop lent → rigide pour la fin du montage ; en image par image, on tolère 40 ms
            disposePuppetRenderer(); for (let k = 0; k < 12; k++) puppetCost(30);
            const slowRealtime = deformedPuppet(sp, sp, 1, 0) === null;
            disposePuppetRenderer(); setPuppetBudget(40); for (let k = 0; k < 12; k++) puppetCost(30);
            const okOffline = deformedPuppet(sp, sp, 1, 0) !== null;
            disposePuppetRenderer(); r.guard = slowRealtime && okOffline && deformedPuppet(sp, sp, 1, 0) !== null;
            disposePuppetRenderer();
        } catch (e) { r.err = e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' '); }
        finally { state.puppetDeform = keepDeform; }
        return r;
    });
    check(!v90.err && v90.identity < 1e-6 && v90.rotation < 1e-3 && v90.flipped === 0, 'personnage déformable : calcul juste (repos exact, rotation d\'un bloc, corps plié sans triangle retourné) (' + (v90.err || v90.identity.toExponential(1) + ' / ' + v90.rotation.toExponential(1) + ' / ' + v90.flipped) + ')');
    check(!v90.err && v90.inside && v90.thin > 150 && v90.lost && v90.tAbs && v90.prewarm && v90.draftRigid && v90.guard, 'personnage vivant : maillage dans l\'image, trait fin détaché gardé, contexte perdu repris, mouvement continu entre scènes, poses préparées, brouillon rigide, garde-fou de vitesse (' + (v90.err || JSON.stringify({ inside: v90.inside, thin: v90.thin, lost: v90.lost, tAbs: v90.tAbs, prewarm: v90.prewarm, draft: v90.draftRigid, guard: v90.guard })) + ')');
    check(!v90.err && v90.feetMoved === 0 && v90.headMoved > 200 && v90.ms < 20 && v90.drawn > 10000 && v90.rigid, 'personnage vivant : pieds immobiles, tête qui bouge, ' + v90.ms + ' ms par image, dessiné par drawPuppet, réglage « rigide » respecté (' + (v90.err || v90.mesh + ', tête ' + v90.headMoved + ' px changés') + ')');
    // 9.1 : enregistreur de test — tout est noté, rien de secret ne sort, il survit à un rechargement
    const v91 = await page.evaluate(async () => {
        const r = {}, realSave = window.saveBlob, realFetch = window.fetch;
        try {
            // services sans réseau : l'échec doit être le même partout (sans internet ici, avec internet sur GitHub)
            window.fetch = function (input) { const u = String(input && input.url ? input.url : input); return /api\.elevenlabs\.io|relais\.test/.test(u) ? Promise.reject(new TypeError('Load failed')) : realFetch.apply(this, arguments); };
            localStorage.removeItem(TESTLOG_KEY); testRec = null;
            await testlogStart();
            r.hooked = !!window.fetch.isTestlog;
            // un appui, un réglage, un texte contenant une clé, un message de journal avec une clé, une erreur
            const sel = document.getElementById('deform-select'); sel.value = 'off'; sel.dispatchEvent(new Event('change', { bubbles: true })); sel.value = 'on'; sel.dispatchEvent(new Event('change', { bubbles: true }));
            const ta = document.createElement('textarea'); ta.id = 'tl-champ-essai'; document.body.appendChild(ta);   // champ de texte (celui du script peut être désactivé par les tests précédents)
            ta.value = 'ma clé ' + ['sk', 'ant', 'api03', 'abcdefghijklmnopqrstuv'].join('-');   // fausse clé construite par morceaux (contrôle des clés du dépôt)
            ta.dispatchEvent(new Event('change', { bubbles: true })); ta.remove();
            document.getElementById('journal-copy-btn').dispatchEvent(new MouseEvent('click', { bubbles: true }));
            log('essai clé ' + ['sk', 'ant', 'api03', 'zyxwvutsrqponmlkjihgf'].join('-'));
            window.dispatchEvent(new ErrorEvent('error', { message: 'Erreur simulée du test', filename: 'https://app.test/js/montage.js', lineno: 42 }));
            try { await fetch('https://api.elevenlabs.io/v1/user/subscription?xi-api-key=' + ['sk', '0123456789abcdef0123'].join('_')); } catch (e) {}
            // titre d'une vidéo dans la liste (texte de l'utilisateur), clé de format inconnu, identifiant de projet dans une adresse
            const li = document.createElement('button'); li.className = 'list-item'; li.dataset.open = 'videos'; li.textContent = 'Fusion secrète Acme 2027'; document.body.appendChild(li);
            li.dispatchEvent(new MouseEvent('click', { bubbles: true })); li.remove();
            r.keepAgnes = localStorage.getItem('agnes_api_key'); const oddKey = 'agnes' + '-perso-' + 'ZZtop9876543';
            localStorage.setItem('agnes_api_key', oddKey); log('réponse du service : clé reçue ' + oddKey);
            try { await fetch('https://relais.test/jobs/' + 'a1b2c3d4'.repeat(8)); } catch (e) {}
            // un montage : mode, vitesse, résultat
            const m = testlogMontageStart({ label: 'Montage essai' }); testlogMontageInfo('image par image (WebCodecs), 1080×1920');
            [12, 18, 70, 15].forEach(testlogFrame); testlogMontageEnd(m, { offline: true, blob: new Blob([new Uint8Array(2e6)]), ext: 'mp4' });
            // la fiche
            testlogStep('version', 'ok'); testlogStep('vivant', 'ko'); testlogStepNote('vivant', 'saccade au début, clé ' + ['sk', 'ant', 'api03', 'notedanslaremarque123'].join('-'));
            // rechargement de l'appli (plantage de Safari) : l'enregistrement reprend
            testlogSave(true); testlogUnhook(); testRec = null;
            await testlogResume();
            r.resumed = !!testRec?.active && testRec.events.some(e => e[1] === 'réouverture') && testRec.steps.version?.res === 'ok';
            // le rapport, téléchargé (feuille de partage sur iPhone)
            let saved = null; window.saveBlob = async (blob, name) => { saved = { name, text: await blob.text() }; return true; };
            await testlogDownload();
            const t = saved?.text || '';
            r.name = saved?.name || '';
            r.sections = ['## Fiche du test', '## Résumé automatique', '## Appareil', '## Chronologie complète', '## Journal de l\'appli'].every(h => t.includes(h));
            r.content = t.includes('deform-select = off') && t.includes('tl-champ-essai texte modifié (') && t.includes('#journal-copy-btn') && t.includes('Erreur simulée du test') && /api\.elevenlabs\.io\/v1\/user\/subscription → ÉCHEC/.test(t)
                && t.includes('Montage essai') && t.includes('1 lentes') && t.includes('❌ **Personnage vivant**') && t.includes('saccade au début') && t.includes('webgl') && t.includes('réouverture');
            r.missing = ['deform-select = off', 'tl-champ-essai texte modifié (', '#journal-copy-btn', 'Erreur simulée du test', 'Montage essai', '1 lentes', '❌ **Personnage vivant**', 'saccade au début', 'webgl', 'réouverture'].filter(x => !t.includes(x)).concat(/api\.elevenlabs\.io\/v1\/user\/subscription → ÉCHEC/.test(t) ? [] : ['service ÉCHEC']);
            r.secret = /sk-ant-api03|sk_0123456789|xi-api-key|Fusion secrète|ZZtop9876543|a1b2c3d4a1b2c3d4/.test(t);
            r.masked = t.includes('relais.test/jobs/[id]') && /appui +« videos »/.test(t);
            r.unhooked = !window.fetch.isTestlog && testRec.active === false;
            testlogClear(); r.cleared = localStorage.getItem(TESTLOG_KEY) === null && testRec === null;
        } catch (e) { r.err = e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' '); }
        finally { window.saveBlob = realSave; if (r.keepAgnes === null) localStorage.removeItem('agnes_api_key'); else if (r.keepAgnes !== undefined) localStorage.setItem('agnes_api_key', r.keepAgnes); if (testRec) { testlogUnhook(); testRec = null; localStorage.removeItem(TESTLOG_KEY); } window.fetch = realFetch; }
        return r;
    });
    check(!v91.err && v91.hooked && v91.resumed && v91.sections && v91.content && /^rapport-test-\d{4}-\d\d-\d\d\.txt$/.test(v91.name), 'enregistreur de test : appuis, réglages, erreurs, services, montages et fiche notés ; reprend après un rechargement ; rapport téléchargé (' + (v91.err || JSON.stringify(v91)) + ')');
    check(!v91.err && v91.secret === false && v91.masked && v91.unhooked && v91.cleared, 'enregistreur de test : aucune clé (même de format inconnu), aucun texte saisi ni titre de vidéo, identifiants de projet masqués ; appels réseau rendus à la normale, effaçable');
    // règle 8 : la version dans une autre langue traduit aussi les mots-clés des dessins (« VS » gardé), puis tout est remis
    const tr8 = await page.evaluate(async () => {
        const r = {}, keep = { drawings: state.drawings, queue: state.queue, scenes: state.scenes, plan: state.scenePlan, lang: state.language, voice: elevenlabsSelectedVoiceId, eleven: localStorage.getItem('elevenlabs_api_key'), claude: localStorage.getItem(STORAGE.CLAUDE_KEY) };
        const realClaude = window.callClaude, realAssemble = window.assembleVideo;
        try {
            state.scenes = ['Le roi contre le peuple.']; state.scenePlan = null;
            state.drawings = [compileDrawing(layoutDrawing({ link: 'versus', elements: [{ label: 'Roi', word: '', icon: 'crown', paths: [] }, { label: 'Peuple', word: '', icon: 'users', paths: [] }] }))];
            state.queue = [{ sceneIndex: 0, status: 'done', videoUrl: 'puppet:0' }];
            localStorage.setItem('elevenlabs_api_key', 'sk_test'); localStorage.setItem(STORAGE.CLAUDE_KEY, 'sk-ant-test'); elevenlabsSelectedVoiceId = 'v1';
            window.callClaude = async req => { r.asked = JSON.stringify(req.prompt).includes('Roi') && !!req.schema.properties.scenes.items.properties.labels; return { title: 'King', scenes: [{ spoken: 'The king against the people.', narration: '', bubble: '', highlight: '', section: '', hook: '', stickerText: '', labels: ['King', 'The common people'] }] }; };
            window.assembleVideo = async () => { r.during = state.drawings[0].labels.map(l => l.text).join('|') + ' ' + state.language; r.smaller = state.drawings[0].labels.find(l => l.text === 'The common people')?.size < keep2.size; return { blob: new Blob(['x']), ext: 'mp4', timeline: state.timeline }; };
            const keep2 = { size: state.drawings[0].labels.find(l => l.text === 'Peuple').size };
            await buildLanguageVersion('en-US');
            r.after = state.drawings[0].labels.map(l => l.text).join('|') + ' ' + state.language;
        } catch (e) { r.err = e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' '); }
        finally {
            window.callClaude = realClaude; window.assembleVideo = realAssemble;
            Object.assign(state, { drawings: keep.drawings, queue: keep.queue, scenes: keep.scenes, scenePlan: keep.plan, language: keep.lang }); elevenlabsSelectedVoiceId = keep.voice;
            for (const [k, v] of [['elevenlabs_api_key', keep.eleven], [STORAGE.CLAUDE_KEY, keep.claude]]) { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); }
        }
        return r;
    });
    check(!tr8.err && tr8.asked && /^King\|VS\|The common people en-US$|^King\|The common people\|VS en-US$/.test(tr8.during || '') && tr8.smaller && /Roi/.test(tr8.after || '') && /Peuple/.test(tr8.after || ''), 'version dans une autre langue : mots-clés des dessins traduits (plus petits si plus longs), « VS » gardé, puis tout remis (' + (tr8.err || tr8.during + ' → ' + tr8.after) + ')');
    check(!v88.err && v88.shapesOk, 'image → traits de feutre : formes retrouvées, zones pleines par leur bord, poussières ignorées (' + (v88.err || v88.shapes) + ')');
    check(!v88.err && v88.illusOk && v88.reload && v88.max3 === 3, 'objet sans icône dessiné par Agnes Image puis retracé au feutre, icône gardée, rien de redemandé (projet rouvert ou même objet), 3 objets au plus (' + (v88.err || v88.illus + ', ' + v88.max3 + ' appels pour 5 objets') + ')');
    check(!v88.err && v88.bg && v88.srv, 'génération en arrière-plan : dessins du serveur retracés par le téléphone pendant le travail, repris du cache au retour, plus aucun appel après le délai ; traits non renvoyés au serveur (sauf image de l\'utilisateur)');
    check(!v88.err && v88.fallback, 'illustrations retracées : réglage coupé → aucun appel ; Agnes Image refusée → dessin de Claude gardé, casting de poses pas coupé');
    check(!v88.err && v88.photoOk, 'image de l\'utilisateur transformée en illustration de la scène, sans aucun appel (' + (v88.err || v88.photo) + ')');
    check(pup.only && pup.video && pup.timeline === 2 && pup.agnes === 0 && pup.dur > 1,'personnage stable + voix ElevenLabs : vidéo montée sans aucune scène Agnes (' + (pup.dur || 0).toFixed(1) + ' s)');
    check(errors.length === 0, 'aucune erreur JavaScript' + (errors.length ? ' : ' + errors.join(' | ') : ''));
    await ctx.close();
}

async function testBackground(browser) {
    console.log('\n▶ Génération en arrière-plan');
    mockStats.flagScene2 = false;   // la scène ratée simulée appartient au groupe « téléphone » : ce groupe ne dépend pas de l'ordre
    const W = await loadWorker(true);
    const { env, objects } = fakeDurableObjects(W);
    const ctx = await browser.newContext({ serviceWorkers: 'block', ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
    await routeEmoji(ctx);
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
