// Cartoon Instructeur · Projets, publication, Instagram, pilote automatique, commentaires, fiche PDF
// (scripts classiques chargés dans l'ordre par index.html : ils partagent les mêmes variables globales)

// ══════════════════════════════════════════════════════════════════
// PROJETS EN PARALLÈLE : chaque vidéo a sa fiche (état, génération, vidéo finale, publication)
// ══════════════════════════════════════════════════════════════════
const PROJECT_STATUS = {
    draft: ['Brouillon', ''], generating: ['Génération…', ''], ready: ['Prêt à monter', 'ok'], done: ['Vidéo prête', 'ok'],
    scheduled: ['Programmée', 'warn'], published: ['Publiée', 'ok'], failed: ['Échec', 'warn']
};
function getProjects() { return getJSON(STORAGE.PROJECTS, []); }
function setProjects(list) { setJSON(STORAGE.PROJECTS, list.slice(0, 40)); }
function findProject(id) { return getProjects().find(p => p.id === id) || null; }
function updateProject(id, patch) {
    const list = getProjects(), p = list.find(x => x.id === id);
    if (!p) return null;
    Object.assign(p, patch, { updatedAt: Date.now() });
    setProjects(list);
    return p;
}
function newProjectId() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
// Crée (ou met à jour) la fiche du projet ouvert
function ensureProject(extra) {
    const info = { title: (state.theme || document.getElementById('theme-input')?.value || '').trim() || (state.scenes[0] || 'Sans titre').slice(0, 60), script: state.script || document.getElementById('script-input')?.value || '', style: state.selectedStyle, test: !!(state.testMode && state.testIdx) };
    if (state.projectId && findProject(state.projectId)) { updateProject(state.projectId, { ...info, ...(extra || {}) }); return state.projectId; }
    const id = state.projectId || newProjectId();
    state.projectId = id;
    const list = getProjects();
    list.unshift({ id, createdAt: Date.now(), updatedAt: Date.now(), status: 'draft', ...info, ...(extra || {}) });
    setProjects(list);
    return id;
}
function projectLabel(p) {
    const [l, cls] = PROJECT_STATUS[p.status] || [p.status, ''];
    const when = p.plan?.at ? ' · ' + new Date(p.plan.at).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
    return { l: l + when, cls };
}
// Sauvegarde complète du projet ouvert (scènes, mise en scène, retouches) sur le téléphone
function saveProjectSnapshot(snap) {
    if (!state.projectId) return;
    idbPut('project:' + state.projectId, snap).catch(() => {});
    const p = findProject(state.projectId);
    if (p && p.status === 'draft' && snap.queue?.some(q => q.status === 'done')) updateProject(p.id, { status: 'ready' });
}
function applySnapshot(p) {
    state.scenePlan = p.scenePlan || null;
    if (p.photo) state.photoSmall = p.photo;
    state.drawings = (p.drawings || []).map(raw => { if (!raw) return null; const c = compileDrawing(raw); if (c) c.raw = raw; return c; });
    state.queue = p.queue.map(q => ({ ...q, image: null, progress: q.status === 'done' ? 'Terminé' : 'Échec', videoId: null, prompt: null, startTime: null }));
    state.completed = state.queue.filter(q => q.status === 'done').length;
    state.failed = state.queue.length - state.completed;
    initSubtitleSegmentsFromScript();
    renderQueue(); setProgress(0);
    document.getElementById('gallery-grid').innerHTML = '';
    state.queue.filter(q => q.status === 'done').forEach(q => addToGallery(q.videoUrl, 'Scène ' + (q.sceneIndex + 1)));
    updateAssembleBtn(); renderMontageEditor();
}
// Vide l'espace de travail (le projet précédent reste enregistré et sa génération continue)
function resetWorkspace() {
    if (state.finalVideoUrl) URL.revokeObjectURL(state.finalVideoUrl);
    Object.assign(state, {
        queue: [], completed: 0, failed: 0, finalVideoUrl: null, finalBlob: null, finalAudioBlob: null, timeline: null, exportCache: {},
        scenePlan: null, drawings: [], drawingsPromise: null, storyboardApproved: false, storyboardSig: '', projectId: null, theme: '', script: '',
        langSrt: {}, lastYouTubeId: null, seo: null, finalFresh: false
    });
    document.getElementById('theme-input').value = '';
    document.getElementById('script-input').value = '';
    updateScriptStats();
    document.getElementById('storyboard').classList.add('hidden');
    document.getElementById('gallery-grid').innerHTML = ''; document.getElementById('gallery').style.display = 'none';
    document.getElementById('video-preview').classList.remove('visible');
    document.getElementById('final-video').removeAttribute('src');
    document.getElementById('fiche-video')?.removeAttribute('src');
    hideResultButtons(); renderQueue(); updateAssembleBtn(); renderMontageEditor();
    const bg = getJSON(STORAGE.BG_JOB);
    if (bg && !bg.finished) setJSON(STORAGE.BG_JOB, { ...bg, finished: true, detached: true });   // continue sur le serveur
    hideBgPanel();
    localStorage.removeItem(STORAGE.LAST_PROJECT);
}
function newVideo() {
    if (state.isRunning || assembling) { showToast('Attends la fin de la génération ou du montage en cours', 'warn'); return; }
    if (state.queue.length || state.scenes.length) saveProject();
    resetWorkspace();
    wizardGo(1);
}
async function loadProjectFinal(p) {
    if (!p.finalKey || !getProxyUrl()) return false;
    try {
        setStatus('Récupération de la vidéo sur ton Cloudflare…');
        const r = await withTimeout(fetch(getProxyUrl() + '/media/' + encodeURIComponent(p.finalKey)), 120000, 'téléchargement trop long');
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const blob = await r.blob();
        state.finalBlob = blob; state.finalVideoUrl = URL.createObjectURL(blob); state.finalExt = blob.type.includes('mp4') ? 'mp4' : 'webm';
        state.timeline = p.timeline || null;
        document.getElementById('final-video').src = state.finalVideoUrl;
        document.getElementById('video-preview').classList.add('visible');
        showResultButtons();
        return true;
    } catch (e) { showToast('Vidéo finale introuvable : ' + e.message, 'warn'); return false; }
    finally { setStatus(null); }
}
async function openProject(id, go = true) {
    if (state.isRunning || assembling) { showToast('Attends la fin de la génération ou du montage en cours', 'warn'); return false; }
    const p = findProject(id); if (!p) return false;
    if (state.projectId !== id) {
        if (state.queue.length) saveProject();
        resetWorkspace();
        state.projectId = id;
        document.getElementById('theme-input').value = p.title || '';
        document.getElementById('script-input').value = p.script || '';
        state.theme = p.title || '';
        if (p.style && CARTOON_STYLES.some(s => s.id === p.style)) { state.selectedStyle = p.style; renderStyles(); }
        updateScriptStats();
        let snap = null;
        try { snap = await idbGet('project:' + id); } catch (e) {}
        if (snap && snap.queue?.length) applySnapshot(snap);
        else if (p.jobId && getProxyUrl()) {
            try {
                const r = await fetch(getProxyUrl() + '/jobs/' + p.jobId); const job = await r.json();
                if (r.ok && ['done', 'failed', 'cancelled'].includes(job.status) && job.scenes.some(s => s.status === 'done')) loadBackgroundResults({ id: p.jobId, projectId: id, theme: p.title, script: p.script, style: p.style, photo: state.photoSmall }, job);
                else if (r.ok) {
                    setJSON(STORAGE.BG_JOB, { id: p.jobId, projectId: id, date: p.createdAt, theme: p.title, script: p.script, style: p.style, n: job.scenes.length, photo: state.photoSmall });
                    bgUI({ title: '☁️ Génération en arrière-plan', text: job.message || 'En cours…', pct: 5, running: true }); scheduleBgPoll(300);
                }
            } catch (e) { showToast('Serveur injoignable : ' + e.message, 'warn'); }
        }
        if (p.finalKey) await loadProjectFinal(p);
    }
    if (go) goToProject(findProject(id));
    return true;
}
function goToProject(p) {
    if (!p) return;
    if (state.finalBlob) { if (['scheduled', 'published'].includes(p.status)) navOpen('videos', 'video'); else wizardGo(p.status === 'done' ? 5 : 4); }
    else if (p.status === 'ready' || state.queue.some(q => q.status === 'done')) wizardGo(4);
    else if (p.status === 'generating') wizardGo(3);
    else wizardGo(1);
}
function deleteProject(id) {
    setProjects(getProjects().filter(p => p.id !== id));
    idbDel('project:' + id).catch(() => {});
    if (state.projectId === id) state.projectId = null;
}
// Met à jour les projets en génération sur le serveur
let lastProjectsRefresh = 0;
async function refreshProjects(force) {
    if (!getProxyUrl() || (!force && Date.now() - lastProjectsRefresh < 30000)) return;
    lastProjectsRefresh = Date.now();
    const gen = getProjects().filter(p => p.status === 'generating' && p.jobId);
    await Promise.all(gen.map(async p => {
        try {
            const r = await fetch(getProxyUrl() + '/jobs/' + p.jobId); const job = await r.json().catch(() => ({}));
            if (r.status === 404) updateProject(p.id, { status: 'failed', note: 'expiré sur le serveur' });
            else if (r.ok && ['done', 'failed', 'cancelled'].includes(job.status)) updateProject(p.id, job.scenes.some(s => s.status === 'done') ? { status: 'ready' } : { status: 'failed', note: job.message });
            else if (r.ok) updateProject(p.id, { note: job.message });
        } catch (e) {}
    }));
}
function projectRow(p) {
    const { l, cls } = projectLabel(p);
    return '<div class="list-item"><button type="button" class="proj-open" data-project="' + p.id + '"><span class="grow"><b>' + esc(p.title || 'Sans titre') + '</b><small>' + esc(l) + (p.note && p.status === 'generating' ? ' · ' + esc(p.note) : '') + (p.auto ? ' · 🤖' : '') + (p.test ? ' · 🧪 test' : '') + '</small></span></button>' +
        '<span class="pill ' + cls + '">' + esc((PROJECT_STATUS[p.status] || [p.status])[0]) + '</span>' +
        '<button type="button" class="proj-del" data-project-del="' + p.id + '" aria-label="Supprimer">🗑</button></div>';
}
async function renderProjectsList() {
    const box = document.getElementById('projects-list'); if (!box) return;
    await refreshProjects();
    const list = getProjects();
    box.innerHTML = list.length ? '<div class="list">' + list.map(projectRow).join('') + '</div>' : '<div class="hcard"><div class="hmuted">Aucun projet pour l\'instant : appuie sur « Créer ».</div></div>';
}
document.addEventListener('click', async e => {
    const o = e.target.closest && e.target.closest('[data-project]');
    if (o) { unlockAudio(); await openProject(o.dataset.project); return; }
    const d = e.target.closest && e.target.closest('[data-project-del]');
    if (d) {
        const p = findProject(d.dataset.projectDel);
        if (p && confirm('Supprimer le projet « ' + (p.title || 'Sans titre') + ' » de la liste ? (les vidéos déjà publiées restent en ligne)')) { deleteProject(p.id); renderProjectsList(); }
    }
});
// Vidéo finale : fiche du projet + copie sur Cloudflare pour la retrouver plus tard
async function projectFinalReady() {
    if (!state.finalFresh || !state.finalBlob) return;
    state.finalFresh = false;
    const id = ensureProject();
    const dur = (state.timeline || []).reduce((a, t) => a + t.duration, 0);
    updateProject(id, { status: 'done', timeline: state.timeline, duration: dur });
    if (mediaAvailable() && state.backupOn) {
        try { const key = await uploadMedia('final/' + id, state.finalBlob, 'final', (state.theme || 'Vidéo') + ' · ' + new Date().toLocaleDateString('fr-FR')); updateProject(id, { finalKey: key }); }
        catch (e) { log('Sauvegarde de la vidéo finale : ' + e.message); }
    }
}

