// Cartoon Instructeur · Qualité : image de référence, scènes riches, dessins vérifiés, contrôle par l'IA, nouvelles prises en arrière-plan
// (scripts classiques chargés dans l'ordre par index.html : ils partagent les mêmes variables globales)

// ══════════════════════════════════════════════════════════════════
// IMAGE DE RÉFÉRENCE : toutes les scènes partent de la même image (personnage, style, décor, cadrage)
// ══════════════════════════════════════════════════════════════════
function photoSig() { const d = state.images[0]?.dataUri || ''; return d.length + ':' + d.slice(-48); }
function refStorageKey(style) { return 'ref:' + (style || state.selectedStyle); }
function referenceImage() { return state.reference && state.reference.sig === photoSig() && state.reference.style === state.selectedStyle ? state.reference.image : null; }
async function loadReference() {
    try { const r = await idbGet(refStorageKey()); state.reference = r || null; } catch (e) { state.reference = null; }
    renderReference();
}
function referencePrompt() {
    const style = CARTOON_STYLES.find(s => s.id === state.selectedStyle), wb = isWhiteboard();
    return [
        'Reference shot for an educational cartoon series.',
        'The character from the input image MUST stay IDENTICAL: same face, hairstyle, body shape, clothing and colors.',
        style ? 'Visual style: ' + style.prompt : '',
        wb ? 'Background: pure plain white (#FFFFFF), completely empty. The character stands on the LEFT third of the frame; the rest of the frame is empty white space.'
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
        state.reference = { image, sig: photoSig(), style: state.selectedStyle, date: Date.now() };
        await idbPut(refStorageKey(), state.reference);
        state.storyboardApproved = false;
        showToast('Image de référence prête ✓ Toutes tes scènes partiront de cette image', 'success', 6000);
    } catch (e) { showToast('Image de référence impossible : ' + e.message, 'error', 7000); }
    finally { state.regenerating = false; state.stopRequested = false; setStatus(null); renderReference(); }
}
function renderReference() {
    const style = CARTOON_STYLES.find(s => s.id === state.selectedStyle)?.name || state.selectedStyle;
    const ref = referenceImage(), outdated = state.reference && !ref;
    const box = document.getElementById('reference-box');
    if (box) box.innerHTML = (ref ? '<img class="ref-img" src="' + ref + '" alt="Image de référence">' : '<div class="hmuted">' + (outdated ? '⚠️ L\'image de référence ne correspond plus (photo ou style changé) : refais-la.' : 'Pas encore d\'image de référence pour le style « ' + esc(style) + ' ».') + '</div>') +
        '<button type="button" class="btn-secondary" id="ref-create-btn"' + (state.regenerating ? ' disabled' : '') + '>' + (state.regenerating ? '⏳ Création…' : ref ? '🔄 Refaire l\'image de référence' : '🎯 Créer l\'image de référence (1 à 2 min, une seule fois)') + '</button>';
    const hint = document.getElementById('ref-hint');
    if (hint) {
        hint.innerHTML = ref ? '<div class="char-chip"><img src="' + ref + '" alt=""><div class="grow"><b>Image de référence</b><br><span class="hmuted">Toutes les scènes partent de cette image</span></div></div>'
            : '<div class="char-chip missing"><div class="grow"><b>Pas d\'image de référence' + (outdated ? ' à jour' : '') + '</b><br><span class="hmuted">Sans elle, le personnage peut changer d\'une scène à l\'autre. À faire une fois par style.</span></div><button type="button" data-ref-create="1">Créer</button></div>';
    }
}
document.addEventListener('click', e => {
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
// Plan illustré plein écran (tableau) : dessin animé au rythme de la voix, titre, sous-titres
function drawBoardShot(ctx, W, H, t, dur, o) {
    const wb = isWhiteboard(), portrait = H > W * 1.2;
    if (wb) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); }
    else {
        ctx.save();
        try { ctx.filter = 'blur(18px)'; } catch (e) {}
        ctx.drawImage(o.backdrop, -20, -20, W + 40, H + 40);
        ctx.restore();
        ctx.fillStyle = 'rgba(15, 18, 26, 0.28)'; ctx.fillRect(0, 0, W, H);
    }
    const z = 1 + 0.03 * clamp01(t / dur);
    ctx.save();
    ctx.translate(W / 2, H * 0.42); ctx.scale(z, z); ctx.translate(-W / 2, -H * 0.42);
    const card = portrait ? { x: W * 0.06, y: H * 0.12, w: W * 0.8, h: H * 0.5 } : { x: W * 0.06, y: H * 0.06, w: W * 0.88, h: H * 0.68 };
    if (!wb) {
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = Math.min(W, H) * 0.03;
        ctx.fillStyle = '#fff'; roundRectPath(ctx, card.x, card.y, card.w, card.h, Math.min(W, H) * 0.03); ctx.fill(); ctx.restore();
    }
    let top = card.y + card.h * 0.06;
    if (o.title) {
        const fs = Math.round(Math.min(W, H) * 0.06);
        ctx.font = '900 ' + fs + 'px ' + MARKER_FONT; ctx.fillStyle = '#1f1f1f'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.globalAlpha = clamp01(t / 0.3); ctx.fillText(o.title, card.x + card.w / 2, top, card.w * 0.92); ctx.globalAlpha = 1;
        top += fs * 1.35;
    }
    const area = { x: card.x + card.w * 0.06, y: top, w: card.w * 0.88, h: card.y + card.h - top - card.h * 0.05 };
    let active = false;
    if (o.drawing) active = drawSketchTimed(ctx, area, o.drawing, o.sched, t, Math.min(1, t / 0.15));
    ctx.restore();
    return active;
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
                system: 'Tu es directeur artistique de vidéos pédagogiques. Tu vérifies que chaque dessin au trait illustre clairement et sans erreur l\'idée demandée, qu\'il est lisible par un enfant et qu\'il ne contient aucun texte. Tu es exigeant mais juste.',
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
    const ref = referenceImage();
    if (!ref || !getClaudeKey() || !items.length) return [];
    try {
        setStatus('Claude compare les scènes à l\'image de référence…');
        const imgs = [];
        for (const it of items) {
            await fetchClipBlob(it);
            imgs.push(await extractFrameAt(it.blob, 0.15, 320, 0.6), await extractFrameAt(it.blob, 0.85, 320, 0.6));
        }
        const out = await callClaude({
            system: 'Tu contrôles la cohérence d\'un personnage de dessin animé entre plusieurs plans. Tu ne signales que les vraies différences (autre visage, autres couleurs, autre style de dessin, autre décor), pas les changements de pose ou d\'expression.',
            prompt: 'Image 1 : la référence. Ensuite, 2 images par scène (début puis fin), dans l\'ordre des scènes ' + items.map(it => it.sceneIndex + 1).join(', ') + '.\nPour chaque scène, donne "scene" (son numéro), "same" (true si le personnage et le décor sont bien ceux de la référence) et "problem" (sinon, ce qui diffère).',
            images: [ref].concat(imgs),
            schema: { type: 'object', properties: { scenes: { type: 'array', items: { type: 'object', properties: { scene: { type: 'integer' }, same: { type: 'boolean' }, problem: { type: 'string' } }, required: ['scene', 'same', 'problem'], additionalProperties: false } } }, required: ['scenes'], additionalProperties: false }
        });
        return (out.scenes || []).filter(s => !s.same).map(s => { const it = items.find(x => x.sceneIndex === s.scene - 1); if (it) it.visualProblem = s.problem || 'personnage différent'; return it; }).filter(Boolean);
    } catch (e) { log('Contrôle visuel : ' + e.message); return []; }
    finally { setStatus(null); }
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
            showToast('Nouvelles prises encore en cours sur ton serveur (' + done + '/' + job.scenes.length + ') : reviens un peu plus tard', 'warn', 6000);
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
    const eleven = state.voiceSource === 'fit' && getElevenLabsKey() && vid;
    el.innerHTML = eleven ? '🗣️ Voix : <b>ElevenLabs</b> (' + esc(name) + '), calée sur les lèvres' + (richActive() ? ' · scènes riches activées' : '')
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
