// Cartoon Instructeur · Dessins du tableau blanc, outils vidéo
// (scripts classiques chargés dans l'ordre par index.html : ils partagent les mêmes variables globales)

// ══════════════════════════════════════════════════════════════════
// DESSINS DU TABLEAU BLANC (conçus par Claude, animés par l'appli)
// ══════════════════════════════════════════════════════════════════
const DRAW_VB = { w: 400, h: 300 };
const INK = { black: '#1f1f1f', blue: '#2563eb', red: '#e03e3e', green: '#1f9d55', orange: '#f08c00' };
const DRAWING_SCHEMA = {
    type: 'object',
    properties: {
        paths: {
            type: 'array',
            items: {
                type: 'object',
                properties: { d: { type: 'string' }, color: { type: 'string', enum: Object.keys(INK) }, word: { type: 'string' } },
                required: ['d', 'color', 'word'], additionalProperties: false
            }
        }
    },
    required: ['paths'], additionalProperties: false
};
let measureSvgEl = null;
function measurePath(d) {
    if (!measureSvgEl) {
        measureSvgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        measureSvgEl.setAttribute('width', '0'); measureSvgEl.setAttribute('height', '0');
        measureSvgEl.style.position = 'absolute'; measureSvgEl.style.visibility = 'hidden';
        document.body.appendChild(measureSvgEl);
    }
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    el.setAttribute('d', d);
    measureSvgEl.appendChild(el);
    let len = 0;
    try { len = el.getTotalLength(); } catch (e) {}
    return { el, len };
}
// Transforme la réponse de Claude en traits prêts à animer (un trait = un seul tracé continu).
function compileDrawing(raw) {
    const strokes = [];
    for (const p of (raw?.paths || [])) {
        const pieces = String(p.d || '').split(/(?=M)/).map(x => x.trim()).filter(x => /^M/.test(x));
        let first = true;
        for (const d of pieces) {
            if (strokes.length >= 40) break;
            let path2d;
            try { path2d = new Path2D(d); } catch (e) { continue; }
            const { el, len } = measurePath(d);
            if (!len || !isFinite(len)) continue;
            strokes.push({ d, path2d, el, len, color: INK[p.color] || INK.black, word: first ? String(p.word || '') : '' });
            first = false;
        }
    }
    return strokes.length ? { strokes, total: strokes.reduce((a, b) => a + b.len, 0) } : null;
}
function drawingRequestFor(sceneText, index, total, feedback, visual) {
    const v = visual !== undefined ? visual : (scenePlanFor(index).visual || '');
    return {
        system: 'Tu es illustrateur de vidéos pédagogiques façon tableau blanc. Tu dessines au feutre, en quelques traits simples et lisibles, ce que dit le narrateur, comme un professeur qui illustre au tableau. Ton dessin doit être reconnaissable au premier coup d\'œil et montrer exactement l\'idée demandée, pas une idée voisine.',
        prompt: 'Sujet de la vidéo : ' + (state.theme || 'non précisé') + '.\nScript complet (pour le contexte) :\n' + state.scenes.map((l, k) => (k + 1) + '. ' + l).join('\n') +
            '\n\nÀ illustrer maintenant, phrase ' + (index + 1) + '/' + total + ' : « ' + sceneText + ' »' + (v ? '\nCe qu\'il faut dessiner : ' + v : '') + (feedback ? '\nUn premier dessin a été refusé pour cette raison : ' + feedback + ' Fais un dessin nettement plus clair.' : '') + '\n\n' +
            'Dessine une illustration concrète et compréhensible de cette phrase (objets, personnages simplifiés, flèches, symboles visuels), dans une zone de ' + DRAW_VB.w + ' × ' + DRAW_VB.h + ' (coordonnées SVG, origine en haut à gauche, marge de 20).\n' +
            'Contraintes :\n- 4 à 18 traits, chaque "d" est UN seul trait continu : il commence par un seul "M" puis uniquement des commandes absolues L, Q, C (et Z pour fermer une forme)\n- dessin au trait uniquement (pas de remplissage)\n- AUCUNE lettre, AUCUN chiffre, AUCUN mot, aucun texte\n- ordre des traits = ordre dans lequel on les dessine (d\'abord l\'élément principal, puis les détails et les flèches)\n- surtout du noir ("black"), une ou deux couleurs d\'accent maximum pour ce qui est important\n- "word" : le mot de la phrase (écrit exactement pareil) au moment duquel ce trait doit commencer à être dessiné, pour que le dessin apparaisse quand le personnage en parle ; "" pour les traits qui suivent simplement le précédent',
        schema: DRAWING_SCHEMA,
        maxTokens: 8000
    };
}
async function generateDrawing(sceneText, index, total, feedback) {
    const p = scenePlanFor(index);
    const out = await callClaude(drawingRequestFor([sceneText, p.narration].filter(Boolean).join(' '), index, total, feedback));
    const compiled = compileDrawing(out);
    if (compiled) compiled.raw = out;
    return compiled;
}
async function prepareDrawings() {
    state.drawings = [];
    if (!needsDrawings() || !getClaudeKey()) return;
    const scenes = state.scenes.slice();
    let next = 0, failures = 0;
    const worker = async () => {
        while (next < scenes.length && !state.stopRequested) {
            const i = next++;
            const text = scenePlanFor(i).spoken || scenes[i];
            try { state.drawings[i] = await generateDrawing(text, i, scenes.length); }
            catch (e) { failures++; log('Dessin ' + (i + 1) + ' : ' + e.message); }
        }
    };
    await Promise.all([worker(), worker(), worker()]);
    if (!state.stopRequested) await verifyDrawings();
    saveProject();
    if (failures) showToast(failures + ' dessin' + (failures > 1 ? 's' : '') + ' n\'ont pas pu être créés', 'warn', 4000);
}

