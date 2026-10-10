// Cartoon Instructeur · Éditeur de montage, aperçu, banque de plans, sauvegarde Cloudflare, séries, langues
// (scripts classiques chargés dans l'ordre par index.html : ils partagent les mêmes variables globales)

// ══════════════════════════════════════════════════════════════════
// ÉDITEUR DE MONTAGE (ordre, scènes retirées, coupes, sous-titres, décalage des dessins)
// ══════════════════════════════════════════════════════════════════
function sceneEdit(item) { if (!item.edit) item.edit = {}; return item.edit; }
// Scènes montées : terminées, non retirées, dans l'ordre choisi ; + plans de la banque (intro / fin parlées)
function montageItems() {
    const scenes = state.queue.filter(q => q.status === 'done' && q.videoUrl && !q.edit?.skip)
        .sort((a, b) => (a.edit?.order ?? a.sceneIndex) - (b.edit?.order ?? b.sceneIndex));
    const bank = state.bankUse ? state.bankItems : [];
    return [...bank.filter(b => b.bankSlot === 'intro'), ...scenes, ...bank.filter(b => b.bankSlot === 'outro')];
}
function getSceneItem(i) { return state.queue.find(q => q.sceneIndex === i) || state.bankItems.find(b => b.sceneIndex === i) || null; }
function renderMontageEditor() {
    const box = document.getElementById('montage-editor'); if (!box) return;
    const items = state.queue.filter(q => q.status === 'done' && q.videoUrl)
        .sort((a, b) => (a.edit?.order ?? a.sceneIndex) - (b.edit?.order ?? b.sceneIndex));
    if (!items.length) { box.innerHTML = '<div class="prompt-main-hint">Aucune scène terminée pour l\'instant.</div>'; return; }
    box.innerHTML = '<div class="prompt-main-hint" style="margin-bottom:0.6rem;">Réordonne, retire, raccourcis ou corrige chaque scène, puis appuie sur « ▶️ Aperçu » pour vérifier. Rien n\'est régénéré.</div>' +
        items.map((it, pos) => {
            const e = it.edit || {};
            const txt = e.caption ?? (segmentsForScene(it.sceneIndex).map(s => s.text).join(' '));
            return '<div class="me-card' + (e.skip ? ' me-off' : '') + '">' +
                '<div class="me-head"><b>Scène ' + (it.sceneIndex + 1) + '</b>' +
                '<span><button type="button" data-me="up" data-i="' + it.sceneIndex + '"' + (pos === 0 ? ' disabled' : '') + '>↑</button>' +
                '<button type="button" data-me="down" data-i="' + it.sceneIndex + '"' + (pos === items.length - 1 ? ' disabled' : '') + '>↓</button>' +
                '<button type="button" data-me="skip" data-i="' + it.sceneIndex + '">' + (e.skip ? '↩️ Remettre' : '🗑️ Retirer') + '</button></span></div>' +
                '<label class="control-label">Sous-titre</label><textarea class="sb-text" data-me-field="caption" data-i="' + it.sceneIndex + '">' + esc(txt) + '</textarea>' +
                '<div class="me-sliders">' +
                '<label>Couper au début <b data-me-val="trimIn" data-i="' + it.sceneIndex + '">' + (e.trimIn || 0).toFixed(1) + ' s</b><input type="range" min="0" max="2" step="0.1" value="' + (e.trimIn || 0) + '" data-me-field="trimIn" data-i="' + it.sceneIndex + '"></label>' +
                '<label>Couper à la fin <b data-me-val="trimOut" data-i="' + it.sceneIndex + '">' + (e.trimOut || 0).toFixed(1) + ' s</b><input type="range" min="0" max="2" step="0.1" value="' + (e.trimOut || 0) + '" data-me-field="trimOut" data-i="' + it.sceneIndex + '"></label>' +
                (isWhiteboard() ? '<label>Décaler le dessin <b data-me-val="drawShift" data-i="' + it.sceneIndex + '">' + (e.drawShift || 0).toFixed(1) + ' s</b><input type="range" min="-1.5" max="1.5" step="0.1" value="' + (e.drawShift || 0) + '" data-me-field="drawShift" data-i="' + it.sceneIndex + '"></label>' : '') +
                '</div></div>';
        }).join('');
}
function normalizeOrders() {
    state.queue.filter(q => q.status === 'done').sort((a, b) => (a.edit?.order ?? a.sceneIndex) - (b.edit?.order ?? b.sceneIndex)).forEach((q, i) => { sceneEdit(q).order = i; });
}
document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-me]'); if (!b) return;
    const item = state.queue.find(q => q.sceneIndex === parseInt(b.dataset.i, 10)); if (!item) return;
    normalizeOrders();
    const list = state.queue.filter(q => q.status === 'done').sort((a, c) => a.edit.order - c.edit.order);
    const pos = list.indexOf(item);
    if (b.dataset.me === 'up' && pos > 0) { const o = list[pos - 1]; [o.edit.order, item.edit.order] = [item.edit.order, o.edit.order]; }
    else if (b.dataset.me === 'down' && pos < list.length - 1) { const o = list[pos + 1]; [o.edit.order, item.edit.order] = [item.edit.order, o.edit.order]; }
    else if (b.dataset.me === 'skip') item.edit.skip = !item.edit.skip;
    state.exportCache = {}; saveProject(); renderMontageEditor();
});
document.addEventListener('input', e => {
    const f = e.target.dataset?.meField; if (!f) return;
    const item = state.queue.find(q => q.sceneIndex === parseInt(e.target.dataset.i, 10)); if (!item) return;
    sceneEdit(item)[f] = f === 'caption' ? e.target.value : parseFloat(e.target.value) || 0;
    const lbl = document.querySelector('[data-me-val="' + f + '"][data-i="' + item.sceneIndex + '"]');
    if (lbl) lbl.textContent = (parseFloat(e.target.value) || 0).toFixed(1) + ' s';
    state.exportCache = {}; saveProject();
});

