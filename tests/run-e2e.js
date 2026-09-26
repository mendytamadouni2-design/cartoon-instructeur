// Tests de bout en bout de Cartoon Instructeur — services simulés, aucune clé réelle.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'index.html');
const ORIGIN = 'https://app.test';
const RELAY = 'https://cartoon-instructeur.mendy-tamadouni2.workers.dev';
let failures = 0;
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
                    async deleteAll() { m.clear(); }, async setAlarm(t) { clearTimeout(alarm); const d = t - Date.now(); if (d < 60000) alarm = setTimeout(() => o.alarm().catch(e => console.log('ALARME', e)), Math.max(0, d)); }, _m: m
                };
                const o = new W.VideoJob({ storage }, env);
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
function claudeMock(route) {
    const body = JSON.parse(route.request().postData());
    const props = body.output_config?.format?.schema?.properties || {};
    let out;
    if (props.paths) out = { paths: [
        { d: 'M 90 110 C 90 70 150 70 150 110 C 150 150 90 150 90 110 Z', color: 'orange', word: 'soleil' },
        { d: 'M 60 250 Q 120 230 180 250 Q 240 270 300 250', color: 'blue', word: 'eau' },
        { d: 'M 200 230 C 205 200 230 180 250 150', color: 'black', word: '' }] };
    else if (props.scenes) out = { setting: '', scenes: [
        { spoken: 'Le soleil chauffe l\'eau.', action: 'draws', camera: 'medium-wide shot', bubble: 'Le soleil', zoom: 'none', emphasis: '', section: '', shot: 'character', highlight: '100 °C', pose: 'main' },
        { spoken: 'Le soleil chauffe l\'eau.', action: 'points', camera: 'medium-wide shot', bubble: '', zoom: 'in', emphasis: 'chauffe', section: '', shot: 'board', highlight: '', pose: 'main' },
        { spoken: 'Le soleil chauffe l\'eau.', action: 'waves', camera: 'medium-wide shot', bubble: 'Évaporation', zoom: 'none', emphasis: '', section: 'Les nuages', shot: 'character', highlight: '', pose: 'explique' }] };
    else out = { text: 'EAU MAGIQUE' };
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(out) }], stop_reason: 'end_turn' }) });
}
function toneWav() {
    const sr = 22050, n = sr * 2, b = Buffer.alloc(44 + n * 2);
    b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) { const t = i / sr; b.writeInt16LE(Math.round(((t > 0.2 && t < 1.8) ? Math.sin(2 * Math.PI * 500 * t) * 0.3 : 0) * 32767), 44 + i * 2); }
    return b;
}
async function commonRoutes(ctx, clipBufs, relayEnv, W, counters) {
    await ctx.route(ORIGIN + '/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: fs.readFileSync(APP) }));
    await ctx.route('https://apihub.agnes-ai.com/v1/videos', r => { const b = JSON.parse(r.request().postData()); counters.agnes.push(b); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ video_id: 'v' + (counters.vid++) }) }); });
    await ctx.route('https://apihub.agnes-ai.com/agnesapi**', r => { const id = new URL(r.request().url()).searchParams.get('video_id'); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'completed', metadata: { url: 'https://cdn.test/' + id + '.webm' } }) }); });
    await ctx.route('https://api.anthropic.com/v1/messages', claudeMock);
    await ctx.route('https://api.elevenlabs.io/v1/text-to-speech/**', r => r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'audio/wav', body: toneWav() }));
    await ctx.route('https://api.elevenlabs.io/v1/speech-to-text', r => r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify({ words: [{ text: 'Le', start: 0.82, end: 1.0, type: 'word' }, { text: 'soleil', start: 1.05, end: 1.5, type: 'word' }, { text: 'chauffe', start: 1.55, end: 2.0, type: 'word' }, { text: 'l\'eau.', start: 2.05, end: 2.9, type: 'word' }] }) }));
    await ctx.route(RELAY + '/**', async r => {
        const q = r.request(), target = new URL(q.url()).searchParams.get('url');
        const real = globalThis.fetch;
        globalThis.fetch = async (u, o) => { u = String(u); if (u.startsWith('https://cdn.test/')) { const n = parseInt(u.match(/v(\d+)/)[1], 10); return new Response(clipBufs[counters.clipFor(n)], { headers: { 'Content-Type': 'video/webm' } }); } return counters.serverFetch ? counters.serverFetch(u, o) : real(u, o); };
        const resp = await W.default.fetch(new Request(q.url(), { method: q.method(), headers: q.headers(), body: ['GET', 'HEAD'].includes(q.method()) ? undefined : q.postData() }), relayEnv);
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
    await page.fill('#theme-input', 'Le cycle de l\'eau');
    await page.fill('#script-input', 'Le soleil chauffe l\'eau.\nLe soleil chauffe l\'eau.\nLe soleil chauffe l\'eau.');
    await page.dispatchEvent('#script-input', 'input');
    await page.waitForFunction(() => !document.getElementById('generate-btn').disabled);
}

async function testPhoneMontage(browser) {
    console.log('\n▶ Montage complet sur le téléphone');
    const W = await loadWorker(false);
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage(); const errors = [], dialogs = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
    const clipBufs = await makeClips(page);
    const counters = { agnes: [], vid: 0, clipFor: n => (n === 1 ? 1 : n % 2 === 0 ? 0 : 2) };
    await commonRoutes(ctx, clipBufs, {}, W, counters);
    await setup(page, { voiceSource: 'fit', captionFont: 'impact', brandColor: '#00d2ff', genMode: 'phone' });
    check(await page.evaluate(() => state.voiceSource === 'fit' && state.captionFont === 'impact' && state.poses.length === 1), 'réglages et poses retrouvés après rechargement');
    await fillProject(page);
    await page.click('#generate-btn');
    await page.waitForSelector('#storyboard:not(.hidden) #sb-approve', { timeout: 60000 });
    check(counters.agnes.length === 0, 'storyboard affiché sans rien payer chez Agnes');
    await page.fill('[data-sb-field="bubble"][data-i="0"]', 'Chaleur !'); await page.dispatchEvent('[data-sb-field="bubble"][data-i="0"]', 'input');
    await page.click('#sb-approve');
    await page.waitForSelector('#video-preview.visible', { timeout: 600000 });
    const r = await page.evaluate(async () => ({
        bubble: state.scenePlan.scenes[0].bubble, size: state.finalBlob.size, type: state.finalBlob.type,
        tl: state.timeline.map(t => +t.duration.toFixed(2)), fit: state.queue.map(q => !!q.fitBuffer), stt: state.queue.map(q => !!q.sttWords),
        journalHasKey: /sk-ant-test|sk-test|sk_test/.test(journalText())
    }));
    check(r.bubble === 'Chaleur !', 'modification du storyboard conservée');
    check(dialogs.some(d => /pas de voix|personnage muet/.test(d)), 'contrôle qualité : scène muette détectée et refaite');
    check(r.size > 100000, 'vidéo finale produite (' + r.type + ', ' + Math.round(r.size / 1024) + ' Ko)');
    check(r.tl.every(d => d > 2 && d < 3.2), 'blancs coupés (durées ' + r.tl.join(', ') + ' s)');
    check(r.fit.every(Boolean), 'voix ElevenLabs calée utilisée');
    check(r.stt.every(Boolean), 'sous-titres synchronisés au mot');
    check(!r.journalHasKey, 'journal sans aucune clé');
    check(counters.agnes[counters.agnes.length - 1].prompt.includes('No background music'), 'Agnes : voix seule (musique gérée par l\'appli)');
    await page.click('#download-square-btn');
    await page.waitForFunction(() => document.getElementById('download-square-btn').textContent.includes('Prêt'), null, { timeout: 300000 });
    const sq = await page.evaluate(async () => { const b = state.exportCache['fmt-square'].blob; const v = document.createElement('video'); v.src = URL.createObjectURL(b); await new Promise(r => v.onloadedmetadata = r); return [v.videoWidth, v.videoHeight]; });
    check(sq[0] === sq[1], 'version carrée ' + sq.join('×'));
    const thumb = await page.evaluate(async () => (await generateThumbnailImage()).size);
    check(thumb > 20000, 'miniature générée');
    check(errors.length === 0, 'aucune erreur JavaScript' + (errors.length ? ' : ' + errors.join(' | ') : ''));
    await ctx.close();
}

async function testBackground(browser) {
    console.log('\n▶ Génération en arrière-plan');
    const W = await loadWorker(true);
    const { env, objects } = fakeDurableObjects(W);
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
    const clipBufs = await makeClips(page);
    const counters = { agnes: [], vid: 0, clipFor: n => n % 2 === 0 ? 0 : 2 };
    // côté serveur : Agnes et Claude simulés
    counters.serverFetch = async (u, o) => {
        if (u.endsWith('/v1/videos')) { counters.agnes.push(JSON.parse(o.body)); return Response.json({ video_id: 'v' + (counters.vid++) }); }
        if (u.includes('agnesapi')) { const id = new URL(u).searchParams.get('video_id'); return Response.json({ status: 'completed', metadata: { url: 'https://cdn.test/' + id + '.webm' } }); }
        throw new Error('appel inattendu ' + u);
    };
    await commonRoutes(ctx, clipBufs, env, W, counters);
    await setup(page, { genMode: 'background', storyboardOn: true });
    await fillProject(page);
    await page.click('#generate-btn');
    await page.waitForSelector('#storyboard:not(.hidden) #sb-approve', { timeout: 60000 });
    await page.click('#sb-approve');
    await page.waitForFunction(() => document.getElementById('bg-text').textContent.includes('éteindre'), null, { timeout: 30000 });
    check(true, 'projet envoyé au serveur');
    await page.close();                                   // « téléphone éteint »
    await new Promise(r => setTimeout(r, 9000));
    const page2 = await ctx.newPage(); page2.on('pageerror', e => errors.push(e.message)); page2.on('dialog', d => d.accept());
    await page2.goto(ORIGIN + '/index.html');
    await page2.waitForSelector('#bg-finish-btn:not(.hidden)', { timeout: 60000 });
    check(true, 'à la réouverture : « Tes scènes sont prêtes »');
    check(counters.agnes.length === 3 && counters.agnes[2].image.startsWith('data:image/jpeg'), 'pose choisie par Claude envoyée pour la scène 3');
    await page2.click('#bg-finish-btn');
    await page2.waitForSelector('#video-preview.visible', { timeout: 300000 });
    check(await page2.evaluate(() => state.finalBlob.size > 100000), 'vidéo finale assemblée après la génération en arrière-plan');
    const keys = [...[...objects.values()].find(o => o.storage?._m?.has('job')).storage._m.keys()];
    check(!keys.includes('secrets') && !keys.includes('image'), 'clés et photo effacées du serveur (' + keys.join(', ') + ')');
    check(errors.length === 0, 'aucune erreur JavaScript' + (errors.length ? ' : ' + errors.join(' | ') : ''));
    await ctx.close();
}

(async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--autoplay-policy=no-user-gesture-required'] });
    try { if (process.env.ONLY !== 'background') await testPhoneMontage(browser); if (process.env.ONLY !== 'phone') await testBackground(browser); }
    catch (e) { console.log('❌ Erreur du test : ' + e.message); failures++; }
    finally { await browser.close(); }
    console.log(failures ? '\n❌ ' + failures + ' vérification(s) en échec' : '\n✅ Tous les tests passent');
    process.exit(failures ? 1 : 0);
})();
