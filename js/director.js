// Cartoon Instructeur · Réalisation : brouillon animé avant de fabriquer, retouches en discutant,
// un sujet → une série de Shorts, miniatures avec le personnage
// (scripts classiques chargés dans l'ordre par index.html : ils partagent les mêmes variables globales)

// ══════════════════════════════════════════════════════════════════
// BROUILLON ANIMÉ (animatique) : toute la vidéo en moins d'une minute, sans rien demander à Agnes.
// Personnage : les poses validées, sinon l'image de référence (ou la photo) ; voix : ElevenLabs si elle
// servira aussi à la vraie vidéo (les phrases seront alors déjà payées), sinon muet avec les sous-titres.
// ══════════════════════════════════════════════════════════════════
function draftUsesVoice() {
    if (!getElevenLabsKey() || !elevenVoiceId() || state.elevenOffRun) return false;
    return (typeof puppetOnly === 'function' && puppetOnly()) || state.voiceSource === 'fit' || (state.voiceSource === 'premium' && state.ttsEngine === 'elevenlabs');
}
// Personnage du brouillon quand il n'y a pas encore de poses : l'image de référence détourée (fond vert),
// sinon la photo en carte arrondie
async function draftSprites() {
    const src = (typeof referenceImage === 'function' && referenceImage()) || state.images[0]?.dataUri || state.photoSmall;
    if (!src) return null;
    const img = await loadImageEl(src);
    if (state.reference?.green && referenceImage()) {
        const proc = createVideoProcessor();
        try {
            const layer = proc.process(img, { key: true });
            const cut = layer ? presenterFrom(layer, null) : null;
            if (cut) return { main: { closed: cut } };
        } finally { proc.dispose(); }
    }
    const S = 720, s = S / Math.max(img.width, img.height), w = Math.round(img.width * s), h = Math.round(img.height * s), pad = 18;
    const c = document.createElement('canvas'); c.width = w + pad * 2; c.height = h + pad * 2;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; roundRectPath(g, 0, 0, c.width, c.height, 36); g.fill();
    g.save(); roundRectPath(g, pad, pad, w, h, 24); g.clip(); g.drawImage(img, pad, pad, w, h); g.restore();
    return { main: { closed: c, rigid: true } };   // une carte photo ne se plie pas (personnage vivant : rigide)
}
async function runAnimatic() {
    if (assembling || state.isRunning) return;
    if (!state.scenes.length) { showToast('Écris d\'abord un script', 'warn'); return; }
    unlockAudio();
    const box = document.getElementById('animatic-box') || document.getElementById('preview-box');
    assembling = true; state.stopRequested = false;
    document.getElementById('stop-btn')?.classList.add('visible');
    await ensureWakeLockActive();
    try {
        if (!state.scenePlan || state.scenePlan.scenes?.length !== state.scenes.length) state.scenePlan = fallbackScenePlan(state.scenes);
        const items = state.scenes.map((t, i) => ({ sceneIndex: i, sceneText: t, status: 'done', puppet: true, draft: true, videoUrl: 'draft:' + i }));
        showToast(draftUsesVoice() ? '🎬 Brouillon avec ta voix ElevenLabs (ces phrases ne seront pas repayées)' : '🎬 Brouillon muet : lis les sous-titres pour juger le rythme', 'success', 4500);
        await assembleVideo({ label: 'Brouillon', preview: box, items, draft: true });
        showToast('Brouillon terminé : corrige le storyboard si besoin, puis valide', 'success', 5000);
    } catch (e) { if (e.message !== 'Arrêt demandé') showToast('Brouillon impossible : ' + e.message, 'error', 6000); }
    finally { assembling = false; state.stopRequested = false; setStatus(null); setProgress(0); document.getElementById('stop-btn')?.classList.remove('visible'); updateAssembleBtn(); }
}
// Voix silencieuse de la bonne durée (≈ 14 caractères par seconde) pour un brouillon muet
function silentVoiceFor(text) {
    const ctx = getAudioCtx(), dur = Math.max(1.8, String(text || '').length / 14 + 0.5);
    return ctx.createBuffer(1, Math.round(ctx.sampleRate * dur), ctx.sampleRate);
}

