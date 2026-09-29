// Cartoon Instructeur · Qualité : image de référence, scènes riches, dessins vérifiés, contrôle par l'IA, nouvelles prises en arrière-plan
// (scripts classiques chargés dans l'ordre par index.html : ils partagent les mêmes variables globales)

// ══════════════════════════════════════════════════════════════════
// IMAGE DE RÉFÉRENCE : toutes les scènes partent de la même image (personnage, style, décor, cadrage)
// ══════════════════════════════════════════════════════════════════
function photoSig() { const d = state.images[0]?.dataUri || ''; return d.length + ':' + d.slice(-48); }
// ─────────────── Fiche d'identité du personnage (lue une fois par Claude sur la photo) ───────────────
function characterIdentity() { return state.identity && state.identity.sig === photoSig() ? state.identity.text : ''; }
async function loadIdentity() { try { state.identity = (await idbGet('identity:' + photoSig())) || null; } catch (e) { state.identity = null; } }
async function ensureIdentity() {
    const photo = state.images[0]?.dataUri;
    if (!photo || !getClaudeKey() || characterIdentity()) return characterIdentity();
    if (!state.identity) await loadIdentity();
    if (characterIdentity()) return characterIdentity();
    try {
        setStatus('Claude note les traits du personnage…');
        const out = await callClaude({
            system: 'You describe cartoon characters precisely so that a video AI can redraw them identically. You only list what is actually visible.',
            prompt: 'Describe this character\'s fixed visual features in English, as one compact list separated by semicolons: body shape and color, head, eyes (shape and color), eyebrows, nose, mouth, glasses or accessories, clothing (or "no clothing"), hands, feet, any distinctive detail. Be concrete (colors, shapes). 25 to 60 words. No pose, no expression, no background.',
            images: [await downscaleImage(photo, 768, 0.85)],
            schema: { type: 'object', properties: { traits: { type: 'string' } }, required: ['traits'], additionalProperties: false },
            maxTokens: 2000, effort: 'medium'
        });
        const text = String(out.traits || '').replace(/"/g, "'").replace(/\s+/g, ' ').trim().slice(0, 500);
        if (text) { state.identity = { sig: photoSig(), text }; await idbPut('identity:' + photoSig(), state.identity).catch(() => {}); log('Fiche du personnage : ' + text); }
    } catch (e) { log('Fiche du personnage : ' + e.message); }
    finally { setStatus(null); }
    return characterIdentity();
}
function normKeywords(k) { return (Array.isArray(k) ? k : []).map(x => String(x || '').trim().slice(0, 30)).filter(Boolean).slice(0, 3); }
function refStorageKey(style) { return 'ref:' + (style || state.selectedStyle) + (state.greenScreen ? ':green' : ''); }
function referenceImage() { return state.reference && state.reference.sig === photoSig() && state.reference.style === state.selectedStyle && !!state.reference.green === !!state.greenScreen ? state.reference.image : null; }
async function loadReference() {
    try { const r = await idbGet(refStorageKey()); state.reference = r || null; } catch (e) { state.reference = null; }
    renderReference();
}
function referencePrompt() {
    const style = CARTOON_STYLES.find(s => s.id === state.selectedStyle), wb = isWhiteboard();
    return [
        'Reference shot for an educational cartoon series.',
        'The character from the input image MUST stay IDENTICAL: same face, hairstyle, body shape, clothing and colors.',
        characterIdentity() ? 'Character identity: ' + characterIdentity() + '.' : '',
        style ? 'Visual style: ' + stylePromptFor(style) : '',
        state.greenScreen ? 'Background: flat, evenly lit pure chroma-key green (#00B140) backdrop filling the whole frame: no shadows on it, no gradient, no floor, no objects. The character keeps its own colors exactly (including any green or teal accessory); the backdrop never tints the character.' + (wb ? ' The character stands on the LEFT third of the frame.' : '')
            : wb ? 'Background: pure plain white (#FFFFFF), completely empty. The character stands on the LEFT third of the frame; the rest of the frame is empty white space.'
            : 'Background: a simple, softly colored, uncluttered studio backdrop matching the visual style, with no objects and no text.',
        'Action: the character calmly settles into a neutral pose facing the camera, arms relaxed, friendly closed-mouth smile, then stays still until the end.',
        'Camera: locked-off static medium shot, no camera movement at all.',
        'The character does not speak. No music, no sound effects.',
        'STRICTLY NO TEXT anywhere in the image. 24fps, no watermark.'
    ].filter(Boolean).join(' ');
}
async function extractFrameAt(blob, frac, max = 1280, quality = 0.92) {
    const url = URL.createObjectURL(blob);
    let v = null;
    try {
        v = await createStageVideo(url);
        const dur = isFinite(v.duration) && v.duration > 0 ? v.duration : 6;
        await seekTo(v, Math.max(0, Math.min(dur - 0.08, dur * frac)));
        const scale = Math.min(1, max / Math.max(v.videoWidth, v.videoHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale);
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        return c.toDataURL('image/jpeg', quality);
    } finally { disposeStageVideo(v); URL.revokeObjectURL(url); }
}
async function createReference() {
    const photo = state.images[0]?.dataUri;
    if (!photo) { showToast('Ajoute d\'abord la photo du personnage', 'error'); return; }
    await ensureIdentity();
    if (!getAgnesKey()) { showToast('Clé Agnes manquante', 'error'); return; }
    if (state.isRunning || assembling || state.regenerating) return;
    unlockAudio();
    state.regenerating = true; state.stopRequested = false; renderReference();
    await ensureWakeLockActive();
    try {
        showToast('Image de référence : 1 à 2 min, garde l\'appli ouverte', 'success', 4000);
        const small = await downscaleImage(photo, 1280, 0.9);
        const videoId = await createVideoTask(small, referencePrompt());
        const url = await pollVideo(videoId, p => setStatus('Image de référence : ' + p));
        const blob = await fetchClipBlob({ videoUrl: url, sceneIndex: -9 });
        const image = await extractFrameAt(blob, 0.85);
        state.reference = { image, sig: photoSig(), style: state.selectedStyle, green: !!state.greenScreen, date: Date.now() };
        await idbPut(refStorageKey(), state.reference);
        state.storyboardApproved = false;
        showToast('Image de référence prête ✓ Toutes tes scènes partiront de cette image', 'success', 6000);
    } catch (e) { showToast('Image de référence impossible : ' + e.message, 'error', 7000); }
    finally { state.regenerating = false; state.stopRequested = false; setStatus(null); renderReference(); }
}
function renderReference() {
    // poses du personnage stable : rechargées seulement quand la photo ou le style change
    if (typeof loadCast === 'function' && state.castSigLoaded !== castSig()) { state.castSigLoaded = castSig(); loadCast(); }
    const style = CARTOON_STYLES.find(s => s.id === state.selectedStyle)?.name || state.selectedStyle;
    const ref = referenceImage(), outdated = state.reference && !ref;
    const box = document.getElementById('reference-box');
    if (box) box.innerHTML = (ref ? '<img class="ref-img" src="' + ref + '" alt="Image de référence">' : '<div class="hmuted">' + (outdated ? '⚠️ L\'image de référence ne correspond plus (photo ou style changé) : refais-la.' : 'Pas encore d\'image de référence pour le style « ' + esc(style) + ' ».') + '</div>') +
        '<button type="button" class="btn-secondary" id="ref-create-btn"' + (state.regenerating ? ' disabled' : '') + '>' + (state.regenerating ? '⏳ Création…' : ref ? '🔄 Refaire l\'image de référence' : '🎯 Créer l\'image de référence (1 à 2 min, une seule fois)') + '</button>' +
        '<button type="button" class="btn-secondary" id="ref-import-btn"' + (state.regenerating ? ' disabled' : '') + '>📥 Utiliser ma propre image de référence</button>' +
        '<input type="file" id="ref-import-input" accept="image/*" style="display:none">';
    const hint = document.getElementById('ref-hint');
    if (hint && typeof castReady === 'function' && castReady() && state.stableChar !== 'off') {
        const sp = castPoses(), direct = puppetOnly();
        hint.innerHTML = '<div class="char-chip"><img src="' + sp[0].closed + '" alt=""><div class="grow"><b>🎭 Personnage stable · ' + sp.length + ' poses</b><br><span class="hmuted">' +
            (direct ? 'Avec ta voix ElevenLabs : aucune scène à attendre chez Agnes, la vidéo se monte directement.' : 'Il reste identique dans toutes les scènes ; Agnes fournit la voix.') + '</span></div></div>';
    } else if (hint) {
        hint.innerHTML = ref ? '<div class="char-chip"><img src="' + ref + '" alt=""><div class="grow"><b>Image de référence</b><br><span class="hmuted">Toutes les scènes partent de cette image</span></div></div>'
            : '<div class="char-chip missing"><div class="grow"><b>Ton personnage peut changer d\'une scène à l\'autre</b><br><span class="hmuted">Fais le casting une fois : il restera identique dans toutes tes vidéos.</span></div><button type="button" data-open="settings:set-brand">Casting</button></div>';
    }
}
// Image de référence fournie (déjà prête, par ex. le personnage sur fond vert) : gratuit et immédiat
async function importReference(file) {
    if (!file) return;
    if (!state.images[0]?.dataUri) { showToast('Ajoute d\'abord la photo du personnage', 'error'); return; }
    try {
        const raw = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('fichier illisible')); r.readAsDataURL(file); });
        const image = await downscaleImage(raw, 1280, 0.92);
        if (state.greenScreen) {
            // contrôle : le fond doit être vert (coins de l'image)
            const img = await loadImageEl(image), c = document.createElement('canvas'); c.width = 64; c.height = 64;
            const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, 64, 64);
            const corners = [[1, 1], [62, 1], [1, 62], [62, 62]].filter(([x, y]) => { const d = g.getImageData(x, y, 1, 1).data; return isKeyGreen(d[0], d[1], d[2]); }).length;
            if (corners < 3) showToast('⚠️ Le fond de cette image ne semble pas vert : le décor ne pourra pas le remplacer', 'warn', 7000);
        }
        state.reference = { image, sig: photoSig(), style: state.selectedStyle, green: !!state.greenScreen, date: Date.now(), imported: true };
        await idbPut(refStorageKey(), state.reference);
        state.storyboardApproved = false;
        showToast('Image de référence enregistrée ✓ Toutes tes scènes partiront de cette image', 'success', 5000);
    } catch (e) { showToast('Image impossible à utiliser : ' + e.message, 'error', 6000); }
    renderReference();
}
document.addEventListener('change', e => { if (e.target.id === 'ref-import-input') { importReference(e.target.files[0]); e.target.value = ''; } });
document.addEventListener('click', e => {
    if (e.target.id === 'ref-import-btn') document.getElementById('ref-import-input')?.click();
    if (e.target.id === 'ref-create-btn' || (e.target.closest && e.target.closest('[data-ref-create]'))) createReference();
});