// ══════════════════════════════════════════════════════════════════
// PUBLICATION (commune : bouton « Publier » et pilote automatique)
// ══════════════════════════════════════════════════════════════════
function getIgToken() { return getJSON(STORAGE.IG_TOKEN); }
async function getIgAccess() {
    const t = getIgToken(); if (!t) return null;
    if (Date.now() > t.exp - 7 * 24 * 3600000) {
        try { const d = await postProxy('/instagram/refresh', { accessToken: t.token }); setJSON(STORAGE.IG_TOKEN, { ...t, token: d.accessToken, exp: Date.now() + (d.expiresIn || 5184000) * 1000 }); }
        catch (e) { if (Date.now() > t.exp) { localStorage.removeItem(STORAGE.IG_TOKEN); updateInstagramStatus(); throw new Error('connexion Instagram expirée, reconnecte-toi'); } }
    }
    return getIgToken();
}
async function verticalBlob(format) {
    if (format === 'final') return state.finalBlob;
    const c = state.exportCache['fmt-vertical'];
    if (c) return c.blob;
    const standalone = !assembling;
    if (state.isRunning) throw new Error('attends la fin de la génération');
    assembling = true; state.stopRequested = false;
    document.getElementById('stop-btn').classList.add('visible');
    await ensureWakeLockActive();
    try {
        const r = await assembleVideo({ label: 'Version verticale 9:16', format: 'portrait' });
        state.exportCache['fmt-vertical'] = { blob: r.blob, name: 'vertical-' + Date.now() + '.' + r.ext };
        return r.blob;
    } finally { if (standalone) { assembling = false; state.stopRequested = false; document.getElementById('stop-btn').classList.remove('visible'); } setStatus(null); setProgress(0); }
}
// opts : { at: Date, youtube, short, tiktok, instagram, caption, ttMode, ttPrivacy, format }
async function doPublish(opts) {
    const at = opts.at || new Date(), later = at.getTime() > Date.now() + 60000;
    const list = getJSON(STORAGE.SCHEDULE, []), done = [], errors = [];
    const title = state.theme || 'Vidéo', caption = (opts.caption || title).trim();
    try {
        if (opts.youtube) {
            const id = await uploadToYouTube({ publishAt: later ? at : null });
            if (id) { list.unshift({ platform: 'youtube', id, at: later ? at.getTime() : Date.now(), title, status: later ? 'scheduled' : 'done' }); done.push('YouTube'); } else errors.push('YouTube');
        }
        let vertical = null, key = null;
        const needVertical = opts.short || opts.tiktok || opts.instagram;
        if (needVertical) vertical = await verticalBlob(opts.format);
        if (opts.short) {
            const id = await uploadToYouTube({ publishAt: later ? at : null, blob: vertical, short: true });
            if (id) { list.unshift({ platform: 'youtube', short: true, id, at: later ? at.getTime() : Date.now(), title: title + ' (Short)', status: later ? 'scheduled' : 'done' }); done.push('YouTube Shorts'); } else errors.push('YouTube Shorts');
        }
        if (opts.tiktok || opts.instagram) {
            setStatus('Envoi de la vidéo sur ton Cloudflare…');
            key = 'post/' + Date.now().toString(36);
            await uploadMedia(key, vertical, 'post', title);
        }
        if (opts.tiktok) {
            try {
                await getTikTokAccess();
                setStatus(later ? 'Programmation sur TikTok…' : 'Publication sur TikTok…');
                const d = await postProxy('/schedule', { platform: 'tiktok', mediaKey: key, at: at.getTime(), title: caption, mode: opts.ttMode || 'direct', privacy: opts.ttPrivacy || 'SELF_ONLY', refreshToken: getTikTokToken().refresh, push: getJSON(STORAGE.PUSH_SUB) || null, deleteMedia: false });
                list.unshift({ platform: 'tiktok', id: d.id, at: at.getTime(), title, status: 'scheduled' });
                const pub = getJSON(STORAGE.TT_PUBLISHED, []);
                pub.unshift({ caption, title, script: state.script || '', hook: state.scenes[0] || '', date: at.getTime() });
                setJSON(STORAGE.TT_PUBLISHED, pub.slice(0, 60));
                done.push('TikTok');
            } catch (e) { errors.push('TikTok (' + e.message + ')'); }
        }
        if (opts.instagram) {
            try {
                const t = await getIgAccess();
                if (!t) throw new Error('non connecté');
                setStatus(later ? 'Programmation sur Instagram…' : 'Publication sur Instagram…');
                const d = await postProxy('/schedule', { platform: 'instagram', mediaKey: key, at: at.getTime(), title: caption, igToken: t.token, igUserId: t.userId, push: getJSON(STORAGE.PUSH_SUB) || null, deleteMedia: false });
                list.unshift({ platform: 'instagram', id: d.id, at: at.getTime(), title, status: 'scheduled' });
                done.push('Instagram');
            } catch (e) { errors.push('Instagram (' + e.message + ')'); }
        }
    } finally {
        setJSON(STORAGE.SCHEDULE, list.slice(0, 60));
        setStatus(null);
    }
    if (done.length && state.projectId) updateProject(state.projectId, { status: later ? 'scheduled' : 'published', plan: { ...(findProject(state.projectId)?.plan || {}), at: at.getTime() }, platforms: done });
    return { done, errors, later, at };
}
async function publishNowOrLater() {
    const btn = document.getElementById('publish-btn');
    if (!state.finalBlob || btn?.dataset.busy) return;
    const atVal = document.getElementById('pub-at').value;
    const at = atVal ? new Date(atVal) : new Date();
    if (atVal && at.getTime() < Date.now() - 60000) { showToast('Cette date est déjà passée', 'warn'); return; }
    const opts = {
        at, youtube: document.getElementById('pub-yt').checked, short: document.getElementById('pub-ys')?.checked, tiktok: document.getElementById('pub-tt').checked,
        instagram: document.getElementById('pub-ig')?.checked, caption: document.getElementById('tt-caption').value.trim(),
        ttMode: document.getElementById('pub-tt-mode').value, ttPrivacy: document.getElementById('pub-tt-privacy').value || 'SELF_ONLY', format: document.getElementById('pub-tt-format').value
    };
    if (!opts.youtube && !opts.short && !opts.tiktok && !opts.instagram) { showToast('Coche au moins une plateforme', 'warn'); return; }
    unlockAudio();
    btn.dataset.busy = '1'; btn.disabled = true; btn.textContent = '⏳ Envoi…';
    try {
        const r = await doPublish(opts);
        if (r.done.length) showToast((r.later ? 'Programmé le ' + at.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) + ' : ' : 'Publié : ') + r.done.join(', ') + ' ✓' + (r.errors.length ? ' · échec : ' + r.errors.join(', ') : ''), r.errors.length ? 'warn' : 'success', 8000);
        else showToast('Publication impossible : ' + r.errors.join(', '), 'error', 8000);
    } catch (e) { showToast('Publication impossible : ' + e.message, 'error', 7000); }
    finally { delete btn.dataset.busy; btn.disabled = false; updatePublishUI(); renderSchedule(); }
}
async function captionFor(theme, lines) {
    if (!getClaudeKey()) return theme;
    try {
        const out = await callClaude({
            system: 'Tu écris les textes de publication TikTok / Instagram de vidéos pédagogiques : une phrase qui donne envie de regarder jusqu\'au bout, puis des hashtags pertinents.',
            prompt: claudeContext() + '\nSujet : ' + theme + '\nScript :\n' + lines.join('\n') + '\n\nDonne "caption" (moins de 150 caractères) et "hashtags" (5 à 8, sans le #).',
            schema: { type: 'object', properties: { caption: { type: 'string' }, hashtags: { type: 'array', items: { type: 'string' } } }, required: ['caption', 'hashtags'], additionalProperties: false }
        });
        return out.caption.trim() + '\n\n' + out.hashtags.map(h => '#' + String(h).replace(/[#\s]+/g, '')).join(' ');
    } catch (e) { return theme; }
}

// ─────────────── Instagram : connexion ───────────────
function updateInstagramStatus() {
    const el = document.getElementById('ig-status'); if (!el) return;
    const t = getIgToken();
    el.textContent = !state.proxyInstagram ? '⚙️ Instagram pas encore configuré sur ton Cloudflare' : t ? '✅ Connecté' + (t.username ? ' (@' + t.username + ')' : '') : 'Non connecté';
    document.getElementById('ig-connect-btn')?.classList.toggle('hidden', !!t);
    document.getElementById('ig-disconnect-btn')?.classList.toggle('hidden', !t);
    if (typeof updatePublishUI === 'function') updatePublishUI();
}
async function connectInstagram() {
    let cfg = {};
    try { cfg = await (await fetch(getProxyUrl() + '/instagram/config')).json(); } catch (e) {}
    if (!cfg.ready) { showToast('Instagram n\'est pas encore configuré sur ton serveur Cloudflare (voir le guide d\'installation)', 'warn', 7000); return; }
    const st = 'ig' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    setLS(STORAGE.IG_STATE, st);
    window.location.href = 'https://www.instagram.com/oauth/authorize?enable_fb_login=0&force_authentication=1&client_id=' + encodeURIComponent(cfg.appId) +
        '&redirect_uri=' + encodeURIComponent(window.location.origin + window.location.pathname) + '&response_type=code&scope=' + encodeURIComponent('instagram_business_basic,instagram_business_content_publish') + '&state=' + st;
}
async function checkInstagramCallback() {
    const q = new URLSearchParams(window.location.search);
    const code = q.get('code'), st = q.get('state');
    if (!st || st !== getLS(STORAGE.IG_STATE)) return;
    window.history.replaceState({}, '', window.location.pathname);
    localStorage.removeItem(STORAGE.IG_STATE);
    if (!code) { showToast('Connexion Instagram annulée', 'warn'); return; }
    try {
        const d = await postProxy('/instagram/token', { code, redirectUri: window.location.origin + window.location.pathname });
        setJSON(STORAGE.IG_TOKEN, { token: d.accessToken, exp: Date.now() + (d.expiresIn || 5184000) * 1000, userId: d.userId, username: d.username });
        showToast('Connecté à Instagram ✓', 'success');
    } catch (e) { showToast('Connexion Instagram impossible : ' + e.message, 'error', 7000); }
    updateInstagramStatus();
}

// ══════════════════════════════════════════════════════════════════
// PILOTE AUTOMATIQUE : Claude prépare la semaine, le serveur génère, tu montes tout en un appui
// ══════════════════════════════════════════════════════════════════
const DAY_NAMES = ['Di', 'Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa'];
function autopilotSettings() {
    return { perWeek: 3, days: [1, 3, 5], hour: '18:00', format: 'minute', youtube: true, short: false, tiktok: true, instagram: false, ...getJSON(STORAGE.AUTOPILOT, {}) };
}
function saveAutopilotSettings() {
    const days = [...document.querySelectorAll('[data-ap-day][aria-pressed="true"]')].map(b => +b.dataset.apDay);
    const s = {
        perWeek: +document.getElementById('ap-count').value || 3, days: days.length ? days : [1, 3, 5], hour: document.getElementById('ap-hour').value || '18:00',
        format: document.getElementById('ap-format').value, youtube: document.getElementById('ap-yt').checked, short: document.getElementById('ap-ys').checked,
        tiktok: document.getElementById('ap-tt').checked, instagram: document.getElementById('ap-ig').checked
    };
    setJSON(STORAGE.AUTOPILOT, s);
    return s;
}
// Prochains créneaux de publication (à partir de demain), selon les jours et l'heure choisis
function nextSlots(n, s) {
    const [h, m] = (s.hour || '18:00').split(':').map(Number);
    const taken = new Set(getProjects().filter(p => p.plan?.at && !['published'].includes(p.status)).map(p => p.plan.at));
    const out = [], d = new Date(); d.setDate(d.getDate() + 1); d.setHours(h, m || 0, 0, 0);
    for (let i = 0; out.length < n && i < 60; i++, d.setDate(d.getDate() + 1)) {
        if (s.days.includes(d.getDay()) && !taken.has(d.getTime())) out.push(d.getTime());
    }
    return out;
}
function renderAutopilot() {
    const s = autopilotSettings();
    document.getElementById('ap-count').value = String(s.perWeek);
    document.getElementById('ap-hour').value = s.hour;
    document.getElementById('ap-format').value = s.format;
    ['yt', 'ys', 'tt', 'ig'].forEach(k => { document.getElementById('ap-' + k).checked = !!s[{ yt: 'youtube', ys: 'short', tt: 'tiktok', ig: 'instagram' }[k]]; });
    document.getElementById('ap-days').innerHTML = [1, 2, 3, 4, 5, 6, 0].map(d => '<button type="button" class="chip" data-ap-day="' + d + '" aria-pressed="' + s.days.includes(d) + '">' + DAY_NAMES[d] + '</button>').join('');
    renderAutopilotPlan();
    renderAutopilotProjects();
}
function renderAutopilotPlan() {
    const box = document.getElementById('ap-plan'); if (!box) return;
    const plan = state.apPlan;
    if (!plan || !plan.length) { box.innerHTML = ''; document.getElementById('ap-launch-btn').classList.add('hidden'); return; }
    box.innerHTML = plan.map((v, i) => '<div class="hcard"><div class="row"><div class="grow t">📅 ' + new Date(v.at).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) + '</div><button type="button" class="btn-secondary" style="width:auto;margin:0;padding:0.4rem 0.7rem" data-ap-del="' + i + '">Retirer</button></div>' +
        '<input class="text-input" data-ap-field="title" data-i="' + i + '" value="' + esc(v.title) + '">' +
        '<div class="hmuted">' + esc(v.why || '') + '</div>' +
        '<textarea class="sb-text" data-ap-field="script" data-i="' + i + '" style="min-height:140px">' + esc(v.script) + '</textarea></div>').join('');
    const btn = document.getElementById('ap-launch-btn');
    btn.classList.remove('hidden'); btn.textContent = '🚀 Lancer la génération des ' + plan.length + ' vidéo' + (plan.length > 1 ? 's' : '');
}
function renderAutopilotProjects() {
    const box = document.getElementById('ap-projects'); if (!box) return;
    const list = getProjects().filter(p => p.auto && !['published'].includes(p.status));
    const ready = list.filter(p => p.status === 'ready').length;
    box.innerHTML = list.length ? '<p class="label">Semaine en cours</p><div class="list">' + list.map(projectRow).join('') + '</div>' : '';
    const b = document.getElementById('ap-finish-btn');
    b.classList.toggle('hidden', !ready);
    b.textContent = '🎞️ Tout monter et programmer (' + ready + ' vidéo' + (ready > 1 ? 's' : '') + ' prête' + (ready > 1 ? 's' : '') + ')';
}
async function prepareWeek() {
    if (!getClaudeKey()) { showToast('Le pilote automatique demande la clé Claude', 'error'); return; }
    const s = saveAutopilotSettings();
    const f = SCRIPT_FORMATS[s.format] || SCRIPT_FORMATS.minute;
    const done = [...new Set([...getProjects().map(p => p.title), ...getJSON(STORAGE.HISTORY, []).map(h => h.theme)].filter(Boolean))].slice(0, 40);
    const channel = (document.getElementById('theme-input').value || '').trim();
    setStatus('Claude prépare ta semaine…');
    const btn = document.getElementById('ap-prepare-btn'); btn.disabled = true;
    try {
        const out = await callClaude({
            system: 'Tu es le rédacteur en chef d\'une chaîne de vidéos pédagogiques animées (un personnage cartoon explique face caméra). Tu proposes des sujets variés qui intéressent le public et donnent envie de regarder jusqu\'au bout. ' + SPEECH_RULES,
            prompt: claudeContext() + '\n' + scriptExtras() + 'Propose ' + s.perWeek + ' vidéo' + (s.perWeek > 1 ? 's' : '') + ' pour la semaine, sur des sujets DIFFÉRENTS de ceux déjà traités' + (channel ? ' et dans la thématique « ' + channel + ' »' : '') + '.\n' +
                'Pour chacune : "title" (sujet court), "why" (en une phrase, pourquoi ce sujet va plaire), "lines" (le script : ' + f.lines + ' lignes, format ' + f.label + ' ; règles : ' + f.rules + ' ; chaque ligne se dit en 6 secondes environ).\n\nSujets déjà traités :\n' + (done.join('\n') || '(aucun)'),
            schema: { type: 'object', properties: { videos: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, why: { type: 'string' }, lines: { type: 'array', items: { type: 'string' } } }, required: ['title', 'why', 'lines'], additionalProperties: false } } }, required: ['videos'], additionalProperties: false }
        });
        const slots = nextSlots(out.videos.length, s);
        state.apPlan = out.videos.slice(0, slots.length).map((v, i) => ({ title: v.title.trim(), why: v.why, script: v.lines.map(l => String(l).trim()).filter(Boolean).join('\n'), at: slots[i] }));
        renderAutopilotPlan();
        showToast('Semaine prête : relis, modifie si besoin, puis lance la génération', 'success', 5000);
    } catch (e) { showToast('Préparation impossible : ' + e.message, 'error', 6000); }
    finally { setStatus(null); btn.disabled = false; }
}
async function launchWeek() {
    const plan = state.apPlan || [];
    if (!plan.length) return;
    if (!state.images.length) { showToast('Ajoute d\'abord la photo du personnage (Réglages → Ma chaîne)', 'error'); return; }
    if (!getAgnesKey()) { showToast('Ajoute la clé Agnes', 'error'); return; }
    if (!(getProxyUrl() && state.proxyJobs)) { showToast('Le pilote automatique demande ton serveur Cloudflare', 'error'); return; }
    const s = saveAutopilotSettings();
    const btn = document.getElementById('ap-launch-btn'); btn.disabled = true;
    let sent = 0;
    try {
        for (let i = 0; i < plan.length; i++) {
            const v = plan[i];
            setStatus('Envoi de la vidéo ' + (i + 1) + '/' + plan.length + ' au serveur…');
            const scenes = splitScriptIntoScenes(v.script);
            const jobId = await sendBackgroundJob(scenes, v.title, v.script, false);
            const list = getProjects();
            list.unshift({ id: newProjectId(), createdAt: Date.now(), updatedAt: Date.now(), status: 'generating', title: v.title, script: v.script, style: state.selectedStyle, jobId, auto: true,
                plan: { at: v.at, youtube: s.youtube, short: s.short, tiktok: s.tiktok, instagram: s.instagram } });
            setProjects(list);
            sent++;
        }
        state.apPlan = null;
        showToast(sent + ' vidéo' + (sent > 1 ? 's' : '') + ' en génération ✓ Tu peux éteindre ton téléphone. Reviens appuyer sur « Tout monter » quand elles sont prêtes.', 'success', 8000);
    } catch (e) { showToast('Envoi interrompu après ' + sent + ' vidéo(s) : ' + e.message, 'error', 7000); state.apPlan = plan.slice(sent); }
    finally { btn.disabled = false; setStatus(null); renderAutopilotPlan(); renderAutopilotProjects(); }
}
// Monte chaque vidéo prête puis la programme au créneau prévu
async function finishWeek() {
    const ready = getProjects().filter(p => p.auto && p.status === 'ready');
    if (!ready.length || state.isRunning || assembling) return;
    unlockAudio();
    const report = [];
    state.autoRun = true;
    try {
        for (let i = 0; i < ready.length; i++) {
            const p = ready[i];
            showToast('Vidéo ' + (i + 1) + '/' + ready.length + ' : ' + p.title, 'success', 3000);
            if (!(await openProject(p.id, false))) { report.push('❌ ' + p.title); continue; }
            const ok = await runAssembly();
            if (!ok) { report.push('❌ ' + p.title + ' (montage)'); if (state.stopRequested) break; continue; }
            await projectFinalReady();
            const plan = p.plan || {};
            const at = new Date(Math.max(plan.at || 0, Date.now() + 10 * 60000));
            const r = await doPublish({
                at, youtube: plan.youtube && !!getYouTubeToken(), short: plan.short && !!getYouTubeToken(), tiktok: plan.tiktok && !!getTikTokToken() && tiktokReady(),
                instagram: plan.instagram && !!getIgToken() && state.proxyInstagram, caption: await captionFor(p.title, state.scenes), ttMode: 'direct', ttPrivacy: 'PUBLIC_TO_EVERYONE'
            });
            report.push((r.done.length ? '✅ ' : '🎞️ ') + p.title + (r.done.length ? ' → ' + r.done.join(', ') : ' (montée, à publier)') + (r.errors.length ? ' · échec : ' + r.errors.join(', ') : ''));
        }
    } finally { state.autoRun = false; renderAutopilotProjects(); }
    const box = document.getElementById('ap-report');
    if (box) box.innerHTML = '<div class="hcard"><div class="t">Bilan</div>' + report.map(l => '<div class="hmuted">' + esc(l) + '</div>').join('') +
        (!getYouTubeToken() ? '<div class="hmuted">⚠️ YouTube non connecté (ou connexion expirée) : reconnecte-toi dans Réglages → Comptes pour publier automatiquement.</div>' : '') + '</div>';
    navOpen('home', 'autopilot');
}
document.addEventListener('click', e => {
    const day = e.target.closest && e.target.closest('[data-ap-day]');
    if (day) { day.setAttribute('aria-pressed', day.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); saveAutopilotSettings(); return; }
    const del = e.target.closest && e.target.closest('[data-ap-del]');
    if (del && state.apPlan) { state.apPlan.splice(+del.dataset.apDel, 1); renderAutopilotPlan(); }
});
document.addEventListener('input', e => {
    const f = e.target.dataset?.apField; if (!f || !state.apPlan) return;
    state.apPlan[+e.target.dataset.i][f] = e.target.value;
});