// ══════════════════════════════════════════════════════════════════
// RETOUCHES EN DISCUTANT : « plus court », « plus dynamique », « change la phrase 3 »…
// Claude décide scène par scène (garder, enlever, réécrire) + accroche, rythme, musique ; on ne refait que le nécessaire.
// ══════════════════════════════════════════════════════════════════
const RETOUCH_SCHEMA = {
    type: 'object',
    properties: {
        scenes: { type: 'array', items: { type: 'object', properties: { index: { type: 'integer' }, action: { type: 'string', enum: ['keep', 'remove', 'rewrite'] }, text: { type: 'string' } }, required: ['index', 'action', 'text'], additionalProperties: false } },
        hook: { type: 'string' },
        energy: { type: 'string', enum: ['same', 'calm', 'normal', 'punchy'] },
        music: { type: 'string', enum: ['same', 'louder', 'quieter', 'none'] },
        message: { type: 'string' }
    },
    required: ['scenes', 'hook', 'energy', 'music', 'message'], additionalProperties: false
};
async function applyRetouch() {
    const req = (document.getElementById('retouch-input')?.value || '').trim();
    if (req.length < 3) { showToast('Dis-moi ce que tu veux changer', 'warn'); return; }
    if (!getClaudeKey()) { showToast('Ajoute ta clé Claude', 'error'); return; }
    if (assembling || state.isRunning || state.regenerating) return;
    const items = state.queue.filter(q => q.status === 'done' && q.sceneIndex >= 0).sort((a, b) => a.sceneIndex - b.sceneIndex);
    if (!items.length) { showToast('Fabrique d\'abord la vidéo', 'warn'); return; }
    const lines = items.map(it => ({ i: it.sceneIndex, text: scenePlanFor(it.sceneIndex).spoken || it.sceneText, skip: !!it.edit?.skip }));
    setStatus('Claude prépare tes retouches…');
    let out;
    try {
        out = await callClaude({
            effort: 'medium', schema: RETOUCH_SCHEMA,
            prompt: claudeContext() + '\nVoici la vidéo actuelle, réplique par réplique (index : texte' + ', « (retirée) » si déjà enlevée) :\n' +
                lines.map(l => l.i + ' : ' + l.text + (l.skip ? ' (retirée)' : '')).join('\n') +
                '\nAccroche écrite au début : « ' + (scenePlanFor(0).hook || '') + ' ».\n\nDemande du créateur : « ' + req + ' »\n\n' +
                'Pour CHAQUE réplique, donne "action" : "keep" (inchangée, "text" = ""), "remove" (à enlever, "text" = "") ou "rewrite" ("text" = la nouvelle réplique, courte, facile à prononcer : ' + SPEECH_RULES + '). ' +
                'Ne change que ce que la demande implique ; garde toujours la première réplique. "hook" : la nouvelle accroche si elle doit changer, sinon "". "energy" : rythme des animations ("same" si inchangé). "music" : "same", "louder", "quieter" ou "none". ' +
                '"message" : une phrase en français, en tutoyant, qui résume ce que tu as changé.'
        });
    } catch (e) { setStatus(null); showToast('Retouche impossible : ' + e.message, 'error', 5000); return; }
    setStatus(null);
    const rewritten = [];
    (out.scenes || []).forEach(op => {
        const it = items.find(x => x.sceneIndex === op.index); if (!it) return;
        if (op.action === 'remove' && op.index > 0) it.edit = { ...(it.edit || {}), skip: true };
        else if (op.action === 'rewrite' && op.text.trim()) {
            const p = state.scenePlan?.scenes?.[op.index]; if (!p) return;
            p.spoken = op.text.trim(); it.sceneText = p.spoken;
            ['ttsBlob', 'ttsBuffer', 'ttsSpeech', 'fitBuffer', 'fitSpeech'].forEach(k => { it[k] = undefined; });
            if (it.edit?.skip) it.edit.skip = false;
            rewritten.push(it);
        }
    });
    if (out.hook && state.scenePlan?.scenes?.[0]) state.scenePlan.scenes[0].hook = out.hook.slice(0, 48);
    if (out.energy && out.energy !== 'same') { const c = getCharter(); c.energy = out.energy; saveCharter(c); loadCharterForm(); }
    if (out.music === 'none') state.musicSource = 'none';
    else if (out.music === 'louder') state.musicVolume = Math.min(0.8, (state.musicVolume || 0.35) * 1.5);
    else if (out.music === 'quieter') state.musicVolume = Math.max(0.08, (state.musicVolume || 0.35) * 0.6);
    if (typeof saveSettings === 'function') saveSettings();
    saveProject();
    showToast('✍️ ' + (out.message || 'Retouches appliquées'), 'success', 6000);
    // une réplique réécrite dite par la voix d'Agnes demande une nouvelle scène ; avec ElevenLabs ou le personnage stable, seule la voix change
    const needClip = rewritten.filter(it => !it.puppet && state.voiceSource === 'agnes');
    try {
        if (needClip.length) {
            if (!confirm(needClip.length + ' réplique(s) réécrite(s) sont dites par la voix d\'Agnes : il faut refaire ces scènes (1 à 2 min chacune). On y va ?')) return;
            state.regenerating = true; updateAssembleBtn();
            for (const it of needClip) { setStatus('Nouvelle prise de la scène ' + (it.sceneIndex + 1) + '…'); await regenerateScene(it); }
            state.regenerating = false;
        }
        await runAssembly();
    } catch (e) { showToast('Retouche : ' + e.message, 'error', 6000); }
    finally { state.regenerating = false; setStatus(null); updateAssembleBtn(); }
}

