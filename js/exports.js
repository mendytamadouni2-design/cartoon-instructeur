// Cartoon Instructeur · Exports, historique, séries, traduction, workflow principal
// (scripts classiques chargés dans l'ordre par index.html : ils partagent les mêmes variables globales)

// ══════════════════════════════════════════════════════════════════
// EXPORTS SUPPLÉMENTAIRES
// ══════════════════════════════════════════════════════════════════
async function generateShortsVersion() {
    const r = await assembleVideo({ maxDuration: 30, label: 'Shorts', format: 'portrait' });
    return r;
}
// Miniature YouTube 1280×720 : ton personnage (pose expressive), un titre court et percutant, la couleur de ta chaîne.
async function thumbnailText() {
    if (state.seo?.thumbnail) return state.seo.thumbnail;
    if (getClaudeKey()) {
        try {
            const out = await callClaude({
                system: 'Tu écris les textes de miniatures YouTube pour des vidéos pédagogiques : très courts, intrigants, lisibles en un coup d\'œil.',
                prompt: claudeContext() + '\nThème : ' + (state.theme || '') + '\nScript :\n' + state.script + '\n\nDonne le texte de la miniature : 2 à 4 mots maximum, percutants (question, chiffre ou promesse).',
                schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false },
                maxTokens: 2000
            });
            if (out.text) { state.seo = { ...(state.seo || {}), thumbnail: out.text }; return out.text; }
        } catch (e) { log('Texte de miniature : ' + e.message); }
    }
    return state.theme || 'Vidéo pédagogique';
}
async function generateThumbnailImage() {
    const W = 1280, H = 720;
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const accent = accentColor();
    // fond : couleur de la chaîne, dégradé et rayons
    const gr = ctx.createLinearGradient(0, 0, W, H); gr.addColorStop(0, accent); gr.addColorStop(1, '#ff7a45');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.globalAlpha = 0.18; ctx.fillStyle = '#fff';
    for (let i = 0; i < 12; i++) { ctx.beginPath(); ctx.moveTo(W * 0.78, H * 0.5); const a1 = i * Math.PI / 6, a2 = a1 + Math.PI / 14; ctx.lineTo(W * 0.78 + Math.cos(a1) * 1600, H * 0.5 + Math.sin(a1) * 1600); ctx.lineTo(W * 0.78 + Math.cos(a2) * 1600, H * 0.5 + Math.sin(a2) * 1600); ctx.fill(); }
    ctx.restore();
    // personnage : pose expressive si disponible (le fond blanc disparaît grâce au mode « multiplier »)
    const src = (state.poses.find(p => p.id === 'surpris') || state.poses.find(p => p.id === 'rigole') || state.poses.find(p => p.id === 'salue') || {}).image || state.images[0]?.dataUri || state.photoSmall;
    if (src) {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.onerror = r; img.src = src; });
        if (img.width) {
            const h = H * 1.02, w = h * img.width / img.height;
            ctx.save(); ctx.globalCompositeOperation = 'multiply';
            ctx.drawImage(img, W - w * 0.92, H - h + 10, w, h);
            ctx.restore();
        }
    }
    // texte
    const text = (await thumbnailText()).toUpperCase();
    let fs = 150;
    ctx.font = '900 ' + fs + 'px ' + captionFontFamily();
    let lines = wrapLines(ctx, text, W * 0.56);
    while ((lines.length > 3 || lines.some(l => ctx.measureText(l).width > W * 0.58)) && fs > 50) { fs -= 8; ctx.font = '900 ' + fs + 'px ' + captionFontFamily(); lines = wrapLines(ctx, text, W * 0.56); }
    const lh = fs * 1.05, y0 = H / 2 - (lines.length - 1) * lh / 2;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    lines.forEach((l, i) => {
        const y = y0 + i * lh, x = W * 0.05;
        ctx.lineWidth = fs * 0.2; ctx.strokeStyle = '#1b1530'; ctx.strokeText(l, x, y);
        ctx.fillStyle = i === lines.length - 1 ? '#fff200' : '#fff'; ctx.fillText(l, x, y);
    });
    const logo = await loadLogoImage();
    if (logo) { ctx.save(); ctx.globalAlpha = 1; const s = 110, r = logo.width / logo.height; ctx.drawImage(logo, 30, H - 30 - s / Math.max(1, r), s * Math.min(1, r), s / Math.max(1, r)); ctx.restore(); }
    return await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.92));
}
function formatChapterTime(sec) { const m = Math.floor(sec / 60), s = Math.floor(sec % 60); return m + ':' + String(s).padStart(2, '0'); }
function generateChapters() {
    const tl = state.timeline && state.timeline.length ? state.timeline : state.queue.filter(q => q.status === 'done').map((q, i) => ({ sceneIndex: q.sceneIndex, start: i * TARGET_SCENE_DURATION }));
    return tl.map((t, i) => {
        const text = (state.scenes[t.sceneIndex] || ('Scène ' + (t.sceneIndex + 1))).split(/\s+/).slice(0, 8).join(' ');
        return formatChapterTime(i === 0 ? 0 : t.start) + ' ' + text;
    }).join('\n') + '\n';
}
async function generateQuiz() {
    if (!state.quizCount) return null;
    if (!getClaudeKey()) { showToast('Le quiz utilise la clé Claude', 'error'); return null; }
    setStatus('Claude prépare le quiz…');
    try {
        return await callClaude({
            system: 'Tu crées des quiz pédagogiques clairs, adaptés au public visé.',
            prompt: claudeContext() + '\nCrée ' + state.quizCount + ' questions à choix multiples sur la vidéo « ' + (state.theme || 'sans titre') + ' », uniquement à partir de ce script :\n\n' + state.script + '\n\nFormat texte simple :\nQ1 : question ?\nA) ...\nB) ...\nC) ...\nRéponse : X'
        });
    } catch (e) { showToast('Quiz impossible : ' + e.message, 'error', 5000); return null; }
    finally { setStatus(null); }
}
async function generateSEO() {
    if (!getClaudeKey()) { showToast('Le SEO utilise la clé Claude', 'error'); return null; }
    setStatus('Claude prépare le SEO…');
    try {
        const out = await callClaude({
            system: 'Tu es expert en référencement YouTube pour des vidéos pédagogiques.',
            prompt: claudeContext() + '\nThème : ' + (state.theme || 'non précisé') + '\nScript :\n' + state.script + '\n\nPropose un titre accrocheur (moins de 70 caractères), une description (3 à 5 phrases, avec un appel à s\'abonner), 10 à 15 tags, et le texte de la miniature (2 à 4 mots percutants).',
            schema: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } }, thumbnail: { type: 'string' } }, required: ['title', 'description', 'tags', 'thumbnail'], additionalProperties: false }
        });
        state.seo = out;
        return 'TITRE\n' + out.title + '\n\nDESCRIPTION\n' + out.description + '\n\nCHAPITRES\n' + generateChapters() + '\nTAGS\n' + (out.tags || []).join(', ') + '\n';
    } catch (e) { showToast('SEO impossible : ' + e.message, 'error', 5000); return null; }
    finally { setStatus(null); }
}

