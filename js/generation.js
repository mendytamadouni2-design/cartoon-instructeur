// Cartoon Instructeur · Sauvegarde, génération en arrière-plan, génération sur le téléphone
// (scripts classiques chargés dans l'ordre par index.html : ils partagent les mêmes variables globales)

// ══════════════════════════════════════════════════════════════════
// SAUVEGARDE DU DERNIER PROJET (iOS peut fermer l'appli en arrière-plan)
// ══════════════════════════════════════════════════════════════════
function saveProject() {
    if (!state.queue.length) return;
    const snap = {
        date: Date.now(), theme: state.theme, script: state.script, style: state.selectedStyle,
        scenePlan: state.scenePlan, photo: state.photoSmall, projectId: state.projectId,
        drawings: state.scenes.map((_, i) => state.drawings[i]?.raw || null),
        queue: state.queue.map(q => ({ sceneIndex: q.sceneIndex, sceneText: q.sceneText, status: q.status === 'done' ? 'done' : 'failed', videoUrl: q.status === 'done' ? q.videoUrl : null, edit: q.edit || undefined, mediaKey: q.mediaKey || undefined }))
    };
    setJSON(STORAGE.LAST_PROJECT, snap);
    if (typeof saveProjectSnapshot === 'function') saveProjectSnapshot(snap);
}
function restoreProject() {
    const p = getJSON(STORAGE.LAST_PROJECT);
    if (!p || !Array.isArray(p.queue) || !p.queue.some(q => q.status === 'done' && q.videoUrl)) return;
    if (Date.now() - (p.date || 0) > 3 * 24 * 3600 * 1000) return;
    document.getElementById('theme-input').value = p.theme || '';
    document.getElementById('script-input').value = p.script || '';
    state.theme = p.theme || '';
    if (p.style && CARTOON_STYLES.some(st => st.id === p.style)) { state.selectedStyle = p.style; renderStyles(); }
    updateScriptStats();
    state.scenePlan = p.scenePlan || null;
    state.photoSmall = p.photo || null;
    state.projectId = p.projectId || null;
    state.drawings = (p.drawings || []).map(raw => { if (!raw) return null; const c = compileDrawing(raw); if (c) c.raw = raw; return c; });
    state.queue = p.queue.map(q => ({ ...q, image: null, progress: q.status === 'done' ? 'Terminé' : 'Échec', videoId: null, prompt: null, startTime: null }));
    state.completed = state.queue.filter(q => q.status === 'done').length;
    state.failed = state.queue.length - state.completed;
    initSubtitleSegmentsFromScript();
    renderQueue(); setProgress(0);
    state.queue.filter(q => q.status === 'done').forEach(q => addToGallery(q.videoUrl, 'Scène ' + (q.sceneIndex + 1)));
    updateAssembleBtn();
    renderMontageEditor();
    showToast('Dernier projet restauré (' + state.completed + ' scènes) : appuie sur « Assembler la vidéo finale »', 'success', 6000);
}

// ══════════════════════════════════════════════════════════════════
// GÉNÉRATION EN ARRIÈRE-PLAN (serveur Cloudflare)
// ══════════════════════════════════════════════════════════════════
let bgPollTimer = null, bgPolling = false;
function downscaleImage(dataUri, max = 1280, quality = 0.88) {
    return new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
            const s = Math.min(1, max / Math.max(img.width, img.height));
            const c = document.createElement('canvas');
            c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
            const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
            g.drawImage(img, 0, 0, c.width, c.height);
            resolve(c.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => resolve(dataUri);
        img.src = dataUri;
    });
}
function bgUI({ title, text, pct, ready, error, running }) {
    const panel = document.getElementById('bg-panel'); if (!panel) return;
    panel.classList.remove('hidden');
    panel.classList.toggle('ready', !!ready); panel.classList.toggle('error', !!error);
    if (title !== undefined) document.getElementById('bg-title').textContent = title;
    if (text !== undefined) document.getElementById('bg-text').textContent = text;
    if (pct !== undefined) document.getElementById('bg-progress').style.width = Math.max(3, Math.min(100, pct)) + '%';
    document.getElementById('bg-finish-btn').classList.toggle('hidden', !ready);
    document.getElementById('bg-cancel-btn').classList.toggle('hidden', !running);
    document.getElementById('bg-dismiss-btn').classList.toggle('hidden', running || ready);
}
function hideBgPanel() { document.getElementById('bg-panel')?.classList.add('hidden'); }