// ══════════════════════════════════════════════════════════════════
// APERÇU INSTANTANÉ (lecture directe, sans enregistrer de fichier)
// ══════════════════════════════════════════════════════════════════
async function runPreview() {
    if (assembling || state.isRunning) return;
    unlockAudio();
    const box = document.getElementById('preview-box');
    assembling = true; state.stopRequested = false; updateAssembleBtn();
    document.getElementById('stop-btn').classList.add('visible');
    await ensureWakeLockActive();
    try {
        if (state.drawingsPromise) await state.drawingsPromise;
        await assembleVideo({ label: 'Aperçu', preview: box });
    } catch (e) { if (e.message !== 'Arrêt demandé') showToast('Aperçu impossible : ' + e.message, 'error', 6000); }
    finally { assembling = false; state.stopRequested = false; setStatus(null); setProgress(0); document.getElementById('stop-btn').classList.remove('visible'); updateAssembleBtn(); }
}

// ══════════════════════════════════════════════════════════════════
// MODE SIMPLE
// ══════════════════════════════════════════════════════════════════
const ADVANCED_IDS = ['section-series', 'section-language', 'section-style', 'section-staging', 'section-pedago', 'section-music', 'section-tts', 'section-avatar', 'section-subtitles', 'section-whisper', 'section-export', 'section-firebase', 'section-cloud', 'section-kit', 'section-analytics', 'section-history', 'section-bank', 'section-costs', 'keys-panel', 'proxy-panel', 'gen-mode-row', 'options-title'];
function applySimpleMode() {
    const simple = getLS(STORAGE.SIMPLE_MODE) === '1';
    ADVANCED_IDS.forEach(id => document.getElementById(id)?.classList.toggle('simple-hidden', simple));
    document.querySelectorAll('.options-title').forEach(el => el.classList.toggle('simple-hidden', simple));
    const b = document.getElementById('simple-mode-btn');
    if (b) b.textContent = simple ? '⚙️ Afficher tous les réglages (mode expert)' : '✨ Passer en mode simple';
}