// Enregistre un fichier : feuille de partage sur iPhone (« Enregistrer la vidéo »), téléchargement ailleurs.
async function saveBlob(blob, filename) {
    try {
        const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: filename });
            return true;
        }
    } catch (e) {
        if (e.name === 'AbortError') return false;
        log('Partage impossible : ' + e.message);
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return true;
}
// Les exports longs à préparer se font en 2 appuis : iOS n'autorise l'enregistrement que juste après un appui.
async function prepareThenSave(btnId, key, builder) {
    const btn = document.getElementById(btnId);
    const cached = state.exportCache[key];
    if (cached) { await saveBlob(cached.blob, cached.name); return; }
    if (btn?.dataset.busy) return;
    if (btn) { btn.dataset.busy = '1'; btn.textContent = '⏳ Préparation…'; }
    try {
        const out = await builder();
        if (!out) { if (btn) btn.textContent = '⬇️ Réessayer'; return; }
        state.exportCache[key] = out;
        if (btn) btn.textContent = '✅ Prêt : appuie pour enregistrer';
        showToast('Prêt ! Appuie à nouveau sur le bouton pour enregistrer', 'success', 4000);
    } catch (e) {
        if (btn) btn.textContent = '⬇️ Réessayer';
        showToast(e.message === 'Arrêt demandé' ? 'Arrêté' : 'Impossible : ' + e.message, 'error', 6000);
    } finally { if (btn) delete btn.dataset.busy; }
}