// Envoie un projet au serveur ; renvoie l'identifiant du travail.
async function sendBackgroundJob(scenes, theme, script, useStoryboard) {
    const n = scenes.length, withClaude = !!getClaudeKey();
    const sb = useStoryboard && storyboardValid();
    const savedTheme = state.theme;
    state.theme = theme || state.theme;
    try {
        const templates = scenes.map((t, i) => buildScenePrompt({ sceneIndex: i, sceneText: t }, {
            total: n, setting: '{{SETTING}}',
            plan: { spoken: '{{SPOKEN}}', action: '{{ACTION}}', camera: '{{CAMERA}}' }
        }));
        const payload = {
            agnesKey: getAgnesKey(), claudeKey: getClaudeKey(), claudeModel: getClaudeModel(),
            image: await downscaleImage(state.images[0].dataUri),
            frames: state.durationFrames, frameRate: FRAME_RATE,
            templates, fallbackPlan: fallbackScenePlan(scenes),
            planRequest: withClaude && !sb ? planRequestFor(scenes) : null,
            plan: sb ? state.scenePlan : undefined,
            drawings: sb ? scenes.map((_, i) => state.drawings[i]?.raw || null) : undefined,
            drawingRequests: withClaude && isWhiteboard() ? scenes.map((t, i) => ({ ...drawingRequestFor('{{SPOKEN}}', i, n), fallbackText: t })) : [],
            poses: await Promise.all(state.poses.map(async p => ({ id: p.id, image: await downscaleImage(p.image, 1024, 0.85) }))),
            push: getJSON(STORAGE.PUSH_SUB) || null,
            backup: state.backupOn
        };
        const res = await withTimeout(fetch(getProxyUrl() + '/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }), 60000, 'le serveur ne répond pas');
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.jobId) throw new Error(data.error || ('HTTP ' + res.status));
        return data.jobId;
    } finally { state.theme = savedTheme; }
}
async function startBackgroundGeneration() {
    const scenes = state.scenes.slice(), n = scenes.length;
    bgUI({ title: '☁️ Envoi du projet…', text: 'Préparation de la photo et des scènes.', pct: 2, running: false });
    try {
        const jobId = await sendBackgroundJob(scenes, state.theme, state.script, true);
        state.photoSmall = await downscaleImage(state.images[0].dataUri, 1024, 0.85);
        const projectId = ensureProject({ status: 'generating', jobId });
        setJSON(STORAGE.BG_JOB, { id: jobId, projectId, date: Date.now(), theme: state.theme, script: state.script, style: state.selectedStyle, n, photo: state.photoSmall });
        state.queue = []; renderQueue(); renderMontageEditor();
        document.getElementById('gallery-grid').innerHTML = ''; document.getElementById('gallery').style.display = 'none';
        document.getElementById('video-preview').classList.remove('visible'); hideResultButtons(); updateAssembleBtn();
        bgUI({ title: '☁️ Génération en arrière-plan', text: 'C\'est parti ! Tu peux fermer l\'appli et éteindre ton téléphone. Reviens dans ' + Math.max(10, Math.round(n * 1.5)) + ' minutes environ.', pct: 4, running: true });
        showToast('Projet envoyé ✓ Tu peux éteindre ton téléphone', 'success', 5000);
        scheduleBgPoll(4000);
    } catch (e) {
        bgUI({ title: '❌ Envoi impossible', text: e.message + '. Tu peux réessayer, ou choisir « Sur le téléphone ».', pct: 0, error: true, running: false });
        showToast('Envoi impossible : ' + e.message, 'error', 6000);
    }
}
function scheduleBgPoll(ms) { clearTimeout(bgPollTimer); bgPollTimer = setTimeout(pollBackgroundJob, ms); }
async function pollBackgroundJob() {
    const saved = getJSON(STORAGE.BG_JOB);
    if (!saved || saved.finished || !getProxyUrl() || bgPolling) return;
    if (document.hidden) return;   // reprise au retour dans l'appli
    bgPolling = true;
    try {
        const res = await withTimeout(fetch(getProxyUrl() + '/jobs/' + saved.id), 20000, 'pas de réponse');
        const job = await res.json().catch(() => ({}));
        if (res.status === 404) { setJSON(STORAGE.BG_JOB, { ...saved, finished: true }); bgUI({ title: 'Projet introuvable', text: 'Ce projet a expiré sur le serveur (plus de 3 jours).', pct: 0, error: true, running: false }); return; }
        if (!res.ok) throw new Error(job.error || ('HTTP ' + res.status));
        const n = job.scenes.length;
        const done = job.scenes.filter(sc => sc.status === 'done').length;
        const failed = job.scenes.filter(sc => sc.status === 'failed').length;
        if (job.status === 'done') {
            loadBackgroundResults(saved, job);
            bgUI({ title: '✅ Tes scènes sont prêtes !', text: done + '/' + n + ' scènes générées' + (failed ? ' (' + failed + ' en échec)' : '') + '. Appuie sur le bouton et garde l\'appli ouverte 1 à 2 minutes pour le montage.', pct: 100, ready: true, running: false });
            return;
        }
        if (job.status === 'failed' || job.status === 'cancelled') {
            setJSON(STORAGE.BG_JOB, { ...saved, finished: true });
            if (done) loadBackgroundResults(saved, job);
            bgUI({ title: job.status === 'cancelled' ? '⏹ Génération arrêtée' : '❌ Génération échouée', text: (job.message || '') + (done ? ' · Les ' + done + ' scènes terminées peuvent être assemblées.' : ''), pct: n ? done / n * 100 : 0, error: job.status === 'failed', running: false });
            if (done) { document.getElementById('bg-finish-btn').classList.remove('hidden'); }
            return;
        }
        const planning = job.status === 'planning';
        bgUI({ title: '☁️ Génération en arrière-plan', text: (planning ? 'Claude prépare la mise en scène…' : job.message) + ' · Tu peux éteindre ton téléphone.', pct: planning ? 4 : 5 + (done + failed) / n * 95, running: true });
        scheduleBgPoll(15000);
    } catch (e) {
        bgUI({ text: 'Connexion au serveur impossible pour l\'instant (' + e.message + '). Nouvel essai dans 30 s. La génération continue de son côté.' });
        scheduleBgPoll(30000);
    } finally { bgPolling = false; }
}
function loadBackgroundResults(saved, job) {
    const lines = splitScriptIntoScenes(saved.script || '');
    document.getElementById('theme-input').value = saved.theme || '';
    document.getElementById('script-input').value = saved.script || '';
    state.theme = saved.theme || '';
    if (saved.style && CARTOON_STYLES.some(st => st.id === saved.style)) { state.selectedStyle = saved.style; renderStyles(); }
    updateScriptStats();
    state.scenePlan = job.plan || fallbackScenePlan(lines);
    if (saved.photo) state.photoSmall = saved.photo;
    state.drawings = (job.drawings || []).map(raw => { if (!raw) return null; const c = compileDrawing(raw); if (c) c.raw = raw; return c; });
    state.queue = job.scenes.map(sc => ({ sceneIndex: sc.index, sceneText: lines[sc.index] || '', image: null, status: sc.status === 'done' ? 'done' : 'failed', progress: sc.status === 'done' ? 'Terminé' : 'Échec', error: sc.error, videoUrl: sc.videoUrl, mediaKey: sc.mediaKey || undefined, videoId: null, prompt: null, startTime: null }));
    state.completed = state.queue.filter(q => q.status === 'done').length;
    state.failed = state.queue.length - state.completed;
    initSubtitleSegmentsFromScript();
    renderQueue(); setProgress(0);
    document.getElementById('gallery-grid').innerHTML = '';
    state.queue.filter(q => q.status === 'done').forEach(q => addToGallery(q.videoUrl, 'Scène ' + (q.sceneIndex + 1)));
    state.exportCache = {};
    state.projectId = saved.projectId || getProjects().find(p => p.jobId && p.jobId === saved.id)?.id || newProjectId();
    ensureProject({ status: 'ready', jobId: saved.id });
    if (typeof trackJobCost === 'function') trackJobCost(saved.id, job.scenes.filter(sc => sc.status === 'done' || sc.videoId).length);
    saveProject(); updateAssembleBtn(); renderMontageEditor();
}
async function finishBackgroundJob() {
    unlockAudio();
    const ok = await runAssembly();
    if (ok) {
        const saved = getJSON(STORAGE.BG_JOB);
        if (saved) setJSON(STORAGE.BG_JOB, { ...saved, finished: true });
        hideBgPanel();
        wizardGo(4);
    }
}
async function cancelBackgroundJob(silent) {
    const saved = getJSON(STORAGE.BG_JOB);
    if (!saved) return;
    if (!silent && !confirm('Arrêter la génération en arrière-plan ? Les scènes déjà prêtes resteront disponibles.')) return;
    try { await fetch(getProxyUrl() + '/jobs/' + saved.id + '/cancel', { method: 'POST' }); } catch (e) {}
    if (silent) { setJSON(STORAGE.BG_JOB, { ...saved, finished: true }); return; }
    scheduleBgPoll(500);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleBgPoll(300); });