// ══════════════════════════════════════════════════════════════════
// BANQUE DE PLANS : intro et fin parlées, générées une fois, réutilisées partout
// ══════════════════════════════════════════════════════════════════
const BANK_SLOTS = { intro: { idx: -1, label: 'Intro parlée', def: 'Salut, c\'est Prof Patate !' }, outro: { idx: -2, label: 'Fin parlée', def: 'Abonne-toi pour ne rien rater !' } };
async function loadBank() {
    state.bankItems = [];
    for (const [slot, cfg] of Object.entries(BANK_SLOTS)) {
        try {
            const rec = await idbGet('bank:' + slot);
            if (rec && rec.blob) state.bankItems.push({ sceneIndex: cfg.idx, bankSlot: slot, sceneText: rec.text, status: 'done', videoUrl: 'bank:' + slot, blob: rec.blob, edit: { caption: rec.text } });
        } catch (e) {}
    }
    renderBank();
}
function renderBank() {
    const box = document.getElementById('bank-list'); if (!box) return;
    box.innerHTML = Object.entries(BANK_SLOTS).map(([slot, cfg]) => {
        const it = state.bankItems.find(b => b.bankSlot === slot);
        return '<div class="bank-row"><b>' + cfg.label + '</b>' +
            '<input class="text-input" id="bank-text-' + slot + '" value="' + esc(it?.sceneText || cfg.def) + '">' +
            '<div class="bank-actions">' + (it ? '<span>✅ Prête</span>' : '<span class="prompt-main-hint">Pas encore créée</span>') +
            '<button type="button" data-bank-gen="' + slot + '">' + (it ? '🔄 Refaire' : '🎬 Créer') + '</button>' +
            (it ? '<button type="button" data-bank-del="' + slot + '">🗑️</button>' : '') + '</div></div>';
    }).join('');
}
async function generateBankClip(slot) {
    const cfg = BANK_SLOTS[slot];
    const text = (document.getElementById('bank-text-' + slot)?.value || cfg.def).trim();
    const photo = referenceImage() || (state.poses.find(p => p.id === 'salue') || state.poses.find(p => p.id === 'explique') || {}).image || state.images[0]?.dataUri || state.photoSmall;
    if (!photo) { showToast('Ajoute d\'abord la photo du personnage', 'error'); return; }
    if (!getAgnesKey()) { showToast('Clé Agnes manquante', 'error'); return; }
    if (state.isRunning || assembling || state.regenerating) return;
    unlockAudio();
    state.regenerating = true; state.stopRequested = false;
    await ensureWakeLockActive();
    const item = { sceneIndex: cfg.idx, sceneText: text, image: photo, status: 'pending', bankSlot: slot };
    try {
        showToast(cfg.label + ' : génération (1 à 2 min, garde l\'appli ouverte)', 'success', 4000);
        item.prompt = buildScenePrompt({ sceneIndex: 0, sceneText: text }, { total: 1, setting: '', plan: { spoken: text, action: slot === 'intro' ? 'waves hello at the viewer with a big smile' : 'points at the viewer and gives a thumbs up', camera: 'medium shot' } });
        item.videoId = await createVideoTask(photo, item.prompt);
        const url = await pollVideo(item.videoId, p => setStatus(cfg.label + ' : ' + p));
        item.videoUrl = url;
        const blob = await fetchClipBlob(item);
        await idbPut('bank:' + slot, { text, blob, date: Date.now() });
        await loadBank();
        showToast(cfg.label + ' prête ✓ Elle sera ajoutée à toutes tes vidéos', 'success', 5000);
    } catch (e) { showToast(cfg.label + ' impossible : ' + e.message, 'error', 6000); }
    finally { state.regenerating = false; state.stopRequested = false; setStatus(null); }
}
document.addEventListener('click', async e => {
    const g = e.target.closest && e.target.closest('[data-bank-gen]'); if (g) { generateBankClip(g.dataset.bankGen); return; }
    const d = e.target.closest && e.target.closest('[data-bank-del]'); if (d) { try { await idbDel('bank:' + d.dataset.bankDel); } catch (err) {} loadBank(); }
});