// ══════════════════════════════════════════════════════════════════
// COMMENTAIRES YOUTUBE : Claude propose une réponse, tu valides
// ══════════════════════════════════════════════════════════════════
async function ytApi(path, opts = {}) {
    const token = getYouTubeToken();
    if (!token) throw new Error('reconnecte-toi à YouTube (Réglages → Comptes)');
    const r = await fetch('https://www.googleapis.com/youtube/v3/' + path, { ...opts, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error?.message || ('YouTube ' + r.status));
    return d;
}
async function loadComments() {
    const box = document.getElementById('comments-box'); if (!box) return;
    box.innerHTML = '⏳ Chargement des commentaires…';
    try {
        const ch = await ytApi('channels?part=id,snippet&mine=true');
        const channelId = ch.items?.[0]?.id;
        if (!channelId) throw new Error('chaîne introuvable');
        const d = await ytApi('commentThreads?part=snippet&maxResults=40&order=time&allThreadsRelatedToChannelId=' + channelId);
        state.comments = (d.items || []).filter(t => !t.snippet.totalReplyCount && t.snippet.topLevelComment?.snippet?.authorChannelId?.value !== channelId && t.snippet.canReply !== false)
            .map(t => ({ id: t.id, videoId: t.snippet.videoId, author: t.snippet.topLevelComment.snippet.authorDisplayName, text: t.snippet.topLevelComment.snippet.textOriginal || t.snippet.topLevelComment.snippet.textDisplay, reply: '' }));
        renderComments();
        if (state.comments.length && getClaudeKey()) await draftReplies();
    } catch (e) { box.innerHTML = '<div class="hmuted">Commentaires indisponibles : ' + esc(e.message) + '</div>'; }
}
function renderComments() {
    const box = document.getElementById('comments-box'); if (!box) return;
    const list = state.comments || [];
    box.innerHTML = list.length ? list.map((c, i) => '<div class="hcard" data-comment="' + i + '"><div class="t">' + esc(c.author) + '</div><div class="hmuted" style="white-space:pre-wrap">' + esc(c.text) + '</div>' +
        '<textarea class="sb-text" data-comment-reply="' + i + '" placeholder="Ta réponse">' + esc(c.reply) + '</textarea>' +
        '<div class="btn-row"><button type="button" class="btn-primary" data-comment-send="' + i + '">Répondre</button><button type="button" class="btn-secondary" data-comment-skip="' + i + '">Ignorer</button></div></div>').join('')
        : '<div class="hmuted">✅ Aucun commentaire sans réponse.</div>';
}
async function draftReplies() {
    const list = state.comments || [];
    if (!list.length) return;
    setStatus('Claude prépare les réponses…');
    try {
        const titles = Object.fromEntries(getJSON(STORAGE.YT_PUBLISHED, []).map(v => [v.id, v.title]));
        const out = await callClaude({
            system: 'Tu réponds aux commentaires YouTube d\'une chaîne de vidéos pédagogiques animées, au nom du personnage de la chaîne : ton chaleureux, drôle et bienveillant, réponses courtes (1 à 2 phrases), dans la langue du commentaire. Tu remercies, tu réponds précisément aux questions (sans inventer), et tu invites parfois à voir une autre vidéo ou à s\'abonner. Jamais de réponse pour un commentaire haineux : réponds alors "".',
            prompt: JSON.stringify(list.map((c, i) => ({ i, video: titles[c.videoId] || '', comment: c.text }))) + '\n\nDonne "replies" : pour chaque commentaire, { "i", "reply" }.',
            schema: { type: 'object', properties: { replies: { type: 'array', items: { type: 'object', properties: { i: { type: 'integer' }, reply: { type: 'string' } }, required: ['i', 'reply'], additionalProperties: false } } }, required: ['replies'], additionalProperties: false }
        });
        (out.replies || []).forEach(r => { if (list[r.i] && !list[r.i].reply) list[r.i].reply = r.reply; });
        renderComments();
    } catch (e) { showToast('Réponses de Claude indisponibles : ' + e.message, 'warn'); }
    finally { setStatus(null); }
}
document.addEventListener('input', e => { const i = e.target.dataset?.commentReply; if (i !== undefined && state.comments?.[+i]) state.comments[+i].reply = e.target.value; });
document.addEventListener('click', async e => {
    const s = e.target.closest && e.target.closest('[data-comment-send]');
    const k = e.target.closest && e.target.closest('[data-comment-skip]');
    if (!s && !k) return;
    const i = +(s || k).dataset[s ? 'commentSend' : 'commentSkip'], c = state.comments?.[i]; if (!c) return;
    if (s) {
        if (!c.reply.trim()) { showToast('Écris une réponse', 'warn'); return; }
        s.disabled = true; s.textContent = '⏳';
        try { await ytApi('comments?part=snippet', { method: 'POST', body: JSON.stringify({ snippet: { parentId: c.id, textOriginal: c.reply.trim() } }) }); showToast('Réponse publiée ✓', 'success'); }
        catch (err) { showToast('Réponse impossible : ' + err.message, 'error'); s.disabled = false; s.textContent = 'Répondre'; return; }
    }
    state.comments.splice(i, 1); renderComments();
});

// ══════════════════════════════════════════════════════════════════
// FICHE PÉDAGOGIQUE PDF (résumé, vocabulaire, quiz, corrigé)
// ══════════════════════════════════════════════════════════════════
function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('bibliothèque PDF injoignable')); document.head.appendChild(s); });
}
const pdfText = s => String(s || '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...').replace(/[–—]/g, '-').replace(/[^\x00-\xFFŒœ€]/g, '').trim();
async function buildPedagoSheet() {
    if (!getClaudeKey()) throw new Error('la fiche demande la clé Claude');
    if (!state.scenes.length) throw new Error('aucun script');
    setStatus('Claude rédige la fiche pédagogique…');
    const out = await callClaude({
        system: 'Tu es enseignant. Tu rédiges des fiches pédagogiques claires et justes à partir du script d\'une vidéo éducative, pour les élèves et leurs parents ou professeurs.',
        prompt: claudeContext() + '\nSujet : ' + (state.theme || '') + '\nScript de la vidéo :\n' + state.scenes.join('\n') +
            '\n\nDonne : "title", "objectives" (3 objectifs « Je sais… »), "summary" (résumé de 5 à 8 phrases), "vocabulary" (4 à 6 mots importants avec une définition simple), "quiz" (5 questions à 3 choix, "answer" = numéro du bon choix, de 0 à 2, et "explanation" en une phrase), "activity" (une petite activité ou expérience à faire à la maison ou en classe).',
        schema: { type: 'object', properties: {
            title: { type: 'string' }, objectives: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' },
            vocabulary: { type: 'array', items: { type: 'object', properties: { word: { type: 'string' }, definition: { type: 'string' } }, required: ['word', 'definition'], additionalProperties: false } },
            quiz: { type: 'array', items: { type: 'object', properties: { question: { type: 'string' }, choices: { type: 'array', items: { type: 'string' } }, answer: { type: 'integer' }, explanation: { type: 'string' } }, required: ['question', 'choices', 'answer', 'explanation'], additionalProperties: false } },
            activity: { type: 'string' } }, required: ['title', 'objectives', 'summary', 'vocabulary', 'quiz', 'activity'], additionalProperties: false }
    });
    setStatus('Mise en page du PDF…');
    if (!window.jspdf) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, M = 16, CW = W - 2 * M;
    const brand = (state.brandColor || '#ffd23f').replace('#', '');
    const rgb = [0, 2, 4].map(i => parseInt(brand.slice(i, i + 2), 16) || 0);
    let y = 0;
    const need = h => { if (y + h > 282) { doc.addPage(); y = 18; } };
    const heading = t => { need(14); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(29, 36, 51); doc.text(pdfText(t), M, y); doc.setDrawColor(...rgb); doc.setLineWidth(1.2); doc.line(M, y + 2, M + 24, y + 2); y += 9; };
    const para = (t, size = 11, style = 'normal', indent = 0) => {
        doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(40, 44, 52);
        doc.splitTextToSize(pdfText(t), CW - indent).forEach(line => { need(6); doc.text(line, M + indent, y); y += size * 0.45; });
        y += 2;
    };
    // bandeau
    doc.setFillColor(...rgb); doc.rect(0, 0, W, 34, 'F');
    doc.setTextColor(29, 36, 51); doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
    doc.text(doc.splitTextToSize(pdfText(out.title || state.theme), CW).slice(0, 2), M, 16);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text('Fiche pedagogique · ' + pdfText(state.theme || '') + (state.lastYouTubeId ? ' · youtu.be/' + state.lastYouTubeId : ''), M, 29);
    y = 46;
    heading('Objectifs'); out.objectives.forEach(o => para('• ' + o));
    heading('Ce qu\'il faut retenir'); para(out.summary);
    heading('Vocabulaire'); out.vocabulary.forEach(v => { para(v.word, 11, 'bold'); y -= 2; para(v.definition, 10.5, 'normal', 4); });
    heading('Quiz'); out.quiz.forEach((q, i) => { para((i + 1) + '. ' + q.question, 11, 'bold'); q.choices.forEach((c, j) => para(String.fromCharCode(97 + j) + ') ' + c, 10.5, 'normal', 5)); y += 1; });
    heading('Activité'); para(out.activity);
    doc.addPage(); y = 18;
    heading('Corrigé du quiz');
    out.quiz.forEach((q, i) => para((i + 1) + '. ' + String.fromCharCode(97 + Math.max(0, Math.min(q.choices.length - 1, q.answer))) + ') ' + (q.choices[q.answer] || '') + ' - ' + q.explanation));
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(140); doc.text('Cartoon Instructeur · page ' + i + '/' + n, W / 2, 292, { align: 'center' }); }
    setStatus(null);
    return { blob: doc.output('blob'), name: 'fiche-' + (state.theme || 'video').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').slice(0, 40) + '.pdf' };
}
function downloadPedagoSheet() {
    return prepareThenSave('pdf-sheet-btn', 'pdf-sheet', async () => { try { return await buildPedagoSheet(); } finally { setStatus(null); } });
}