// ══════════════════════════════════════════════════════════════════
// PIPELINE DE GÉNÉRATION
// ══════════════════════════════════════════════════════════════════
async function createTaskOnly(item) {
    item.status = 'creating'; item.progress = 'Préparation…'; renderQueue();
    if (!item.chained) { const poseImg = imageForScene(item.sceneIndex); if (poseImg) item.image = poseImg; }
    item.prompt = buildScenePrompt(item);
    const videoId = await createVideoTask(item.image, item.prompt);
    item.videoId = videoId; item.startTime = Date.now();
    item.status = 'processing'; item.progress = 'En cours…'; renderQueue();
}
async function pollTaskAndDisplay(item) {
    try {
        const videoUrl = await pollVideo(item.videoId, p => { item.progress = p; renderQueue(); });
        const elapsed = Date.now() - item.startTime;
        recordGenerationTime(state.durationFrames, elapsed);
        item.status = 'done'; item.videoUrl = videoUrl; item.progress = 'Terminé';
        state.completed++; renderQueue(); updateGenerateBtn(); renderQuota();
        saveProject();
        addToGallery(videoUrl, 'Scène ' + (item.sceneIndex + 1));
        trackAnalytics('scenes');
    } catch (e) {
        item.status = 'failed';
        if (e.message === 'Arrêt demandé') item.progress = 'Arrêté';
        else { item.progress = 'Échec'; item.error = e.message; state.failed++; log('Scène ' + (item.sceneIndex + 1) + ' : ' + e.message); }
        renderQueue(); updateGenerateBtn(); renderQuota();
    }
}
function renderQueue() {
    const el = document.getElementById('queue'); if (!el) return;
    if (!state.queue.length) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    const total = state.queue.length;
    const done = state.completed + state.failed;
    let html = '<div class="queue-summary"><span class="progress-text">Progression : ' + done + '/' + total + '</span><span class="eta-text">' + (done < total ? 'En cours' : 'Terminé') + '</span></div>';
    html += state.queue.slice(0, 40).map(item => {
        let icon = '○', txt = 'En file', cls = 'pending';
        if (item.status === 'creating') { icon = '◐'; txt = 'Création…'; cls = 'creating'; }
        else if (item.status === 'processing') { icon = '◐'; txt = item.progress || 'En cours'; cls = 'processing'; }
        else if (item.status === 'done') { icon = '●'; txt = 'Terminé' + (item.chained ? ' · enchaînée' : ''); cls = 'done'; }
        else if (item.status === 'failed') { icon = '✕'; txt = item.progress === 'Arrêté' ? 'Arrêtée' : 'Échec' + (item.error ? ' : ' + item.error.slice(0, 60) : ''); cls = 'failed'; }
        const canRegen = (item.status === 'done' || item.status === 'failed') && !state.isRunning && !assembling && !state.regenerating;
        return '<div class="queue-item ' + cls + '"><div class="q-icon">' + icon + '</div><div class="q-name">Scène ' + (item.sceneIndex + 1) + '</div><div class="q-status">' + esc(txt) + '</div>' +
            (canRegen ? '<button type="button" class="q-regen" data-regen="' + item.sceneIndex + '">🔄 Refaire</button>' : '') + '</div>';
    }).join('');
    el.innerHTML = html;
    setProgress(total > 0 ? (done / total) * 100 : 0);
}
function rebuildGallery() {
    const gg = document.getElementById('gallery-grid'); if (!gg) return;
    gg.innerHTML = '';
    const done = state.queue.filter(q => q.status === 'done' && q.videoUrl);
    document.getElementById('gallery').style.display = done.length ? 'block' : 'none';
    done.forEach(q => addToGallery(q.videoUrl, 'Scène ' + (q.sceneIndex + 1)));
}
// Refaire une seule scène (nouvelle prise), sans toucher aux autres.
async function regenerateScene(item) {
    const photo = state.images[0]?.dataUri || state.photoSmall;
    if (!photo) throw new Error('photo du personnage introuvable : ajoute-la à nouveau en haut de la page');
    if (!getAgnesKey()) throw new Error('clé Agnes manquante');
    if (item.status === 'done') state.completed = Math.max(0, state.completed - 1);
    else if (item.status === 'failed') state.failed = Math.max(0, state.failed - 1);
    ['blob', 'audioBuffer', 'speech', 'sttWords', 'ttsBlob', 'ttsBuffer', 'ttsSpeech', 'error', 'mediaKey'].forEach(k => delete item[k]);
    item.image = photo; item.chained = false; item.videoUrl = null;
    state.exportCache = {};
    try { await createTaskOnly(item); }
    catch (e) { item.status = 'failed'; item.error = e.message; state.failed++; renderQueue(); rebuildGallery(); throw e; }
    await pollTaskAndDisplay(item);
    rebuildGallery(); saveProject();
    if (item.status !== 'done') throw new Error(item.error || 'la nouvelle prise a échoué');
}
async function regenerateSceneUI(index) {
    const item = state.queue.find(q => q.sceneIndex === index);
    if (!item || state.regenerating || state.isRunning || assembling) return;
    if (!confirm('Refaire la scène ' + (index + 1) + ' ? Garde l\'appli ouverte 1 à 2 minutes.')) return;
    unlockAudio();
    state.regenerating = true; state.stopRequested = false; renderQueue(); updateAssembleBtn();
    await ensureWakeLockActive();
    try { await regenerateScene(item); showToast('Scène ' + (index + 1) + ' refaite ✓ Tu peux relancer le montage.', 'success', 5000); }
    catch (e) { showToast('Impossible de refaire la scène : ' + e.message, 'error', 6000); }
    finally { state.regenerating = false; state.stopRequested = false; setStatus(null); renderQueue(); updateAssembleBtn(); }
}
document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-regen]');
    if (b) regenerateSceneUI(parseInt(b.dataset.regen, 10));
});
function addToGallery(videoUrl, label) {
    const g = document.getElementById('gallery'), gg = document.getElementById('gallery-grid');
    g.style.display = 'block';
    const el = document.createElement('div');
    el.className = 'gallery-item';
    const v = document.createElement('video');
    v.controls = true; v.preload = 'metadata'; v.playsInline = true; v.setAttribute('playsinline', ''); v.src = videoUrl;
    el.appendChild(v);
    const cap = document.createElement('div'); cap.className = 'g-caption'; cap.textContent = label;
    el.appendChild(cap);
    gg.appendChild(el);
}