// ══════════════════════════════════════════════════════════════════
// SAUVEGARDE SUR TON CLOUDFLARE (scènes et vidéos finales) + BIBLIOTHÈQUE
// ══════════════════════════════════════════════════════════════════
function mediaAvailable() { return !!getProxyUrl() && state.proxyMedia; }
// Envoi sur le serveur. Au-delà de MEDIA_PART_SIZE, le fichier part en morceaux de 6 Mo
// (une requête Cloudflare est limitée à 100 Mo : une vidéo de 2 min en 1080p dépasse),
// chaque morceau étant réessayé en cas de coupure réseau.
const MEDIA_PART_SIZE = 6000000;
async function uploadMedia(key, blob, kind, title, onProgress) {
    const base = getProxyUrl() + '/media/' + encodeURIComponent(key) + '?kind=' + kind + '&title=' + encodeURIComponent(title || '');
    const put = async (url, body, ms) => {
        const res = await withTimeout(fetch(url, { method: 'PUT', headers: { 'Content-Type': blob.type || 'application/octet-stream' }, body }), ms, 'envoi trop long');
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { const err = new Error(data.error || ('HTTP ' + res.status)); err.status = res.status; throw err; }
        return data;
    };
    if (blob.size <= MEDIA_PART_SIZE || !state.proxyParts) {
        if (blob.size > 95 * 1048576) throw new Error('fichier de ' + Math.round(blob.size / 1048576) + ' Mo, trop lourd pour ton serveur (pas encore à jour)');
        await put(base, blob, 300000); return key;
    }
    const parts = Math.ceil(blob.size / MEDIA_PART_SIZE);
    const upload = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    for (let i = 0; i < parts; i++) {
        const body = blob.slice(i * MEDIA_PART_SIZE, (i + 1) * MEDIA_PART_SIZE, blob.type);
        for (let attempt = 0; ; attempt++) {
            try { await put(base + '&upload=' + upload + '&part=' + i + '&parts=' + parts, body, 120000); break; }
            catch (e) { if (attempt >= 2 || (e.status >= 400 && e.status < 500)) throw e; await new Promise(r => setTimeout(r, 2000 * (attempt + 1))); }
        }
        if (onProgress) onProgress((i + 1) / parts);
    }
    return key;
}
async function backupScenes() {
    if (!mediaAvailable() || !state.backupOn) return;
    const pid = state.projectId || (state.projectId = 'p' + Date.now().toString(36));
    for (const it of state.queue.filter(q => q.status === 'done' && !q.mediaKey)) {
        try { await fetchClipBlob(it); it.mediaKey = await uploadMedia('phone/' + pid + '/' + it.sceneIndex, it.blob, 'clip'); }
        catch (e) { log('Sauvegarde scène ' + (it.sceneIndex + 1) + ' : ' + e.message); break; }
    }
    saveProject();
}
async function backupFinal() {
    if (!state.finalBlob) return;
    if (!mediaAvailable()) { showToast('Serveur Cloudflare pas à jour : sauvegarde indisponible', 'warn'); return; }
    const btn = document.getElementById('backup-final-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Envoi sur ton Cloudflare…'; }
    try {
        const pid = ensureProject();
        const key = await uploadMedia('final/' + pid, state.finalBlob, 'final', (state.theme || 'Vidéo') + ' · ' + new Date().toLocaleDateString('fr-FR'),
            f => { if (btn) btn.textContent = '⏳ Envoi sur ton Cloudflare… ' + Math.round(f * 100) + ' %'; });
        updateProject(pid, { finalKey: key });
        showToast('Vidéo sauvegardée sur ton Cloudflare ✓', 'success');
        if (btn) btn.textContent = '✅ Vidéo sauvegardée';
        renderLibrary();
    } catch (e) { showToast('Sauvegarde impossible : ' + e.message, 'error', 6000); if (btn) btn.textContent = '☁️ Sauvegarder la vidéo sur mon Cloudflare'; }
    finally { if (btn) btn.disabled = false; }
}
async function renderLibrary() {
    const box = document.getElementById('library-list'); if (!box) return;
    if (!mediaAvailable()) { box.innerHTML = '<div class="prompt-main-hint">Disponible quand ton serveur Cloudflare est à jour.</div>'; return; }
    try {
        const res = await fetch(getProxyUrl() + '/media-list?kind=final');
        const { items = [] } = await res.json();
        box.innerHTML = items.length ? items.map(m => '<div class="series-item"><span>🎬 ' + esc(m.title || m.key) + ' · ' + Math.round(m.size / 1048576) + ' Mo</span><span><button type="button" data-lib-get="' + esc(m.key) + '">⬇️</button> <button type="button" data-lib-del="' + esc(m.key) + '">🗑️</button></span></div>').join('')
            : '<div class="prompt-main-hint">Aucune vidéo sauvegardée pour l\'instant.</div>';
    } catch (e) { box.innerHTML = '<div class="prompt-main-hint">Bibliothèque injoignable.</div>'; }
}
document.addEventListener('click', async e => {
    const g = e.target.closest && e.target.closest('[data-lib-get]');
    if (g) {
        const key = g.dataset.libGet;
        if (state.exportCache['lib:' + key]) { saveBlob(state.exportCache['lib:' + key].blob, state.exportCache['lib:' + key].name); return; }
        g.textContent = '⏳';
        try { const r = await fetch(getProxyUrl() + '/media/' + encodeURIComponent(key)); const b = await r.blob(); state.exportCache['lib:' + key] = { blob: b, name: key.replace(/\W+/g, '-') + (b.type.includes('mp4') ? '.mp4' : '.webm') }; g.textContent = '✅'; showToast('Prêt : appuie à nouveau pour enregistrer', 'success'); }
        catch (err) { g.textContent = '⬇️'; showToast('Téléchargement impossible', 'error'); }
        return;
    }
    const d = e.target.closest && e.target.closest('[data-lib-del]');
    if (d && confirm('Supprimer cette vidéo de ton Cloudflare ?')) { await fetch(getProxyUrl() + '/media/' + encodeURIComponent(d.dataset.libDel), { method: 'DELETE' }); renderLibrary(); }
});

