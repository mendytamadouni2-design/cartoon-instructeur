// Cartoon Instructeur · Dessins du tableau blanc, outils vidéo
// (scripts classiques chargés dans l'ordre par index.html : ils partagent les mêmes variables globales)

// ══════════════════════════════════════════════════════════════════
// DESSINS DU TABLEAU BLANC (conçus par Claude, animés par l'appli)
// ══════════════════════════════════════════════════════════════════
const DRAW_VB = { w: 400, h: 300 };
const INK = { black: '#1f1f1f', blue: '#2563eb', red: '#e03e3e', green: '#1f9d55', orange: '#f08c00' };
// Claude dessine 1 à 3 éléments, chacun dans sa case de 200 × 200 ; l'appli les range et écrit leur mot-clé dessous
// Quelques noms d'icônes Lucide utiles, donnés à Claude comme repères (la recherche accepte aussi des mots-clés)
const ICON_HINTS = 'crown, landmark, scale, gavel, users, user, file-text, scroll, book-open, graduation-cap, lightbulb, brain, heart, sun, moon, cloud, cloud-rain, droplet, snowflake, flame, leaf, sprout, trees, mountain, waves-horizontal, globe, earth, map, flag, castle, church, factory, house, building, school, hospital, ship, plane, car, train-front, rocket, atom, dna, microscope, flask-conical, zap, battery, magnet, thermometer, clock, calendar, hourglass, banknote, coins, receipt, trending-up, trending-down, chart-column, handshake, swords, shield, lock, key, megaphone, vote, newspaper, smartphone, monitor, wifi, database, wheat, utensils, apple, fish, bird, paw-print, bug, virus, pill, stethoscope, skull, triangle-alert, target, search, recycle, wind, bike, anchor, compass, gem, trophy';
const DRAWING_SCHEMA = {
    type: 'object',
    properties: {
        elements: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    label: { type: 'string' }, word: { type: 'string' }, icon: { type: 'string' }, draw: { type: 'string' },
                    paths: { type: 'array', items: { type: 'object', properties: { d: { type: 'string' }, color: { type: 'string', enum: Object.keys(INK) } }, required: ['d', 'color'], additionalProperties: false } }
                },
                required: ['label', 'word', 'icon', 'draw', 'paths'], additionalProperties: false
            }
        },
        link: { type: 'string', enum: ['none', 'arrow', 'versus'] }
    },
    required: ['elements', 'link'], additionalProperties: false
};
// Mise en page des illustrations : 1 à 3 éléments dessinés chacun dans sa case, rangés côte à côte,
// avec leur mot-clé écrit dessous (vraie police) et une flèche ou « VS » entre eux.
function layoutDrawing(out) {
    if (!out || !Array.isArray(out.elements)) return out;   // ancien format : déjà en place
    // icône de la bibliothèque quand Claude en propose une qui existe (trait net, reconnaissable), sinon son dessin
    const use3d = typeof iconStyle === 'function' && iconStyle() === '3d' && typeof EMOJI3D !== 'undefined' && EMOJI3D;
    const withIcons = out.elements.map(e => {
        if (!e) return e;
        // emoji 3D (styles colorés) si son image est déjà chargée : un trait invisible sert d'horloge à son apparition
        const em = use3d && e.icon ? findEmoji(String(e.icon).split(/\s*[,;|]\s*/)) : null;
        if (em && emojiImageNow(em)) return { ...e, emoji: em, paths: [{ d: 'M 20 100 L 180 100', color: 'ghost' }] };
        const ic = e.icon && typeof findIcon === 'function' ? findIcon(String(e.icon).split(/\s*[,;|]\s*/)) : null;
        const norm = d => typeof normalizePath === 'function' ? normalizePath(d).map(sp => segsToD(sp.segs)).join(' ') : d;
        if (ic) return { ...e, paths: ic.paths.map((d, i) => ({ d, color: i === 0 && e.accent ? 'red' : 'black' })), iconName: ic.name };
        // 8.8 : vraie illustration retracée au feutre (Agnes Image ou image de l'utilisateur), sinon le dessin de Claude
        if (Array.isArray(e.traced) && e.traced.length) return { ...e, paths: e.traced.map(d => ({ d: String(d), color: 'black' })), isTraced: true };
        return { ...e, paths: (Array.isArray(e.paths) ? e.paths : []).map(p => ({ ...p, d: norm(p.d) })) };
    });
    const els = withIcons.filter(e => e && Array.isArray(e.paths) && e.paths.length).slice(0, 3);
    const n = els.length, paths = [], labels = [], images = [];
    if (!n) return { paths, labels, images };
    const link = ['arrow', 'versus'].includes(out.link) && n > 1 ? out.link : 'none';
    const M = 10, gap = link === 'none' ? 14 : 36, top = 8, zoneH = 200, labelY = 250;
    const cellW = (400 - 2 * M - gap * (n - 1)) / n;
    const parse = d => {
        const s = String(d || '');
        if (/[a-df-z]/.test(s.replace(/e-?\d/g, ''))) return null;   // commandes relatives refusées
        const toks = s.match(/[MLQCZHV]|-?\d*\.?\d+(?:e-?\d+)?/g);
        return toks && toks[0] === 'M' ? toks : null;
    };
    // parcourt les points d'un tracé (x,y), en appelant f pour chacun
    const walk = (toks, f) => {
        const out = []; let cmd = null, buf = [], lx = 0, ly = 0;
        const flush = () => {
            if (cmd === 'H') { buf.forEach(x => { lx = x; const p = f(x, ly); out.push('L', p[0], p[1]); }); }
            else if (cmd === 'V') { buf.forEach(y => { ly = y; const p = f(lx, y); out.push('L', p[0], p[1]); }); }
            else if (cmd && cmd !== 'Z') {
                const per = { M: 2, L: 2, Q: 4, C: 6 }[cmd];
                for (let i = 0; i + per <= buf.length; i += per) {
                    out.push(i === 0 || cmd !== 'M' ? cmd : 'L');
                    for (let k = 0; k < per; k += 2) { const p = f(buf[i + k], buf[i + k + 1]); out.push(p[0], p[1]); lx = buf[i + k]; ly = buf[i + k + 1]; }
                }
            } else if (cmd === 'Z') out.push('Z');
            buf = [];
        };
        for (const t of toks) { if (/[A-Z]/.test(t)) { flush(); cmd = t; } else buf.push(+t); }
        flush();
        return out;
    };
    els.forEach((el, k) => {
        const parsed = el.paths.map(p => ({ p, toks: parse(p.d) })).filter(x => x.toks).slice(0, el.isTraced ? TRACE_MAX_STROKES : 24);
        if (!parsed.length) return;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        parsed.forEach(x => walk(x.toks, (px, py) => { if (isFinite(px) && isFinite(py)) { x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); } return [0, 0]; }));
        if (!isFinite(x0)) return;
        const bw = Math.max(20, x1 - x0), bh = Math.max(20, y1 - y0);
        const s = Math.min((cellW - 8) / bw, (zoneH - 8) / bh, el.iconName ? 7 : 2.5);   // une icône (grille 24) remplit sa case
        const cx = M + k * (cellW + gap) + cellW / 2, cy = top + zoneH / 2;
        const ox = cx - (x0 + x1) / 2 * s, oy = cy - (y0 + y1) / 2 * s;
        const r = v => Math.round(v * 10) / 10;
        if (k > 0 && link === 'arrow') {
            const ax0 = M + k * (cellW + gap) - gap + 6, ax1 = M + k * (cellW + gap) - 6, ay = cy;
            paths.push({ d: 'M ' + r(ax0) + ' ' + ay + ' L ' + r(ax1) + ' ' + ay + ' M ' + r(ax1 - 9) + ' ' + (ay - 8) + ' L ' + r(ax1) + ' ' + ay + ' L ' + r(ax1 - 9) + ' ' + (ay + 8), color: 'black', word: '' });
        }
        if (k > 0 && link === 'versus') labels.push({ text: 'VS', x: r(M + k * (cellW + gap) - gap / 2), y: cy, size: 20, path: paths.length - 1, accent: true });
        parsed.forEach((x, i) => {
            const d = walk(x.toks, (px, py) => [r(ox + px * s), r(oy + py * s)]).join(' ');
            paths.push({ d, color: x.p.color || 'black', word: i === 0 ? String(el.word || '') : '', lw: el.isTraced ? TRACE_LINE : undefined });
        });
        if (el.emoji) images.push({ name: el.emoji, x: r(cx), y: r(cy), size: r(Math.min(cellW, zoneH) * 0.9), path: paths.length - 1 });
        const label = String(el.label || '').trim().slice(0, 28);
        if (label) labels.push({ text: label, x: r(cx), y: labelY, size: Math.max(16, Math.min(34, (cellW - 4) / (label.length * 0.55))), path: paths.length - 1 });
    });
    // mots-clés d'une même taille (celle du plus long), pour un rendu homogène
    const size = Math.min(...labels.filter(l => !l.accent).map(l => l.size), 34);
    labels.forEach(l => { if (!l.accent) l.size = size; });
    return { paths, labels, images };
}
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
// Compile une illustration enregistrée (ancien format, format mis en page ou éléments bruts de Claude)
// Charge les icônes (et les emojis 3D des éléments) avant de mettre en page une illustration
async function prepareDrawingIcons(raw) {
    await loadIcons();
    if (!Array.isArray(raw?.elements) || iconStyle() !== '3d') return;
    await loadEmoji3d();
    await Promise.all(raw.elements.filter(e => e?.icon).map(e => { const n = findEmoji(String(e.icon).split(/\s*[,;|]\s*/)); return n ? withTimeoutSafe(loadEmojiImage(n), 12000) : null; }));
}
async function compileStoredDrawing(raw) {
    if (!raw) return null;
    if (Array.isArray(raw.elements)) await prepareDrawingIcons(raw);
    const c = compileDrawing(layoutDrawing(raw));
    if (c) c.raw = raw;
    return c;
}
function compileDrawing(raw) {
    const strokes = [], lastStroke = [];
    for (const p of (raw?.paths || [])) {
        lastStroke.push(strokes.length - 1);
        const pieces = String(p.d || '').split(/(?=M)/).map(x => x.trim()).filter(x => /^M/.test(x));
        let first = true;
        for (const d of pieces) {
            if (strokes.length >= 100) break;   // 3 illustrations retracées de 30 traits + flèches tiennent
            let path2d;
            try { path2d = new Path2D(d); } catch (e) { continue; }
            const { el, len } = measurePath(d);
            if (!len || !isFinite(len)) continue;
            strokes.push({ d, path2d, el, len, color: INK[p.color] || INK.black, ghost: p.color === 'ghost', word: first ? String(p.word || '') : '', lw: +p.lw || 0 });
            first = false;
        }
        lastStroke[lastStroke.length - 1] = strokes.length - 1;
    }
    // mots-clés : affichés quand le dernier trait de leur élément est tracé
    const labels = (raw?.labels || []).map(l => ({ text: String(l.text || '').slice(0, 28), x: +l.x || 0, y: +l.y || 0, size: +l.size || 20, accent: !!l.accent, stroke: lastStroke[l.path] ?? -1 })).filter(l => l.text && l.stroke >= 0);
    const images = (raw?.images || []).map(im => ({ name: im.name, x: +im.x || 0, y: +im.y || 0, size: +im.size || 100, stroke: lastStroke[im.path] ?? -1 })).filter(im => im.stroke >= 0);
    return strokes.length ? { strokes, labels, images, total: strokes.reduce((a, b) => a + b.len, 0) } : null;
}
function drawingRequestFor(sceneText, index, total, feedback, visual) {
    const v = visual !== undefined ? visual : (scenePlanFor(index).visual || '');
    return {
        effort: 'high',
        system: 'Tu es illustrateur de vidéos pédagogiques façon tableau blanc. Tu dessines au feutre, en quelques traits simples et lisibles, ce que dit le narrateur, comme un professeur qui illustre au tableau. Chaque élément doit être un objet, un personnage simplifié ou un symbole CONCRET, reconnaissable au premier coup d\'œil, qui montre exactement l\'idée demandée (jamais une forme abstraite).',
        prompt: 'Sujet de la vidéo : ' + (state.theme || 'non précisé') + '.\nScript complet (pour le contexte) :\n' + state.scenes.map((l, k) => (k + 1) + '. ' + l).join('\n') +
            '\n\nÀ illustrer maintenant, phrase ' + (index + 1) + '/' + total + ' : « ' + sceneText + ' »' + (v ? '\nCe qu\'il faut dessiner : ' + v : '') + (feedback ? '\nUn premier dessin a été refusé pour cette raison : ' + feedback + ' Fais un dessin nettement plus clair.' : '') + '\n\n' +
            'Compose l\'illustration en 1 à 3 ÉLÉMENTS (2 ou 3 de préférence) : l\'appli les place côte à côte et écrit sous chacun son mot-clé.\n' +
            'Pour chaque élément :\n- "label" : son mot-clé, 1 à 3 mots dans la langue de la vidéo (ex. « Privilèges », « Constitution », « Coup d\'État »)\n' +
            '- "word" : le mot de la phrase (écrit exactement pareil) au moment duquel il commence à être dessiné, ou ""\n' +
            '- "icon" : 1 à 3 mots-clés ANGLAIS séparés par des virgules pour trouver une icône toute faite (ex. "crown, king" ; "scale, justice" ; "factory"). Mets d\'abord un nom d\'icône Lucide exact si tu le connais (' + ICON_HINTS + '). Si l\'élément est trop particulier pour une icône (ex. une guillotine, un personnage historique précis), mets "" et dessine-le dans "paths".\n' +
            '- "draw" : si "icon" est vide, cet élément décrit en ANGLAIS en quelques mots précis pour un illustrateur (ex. "a guillotine" ; "Napoleon Bonaparte wearing his bicorne hat"), sinon ""\n' +
            '- "paths" : si "icon" est vide, 3 à 10 traits qui dessinent CET élément seul (sinon []), centré dans une case de 200 × 200 (coordonnées SVG de 0 à 200, origine en haut à gauche, marge de 15). Chaque "d" est UN seul trait continu : il commence par un seul "M" puis uniquement des commandes absolues L, Q, C (et Z pour fermer). Dessin au trait, sans remplissage, AUCUNE lettre ni chiffre dans les traits. Surtout du noir ("black"), une couleur d\'accent pour le détail important.\n' +
            '"link" : "arrow" si les éléments se suivent (cause → conséquence, avant → après, étapes), "versus" s\'ils s\'opposent, sinon "none".',
        schema: DRAWING_SCHEMA,
        maxTokens: 8000
    };
}
async function generateDrawing(sceneText, index, total, feedback) {
    const p = scenePlanFor(index);
    // dessin refusé : Claude revoit ses descriptions pour l'illustrateur, sinon Agnes redessinerait le même objet
    const prevDraw = feedback ? (state.drawings[index]?.raw?.elements || []).map(e => e && e.draw).filter(Boolean) : [];
    if (prevDraw.length) feedback += ' Descriptions "draw" du premier essai : ' + prevDraw.join(' ; ') + '. Change-les (objet plus simple, plus reconnaissable).';
    const out = await callClaude(drawingRequestFor([sceneText, p.narration].filter(Boolean).join(' '), index, total, feedback));
    await prepareDrawingIcons(out);
    await traceDrawingElements(out, { fresh: !!feedback });   // 8.8 : objets sans icône dessinés par Agnes Image (si le réglage est activé) puis retracés au feutre
    const compiled = compileDrawing(layoutDrawing(out));
    if (compiled) compiled.raw = out;   // on garde la réponse brute : la mise en page est refaite à chaque ouverture
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
    if (item.puppet) return null;
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
function getAudioCtx() { if (!audioCtx) { playThroughSilentSwitch(); } if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); return audioCtx; }
// À appeler directement dans un clic : iOS n'autorise le son qu'après un geste de l'utilisateur.
// iPhone : sans cela, le son de l'appli (aperçu, essais de voix) est coupé quand le bouton silencieux est activé
function playThroughSilentSwitch() { try { if (navigator.audioSession && navigator.audioSession.type !== 'playback') navigator.audioSession.type = 'playback'; } catch (e) {} }
function unlockAudio() {
    playThroughSilentSwitch();
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