// ══════════════════════════════════════════════════════════════════
// EXPORT ZIP
// ══════════════════════════════════════════════════════════════════
async function buildZip() {
    if (typeof JSZip === 'undefined') await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
    const zip = new JSZip();
    if (state.finalBlob) zip.file('video.' + state.finalExt, state.finalBlob);
    if (state.finalAudioBlob) zip.file('voix-premium.mp3', state.finalAudioBlob);
    zip.file('sous-titres.srt', generateSRT());
    zip.file('chapitres.txt', generateChapters());
    zip.file('script.txt', state.script);
    zip.file('metadonnees.json', JSON.stringify({ theme: state.theme, scenes: state.scenes.length, style: state.selectedStyle, language: state.language, mise_en_scene: state.scenePlan }, null, 2));
    const blob = await zip.generateAsync({ type: 'blob' });
    return { blob, name: 'cartoon-instructeur-' + Date.now() + '.zip' };
}
function loadScript(src) {
    return new Promise((res, rej) => {
        if (document.querySelector('script[src="' + src + '"]')) { res(); return; }
        const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('chargement ' + src)); document.head.appendChild(s);
    });
}

// ══════════════════════════════════════════════════════════════════
// HISTORIQUE
// ══════════════════════════════════════════════════════════════════
function loadHistory() { return getJSON(STORAGE.HISTORY, []); }
function saveHistory(h) { setJSON(STORAGE.HISTORY, h.slice(0, 30)); }
function addToHistory(entry) { const h = loadHistory(); h.unshift(entry); saveHistory(h); renderHistory(); }
function renderHistory() {
    const list = document.getElementById('history-list'); if (!list) return;
    const h = loadHistory();
    if (!h.length) { list.innerHTML = '<div style="font-size:0.78rem;color:var(--ink-dim);padding:0.5rem;">Aucun projet.</div>'; return; }
    list.innerHTML = h.map((x, i) => '<div class="history-item"><div class="h-info"><div class="h-title">' + esc(x.theme || 'Sans titre') + '</div><div class="h-date">' + new Date(x.date).toLocaleString('fr-FR') + '</div></div><button data-load="' + i + '">Charger</button><button data-del="' + i + '">✕</button></div>').join('');
    list.querySelectorAll('[data-load]').forEach(b => b.addEventListener('click', () => {
        const e = loadHistory()[parseInt(b.dataset.load, 10)];
        if (!e) return;
        document.getElementById('theme-input').value = e.theme || '';
        state.theme = e.theme || '';
        document.getElementById('script-input').value = e.script || '';
        updateScriptStats(); renderScenesEditor(); showToast('Projet rechargé', 'success');
    }));
    list.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => { const h = loadHistory(); h.splice(parseInt(b.dataset.del, 10), 1); saveHistory(h); renderHistory(); }));
}