// ══════════════════════════════════════════════════════════════════
// SÉRIE EN ARRIÈRE-PLAN (plusieurs épisodes, téléphone éteint)
// ══════════════════════════════════════════════════════════════════
async function launchSeriesBackground() {
    const eps = state.seriesEpisodes;
    if (!state.images.length) { showToast('Ajoute la photo du personnage', 'error'); return; }
    if (!getAgnesKey()) { showToast('Ajoute la clé Agnes', 'error'); return; }
    const btn = document.getElementById('launch-series-btn'); if (btn) btn.disabled = true;
    const list = [];
    try {
        state.photoSmall = await downscaleImage(state.images[0].dataUri, 1024, 0.85);
        for (let i = 0; i < eps.length; i++) {
            setStatus('Envoi de l\'épisode ' + (i + 1) + '/' + eps.length + '…');
            const scenes = splitScriptIntoScenes(eps[i].script);
            const id = await sendBackgroundJob(scenes, eps[i].title, eps[i].script, false);
            const projectId = newProjectId(), plist = getProjects();
            plist.unshift({ id: projectId, createdAt: Date.now(), updatedAt: Date.now(), status: 'generating', title: eps[i].title, script: eps[i].script, style: state.selectedStyle, jobId: id });
            setProjects(plist);
            list.push({ id, projectId, title: eps[i].title, script: eps[i].script, n: scenes.length, style: state.selectedStyle, finished: false });
        }
        setJSON(STORAGE.BG_SERIES, { date: Date.now(), photo: state.photoSmall, episodes: list });
        showToast(list.length + ' épisodes envoyés ✓ Tu peux éteindre ton téléphone', 'success', 6000);
        renderSeriesJobs();
    } catch (e) { showToast('Envoi de la série impossible : ' + e.message, 'error', 6000); }
    finally { if (btn) btn.disabled = false; setStatus(null); }
}
async function renderSeriesJobs() {
    const box = document.getElementById('series-jobs'); if (!box) return;
    const s = getJSON(STORAGE.BG_SERIES);
    if (!s || !s.episodes?.length) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    const rows = await Promise.all(s.episodes.map(async (ep, i) => {
        if (ep.finished) return { ep, i, label: '✅ Vidéo terminée', ready: false };
        try {
            const r = await fetch(getProxyUrl() + '/jobs/' + ep.id); const job = await r.json();
            if (!r.ok) return { ep, i, label: '⌛ ' + (job.error || 'expiré'), ready: false };
            const done = (job.scenes || []).filter(x => x.status === 'done').length;
            return { ep, i, job, label: job.status === 'done' ? '✅ Scènes prêtes (' + done + '/' + job.scenes.length + ')' : job.status === 'failed' ? '❌ ' + job.message : '⏳ ' + (job.message || 'En cours'), ready: job.status === 'done' || (job.status === 'failed' && done > 0) };
        } catch (e) { return { ep, i, label: '… serveur injoignable', ready: false }; }
    }));
    box.innerHTML = '<div class="section-title" style="margin-bottom:0.5rem;">📺 Série en arrière-plan</div>' + rows.map(r =>
        '<div class="series-item"><span>' + esc(r.ep.title) + '<br><small>' + esc(r.label) + '</small></span>' + (r.ready ? '<button type="button" data-series-finish="' + r.i + '">🎞️ Terminer</button>' : '') + '</div>').join('') +
        '<button type="button" class="btn-secondary" id="series-refresh-btn" style="margin-top:0.4rem;">🔄 Actualiser</button><button type="button" class="btn-secondary" id="series-clear-btn" style="margin-top:0.4rem;">Effacer cette liste</button>';
    state._seriesRows = rows;
}
document.addEventListener('click', async e => {
    if (e.target.id === 'series-refresh-btn') { renderSeriesJobs(); return; }
    if (e.target.id === 'series-clear-btn') { localStorage.removeItem(STORAGE.BG_SERIES); renderSeriesJobs(); return; }
    const b = e.target.closest && e.target.closest('[data-series-finish]'); if (!b) return;
    const s = getJSON(STORAGE.BG_SERIES), row = state._seriesRows?.[parseInt(b.dataset.seriesFinish, 10)];
    if (!s || !row?.job) return;
    unlockAudio();
    await loadBackgroundResults({ ...row.ep, theme: row.ep.title, photo: s.photo }, row.job);
    state.isSeriesMode = true;
    const ok = await runAssembly();
    state.isSeriesMode = false;
    if (ok) { row.ep.finished = true; s.episodes[row.i].finished = true; setJSON(STORAGE.BG_SERIES, s); renderSeriesJobs(); }
});