// ══════════════════════════════════════════════════════════════════
// SCÈNES RICHES : le personnage dit une phrase face caméra, puis un plan illustré
// pendant que la voix ElevenLabs continue l'explication (tous styles)
// ══════════════════════════════════════════════════════════════════
function elevenVoiceId() { return elevenlabsSelectedVoiceId || getLS(STORAGE.ELEVENLABS_VOICE); }
function richActive() { return !!(state.richMode && getElevenLabsKey() && elevenVoiceId()); }
function needsDrawings() { return isWhiteboard() || richActive(); }
// « Phrase 1. Phrase 2 ! » → ['Phrase 1.', 'Phrase 2 !']
function splitSentences(text) { return (String(text || '').match(/[^.!?…]+[.!?…]+["»”]?|[^.!?…]+$/g) || []).map(s => s.trim()).filter(Boolean); }
// Mots de la narration répartis sur la zone de parole de la voix
function narrationWords(text, speech, dur) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const start = speech && !speech.silent ? speech.start : 0.15, end = speech && !speech.silent ? speech.end : Math.max(0.5, dur - 0.3);
    const total = words.reduce((a, w) => a + w.length + 2, 0);
    let t = start;
    return words.map(w => { const d = (end - start) * (w.length + 2) / total; const o = { text: w, start: t, end: t + d }; t += d; return o; });
}
async function prepareNarration(item) {
    const plan = scenePlanFor(item.sceneIndex);
    if (!plan.narration || item.narrBuffer !== undefined) return;
    let blob = null;
    try {
        if (item.narrKey && getProxyUrl()) {
            const r = await withTimeout(fetch(getProxyUrl() + '/media/' + encodeURIComponent(item.narrKey)), 60000, 'téléchargement trop long');
            if (r.ok) blob = await r.blob();
        }
        if (!blob && getElevenLabsKey() && elevenVoiceId()) blob = await generateElevenLabsAudio(plan.narration, elevenVoiceId(), document.getElementById('elevenlabs-model-select')?.value || 'eleven_multilingual_v2', '0.5', '0.75', 1);
    } catch (e) { log('Narration ' + (item.sceneIndex + 1) + ' : ' + e.message); }
    item.narrBuffer = blob ? await decodeAudioBlob(blob) : null;
    item.narrSpeech = item.narrBuffer ? analyzeSpeech(item.narrBuffer) : null;
}
// Plan illustré plein écran (tableau) : dessin et graphique animés au rythme de la voix, titre,
// et, en mode fond vert, le personnage en médaillon à côté du tableau
function drawBoardShot(ctx, W, H, t, dur, o) {
    const wb = isWhiteboard(), portrait = H > W * 1.2;
    if (state.greenScreen) drawDecor(ctx, W, H);
    else if (wb) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); }
    else {
        ctx.save();
        try { ctx.filter = 'blur(18px)'; } catch (e) {}
        ctx.drawImage(o.backdrop, -20, -20, W + 40, H + 40);
        ctx.restore();
        ctx.fillStyle = 'rgba(15, 18, 26, 0.28)'; ctx.fillRect(0, 0, W, H);
    }
    const pres = o.presenter && state.greenScreen ? o.presenter : null;
    // la carte entre sur un ressort doux (échelle + montée), puis la caméra avance très lentement
    const z = (0.94 + 0.06 * spring(t, SPRINGS.gentle)) * (1 + 0.03 * clamp01(t / dur)), rise = (1 - spring(t, SPRINGS.gentle)) * H * 0.03;
    ctx.save();
    ctx.translate(W / 2, H * 0.42 + rise); ctx.scale(z, z); ctx.translate(-W / 2, -H * 0.42);
    let card = portrait ? { x: W * 0.06, y: H * 0.12, w: W * 0.8, h: H * 0.5 } : { x: W * 0.06, y: H * 0.06, w: W * 0.88, h: H * 0.68 };
    if (pres && !portrait) card = { x: W * 0.33, y: H * 0.07, w: W * 0.63, h: H * 0.66 };
    if (!wb || state.greenScreen) {
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = Math.min(W, H) * 0.03;
        ctx.fillStyle = '#fff'; roundRectPath(ctx, card.x, card.y, card.w, card.h, Math.min(W, H) * 0.03); ctx.fill(); ctx.restore();
    }
    let top = card.y + card.h * 0.06;
    const title = o.graphic?.title || o.title;
    if (title) {
        let fs = Math.round(Math.min(W, H) * 0.058);
        ctx.font = '900 ' + fs + 'px ' + MARKER_FONT;
        while (ctx.measureText(title).width > card.w * 0.9 && fs > 16) { fs -= 2; ctx.font = '900 ' + fs + 'px ' + MARKER_FONT; }
        drawTextReveal(ctx, title, card.x + card.w / 2, top + fs * 0.55, t - 0.12, { font: '900 ' + fs + 'px ' + MARKER_FONT, color: '#1f1f1f', each: 0.06 });
        top += fs * 1.35;
    }
    const inner = { x: card.x + card.w * 0.05, y: top, w: card.w * 0.9, h: card.y + card.h - top - card.h * 0.05 };
    const hasGraphic = o.graphic && o.graphic.type && o.graphic.type !== 'none' && o.graphic.items?.length;
    let active = false;
    if (o.drawing && hasGraphic) {
        // côte à côte en paysage, l'un au-dessus de l'autre en vertical
        const left = portrait ? { x: inner.x, y: inner.y + inner.h * 0.5, w: inner.w, h: inner.h * 0.5 } : { x: inner.x, y: inner.y, w: inner.w * 0.52, h: inner.h };
        const right = portrait ? { x: inner.x, y: inner.y, w: inner.w, h: inner.h * 0.46 } : { x: inner.x + inner.w * 0.55, y: inner.y, w: inner.w * 0.45, h: inner.h };
        active = drawSketchTimed(ctx, left, o.drawing, o.sched, t, Math.min(1, t / 0.15));
        drawGraphic(ctx, right, o.graphic, t, dur);
    } else if (hasGraphic) drawGraphic(ctx, inner, o.graphic, t, dur);
    else if (o.drawing) active = drawSketchTimed(ctx, inner, o.drawing, o.sched, t, Math.min(1, t / 0.15));
    ctx.restore();
    if (pres) {
        // médaillon : le personnage reste présent pendant l'explication
        let ph = portrait ? H * 0.3 : H * 0.66, pw = ph * pres.width / pres.height;
        const room = portrait ? W * 0.4 : card.x - W * 0.03;
        if (pw > room) { pw = room; ph = pw * pres.height / pres.width; }
        const px = portrait ? W * 0.02 : Math.max(W * 0.01, (card.x - pw) / 2), py = (portrait ? H * 0.99 : H * 0.96) - ph + Math.sin(t * 2.2) * H * 0.004;
        // le personnage glisse depuis le bord sur un ressort, puis respire
        const sp = spring(t - 0.1, SPRINGS.natural), slide = (1 - sp) * (portrait ? -pw * 0.6 : -(px + pw));
        ctx.save(); ctx.globalAlpha = clamp01((t - 0.1) / 0.25);
        ctx.drawImage(pres, px + slide, py, pw, ph);
        ctx.restore();
    }
    return active;
}
// Graphiques animés : voir js/graphics.js
const GRAPHIC_TYPES = ['counter', 'bars', 'list', 'compare', 'timeline', 'chain', 'beforeafter'];
function normalizeGraphic(g) {
    const type = GRAPHIC_TYPES.includes(g?.type) ? g.type : 'none';
    const items = (Array.isArray(g?.items) ? g.items : []).map(i => ({ label: String(i?.label || '').slice(0, 60), value: Number(i?.value) || 0, icon: String(i?.icon || '').slice(0, 60) }))
        .filter(i => i.label || i.value).slice(0, type === 'timeline' ? 6 : 5);
    const need = { bars: 2, compare: 2, timeline: 2, chain: 2, beforeafter: 2 }[type] || 1;
    if (type === 'none' || items.length < need) return { type: 'none', title: '', unit: '', items: [] };
    return { type, title: String(g.title || '').slice(0, 50), unit: String(g.unit || '').slice(0, 12), items };
}

function drawNarrationCaptions(ctx, W, H, words, groups, t) {
    if (state.subtitlesStyle === 'off' || !words.length) return;
    if (state.subtitlesStyle === 'words') { drawWordCaptions(ctx, W, H, groups, t); return; }
    const spoken = words.filter(w => w.start <= t).length;
    const sentences = splitSentences(words.map(w => w.text).join(' '));
    let acc = 0;
    for (const s of sentences) {
        const n = s.split(/\s+/).filter(Boolean).length;
        if (spoken <= acc + n) { drawSubtitle(ctx, W, H, s, (spoken - acc) / n); return; }
        acc += n;
    }
    drawSubtitle(ctx, W, H, sentences[sentences.length - 1] || '', 1);
}

// ══════════════════════════════════════════════════════════════════
// DESSINS VÉRIFIÉS : Claude regarde chaque dessin et fait refaire ceux qui ne montrent pas la bonne idée
// ══════════════════════════════════════════════════════════════════
function drawingToImage(d) {
    const c = document.createElement('canvas'); c.width = 480; c.height = 360;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    drawSketch(g, { x: 10, y: 10, w: 460, h: 340 }, d, 1, 1);
    return c.toDataURL('image/jpeg', 0.8);
}
function drawingIntent(i) { const p = scenePlanFor(i); return [p.visual, p.spoken || state.scenes[i], p.narration].filter(Boolean).join(' — '); }
async function verifyDrawings() {
    if (!getClaudeKey()) return 0;
    const idx = state.drawings.map((d, i) => d ? i : -1).filter(i => i >= 0);
    if (!idx.length) return 0;
    let redone = 0;
    for (let b = 0; b < idx.length; b += 12) {
        const batch = idx.slice(b, b + 12);
        setStatus('Claude vérifie les dessins…');
        try {
            const out = await callClaude({
                effort: 'high',
                system: 'Tu es directeur artistique de vidéos pédagogiques. Tu vérifies que chaque dessin au trait illustre clairement et sans erreur l\'idée demandée, qu\'il est lisible par un enfant, sans chevauchement, et que ses mots-clés (écrits sous chaque élément) sont justes. Aucun autre texte. Tu es exigeant mais juste.',
                prompt: 'Images dans l\'ordre. Pour chacune, l\'idée à illustrer :\n' + batch.map((i, k) => (k + 1) + '. ' + drawingIntent(i)).join('\n') + '\n\nPour chaque image, donne "k" (son numéro), "ok" (true si elle montre bien l\'idée) et "why" (ce qui ne va pas, en une phrase, sinon "").',
                images: batch.map(i => drawingToImage(state.drawings[i])),
                schema: { type: 'object', properties: { results: { type: 'array', items: { type: 'object', properties: { k: { type: 'integer' }, ok: { type: 'boolean' }, why: { type: 'string' } }, required: ['k', 'ok', 'why'], additionalProperties: false } } }, required: ['results'], additionalProperties: false }
            });
            for (const r of out.results || []) {
                const i = batch[r.k - 1];
                if (i === undefined || r.ok) continue;
                setStatus('Nouveau dessin pour la scène ' + (i + 1) + '…');
                try { const d = await generateDrawing(scenePlanFor(i).spoken || state.scenes[i], i, state.scenes.length, r.why); if (d) { state.drawings[i] = d; redone++; } } catch (e) {}
            }
        } catch (e) { log('Vérification des dessins : ' + e.message); }
    }
    setStatus(null);
    if (redone) saveProject();
    return redone;
}

// ══════════════════════════════════════════════════════════════════
// CONTRÔLE PAR L'IA : ~50 images du montage analysées (personnage, raccords, illustrations)
// ══════════════════════════════════════════════════════════════════
function createQa(segCount) {
    const small = document.createElement('canvas');
    const frames = [];
    const every = Math.max(1.2, (segCount * 6) / 40);
    let next = 0.8;
    return {
        frames,
        grab(canvas, time, label) {
            if (frames.length >= 70) return;
            small.width = 384; small.height = Math.round(384 * canvas.height / canvas.width);
            small.getContext('2d').drawImage(canvas, 0, 0, small.width, small.height);
            frames.push({ t: time, label, image: small.toDataURL('image/jpeg', 0.6) });
        },
        tick(canvas, time, local, dur, info) {
            if (!info.first && local > 0.2) { info.first = true; this.grab(canvas, time, info.name + ' (début)'); return; }
            if (!info.last && local > dur - 0.25) { info.last = true; this.grab(canvas, time, info.name + ' (fin)'); return; }
            if (time >= next) { next = time + every; this.grab(canvas, time, info.name); }
        }
    };
}
function pickFrames(frames, n) {
    if (frames.length <= n) return frames;
    const keep = frames.filter(f => /\((début|fin)\)/.test(f.label)).slice(0, Math.floor(n * 0.6));
    const rest = frames.filter(f => !keep.includes(f));
    const need = n - keep.length;
    for (let k = 0; k < need; k++) keep.push(rest[Math.floor(k * rest.length / need)]);
    return keep.sort((a, b) => a.t - b.t);
}
async function analyzeMontage() {
    const box = document.getElementById('qa-report');
    const frames = pickFrames(state.qaFrames || [], 50);
    if (!frames.length || !getClaudeKey()) return;
    if (box) { box.classList.remove('hidden'); box.innerHTML = '<div class="hmuted">🔎 Claude analyse ' + frames.length + ' images de ta vidéo…</div>'; }
    try {
        const ref = referenceImage();
        const scenes = state.scenes.map((l, i) => { const p = scenePlanFor(i); return (i + 1) + '. dit : « ' + (p.spoken || l) + ' »' + (p.narration ? ' · voix off : « ' + p.narration + ' »' : '') + (p.visual ? ' · illustration attendue : ' + p.visual : ''); }).join('\n');
        const out = await callClaude({
            system: 'Tu es chef monteur et directeur artistique de vidéos pédagogiques animées. Tu analyses des images extraites d\'une vidéo montée et tu repères précisément ce qui casse l\'impression d\'une vidéo continue et soignée. Sois concret et honnête.',
            prompt: (ref ? 'La PREMIÈRE image est l\'image de référence du personnage (le modèle à respecter). ' : '') + 'Les images suivantes sont extraites de la vidéo, dans l\'ordre, avec leur légende :\n' + frames.map((f, k) => (k + 1) + '. ' + f.t.toFixed(1) + ' s · ' + f.label).join('\n') +
                '\n\nScènes de la vidéo :\n' + scenes +
                '\n\nVérifie : 1) le personnage est-il le même partout (visage, couleurs, style, décor) ? 2) les raccords entre scènes sont-ils fluides (même pose, même cadrage) ? 3) les illustrations montrent-elles vraiment ce qui est dit ? 4) du texte déformé ou des erreurs visibles ?\n' +
                'Donne "score" (0 à 10), "summary" (2 à 3 phrases) et "issues" : pour chaque problème, "scene" (numéro), "kind" (personnage, raccord, illustration, texte ou autre), "problem" (précis) et "action" ("refaire_scene" si la scène vidéo doit être regénérée, "redessiner" si c\'est le dessin, "rien" sinon).',
            images: (ref ? [ref] : []).concat(frames.map(f => f.image)),
            schema: { type: 'object', properties: {
                score: { type: 'number' }, summary: { type: 'string' },
                issues: { type: 'array', items: { type: 'object', properties: { scene: { type: 'integer' }, kind: { type: 'string', enum: ['personnage', 'raccord', 'illustration', 'texte', 'autre'] }, problem: { type: 'string' }, action: { type: 'string', enum: ['refaire_scene', 'redessiner', 'rien'] } }, required: ['scene', 'kind', 'problem', 'action'], additionalProperties: false } }
            }, required: ['score', 'summary', 'issues'], additionalProperties: false }
        });
        state.qaReport = out;
        renderQaReport();
        if (state.projectId) updateProject(state.projectId, { qaScore: out.score });
    } catch (e) { if (box) box.innerHTML = '<div class="hmuted">Contrôle impossible : ' + esc(e.message) + '</div>'; }
}
const QA_KIND = { personnage: '🧑 Personnage', raccord: '🔗 Raccord', illustration: '🖊️ Illustration', texte: '🔤 Texte', autre: '• Autre' };
function renderQaReport() {
    const box = document.getElementById('qa-report'), r = state.qaReport;
    if (!box || !r) return;
    box.classList.remove('hidden');
    const n = state.scenes.length;
    const issues = (r.issues || []).filter(x => x.scene >= 1 && x.scene <= n);
    const redo = [...new Set(issues.filter(x => x.action === 'refaire_scene').map(x => x.scene))];
    const redraw = [...new Set(issues.filter(x => x.action === 'redessiner').map(x => x.scene))];
    box.innerHTML = '<div class="row"><div class="grow t">🔎 Contrôle par l\'IA</div><span class="pill ' + (r.score >= 8 ? 'ok' : 'warn') + '">' + Math.round(r.score * 10) / 10 + ' / 10</span></div>' +
        '<div class="hmuted">' + esc(r.summary) + '</div>' +
        (issues.length ? issues.map(x => '<div class="fc-item"><b>Scène ' + x.scene + '</b> · ' + (QA_KIND[x.kind] || x.kind) + ' : ' + esc(x.problem) + '</div>').join('') : '<div class="hmuted">✅ Aucun problème repéré.</div>') +
        (redraw.length ? '<button type="button" class="btn-secondary" data-qa-redraw="' + redraw.join(',') + '">🖊️ Redessiner ' + (redraw.length > 1 ? 'les illustrations ' : 'l\'illustration ') + redraw.join(', ') + '</button>' : '') +
        (redo.length ? '<button type="button" class="btn-secondary" data-qa-redo="' + redo.join(',') + '">🎬 Refaire ' + (redo.length > 1 ? 'les scènes ' : 'la scène ') + redo.join(', ') + (canRedoInBackground() ? ' en arrière-plan' : '') + '</button>' : '') +
        (redo.length || redraw.length ? '<div class="hmuted">Ensuite, appuie sur « Créer la vidéo finale » pour remonter.</div>' : '');
}
document.addEventListener('click', async e => {
    const rd = e.target.closest && e.target.closest('[data-qa-redraw]');
    if (rd) {
        rd.disabled = true;
        const list = rd.dataset.qaRedraw.split(',').map(Number);
        for (const s of list) {
            const i = s - 1, why = (state.qaReport?.issues || []).filter(x => x.scene === s).map(x => x.problem).join(' ');
            setStatus('Nouveau dessin pour la scène ' + s + '…');
            try { const d = await generateDrawing(scenePlanFor(i).spoken || state.scenes[i], i, state.scenes.length, why); if (d) state.drawings[i] = d; } catch (err) { showToast('Dessin ' + s + ' impossible : ' + err.message, 'warn'); }
        }
        setStatus(null); saveProject(); state.exportCache = {};
        rd.textContent = '✅ Illustrations refaites'; showToast('Illustrations refaites ✓ Remonte la vidéo', 'success');
        return;
    }
    const rs = e.target.closest && e.target.closest('[data-qa-redo]');
    if (rs) {
        const items = rs.dataset.qaRedo.split(',').map(s => state.queue.find(q => q.sceneIndex === +s - 1)).filter(Boolean);
        if (!items.length) return;
        rs.disabled = true;
        if (canRedoInBackground()) { try { await redoInBackground(items); rs.textContent = '⏳ Nouvelles prises en cours sur ton serveur'; } catch (err) { rs.disabled = false; showToast('Envoi impossible : ' + err.message, 'error'); } }
        else {
            state.regenerating = true;
            for (let k = 0; k < items.length; k++) {
                if (k > 0) await countdown(createIntervalMs, 'Nouvelle prise ' + (k + 1) + '/' + items.length + ' dans ');
                try { await regenerateScene(items[k]); } catch (err) { log('Nouvelle prise : ' + err.message); }
            }
            state.regenerating = false; setStatus(null); renderQueue(); updateAssembleBtn();
            rs.textContent = '✅ Scènes refaites';
        }
    }
});

// ══════════════════════════════════════════════════════════════════
// CONTRÔLE AVANT MONTAGE : chaque scène comparée à l'image de référence
// ══════════════════════════════════════════════════════════════════
async function checkScenesAgainstReference(items) {
    const ref = referenceImage() || state.images[0]?.dataUri;
    if (!ref || !getClaudeKey() || !items.length) return [];
    const idText = characterIdentity(), bad = [];
    const schema = { type: 'object', properties: { scenes: { type: 'array', items: { type: 'object', properties: { scene: { type: 'integer' }, same: { type: 'boolean' }, problem: { type: 'string' } }, required: ['scene', 'same', 'problem'], additionalProperties: false } } }, required: ['scenes'], additionalProperties: false };
    try {
        const refSmall = await downscaleImage(ref, 512, 0.8);
        // 3 images par scène (début, milieu, fin), 7 scènes par appel
        for (let b = 0; b < items.length; b += 7) {
            const batch = items.slice(b, b + 7), imgs = [];
            setStatus('Claude vérifie le personnage (scènes ' + (b + 1) + ' à ' + (b + batch.length) + ')…');
            for (const it of batch) {
                await fetchClipBlob(it);
                for (const f of [0.2, 0.5, 0.85]) imgs.push(await extractFrameAt(it.blob, f, 384, 0.65));
            }
            const out = await callClaude({
                system: 'Tu contrôles la cohérence d\'un personnage de dessin animé entre plusieurs plans. Tu es strict sur son apparence (tout trait ajouté, perdu ou changé est une erreur) mais tu acceptes les changements de pose, de geste et d\'expression.',
                prompt: 'Image 1 : la référence du personnage.' + (idText ? ' Ses traits obligatoires : ' + idText + '.' : '') + '\nEnsuite, 3 images par scène (début, milieu, fin), dans l\'ordre des scènes ' + batch.map(it => it.sceneIndex + 1).join(', ') + '.\n' +
                    'Pour chaque scène, "same" vaut false si, sur AU MOINS UNE des 3 images : un trait manque ou change (lunettes, yeux, couleur, forme du corps, accessoire), un vêtement ou un accessoire est ajouté, un membre est en trop ou déformé, le personnage tient un objet, un effet ou un texte apparaît, ou le style de dessin change. Donne "scene" (son numéro), "same" et "problem" (ce qui diffère, en une phrase, sinon "").',
                images: [refSmall].concat(imgs), schema, effort: 'high'
            });
            for (const s of out.scenes || []) {
                if (s.same) continue;
                const it = batch.find(x => x.sceneIndex === s.scene - 1);
                if (it) { it.visualProblem = s.problem || 'personnage différent'; bad.push(it); }
            }
        }
    } catch (e) { log('Contrôle visuel : ' + e.message); }
    finally { setStatus(null); }
    return bad;
}

// ══════════════════════════════════════════════════════════════════
// NOUVELLES PRISES EN ARRIÈRE-PLAN (le serveur refait seulement les scènes ratées)
// ══════════════════════════════════════════════════════════════════
function canRedoInBackground() { return state.genMode === 'background' && !!getProxyUrl() && state.proxyJobs && !state.oneShot; }
async function redoInBackground(items) {
    const indices = items.map(i => i.sceneIndex).filter(i => i >= 0);
    if (!indices.length) return;
    const n = state.scenes.length, setting = state.scenePlan?.setting || '';
    const plans = indices.map(i => scenePlanFor(i));
    const payload = {
        agnesKey: getAgnesKey(), claudeKey: '', claudeModel: getClaudeModel(),
        image: referenceImage() || await downscaleImage((state.images[0] || {}).dataUri || state.photoSmall),
        frames: state.durationFrames, frameRate: FRAME_RATE,
        templates: indices.map((i, k) => buildScenePrompt({ sceneIndex: i, sceneText: state.scenes[i] }, { total: n, setting, plan: plans[k] })),
        fallbackPlan: { setting, scenes: plans }, plan: { setting, scenes: plans }, drawings: indices.map(() => null), drawingRequests: [],
        poses: [], push: getJSON(STORAGE.PUSH_SUB) || null, backup: state.backupOn
    };
    const res = await withTimeout(fetch(getProxyUrl() + '/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }), 60000, 'le serveur ne répond pas');
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.jobId) throw new Error(data.error || ('HTTP ' + res.status));
    const pid = ensureProject();
    updateProject(pid, { redo: { jobId: data.jobId, indices }, status: 'generating', note: 'nouvelles prises : scène' + (indices.length > 1 ? 's ' : ' ') + indices.map(i => i + 1).join(', ') });
    showToast('Nouvelles prises envoyées ✓ Tu peux éteindre ton téléphone, puis revenir appuyer sur « Terminer »', 'success', 7000);
}
// Avant le montage : récupère les nouvelles prises terminées (renvoie false s'il faut encore attendre)
let redoWatch = null;
function watchRedo() {
    if (redoWatch) return;
    redoWatch = setInterval(async () => {
        const p = state.projectId && findProject(state.projectId);
        if (!p?.redo || !getProxyUrl()) { clearInterval(redoWatch); redoWatch = null; return; }
        if (document.hidden || assembling || state.isRunning) return;
        try {
            const job = await (await fetch(getProxyUrl() + '/jobs/' + p.redo.jobId)).json();
            if (['done', 'failed', 'cancelled'].includes(job.status)) {
                clearInterval(redoWatch); redoWatch = null;
                showToast('Nouvelle prise prête ✓ Le montage démarre', 'success', 4000);
                runAssembly();
            }
        } catch (e) {}
    }, 30000);
}
async function applyPendingRedo() {
    const p = state.projectId && findProject(state.projectId);
    if (!p?.redo || !getProxyUrl()) return true;
    try {
        const r = await fetch(getProxyUrl() + '/jobs/' + p.redo.jobId);
        const job = await r.json().catch(() => ({}));
        if (r.status === 404) { updateProject(p.id, { redo: null, status: 'ready' }); return true; }
        if (!r.ok) throw new Error(job.error || ('HTTP ' + r.status));
        if (!['done', 'failed', 'cancelled'].includes(job.status)) {
            const done = job.scenes.filter(s => s.status === 'done').length;
            showToast('Nouvelle prise en cours sur ton serveur (' + done + '/' + job.scenes.length + ', 5 à 15 min). Laisse l\'appli ouverte : le montage démarrera tout seul dès qu\'elle sera prête. Tu peux aussi revenir plus tard.', 'warn', 8000);
            watchRedo();
            return false;
        }
        let applied = 0;
        p.redo.indices.forEach((idx, k) => {
            const sc = job.scenes[k], it = state.queue.find(q => q.sceneIndex === idx);
            if (!sc || !it || sc.status !== 'done') return;
            ['blob', 'audioBuffer', 'speech', 'sttWords', 'fitBuffer', 'fitSpeech', 'ttsBlob', 'ttsBuffer', 'ttsSpeech', 'visualProblem'].forEach(key => delete it[key]);
            it.videoUrl = sc.videoUrl; it.mediaKey = sc.mediaKey || undefined; it.status = 'done'; it.progress = 'Terminé';
            applied++;
        });
        updateProject(p.id, { redo: null, status: 'ready', note: '' });
        state.exportCache = {};
        saveProject(); renderQueue(); rebuildGallery();
        if (applied) showToast(applied + ' nouvelle' + (applied > 1 ? 's prises récupérées' : ' prise récupérée') + ' ✓', 'success');
        return true;
    } catch (e) { showToast('Nouvelles prises : ' + e.message, 'warn'); return true; }
}

// ══════════════════════════════════════════════════════════════════
// VOIX UTILISÉE (affichée clairement) + réglages par défaut
// ══════════════════════════════════════════════════════════════════
function updateVoiceIndicator() {
    const el = document.getElementById('voice-indicator'); if (!el) return;
    const vid = elevenVoiceId(), name = (typeof elevenlabsVoices !== 'undefined' && elevenlabsVoices.find(v => v.voice_id === vid)?.name) || (vid ? 'voix choisie' : '');
    const fit = state.voiceSource === 'fit', prem = state.voiceSource === 'premium' && state.ttsEngine === 'elevenlabs';
    const eleven = (fit || prem) && getElevenLabsKey() && vid;
    el.innerHTML = eleven ? '🗣️ Voix : <b>ElevenLabs</b> (' + esc(name) + ')' + (fit ? ', calée sur les lèvres' : '') + (richActive() ? ' · scènes riches activées' : '')
        : '🗣️ Voix : <b>Agnes</b>. ' + (getElevenLabsKey() ? 'Choisis une voix ElevenLabs dans Réglages → Voix et sous-titres pour une voix plus naturelle.' : 'Ajoute ta clé ElevenLabs (Réglages → Voix et sous-titres) pour une voix plus naturelle et les scènes riches.');
}
function applyQualityDefaults() {
    if (getLS(STORAGE.DEFAULTS_V3)) return;
    if (getElevenLabsKey() && elevenVoiceId()) state.voiceSource = 'fit';
    state.camera = 'static';
    const vs = document.getElementById('voice-source-select'); if (vs) vs.value = state.voiceSource;
    const cs = document.getElementById('camera-select'); if (cs) cs.value = 'static';
    if (typeof saveSettings === 'function') saveSettings();
    setLS(STORAGE.DEFAULTS_V3, '1');
}

// Cible Shorts / TikTok (8.0) : format du script adapté ; la première fois, cible Shorts par défaut
function applyTargetDefaults(atStart) {
    if (atStart && !getLS(STORAGE.DEFAULTS_V8)) {
        state.target = 'shorts'; state.subtitlesStyle = 'words';
        const ts = document.getElementById('target-select'); if (ts) ts.value = 'shorts';
        const ss = document.getElementById('subtitles-style-select'); if (ss) ss.value = 'words';
        if (typeof saveSettings === 'function') saveSettings();
        setLS(STORAGE.DEFAULTS_V8, '1');
    }
    const fs = document.getElementById('script-format-select');
    if (fs && (!atStart || !fs.dataset.touched)) fs.value = shortsMode() ? 'short60' : 'minute';
    if (typeof syncFmtChips === 'function') syncFmtChips();
}
