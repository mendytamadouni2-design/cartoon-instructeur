// Cartoon Instructeur · Personnage stable : casting de poses (Agnes, une fois), puis personnage animé par l'appli
// Le personnage ne peut plus changer d'une scène à l'autre : ce sont toujours les mêmes images validées,
// détourées, posées sur le décor et animées (respiration, balancement, entrées) ; la bouche suit la voix.
// (scripts classiques chargés dans l'ordre par index.html : ils partagent les mêmes variables globales)

// ══════════════════════════════════════════════════════════════════
// CASTING : une courte vidéo Agnes par pose, sur fond vert, où seul le personnage parle.
// On y prend 3 images de la même seconde : bouche fermée, mi-ouverte, ouverte (d'après le volume de la voix).
// ══════════════════════════════════════════════════════════════════
const CAST_POSES = [
    { id: 'main', label: 'Neutre', action: 'stands in a relaxed neutral pose facing the camera, arms relaxed along the body' },
    { id: 'explique', label: 'Explique', action: 'explains with both open hands held at chest height, palms up' },
    { id: 'montre', label: 'Montre', action: 'points with one extended arm toward the side of the frame' },
    { id: 'reflechit', label: 'Réfléchit', action: 'thinks with one hand on the chin, looking slightly up' },
    { id: 'salue', label: 'Salue', action: 'waves one raised hand in greeting' },
    { id: 'surpris', label: 'Surpris', action: 'looks amazed with both hands raised near the face' },
    { id: 'rigole', label: 'Content', action: 'smiles broadly with both fists raised in a happy cheer' }
];
function castSig() { return photoSig() + '|' + state.selectedStyle; }
async function loadCast() {
    state.castSigLoaded = castSig();
    try { state.cast = (await idbGet('cast:' + castSig())) || null; } catch (e) { state.cast = null; }
    if (state.cast && state.cast.sig !== castSig()) state.cast = null;
    puppetCache = { key: '', sprites: null };
    renderCast();
}
async function saveCast() {
    if (state.cast) await idbPut('cast:' + castSig(), state.cast).catch(() => {});
    state.castSigLoaded = castSig();   // déjà en mémoire : pas de rechargement qui écraserait un changement en cours
    renderCast();
    // les écrans qui annoncent le personnage stable se mettent à jour
    if (typeof renderReference === 'function') renderReference();
    if (typeof renderCharChip === 'function') renderCharChip();
    updateGenerateBtn();
}
function castPoses() { return (state.cast?.poses || []).filter(p => p.approved && p.closed); }
function castReady() { return castPoses().some(p => p.id === 'main') && castPoses().length >= 2; }
// Personnage stable utilisé : poses validées et réglage non désactivé (tous les styles)
function stableActive() { return state.stableChar !== 'off' && castReady(); }
// Sans aucune scène Agnes : poses validées + voix ElevenLabs disponible pour tout le script
function puppetOnly() {
    if (!stableActive() || !getElevenLabsKey() || !elevenVoiceId()) return false;
    const need = state.scenes.reduce((a, l, i) => a + (scenePlanFor(i).spoken || l).length, 0);
    return !(typeof elevenQuotaShort === 'function' && elevenQuotaShort(need)) && !state.elevenOffRun;
}
function castPrompt(pose) {
    const style = CARTOON_STYLES.find(s => s.id === state.selectedStyle);
    const saved = state.greenScreen; state.greenScreen = true;
    const stylePrompt = style ? stylePromptFor(style) : '';
    state.greenScreen = saved;
    return [
        'Character model sheet shot for an educational cartoon series.',
        'The character from the input image MUST stay IDENTICAL: same face, hairstyle, body shape, clothing, accessories and colors.',
        characterIdentity() ? 'Character identity: ' + characterIdentity() + '.' : '',
        stylePrompt ? 'Visual style: ' + stylePrompt : '',
        'Background: flat, evenly lit pure chroma-key green (#00B140) backdrop filling the whole frame: no shadows on it, no gradient, no floor, no objects. The backdrop never tints the character.',
        'Framing: the WHOLE character is visible from head to feet, centered, with empty green margin all around; locked-off static camera, no camera movement.',
        'Action: the character ' + pose.action + ', then HOLDS this exact pose perfectly still and says a short friendly sentence to the camera: only the mouth moves; head, body, arms and hands stay completely still.',
        'The character holds nothing. No music, no sound effects.',
        'STRICTLY NO TEXT anywhere in the image. 24fps, no watermark.'
    ].filter(Boolean).join(' ');
}
// Volume de la voix image par image (60 par seconde), ramené entre 0 et 1
function voiceEnvelope(buf, fps = 60) {
    if (!buf) return null;
    const d = buf.getChannelData(0), sr = buf.sampleRate, hop = Math.round(sr / fps), n = Math.floor(d.length / hop);
    const env = new Float32Array(n);
    for (let i = 0; i < n; i++) { let e = 0; for (let j = i * hop, k = j + hop; j < k; j++) e += d[j] * d[j]; env[i] = Math.sqrt(e / hop); }
    const sorted = Array.from(env).sort((a, b) => a - b), p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
    if (p95 < 0.01) return null;   // pas de voix
    for (let i = 0; i < n; i++) env[i] = Math.min(1, env[i] / p95);
    return { env, fps };
}
function envAt(e, t) { if (!e) return 0; const i = Math.floor(t * e.fps); return i >= 0 && i < e.env.length ? e.env[i] : 0; }
// Images de la vidéo de casting : bouche fermée (silence), mi-ouverte, ouverte (voix forte), dans la partie où la pose est tenue
async function extractCastFrames(blob) {
    let e = null, dur = 5;
    try { const buf = await decodeAudioBlob(blob); dur = buf.duration || dur; e = voiceEnvelope(buf, 24); } catch (err) {}
    const t0 = dur * 0.45, t1 = dur * 0.95;
    if (!e) return { closed: await extractFrameAt(blob, 0.9, 1024, 0.92), mid: null, open: null };
    const cand = [];
    for (let i = Math.ceil(t0 * e.fps); i < Math.min(e.env.length, t1 * e.fps); i++) cand.push({ t: i / e.fps, v: e.env[i] });
    if (!cand.length) return { closed: await extractFrameAt(blob, 0.9, 1024, 0.92), mid: null, open: null };
    const byV = cand.slice().sort((a, b) => a.v - b.v);
    const closed = byV[0], open = byV[byV.length - 1], mid = byV.reduce((best, c) => Math.abs(c.v - open.v * 0.5) < Math.abs(best.v - open.v * 0.5) ? c : best, byV[0]);
    const at = x => extractFrameAt(blob, Math.min(0.99, x.t / dur), 1024, 0.92);
    return { closed: await at(closed), mid: open.v - closed.v > 0.25 ? await at(mid) : null, open: open.v - closed.v > 0.25 ? await at(open) : null };
}
// Claude compare la pose à la photo : même personnage (couleurs, accessoires, mains…), pose lisible, bouche visible
async function verifyCastFrame(frames) {
    if (!getClaudeKey()) return { ok: true, why: '' };
    const photo = referenceImage() || state.images[0]?.dataUri;
    const imgs = [await downscaleImage(photo, 640, 0.8), await downscaleImage(frames.closed, 640, 0.8)];
    if (frames.open) imgs.push(await downscaleImage(frames.open, 640, 0.8));
    const out = await callClaude({
        effort: 'medium', images: imgs,
        prompt: 'Image 1 : le personnage de référence. Image 2' + (frames.open ? ' et 3 : la même pose, bouche fermée puis ouverte' : ' : une pose') + ', sur fond vert. ' +
            (characterIdentity() ? 'Fiche du personnage : ' + characterIdentity() + '. ' : '') +
            'Est-ce EXACTEMENT le même personnage (forme, couleurs de chaque élément, accessoires, forme des mains, visage), entier de la tête aux pieds, sans objet en main ni texte ? Sois strict sur les couleurs et les mains. ' +
            (frames.open ? 'Les deux images doivent être quasiment identiques à part la bouche. ' : '') +
            'Réponds "ok" et, si ce n\'est pas bon, "why" : la différence principale, en une phrase courte en français.',
        schema: { type: 'object', properties: { ok: { type: 'boolean' }, why: { type: 'string' } }, required: ['ok', 'why'], additionalProperties: false }
    });
    return { ok: !!out.ok, why: String(out.why || '').slice(0, 200) };
}
let casting = false, castCreateInterval = CREATE_INTERVAL_MIN;   // Agnes : une création par minute
async function runCasting(onlyId) {
    if (casting) return;
    if (!state.images[0]) { showToast('Ajoute d\'abord la photo du personnage', 'error'); return; }
    if (!getAgnesKey()) { showToast('Clé Agnes manquante', 'error'); return; }
    if (state.isRunning || assembling || state.regenerating) { showToast('Attends la fin de la génération en cours', 'warn'); return; }
    casting = true; state.stopRequested = false; unlockAudio(); renderCast();
    await ensureWakeLockActive();
    try {
        await ensureIdentity();
        if (!state.cast || state.cast.sig !== castSig()) state.cast = { sig: castSig(), style: state.selectedStyle, poses: [] };
        const todo = CAST_POSES.filter(p => onlyId ? p.id === onlyId : !state.cast.poses.some(x => x.id === p.id && x.closed));
        const src = await downscaleImage(referenceImage() || state.images[0].dataUri, 1280, 0.9);
        let lastCreate = 0;
        for (let k = 0; k < todo.length; k++) {
            const pose = todo[k];
            let result = null, why = '';
            for (let attempt = 0; attempt < 2 && !result; attempt++) {
                if (state.stopRequested) throw new Error('Arrêt demandé');
                const wait = lastCreate ? castCreateInterval - (Date.now() - lastCreate) : 0;
                for (let s = Math.ceil(wait / 1000); s > 0; s--) { setStatus('Casting : pose « ' + pose.label + ' » dans ' + s + ' s (1 création par minute)'); await sleep(1000); if (state.stopRequested) throw new Error('Arrêt demandé'); }
                lastCreate = Date.now();
                const videoId = await createVideoTask(src, castPrompt(pose) + (why ? ' Previous attempt was rejected because: ' + why + ' Fix this.' : ''));
                const url = await pollVideo(videoId, p => setStatus('Casting ' + (k + 1) + '/' + todo.length + ' « ' + pose.label + ' » : ' + p));
                const blob = await fetchClipBlob({ videoUrl: url, sceneIndex: -20 - k });
                setStatus('Casting : vérification de la pose « ' + pose.label + ' »…');
                const frames = await extractCastFrames(blob);
                const check = await verifyCastFrame(frames).catch(() => ({ ok: true, why: '' }));
                if (check.ok || attempt === 1) result = { id: pose.id, ...frames, approved: false, check: check.ok ? '' : check.why, date: Date.now() };
                else { why = check.why; log('Casting « ' + pose.label + ' » refait : ' + why); }
            }
            state.cast.poses = state.cast.poses.filter(x => x.id !== pose.id).concat([result]);
            await saveCast();
        }
        showToast('Casting terminé ✓ Valide les poses réussies (✅), refais les autres (🔁)', 'success', 7000);
    } catch (e) { if (!/Arrêt demandé/.test(e.message)) showToast('Casting interrompu : ' + e.message, 'error', 7000); }
    finally { casting = false; state.stopRequested = false; setStatus(null); puppetCache = { key: '', sprites: null }; renderCast(); }
}
function renderCast() {
    const box = document.getElementById('cast-box'); if (!box) return;
    const poses = state.cast?.sig === castSig() ? state.cast.poses : [];
    const ready = castReady();
    box.innerHTML =
        '<div class="hmuted">' + (ready ? '✅ Personnage stable prêt : ' + castPoses().length + ' pose(s) validée(s). Ton personnage ne changera plus jamais d\'une scène à l\'autre' + (getElevenLabsKey() ? ', et avec ta voix ElevenLabs la vidéo se fait sans attendre Agnes.' : '.')
            : 'Fabrique une fois les poses de ton personnage (≈ 7 petites vidéos Agnes, ≈ 10 min). Tu valides les réussies : l\'appli anime ensuite toujours les mêmes images, la bouche suit la voix.') + '</div>' +
        (poses.length ? '<div class="cast-grid">' + CAST_POSES.map(p => {
            const x = poses.find(q => q.id === p.id); if (!x) return '';
            return '<div class="cast-item' + (x.approved ? ' ok' : '') + '"><img src="' + x.closed + '" alt="">' + (x.open ? '<img class="cast-open" src="' + x.open + '" alt="">' : '') +
                '<span>' + esc(p.label) + (x.open ? ' · 👄' : '') + '</span>' + (x.check ? '<small>⚠️ ' + esc(x.check) + '</small>' : '') +
                '<div><button type="button" data-cast-ok="' + p.id + '">' + (x.approved ? '✅' : '☐ Valider') + '</button> <button type="button" data-cast-redo="' + p.id + '">🔁</button></div></div>';
        }).join('') + '</div>' : '') +
        '<button type="button" class="btn-secondary" id="cast-run-btn"' + (casting ? ' disabled' : '') + '>' + (casting ? '⏳ Casting en cours…' : poses.length ? '🎭 Compléter le casting' : '🎭 Lancer le casting du personnage') + '</button>';
}
document.addEventListener('click', async e => {
    const b = e.target.closest ? e.target.closest('button') : null; if (!b) return;
    if (b.id === 'cast-run-btn') runCasting();
    else if (b.dataset.castRedo) runCasting(b.dataset.castRedo);
    else if (b.dataset.castOk && state.cast) {
        const x = state.cast.poses.find(p => p.id === b.dataset.castOk);
        if (x) { x.approved = !x.approved; puppetCache = { key: '', sprites: null }; await saveCast(); updateEstimate(); }
    }
});