// ══════════════════════════════════════════════════════════════════
// VERSIONS DANS D'AUTRES LANGUES (mêmes images, voix et textes traduits)
// ══════════════════════════════════════════════════════════════════
async function buildLanguageVersion(lang) {
    const items = state.queue.filter(q => q.status === 'done' && q.videoUrl);
    if (!items.length) throw new Error('aucune scène');
    if (!getClaudeKey()) throw new Error('la traduction utilise la clé Claude');
    if (!getElevenLabsKey() || !(elevenlabsSelectedVoiceId || getLS(STORAGE.ELEVENLABS_VOICE))) throw new Error('choisis une voix ElevenLabs (section Voix)');
    setStatus('Claude traduit la vidéo…');
    const scenes = state.scenes.map((_, i) => scenePlanFor(i));
    // mots-clés écrits sous les dessins (règle 8 : tout texte de la vidéo dans sa langue) ; « VS » reste tel quel
    const drawLabels = state.scenes.map((_, i) => (state.drawings[i]?.labels || []).filter(l => !l.accent).map(l => l.text));
    const out = await callClaude({
        system: 'Tu traduis des vidéos pédagogiques en gardant le ton, le niveau et des phrases faciles à prononcer par une voix de synthèse.',
        prompt: 'Traduis en ' + (LANG_NAMES_FR[lang] || lang) + '. Garde exactement ' + scenes.length + ' scènes, dans le même ordre. Pour chaque scène : "spoken" (la réplique), "narration" (la voix off), "bubble", "highlight", "section", "hook" (l\'accroche écrite) et "stickerText" (le texte de l\'autocollant), vides si vides dans l\'original, et "labels" (les mots-clés écrits sous les dessins : même nombre, 1 à 3 mots chacun). Donne aussi "title" (le titre de la vidéo).\n\nTitre : ' + (state.theme || '') + '\n' +
            JSON.stringify(scenes.map((p, i) => ({ spoken: p.spoken, narration: p.narration || '', bubble: p.bubble || '', highlight: p.highlight || '', section: p.section || '', hook: p.hook || '', stickerText: p.stickerText || '', labels: drawLabels[i] }))),
        schema: { type: 'object', properties: { title: { type: 'string' }, scenes: { type: 'array', items: { type: 'object', properties: { spoken: { type: 'string' }, narration: { type: 'string' }, bubble: { type: 'string' }, highlight: { type: 'string' }, section: { type: 'string' }, hook: { type: 'string' }, stickerText: { type: 'string' }, labels: { type: 'array', items: { type: 'string' } } }, required: ['spoken', 'narration', 'bubble', 'highlight', 'section', 'hook', 'stickerText', 'labels'], additionalProperties: false } } }, required: ['title', 'scenes'], additionalProperties: false }
    });
    if (!out.scenes || out.scenes.length !== scenes.length) throw new Error('traduction incomplète');
    // on échange temporairement textes, voix et langue, puis on remet tout en place
    const saved = { drawings: state.drawings, plan: state.scenePlan, theme: state.theme, language: state.language, voice: state.voiceSource, segs: subtitleSegments, sig: subtitleScriptSignature, bank: state.bankUse,
        items: items.map(it => ({ it, fitBuffer: it.fitBuffer, fitSpeech: it.fitSpeech, stt: it.sttWords, edit: it.edit, narrBuffer: it.narrBuffer, narrSpeech: it.narrSpeech, narrKey: it.narrKey })) };
    try {
        state.scenePlan = { ...state.scenePlan, scenes: scenes.map((p, i) => ({ ...p, ...out.scenes[i], section: i > 0 ? out.scenes[i].section : '' })) };
        state.theme = out.title || state.theme; state.language = lang; state.voiceSource = 'fit'; state.bankUse = false;
        // dessins : mêmes traits, mots-clés traduits (plus petits si le mot traduit est plus long)
        state.drawings = state.drawings.map((d, i) => {
            const tr = Array.isArray(out.scenes[i]?.labels) ? out.scenes[i].labels : [];
            if (!d || !d.labels || !tr.length) return d;
            let k = 0;
            return { ...d, labels: d.labels.map(l => {
                if (l.accent) return l;
                const t = String(tr[k++] || '').trim().slice(0, 28);
                return t ? { ...l, text: t, size: l.size * Math.min(1, Math.max(4, l.text.length) / Math.max(4, t.length)) } : l;
            }) };
        });
        subtitleSegments = [];
        items.forEach((it, i) => {
            const cache = it.langCache?.[lang];
            it.fitBuffer = cache?.fitBuffer; it.fitSpeech = cache?.fitSpeech;
            it.narrBuffer = cache?.narrBuffer; it.narrSpeech = cache?.narrSpeech; it.narrKey = undefined;
            it.sttWords = null; it.edit = { ...(it.edit || {}), caption: out.scenes[it.sceneIndex]?.spoken };
        });
        const r = await assembleVideo({ label: 'Version ' + (LANG_NAMES_FR[lang] || lang) });
        const tl = state.timeline; state.timeline = r.timeline;
        try { state.langSrt = state.langSrt || {}; state.langSrt[lang] = generateSRT(); } finally { state.timeline = tl; }
        document.getElementById('lang-yt-btn')?.classList.toggle('hidden', !state.lastYouTubeId);
        items.forEach(it => { it.langCache = it.langCache || {}; it.langCache[lang] = { fitBuffer: it.fitBuffer, fitSpeech: it.fitSpeech, narrBuffer: it.narrBuffer, narrSpeech: it.narrSpeech }; });
        return { blob: r.blob, name: 'video-' + lang.split('-')[0] + '-' + Date.now() + '.' + r.ext };
    } finally {
        state.drawings = saved.drawings; state.scenePlan = saved.plan; state.theme = saved.theme; state.language = saved.language; state.voiceSource = saved.voice; state.bankUse = saved.bank;
        subtitleSegments = saved.segs; subtitleScriptSignature = saved.sig;
        saved.items.forEach(s => { s.it.fitBuffer = s.fitBuffer; s.it.fitSpeech = s.fitSpeech; s.it.sttWords = s.stt; s.it.edit = s.edit; s.it.narrBuffer = s.narrBuffer; s.it.narrSpeech = s.narrSpeech; s.it.narrKey = s.narrKey; });
    }
}
function downloadLanguageVersion() {
    const lang = document.getElementById('lang-version-select')?.value || 'en-US';
    return prepareThenSave('lang-version-btn', 'lang:' + lang, async () => {
        if (assembling || state.isRunning) throw new Error('attends la fin du montage en cours');
        unlockAudio();
        assembling = true; state.stopRequested = false;
        document.getElementById('stop-btn').classList.add('visible');
        await ensureWakeLockActive();
        try { return await buildLanguageVersion(lang); }
        finally { assembling = false; state.stopRequested = false; setStatus(null); setProgress(0); document.getElementById('stop-btn').classList.remove('visible'); }
    });
}