// ══════════════════════════════════════════════════════════════════
// UN SUJET → UNE SÉRIE DE SHORTS (3 à 5 épisodes qui se suivent)
// ══════════════════════════════════════════════════════════════════
async function seriesFromTopic() {
    const topic = (document.getElementById('series-topic')?.value || '').trim();
    const n = parseInt(document.getElementById('series-count')?.value || '4', 10);
    if (topic.length < 4) { showToast('Écris le sujet de la série', 'warn'); return; }
    if (!getClaudeKey()) { showToast('Ajoute ta clé Claude', 'error'); return; }
    setStatus('Claude découpe le sujet en ' + n + ' Shorts…');
    try {
        const out = await callClaude({
            effort: 'high',
            system: 'Tu écris des séries de Shorts pédagogiques animés. Chaque ligne est dite par un personnage cartoon face caméra et devient une scène. ' + SPEECH_RULES,
            prompt: (typeof scriptExtras === 'function' ? scriptExtras() : '') + claudeContext() + '\nDécoupe le sujet « ' + topic + ' » en une série de ' + n + ' Shorts qui se suivent (du plus simple au plus avancé), chacun compréhensible seul. ' +
                'Pour chaque épisode : "title" (court, accrocheur, moins de 50 caractères) et "lines" (8 à 9 lignes). Règles : ' + SHORT_RULES + '. La dernière ligne peut teaser l\'épisode suivant, sauf pour le dernier.',
            schema: { type: 'object', properties: { episodes: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, lines: { type: 'array', items: { type: 'string' } } }, required: ['title', 'lines'], additionalProperties: false } } }, required: ['episodes'], additionalProperties: false }
        });
        const eps = (out.episodes || []).filter(e => e.lines?.length).slice(0, 6);
        if (!eps.length) throw new Error('série vide');
        const el = document.getElementById('series-input');
        if (el) el.value = eps.map((e, i) => 'Épisode ' + (i + 1) + ' : ' + String(e.title).trim() + '\n' + e.lines.map(l => String(l).trim()).filter(Boolean).join('\n')).join('\n\n');
        updateSeriesStats();
        showToast(eps.length + ' Shorts écrits ✓ Relis-les puis lance la série', 'success', 5000);
    } catch (e) { showToast('Série impossible : ' + e.message, 'error', 5000); }
    finally { setStatus(null); }
}