async function prepareScenePlan() {
    state.scenePlan = null;
    if (getClaudeKey()) {
        setStatus('Claude prépare la mise en scène…');
        try { state.scenePlan = await planScenesWithClaude(state.scenes); saveProject(); }
        catch (e) { showToast('Mise en scène Claude indisponible (' + e.message + ') : mode automatique', 'warn', 5000); }
        finally { setStatus(null); }
    }
    if (!state.scenePlan) state.scenePlan = fallbackScenePlan(state.scenes);
}

// ══════════════════════════════════════════════════════════════════
// UTILITAIRES MÉDIA (compatibles iPhone)
// ══════════════════════════════════════════════════════════════════
function withTimeout(promise, ms, msg) {
    let t;
    return Promise.race([promise, new Promise((_, rej) => { t = setTimeout(() => rej(new Error(msg || 'Délai dépassé')), ms); })]).finally(() => clearTimeout(t));
}
function waitEvent(el, events, ms, msg) {
    return withTimeout(new Promise((res, rej) => {
        const ok = () => { cleanup(); res(); };
        const ko = () => { cleanup(); rej(new Error(msg || 'Lecture impossible')); };
        const cleanup = () => { events.forEach(e => el.removeEventListener(e, ok)); el.removeEventListener('error', ko); };
        events.forEach(e => el.addEventListener(e, ok));
        el.addEventListener('error', ko);
    }), ms, msg);
}
function stageEl() {
    let st = document.getElementById('media-stage');
    if (!st) { st = document.createElement('div'); st.id = 'media-stage'; document.body.appendChild(st); }
    return st;
}
// Sur iPhone, une vidéo ne se charge pas tant qu'elle n'est pas dans la page ET lancée avec play().
async function createStageVideo(src) {
    const v = document.createElement('video');
    v.muted = true; v.defaultMuted = true; v.playsInline = true;
    v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', '');
    v.preload = 'auto'; v.src = src;
    stageEl().appendChild(v);
    const ready = waitEvent(v, ['loadeddata', 'canplay'], 20000, 'la scène ne se charge pas');
    try { await v.play(); v.pause(); } catch (e) {}
    if (v.readyState >= 2) ready.catch(() => {}); else await ready;
    return v;
}
function disposeStageVideo(v) { if (!v) return; try { v.pause(); v.removeAttribute('src'); v.load(); v.remove(); } catch (e) {} }
async function seekTo(v, t) {
    if (Math.abs(v.currentTime - t) < 0.02) return;
    const p = waitEvent(v, ['seeked'], 5000, 'seek');
    v.currentTime = t;
    await p.catch(() => {});
}
async function fetchClipBlob(item) {
    if (item.blob) return item.blob;
    const viaProxy = !!getProxyUrl();
    // copie sauvegardée sur ton Cloudflare (ne périme pas, contrairement aux liens d'Agnes)
    if (item.mediaKey && viaProxy) {
        try {
            const res = await withTimeout(fetch(getProxyUrl() + '/media/' + encodeURIComponent(item.mediaKey)), 90000, 'téléchargement trop long');
            if (res.ok) { const blob = await res.blob(); if (blob.size) { item.blob = blob; return blob; } }
        } catch (e) { log('Copie sauvegardée indisponible : ' + e.message); }
    }
    let lastErr = null;
    for (let a = 0; a < 3; a++) {
        try {
            const res = await withTimeout(fetch(proxied(item.videoUrl)), 90000, 'téléchargement trop long');
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const blob = await res.blob();
            if (!blob.size) throw new Error('fichier vide');
            item.blob = blob;
            return blob;
        } catch (e) {
            lastErr = e;
            // Sans relais, un refus du serveur d'Agnes ne se corrige pas en réessayant
            if (!viaProxy && e instanceof TypeError) break;
            await sleep(2000);
        }
    }
    if (!viaProxy) throw new Error('le serveur d\'Agnes bloque le téléchargement des scènes. Installe le relais Cloudflare (bloc « Relais de téléchargement » en haut de la page), puis appuie sur « Assembler la vidéo finale »');
    throw new Error('impossible de récupérer la scène ' + (item.sceneIndex + 1) + ' via le relais (' + (lastErr?.message || 'erreur réseau') + ')');
}
async function extractLastFrame(item) {
    const blob = await fetchClipBlob(item);
    const url = URL.createObjectURL(blob);
    let v = null;
    try {
        v = await createStageVideo(url);
        const dur = isFinite(v.duration) && v.duration > 0 ? v.duration : 6;
        await seekTo(v, Math.max(0, dur - 0.08));
        const scale = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale);
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        return c.toDataURL('image/jpeg', 0.92);
    } finally { disposeStageVideo(v); URL.revokeObjectURL(url); }
}

let audioCtx = null;
function getAudioCtx() { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); return audioCtx; }
// À appeler directement dans un clic : iOS n'autorise le son qu'après un geste de l'utilisateur.
function unlockAudio() {
    try {
        const c = getAudioCtx();
        if (c.state !== 'running') c.resume().catch(() => {});
        const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource();
        s.buffer = b; s.connect(c.destination); s.start(0);
    } catch (e) {}
}
async function decodeAudioBlob(blob) {
    try {
        const buf = await blob.arrayBuffer();
        const ctx = getAudioCtx();
        return await withTimeout(new Promise((res, rej) => {
            const p = ctx.decodeAudioData(buf, res, rej);
            if (p && p.then) p.then(res, rej);
        }), 30000, 'décodage audio');
    } catch (e) { return null; }
}

async function countdown(ms, label) {
    for (let r = Math.ceil(ms / 1000); r > 0; r--) {
        if (state.stopRequested) return;
        setStatus(label + r + 's');
        await sleep(1000);
    }
}