// ══════════════════════════════════════════════════════════════════
// MODE SÉRIE
// ══════════════════════════════════════════════════════════════════
function parseSeriesInput() {
    const text = document.getElementById('series-input').value.trim();
    if (!text) return [];
    return text.split(/\n\s*\n/).map((block, i) => {
        const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
        const title = (lines[0] || 'Épisode ' + (i + 1)).replace(/^épisode\s*\d+\s*[:\-–]\s*/i, '') || 'Épisode ' + (i + 1);
        const script = lines.slice(1).join('\n');
        return { title, script };
    }).filter(ep => ep.script);
}
function updateSeriesStats() {
    const ep = parseSeriesInput();
    const el = document.getElementById('series-stats');
    if (el) el.textContent = ep.length + ' épisode' + (ep.length > 1 ? 's' : '');
    state.seriesEpisodes = ep;
}
function addSeriesResult(title, blob, ext) {
    state.seriesResults.push({ title, blob, ext });
    const box = document.getElementById('series-results'); if (!box) return;
    box.classList.remove('hidden');
    box.innerHTML = '<div class="section-title" style="margin-bottom:0.5rem;">📺 Épisodes terminés</div>' + state.seriesResults.map((r, i) =>
        '<div class="series-item"><span>' + esc(r.title) + '</span><button type="button" data-series-save="' + i + '">⬇️ Enregistrer</button></div>').join('');
    box.querySelectorAll('[data-series-save]').forEach(b => b.addEventListener('click', () => {
        const r = state.seriesResults[parseInt(b.dataset.seriesSave, 10)];
        if (r) saveBlob(r.blob, (r.title || 'episode').replace(/[^\w\-]+/g, '_').slice(0, 40) + '.' + r.ext);
    }));
}
async function launchSeries() {
    updateSeriesStats();
    if (!state.seriesEpisodes.length) { showToast('Ajoute des épisodes (titre puis phrases, séparés par une ligne vide)', 'warn', 4000); return; }
    if (state.isRunning) return;
    unlockAudio();
    if (state.genMode === 'background' && state.proxyJobs && getProxyUrl()) return launchSeriesBackground();
    state.isSeriesMode = true; state.seriesAbort = false;
    try {
        for (let i = 0; i < state.seriesEpisodes.length; i++) {
            if (state.seriesAbort) break;
            const ep = state.seriesEpisodes[i];
            showToast('Épisode ' + (i + 1) + '/' + state.seriesEpisodes.length + ' : ' + ep.title, 'success', 3000);
            document.getElementById('theme-input').value = ep.title;
            document.getElementById('script-input').value = ep.script;
            state.theme = ep.title;
            updateScriptStats();
            await startGeneration();
            if (state.seriesAbort) break;
            await sleep(2000);
        }
    } finally { state.isSeriesMode = false; state.seriesAbort = false; }
}

// ══════════════════════════════════════════════════════════════════
// TRADUCTION
// ══════════════════════════════════════════════════════════════════
async function translateScript() {
    const target = document.getElementById('language-select').value;
    if (!state.scenes.length) { showToast('Aucun script à traduire', 'warn'); return; }
    const engine = document.getElementById('translate-engine-select').value;
    setStatus('Traduction…');
    try {
        let lines = [];
        if (engine === 'claude') {
            if (!getClaudeKey()) { showToast('Ajoute ta clé Claude en haut de la page', 'error'); return; }
            const out = await callClaude({
                system: 'Tu traduis des scripts de vidéos pédagogiques en gardant le ton, le niveau et une ligne par phrase. ' + SPEECH_RULES,
                prompt: 'Traduis en ' + (LANG_NAMES_FR[target] || target) + ' ces ' + state.scenes.length + ' lignes. Renvoie exactement ' + state.scenes.length + ' lignes, dans le même ordre :\n\n' + state.scenes.join('\n'),
                schema: LINES_SCHEMA
            });
            lines = (out.lines || []).map(l => String(l).trim()).filter(Boolean);
        } else if (engine === 'deepl') {
            const key = document.getElementById('translate-key-input').value.trim() || getDeepLKey();
            if (!key) { showToast('Clé DeepL requise', 'error'); return; }
            setLS(STORAGE.DEEPL_KEY, key);
            const res = await fetch('https://api-free.deepl.com/v2/translate', {
                method: 'POST', headers: { 'Authorization': 'DeepL-Auth-Key ' + key, 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'text=' + encodeURIComponent(state.scenes.join('\n')) + '&target_lang=' + target.split('-')[0].toUpperCase()
            });
            if (!res.ok) throw new Error('DeepL ' + res.status);
            const data = await res.json();
            lines = (data.translations?.[0]?.text || '').split('\n');
        } else {
            const key = document.getElementById('translate-key-input').value.trim() || getGTranslateKey();
            if (!key) { showToast('Clé Google Translate requise', 'error'); return; }
            setLS(STORAGE.GTRANSLATE_KEY, key);
            const res = await fetch('https://translation.googleapis.com/language/translate/v2?key=' + encodeURIComponent(key), {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ q: state.scenes, target: target.split('-')[0], format: 'text' })
            });
            if (!res.ok) throw new Error('Google ' + res.status);
            const data = await res.json();
            lines = (data.data?.translations || []).map(t => t.translatedText);
        }
        lines = lines.map(l => l.trim()).filter(Boolean);
        if (!lines.length) throw new Error('traduction vide');
        writeSceneLines(lines);
        state.language = target;
        updateScriptStats(); renderScenesEditor();
        showToast('Script traduit ✓', 'success');
    } catch (e) { showToast('Traduction impossible : ' + e.message, 'error', 5000); }
    finally { setStatus(null); }
}