// ══════════════════════════════════════════════════════════════════
// MINIATURES : 3 versions au choix, avec le personnage stable si les poses existent
// ══════════════════════════════════════════════════════════════════
async function thumbnailCharacter() {
    if (typeof castReady === 'function' && castReady()) {
        const sp = await loadPuppetSprites();
        const pick = ['surpris', 'rigole', 'salue', 'montre', 'main'].find(id => sp[id]);
        if (pick) return { canvas: sp[pick].closed, cut: true };
    }
    const d = await draftSprites().catch(() => null);
    return d ? { canvas: d.main.closed, cut: !!(state.reference?.green && referenceImage()) } : null;
}
async function renderThumbnailVariant(variant, portrait) {
    const W = portrait ? 1080 : 1280, H = portrait ? 1920 : 720;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), accent = accentColor();
    const text = (await thumbnailText()).toUpperCase();
    // fonds : 0 = couleur de la chaîne + rayons, 1 = sombre + halo, 2 = décor du style
    if (variant === 0) {
        const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, accent); gr.addColorStop(1, '#ff7a45'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
        g.save(); g.globalAlpha = 0.18; g.fillStyle = '#fff';
        const ox = portrait ? W * 0.5 : W * 0.75, oy = portrait ? H * 0.68 : H * 0.5;
        for (let i = 0; i < 12; i++) { const a1 = i * Math.PI / 6, a2 = a1 + Math.PI / 14; g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox + Math.cos(a1) * 2400, oy + Math.sin(a1) * 2400); g.lineTo(ox + Math.cos(a2) * 2400, oy + Math.sin(a2) * 2400); g.fill(); }
        g.restore();
    } else if (variant === 1) {
        g.fillStyle = '#14121f'; g.fillRect(0, 0, W, H);
        const halo = g.createRadialGradient(portrait ? W / 2 : W * 0.72, portrait ? H * 0.66 : H * 0.55, 0, portrait ? W / 2 : W * 0.72, portrait ? H * 0.66 : H * 0.55, Math.max(W, H) * 0.5);
        halo.addColorStop(0, accent); halo.addColorStop(1, 'rgba(20,18,31,0)'); g.fillStyle = halo; g.fillRect(0, 0, W, H);
    } else drawDecor(g, W, H);
    const ch = await thumbnailCharacter();
    if (ch && ch.canvas.width) {
        const im = ch.canvas, h = portrait ? H * 0.55 : H * 0.95, w = h * im.width / im.height;
        const x = portrait ? (W - w) / 2 : W - w - W * 0.03, y = H - h - (portrait ? H * 0.04 : 0);
        g.save(); g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 40; g.drawImage(im, x, y, w, h); g.restore();
    }
    // texte : gros, 2 à 3 lignes, dernière ligne en couleur
    const maxW = portrait ? W * 0.86 : W * 0.56;
    let fs = portrait ? 160 : 140;
    g.font = '900 ' + fs + 'px ' + captionFontFamily();
    let lines = wrapLines(g, text, maxW);
    while ((lines.length > 3 || lines.some(l => g.measureText(l).width > maxW)) && fs > 50) { fs -= 8; g.font = '900 ' + fs + 'px ' + captionFontFamily(); lines = wrapLines(g, text, maxW); }
    const lh = fs * 1.05, y0 = portrait ? H * 0.16 : H / 2 - (lines.length - 1) * lh / 2;
    g.textAlign = portrait ? 'center' : 'left'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    lines.forEach((l, i) => {
        const y = y0 + i * lh, x = portrait ? W / 2 : W * 0.05;
        g.lineWidth = fs * 0.2; g.strokeStyle = '#1b1530'; g.strokeText(l, x, y);
        g.fillStyle = i === lines.length - 1 ? (variant === 0 ? '#fff200' : accent) : '#fff'; g.fillText(l, x, y);
    });
    const logo = await loadLogoImage();
    if (logo) { const s = portrait ? 140 : 110, r = logo.width / logo.height; g.drawImage(logo, 30, H - 30 - s / Math.max(1, r), s * Math.min(1, r), s / Math.max(1, r)); }
    return c;
}
async function showThumbnailChoices() {
    const box = document.getElementById('thumb-choices'); if (!box) return;
    setStatus('Création de 3 miniatures…');
    try {
        const portrait = outputFormat() !== 'landscape';
        const canvases = [];
        for (let v = 0; v < 3; v++) canvases.push(await renderThumbnailVariant(v, portrait));
        state.thumbChoices = canvases;
        box.innerHTML = '<div class="hmuted">Touche une miniature pour l\'enregistrer' + (portrait ? ' (couverture TikTok / Shorts)' : '') + ' :</div><div class="thumb-grid">' +
            canvases.map((c, i) => '<img src="' + c.toDataURL('image/jpeg', 0.85) + '" data-thumb-save="' + i + '" alt="Miniature ' + (i + 1) + '">').join('') + '</div>';
        box.classList.remove('hidden');
    } catch (e) { showToast('Miniatures impossibles : ' + e.message, 'error', 5000); }
    finally { setStatus(null); }
}

document.addEventListener('click', e => {
    const t = e.target.closest ? e.target.closest('button, img[data-thumb-save]') : null; if (!t) return;
    if (t.id === 'sb-animatic' || t.id === 'animatic-btn') runAnimatic();
    else if (t.id === 'retouch-btn') applyRetouch();
    else if (t.id === 'series-topic-btn') seriesFromTopic();
    else if (t.id === 'thumb-choices-btn') showThumbnailChoices();
    else if (t.dataset.thumbSave && state.thumbChoices) state.thumbChoices[+t.dataset.thumbSave].toBlob(b => saveBlob(b, 'miniature-' + (+t.dataset.thumbSave + 1) + '.jpg'), 'image/jpeg', 0.92);
});