// Scènes créées à intervalle régulier puis suivies en parallèle (plus rapide, sans enchaînement).
async function runParallel() {
    const polling = [];
    for (let i = 0; i < state.queue.length; i++) {
        if (state.stopRequested) break;
        try { await createTaskOnly(state.queue[i]); polling.push(pollTaskAndDisplay(state.queue[i])); }
        catch (e) { if (e.message === 'Arrêt demandé') break; state.queue[i].status = 'failed'; state.queue[i].error = e.message; state.failed++; renderQueue(); }
        if (i < state.queue.length - 1 && !state.stopRequested) await countdown(createIntervalMs, 'Scène ' + (i + 2) + '/' + state.queue.length + ' dans ');
    }
    if (polling.length) await Promise.allSettled(polling);
}
// Chaque scène part de la dernière image de la précédente : une seule vidéo continue.
async function runChained() {
    let lastCreate = 0, warned = false;
    for (let i = 0; i < state.queue.length; i++) {
        if (state.stopRequested) break;
        const item = state.queue[i];
        if (i > 0) {
            const prev = state.queue[i - 1];
            const pose = scenePlanFor(i).pose;
            if (prev.status === 'done' && (!pose || pose === 'main' || !imageForScene(i))) {
                setStatus('Scène ' + (i + 1) + ' : récupération de la dernière image…');
                try { item.image = await extractLastFrame(prev); item.chained = true; }
                catch (e) {
                    log('Enchaînement impossible : ' + e.message);
                    if (!warned) { showToast('Enchaînement impossible pour cette scène : la photo d\'origine est utilisée', 'warn', 4000); warned = true; }
                }
            }
            const wait = createIntervalMs - (Date.now() - lastCreate);
            if (wait > 0) await countdown(wait, 'Scène ' + (i + 1) + '/' + state.queue.length + ' dans ');
            if (state.stopRequested) break;
        }
        try {
            lastCreate = Date.now();
            await createTaskOnly(item);
            await pollTaskAndDisplay(item);
        } catch (e) {
            if (e.message === 'Arrêt demandé') break;
            item.status = 'failed'; item.error = e.message; state.failed++; renderQueue();
        }
    }
}