// ══════════════════════════════════════════════════════════════════
// WORKFLOW PRINCIPAL
// ══════════════════════════════════════════════════════════════════
async function startGeneration() {
    if (state.isRunning || assembling) return;
    if (!state.images.length) { showToast('Ajoute une photo du personnage', 'error'); return; }
    if (!getAgnesKey()) { showToast('Ajoute la clé Agnes', 'error'); return; }
    if (!state.scenes.length) { showToast('Écris un script', 'error'); return; }
    unlockAudio();
    downscaleImage(state.images[0].dataUri, 1024, 0.85).then(d => { state.photoSmall = d; });
    if (state.storyboardOn && getClaudeKey() && !state.isSeriesMode && !storyboardValid()) { await prepareStoryboardFlow(); return; }
    if (state.genMode === 'background' && !state.isSeriesMode) {
        if (getProxyUrl() && state.proxyJobs) { await startBackgroundGeneration(); return; }
        showToast('Arrière-plan indisponible (serveur Cloudflare pas à jour) : génération sur le téléphone', 'warn', 6000);
    }
    if (!getProxyUrl()) showToast('Pas de relais Cloudflare : les scènes seront générées, mais le montage final échouera', 'warn', 6000);

    state.isRunning = true; state.stopRequested = false;
    state.completed = 0; state.failed = 0;
    state.creationAttemptsSinceLastError = 0;
    if (state.finalVideoUrl) URL.revokeObjectURL(state.finalVideoUrl);
    state.finalVideoUrl = null; state.finalBlob = null; state.finalAudioBlob = null; state.timeline = null; state.exportCache = {};
    createIntervalMs = CREATE_INTERVAL_MIN;
    if (subtitleScriptSignature !== currentScriptSignature()) initSubtitleSegmentsFromScript();
    const photo = state.images[0].dataUri;
    ensureProject({ status: 'generating', jobId: null });
    state.queue = state.scenes.map((sceneText, i) => ({ sceneIndex: i, sceneText, image: photo, status: 'pending', progress: null, videoId: null, videoUrl: null, prompt: null, startTime: null }));

    document.getElementById('gallery-grid').innerHTML = '';
    document.getElementById('gallery').style.display = 'none';
    document.getElementById('video-preview').classList.remove('visible');
    hideResultButtons(); updateAssembleBtn();
    document.getElementById('stop-btn').classList.add('visible');
    document.getElementById('generate-btn').disabled = true;

    await ensureWakeLockActive();
    renderQueue(); updateGenerateBtn(); renderQuota();
    const startTime = Date.now();
    let assembled = false;

    try {
        if (storyboardValid()) state.drawingsPromise = null;   // mise en scène et dessins déjà validés
        else {
            await prepareScenePlan();
            state.drawingsPromise = prepareDrawings().catch(e => log('Dessins : ' + e.message));
        }
        if (!state.stopRequested) {
            if (state.chainScenes) await runChained(); else await runParallel();
        }
        if (!state.stopRequested && state.queue.some(q => q.status === 'done')) {
            if (state.drawingsPromise) { setStatus('Finalisation des dessins…'); await state.drawingsPromise; }
            state.isRunning = false;   // le montage gère lui-même l'arrêt et l'affichage
            updateGenerateBtn();
            assembled = await runAssembly();
        }
    } catch (e) { log('Erreur globale : ' + e.message); showToast('Erreur : ' + e.message, 'error', 6000); }

    const elapsed = (Date.now() - startTime) / 1000;
    const stopped = state.stopRequested;
    if (stopped && state.isSeriesMode) state.seriesAbort = true;
    state.isRunning = false; state.stopRequested = false;
    setStatus(null); setProgress(0);
    document.getElementById('stop-btn').classList.remove('visible');
    updateGenerateBtn(); updateAssembleBtn(); renderQuota(); renderQueue();
    if (stopped) showToast('Génération arrêtée. Les scènes terminées peuvent être assemblées.', 'warn', 5000);
    else if (!assembled) showToast(state.completed + '/' + state.queue.length + ' scènes générées en ' + formatEta(elapsed), state.completed ? 'warn' : 'error', 5000);
}
function stopGeneration() {
    if (!state.isRunning && !assembling) return;
    state.stopRequested = true;
    if (state.isSeriesMode) state.seriesAbort = true;
    stopSpeech(); setStatus('Arrêt…');
}