// ══════════════════════════════════════════════════════════════════
// ANIMATION DU PERSONNAGE (marionnette) au montage
// ══════════════════════════════════════════════════════════════════
let puppetCache = { key: '', sprites: null };
// Détoure les images validées une fois (fond vert retiré), recadrées sur la silhouette et alignées par les pieds
async function loadPuppetSprites() {
    const poses = castPoses(), key = castSig() + ':' + poses.map(p => p.id + p.date).join(',');
    if (puppetCache.key === key) return puppetCache.sprites;
    const proc = createVideoProcessor(), sprites = {};
    try {
        for (const p of poses) {
            const frames = {};
            for (const k of ['closed', 'mid', 'open']) {
                if (!p[k]) continue;
                const img = await loadImageEl(p[k]);
                const layer = proc.process(img, { key: true });
                if (!layer) continue;
                const c = document.createElement('canvas'); c.width = layer.width; c.height = layer.height;
                c.getContext('2d').drawImage(layer, 0, 0);
                frames[k] = { canvas: c, bbox: alphaBBox(c) };
            }
            const base = frames.closed;
            if (!base || !base.bbox) continue;
            // cadre commun (union des silhouettes) pour que la bouche change sans que le corps saute
            const bbs = Object.values(frames).map(f => f.bbox).filter(Boolean);
            const x0 = Math.min(...bbs.map(b => b.x)), y0 = Math.min(...bbs.map(b => b.y)), x1 = Math.max(...bbs.map(b => b.x + b.w)), y1 = Math.max(...bbs.map(b => b.y + b.h));
            const W0 = base.canvas.width, H0 = base.canvas.height, m = 0.02;
            const box = { x: Math.max(0, x0 - m) * W0, y: Math.max(0, y0 - m) * H0, w: Math.min(1, x1 - x0 + 2 * m) * W0, h: Math.min(1, y1 - y0 + m) * H0 + H0 * 0.01 };
            const crop = f => {
                if (!f) return null;
                const c = document.createElement('canvas'); c.width = Math.round(box.w); c.height = Math.round(Math.min(H0 - box.y, box.h));
                // chaque image est recalée sur les pieds et le centre de la pose bouche fermée
                const dx = f.bbox ? ((base.bbox.x + base.bbox.w / 2) - (f.bbox.x + f.bbox.w / 2)) * W0 : 0, dy = f.bbox ? ((base.bbox.y + base.bbox.h) - (f.bbox.y + f.bbox.h)) * H0 : 0;
                c.getContext('2d').drawImage(f.canvas, -box.x + Math.max(-8, Math.min(8, dx)), -box.y + Math.max(-8, Math.min(8, dy)));
                return c;
            };
            sprites[p.id] = { closed: crop(frames.closed), mid: crop(frames.mid), open: crop(frames.open) };
        }
    } finally { proc.dispose(); }
    puppetCache = { key, sprites };
    return sprites;
}
function puppetSprite(sprites, poseId) { return sprites[poseId] || sprites.main || Object.values(sprites)[0] || null; }
// Bouche : fermée / mi-ouverte / ouverte selon le volume, avec un peu d'inertie (pas de clignotement)
function mouthState(e, bt, prev) {
    const v = envAt(e, bt), v2 = envAt(e, bt - 0.04);
    const lvl = (v + v2) / 2;
    if (lvl > 0.55) return 'open';
    if (lvl > 0.2) return prev === 'open' && lvl > 0.4 ? 'open' : 'mid';
    return 'closed';
}
// Place et anime le personnage : entrée sur un ressort, respiration, léger balancement, rebond quand il parle,
// petit « pop » quand la pose change. o = { sprite, t, dur, env, bufTime, first, poseChanged, wb, mouth }
function drawPuppet(g, W, H, o) {
    const sp = o.sprite; if (!sp || !sp.closed) return 'closed';
    const portrait = H > W * 1.1;
    const mouth = o.env ? mouthState(o.env, o.bufTime, o.mouth) : 'closed';
    const img = (mouth === 'open' && (sp.open || sp.mid)) || (mouth !== 'closed' && (sp.mid || sp.open)) || sp.closed;
    const hTarget = portrait ? H * 0.5 : H * 0.8, s = hTarget / img.height, w = img.width * s, h = img.height * s;
    const cx = o.wb ? W * (portrait ? 0.5 : 0.22) : portrait ? W * 0.5 : W * 0.3, feet = portrait ? H * 0.94 : H * 0.97;
    const t = o.t, talk = o.env ? envAt(o.env, o.bufTime) : 0;
    const enter = o.first ? spring(t, SPRINGS.bouncy) : 1, pop = o.poseChanged ? 0.965 + 0.035 * spring(t, SPRINGS.snappy) : 1;
    const breathe = 1 + 0.012 * Math.sin(t * 2 * Math.PI / 3.2), sway = 0.008 * Math.sin(t * 2 * Math.PI / 4.3 + 1);
    const bob = -talk * h * 0.008;
    // ombre au sol
    g.save();
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.ellipse(cx, feet, w * 0.32 * enter, h * 0.025, 0, 0, Math.PI * 2); g.fill();
    g.translate(cx, feet + (1 - enter) * H * 0.25 + bob);
    g.rotate(sway); g.scale(pop / Math.sqrt(breathe), pop * breathe);
    g.drawImage(img, -w / 2, -h, w, h);
    g.restore();
    return mouth;
}
