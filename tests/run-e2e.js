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
function claudeMock(route) {
    const body = JSON.parse(route.request().postData());
    const props = body.output_config?.format?.schema?.properties || {};
    let out;
    if (props.videos) out = { videos: [{ title: 'Le cycle de l\'eau', views: 1200, likes: 80, comments: 5, shares: 3, avg_watch_seconds: 11, full_watch_pct: 34, duration_seconds: 30, notes: 'décroche à 4 s' }] };
    else if (props.script_rules) out = { analysis: 'Bon début.', tips: ['Accroche plus courte'], ideas: ['Les volcans'], script_rules: 'Accroche en moins de 3 secondes.' };
    else if (props.hooks) out = { hooks: [{ text: 'Savais-tu que l\'eau voyage ?', why: 'question' }, { text: 'Un chiffre fou.', why: 'chiffre' }, { text: 'Tout est faux.', why: 'surprise' }] };
    else if (props.question) out = { question: 'Et toi, tu bois combien de verres par jour ?' };
    else if (props.hashtags) out = { caption: 'Le voyage de l\'eau en 30 s', hashtags: ['science', 'eau'] };
    else if (props.lines) out = { lines: ['Ligne modèle un.', 'Ligne modèle deux.'] };
    else if (props.issues) out = { issues: [{ line: 1, problem: 'imprécis', fix: 'Le soleil réchauffe l\'eau des océans.' }] };
    else if (props.paths) out = { paths: [
        { d: 'M 90 110 C 90 70 150 70 150 110 C 150 150 90 150 90 110 Z', color: 'orange', word: 'soleil' },
        { d: 'M 60 250 Q 120 230 180 250 Q 240 270 300 250', color: 'blue', word: 'eau' },
        { d: 'M 200 230 C 205 200 230 180 250 150', color: 'black', word: '' }] };
    else if (props.scenes) out = { setting: '', scenes: [
        { spoken: 'Le soleil chauffe l\'eau.', action: 'draws', camera: 'medium-wide shot', bubble: 'Le soleil', zoom: 'none', emphasis: '', section: '', shot: 'character', highlight: '100 °C', pose: 'main' },
        { spoken: 'Le soleil chauffe l\'eau.', action: 'points', camera: 'medium-wide shot', bubble: '', zoom: 'in', emphasis: 'chauffe', section: '', shot: 'board', highlight: '', pose: 'main' },
        { spoken: 'Le soleil chauffe l\'eau.', action: 'waves', camera: 'medium-wide shot', bubble: 'Évaporation', zoom: 'none', emphasis: '', section: 'Les nuages', shot: 'character', highlight: '', pose: 'explique' }] };
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
    const { env } = fakeDurableObjects(W);
    env.TIKTOK_CLIENT_KEY = 'ttkey'; env.TIKTOK_CLIENT_SECRET = 'ttsecret';
    const tt = { uploaded: 0, inits: [], token: 0 };
    counters.serverFetch = async (u, o) => {
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
    await commonRoutes(ctx, clipBufs, env, W, counters);
    await setup(page, { voiceSource: 'fit', captionFont: 'impact', brandColor: '#00d2ff', genMode: 'phone' });
    check(await page.evaluate(() => state.voiceSource === 'fit' && state.captionFont === 'impact' && state.poses.length === 1), 'réglages et poses retrouvés après rechargement');
    // Connexion TikTok (retour de TikTok avec ?code=…&state=…) + YouTube connecté
    await page.evaluate(() => { localStorage.setItem('cartoon_tiktok_oauth_state', 'st1'); localStorage.setItem('youtube_oauth_token', 'ytok'); localStorage.setItem('youtube_oauth_token_exp', String(Date.now() + 3600000)); });
    await page.goto(ORIGIN + '/index.html?code=abc&state=st1');
    await page.waitForFunction(() => !!localStorage.getItem('cartoon_tiktok_token'), null, { timeout: 20000 }).catch(() => {});
    check(await page.evaluate(() => !!getTikTokToken() && location.search === '' && document.getElementById('tiktok-status').textContent.includes('connecté')), 'connexion TikTok réussie (jeton gardé, adresse nettoyée)');
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
    await page.click('[data-toggle="section-editor"]'); await new Promise(r => setTimeout(r, 600));
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
    await page.selectOption('#lang-version-select', 'en-US');
    await page.click('#lang-version-btn');
    await page.waitForFunction(() => /Prêt|Réessayer/.test(document.getElementById('lang-version-btn').textContent), null, { timeout: 300000 });
    const lv = await page.evaluate(() => ({ ok: !!state.exportCache['lang:en-US'], lang: state.language, bank: state.bankUse, cap: segmentsForScene(0)[0].text }));
    check(lv.ok && lv.lang === 'fr-FR' && lv.bank && lv.cap === 'Texte corrigé à la main', 'version anglaise créée, projet français intact');

    // Assistant de script + mode simple
    await page.click('#factcheck-btn');
    await page.waitForSelector('#fc-apply', { timeout: 30000 });
    await page.click('#fc-apply');
    check((await page.inputValue('#script-input')).startsWith('Le soleil réchauffe'), 'vérification des faits : correction appliquée');
    await page.click('#simple-mode-btn');
    check(await page.evaluate(() => document.getElementById('section-style').classList.contains('simple-hidden') && !document.getElementById('generate-btn').classList.contains('simple-hidden')), 'mode simple : réglages avancés masqués');
    await page.click('#simple-mode-btn');
    // Stats TikTok (API + capture lue par Claude) et conseils
    await page.click('[data-toggle="section-ytstats"]'); await new Promise(r => setTimeout(r, 600));
    await page.click('#ttstats-btn');
    await page.waitForFunction(() => (state.ttStats || []).length === 1, null, { timeout: 20000 });
    await page.setInputFiles('#tt-shot-input', await photoBuffer(page));
    await page.waitForFunction(() => state.ttStats?.[0]?.fullPct === 34, null, { timeout: 20000 }).catch(() => {});
    check(await page.evaluate(() => state.ttStats.length === 1 && state.ttStats[0].views === 1500 && state.ttStats[0].fullPct === 34), 'stats TikTok : API + capture réunies');
    await page.click('#platform-advice-btn');
    await page.waitForFunction(() => document.getElementById('platform-advice').textContent.includes('Appliqué'), null, { timeout: 20000 });
    check(await page.evaluate(() => scriptExtras().includes('moins de 3 secondes') && !document.getElementById('insights-line').classList.contains('hidden')), 'conseils : leçons appliquées aux prochains scripts');

    // Publication programmée (YouTube natif + TikTok via le serveur), puis publication immédiate sur TikTok
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
    await page.click('#schedule-list [data-unschedule]');
    await page.waitForFunction(() => document.getElementById('schedule-list').textContent.includes('Annulée'), null, { timeout: 20000 });
    check(true, 'TikTok : publication programmée annulée');
    await page.fill('#pub-at', ''); await page.dispatchEvent('#pub-at', 'change'); await page.uncheck('#pub-yt');
    await page.click('#publish-btn');
    await page.waitForFunction(() => (getJSON('cartoon_schedule', []) || []).length === 3 && !document.getElementById('publish-btn').dataset.busy, null, { timeout: 120000 });
    let pubOk = false;
    for (let i = 0; i < 20 && !pubOk; i++) { await new Promise(r => setTimeout(r, 1500)); await page.evaluate(() => renderSchedule()); pubOk = await page.evaluate(() => document.getElementById('schedule-list').textContent.includes('Publiée sur TikTok')); }
    const finalSize = await page.evaluate(() => state.finalBlob.size);
    check(pubOk && tt.uploaded === finalSize && tt.inits[0]?.post_info?.privacy_level === 'PUBLIC_TO_EVERYONE' && tt.inits[0]?.post_info?.title.includes('#science'), 'TikTok : vidéo publiée par le serveur (' + tt.uploaded + ' octets)' + (pubOk ? '' : ' [liste : ' + await page.evaluate(() => document.getElementById('schedule-list').textContent) + ']') + ' ' + JSON.stringify(tt.inits[0]?.post_info));

    // Sous-titres traduits sur YouTube, découpage, zones TikTok, accroches, question de fin, même structure, dépenses
    check(await page.evaluate(() => /-->/.test(state.langSrt?.['en-US'] || '')), 'sous-titres anglais prêts');
    await page.click('#lang-yt-btn');
    await page.waitForFunction(() => document.getElementById('toast-text').textContent.includes('Sous-titres ajoutés'), null, { timeout: 20000 }).catch(() => {});
    check((yt.captions || 0) >= 2, 'sous-titres traduits ajoutés à la vidéo YouTube');
    check(await page.evaluate(() => computeParts(4).length > 1 && computeParts().length === 1 && safeZone(1080, 1920).on && !safeZone(1920, 1080).on), 'découpage en parties et zones TikTok');
    await page.click('#hooks-btn'); await page.waitForSelector('[data-hook="0"]', { timeout: 20000 }); await page.click('[data-hook="0"]');
    check((await page.inputValue('#script-input')).startsWith('Savais-tu'), 'accroche choisie appliquée');
    await page.click('#end-question-btn');
    await page.waitForFunction(() => document.getElementById('script-input').value.trim().endsWith('par jour ?'), null, { timeout: 20000 }).catch(() => {});
    check((await page.inputValue('#script-input')).trim().endsWith('par jour ?'), 'question de fin ajoutée');
    await page.evaluate(() => { document.getElementById('theme-input').value = 'Les volcans'; return sameStructure('Modèle.\nModèle.'); });
    check((await page.inputValue('#script-input')).startsWith('Ligne modèle un.'), 'nouveau script sur le même modèle');
    const costs = await page.evaluate(() => { const c = getJSON(STORAGE.COSTS); const m = c.months[new Date().toISOString().slice(0, 7)]; renderCosts(); return m; });
    check(costs.agnes > 0 && costs.claude > 0 && costs.elevenlabs > 0, 'dépenses suivies (Agnes, Claude, ElevenLabs)');
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
    check(await page2.evaluate(() => state.queue.every(q => q.mediaKey && q.mediaKey.startsWith('job/'))), 'scènes copiées sur Cloudflare par le serveur');
    // Série entière en arrière-plan
    await page2.click('[data-toggle="section-series"]'); await new Promise(r => setTimeout(r, 600));
    await page2.fill('#series-input', 'Épisode A\nLe soleil chauffe l\'eau.\nLe soleil chauffe l\'eau.\n\nÉpisode B\nLe soleil chauffe l\'eau.\nLe soleil chauffe l\'eau.');
    await page2.dispatchEvent('#series-input', 'input');
    await page2.setInputFiles('#file-input', await photoBuffer(page2));
    await page2.waitForFunction(() => state.images.length > 0);
    await page2.click('#launch-series-btn');
    await page2.waitForFunction(() => document.querySelectorAll('#series-jobs .series-item').length === 2, null, { timeout: 60000 });
    check(true, 'série : 2 épisodes envoyés en arrière-plan');
    let ready = 0;
    for (let i = 0; i < 40 && ready < 2; i++) { await new Promise(r => setTimeout(r, 1500)); await page2.click('#series-refresh-btn'); await new Promise(r => setTimeout(r, 400)); ready = await page2.evaluate(() => document.querySelectorAll('[data-series-finish]').length); }
    check(ready === 2, 'série : les 2 épisodes sont prêts à terminer');
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