// ══════════════════════════════════════════════════════════════════
// TÉLÉCHARGEMENTS
// ══════════════════════════════════════════════════════════════════
function downloadFinal() {
    if (!state.finalBlob) return;
    saveBlob(state.finalBlob, 'video-' + Date.now() + '.' + state.finalExt);
}
function downloadSRT() { saveBlob(new Blob([generateSRT()], { type: 'text/plain' }), 'sous-titres-' + Date.now() + '.srt'); }
function downloadAudio() { if (state.finalAudioBlob) saveBlob(state.finalAudioBlob, 'voix-' + Date.now() + '.mp3'); }
function downloadChapters() { saveBlob(new Blob([generateChapters()], { type: 'text/plain' }), 'chapitres-' + Date.now() + '.txt'); }
function downloadScenes() {
    return prepareThenSave('download-scenes-btn', 'scenes', async () => {
        const items = state.queue.filter(q => q.status === 'done');
        for (const it of items) await fetchClipBlob(it);
        const files = items.map(it => new File([it.blob], 'scene-' + String(it.sceneIndex + 1).padStart(2, '0') + '.mp4', { type: it.blob.type || 'video/mp4' }));
        if (typeof JSZip === 'undefined') await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
        const zip = new JSZip();
        files.forEach(f => zip.file(f.name, f));
        return { blob: await zip.generateAsync({ type: 'blob' }), name: 'scenes-' + Date.now() + '.zip' };
    });
}
function downloadAsZip() { return prepareThenSave('download-zip-btn', 'zip', buildZip); }
// Autre format à partir des mêmes scènes (aucune nouvelle génération)
function downloadVariant(btnId, key, opts, prefix) {
    return prepareThenSave(btnId, key, async () => {
        if (assembling || state.isRunning) throw new Error('attends la fin du montage en cours');
        unlockAudio();
        assembling = true; state.stopRequested = false;
        document.getElementById('stop-btn').classList.add('visible');
        await ensureWakeLockActive();
        try { const r = await assembleVideo(opts); return { blob: r.blob, name: prefix + '-' + Date.now() + '.' + r.ext }; }
        finally { assembling = false; state.stopRequested = false; setStatus(null); setProgress(0); document.getElementById('stop-btn').classList.remove('visible'); }
    });
}
function downloadShorts() {
    return prepareThenSave('download-shorts-btn', 'shorts', async () => {
        if (assembling || state.isRunning) throw new Error('attends la fin du montage en cours');
        assembling = true; state.stopRequested = false;
        document.getElementById('stop-btn').classList.add('visible');
        await ensureWakeLockActive();
        try { const r = await generateShortsVersion(); return { blob: r.blob, name: 'shorts-' + Date.now() + '.' + r.ext }; }
        finally { assembling = false; state.stopRequested = false; setStatus(null); setProgress(0); document.getElementById('stop-btn').classList.remove('visible'); }
    });
}
function downloadThumbnail() {
    return prepareThenSave('download-thumbnail-btn', 'thumbnail', async () => {
        const blob = await generateThumbnailImage();
        return blob ? { blob, name: 'miniature-' + Date.now() + '.jpg' } : null;
    });
}
function downloadSEO() {
    return prepareThenSave('download-seo-btn', 'seo', async () => {
        const seo = await generateSEO();
        return seo ? { blob: new Blob([seo], { type: 'text/plain' }), name: 'seo-' + Date.now() + '.txt' } : null;
    });
}
function downloadQuiz() {
    return prepareThenSave('download-quiz-btn', 'quiz', async () => {
        const quiz = await generateQuiz();
        return quiz ? { blob: new Blob([quiz], { type: 'text/plain' }), name: 'quiz-' + Date.now() + '.txt' } : null;
    });
}
