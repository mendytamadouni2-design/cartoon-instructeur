// Cartoon Instructeur · Navigation : onglets, réglages, assistant de création
// (scripts classiques chargés dans l'ordre par index.html : ils partagent les mêmes variables globales)

// ══════════════════════════════════════════════════════════════════
// NAVIGATION : onglets, pages de réglages, assistant de création en 5 étapes
// ══════════════════════════════════════════════════════════════════
const NAV = { tab: 'home', stacks: { home: ['home'], create: ['create'], videos: ['videos'], stats: ['stats'], settings: ['settings'] }, step: 1 };
const WIZ_STEPS = ['Script', 'Storyboard', 'Génération', 'Montage', 'Publier'];
function navRender() {
    const stack = NAV.stacks[NAV.tab], id = stack[stack.length - 1];
    document.querySelectorAll('[data-screen]').forEach(s => { s.hidden = s.dataset.screen !== id; });
    const scr = document.querySelector('[data-screen="' + id + '"]');
    document.getElementById('screen-title').textContent = id === 'video' ? (state.theme || scr.dataset.title) : scr.dataset.title;
    document.getElementById('nav-back').hidden = stack.length < 2;
    document.querySelectorAll('[data-tab]').forEach(b => { if (b.dataset.tab === NAV.tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    document.getElementById('wizard-foot').hidden = id !== 'create';
    if (id === 'create') renderWizard();
    else if (id === 'home') renderHome();
    else if (id === 'videos') { renderVideosTab(); renderProjectsList(); }
    else if (id === 'autopilot') renderAutopilot();
    else if (id === 'stats') renderCosts();
    else if (id === 'settings') renderSettingsList();
    else if (id === 'video') { syncFicheVideo(); const pb = document.getElementById('pdf-sheet-btn'); if (pb && !state.exportCache['pdf-sheet']) pb.textContent = '📄 Créer la fiche pédagogique (PDF)'; }
}
function navTab(t) {
    if (t === NAV.tab && NAV.stacks[t].length > 1) NAV.stacks[t] = [NAV.stacks[t][0]];
    NAV.tab = t; navRender(); window.scrollTo(0, 0);
}
function navPush(id) { NAV.stacks[NAV.tab].push(id); navRender(); window.scrollTo(0, 0); }
function navBack() { const st = NAV.stacks[NAV.tab]; if (st.length > 1) st.pop(); navRender(); window.scrollTo(0, 0); }
// Ouvre une page précise (ex. navOpen('settings', 'set-keys'))
function navOpen(tab, page) { NAV.tab = tab; NAV.stacks[tab] = page && page !== tab ? [tab, page] : [tab]; navRender(); window.scrollTo(0, 0); }
function wizardGo(n) {
    NAV.step = Math.max(1, Math.min(5, n));
    NAV.tab = 'create'; NAV.stacks.create = ['create'];
    navRender(); window.scrollTo(0, 0);
}
function renderWizard() {
    const st = NAV.step;
    document.getElementById('stepper').innerHTML = WIZ_STEPS.map((s, i) => '<button type="button" class="step ' + (i + 1 < st ? 'done' : i + 1 === st ? 'now' : '') + '" data-step-go="' + (i + 1) + '"><i></i>' + s + '</button>').join('');
    document.querySelectorAll('.wstep').forEach(d => { d.hidden = +d.dataset.step !== st; });
    const prev = document.getElementById('wiz-prev'), next = document.getElementById('wiz-next');
    prev.hidden = st === 1;
    const sbShown = !document.getElementById('storyboard').classList.contains('hidden');
    next.textContent = ['Suivant : storyboard', sbShown && !storyboardValid() ? '✅ Valider le storyboard' : 'Suivant : génération', 'Suivant : montage', 'Suivant : publier', 'Terminé'][st - 1];
    if (st === 1) renderCharChip();
    if (st === 2) {
        const e = document.getElementById('sb-empty');
        e.textContent = state.storyboarding ? '⏳ Claude prépare la mise en scène et les dessins…'
            : sbShown ? '' : !getClaudeKey() ? 'Le storyboard demande la clé Claude : la mise en scène sera automatique. Passe à la génération.'
            : 'Appuie sur « Suivant » à l\'étape Script pour préparer le storyboard, ou passe directement à la génération.';
        e.hidden = !e.textContent;
    }
    if (st === 3) updateEstimate();
    if (st === 4) {
        const has = state.queue.some(q => q.status === 'done'), fin = !!state.finalBlob;
        const e = document.getElementById('montage-empty');
        e.textContent = fin ? '✅ Vidéo prête. Tu peux encore retoucher le montage puis la recréer.' : has ? 'Vérifie avec l\'aperçu, retouche si besoin, puis crée la vidéo finale.' : 'Aucune scène prête pour l\'instant : lance d\'abord la génération (étape 3).';
        document.getElementById('goto-fiche-btn').classList.toggle('hidden', !fin);
    }
    if (st === 5) {
        const e = document.getElementById('publish-empty');
        e.textContent = state.finalBlob ? '' : 'Crée d\'abord la vidéo finale (étape 4).';
        e.hidden = !e.textContent;
        if (state.finalBlob) updatePublishUI();
    }
}
async function wizardNext() {
    const st = NAV.step;
    if (st === 1) {
        if (!state.scenes.length) { showToast('Écris d\'abord ton script (une phrase par scène)', 'warn'); return; }
        ensureProject();
        if (storyboardValid()) { wizardGo(3); return; }
        if (state.storyboardOn && getClaudeKey()) { wizardGo(2); unlockAudio(); await prepareStoryboardFlow(); renderWizard(); return; }
        wizardGo(3); return;
    }
    if (st === 2) {
        const sbShown = !document.getElementById('storyboard').classList.contains('hidden');
        if (sbShown && !storyboardValid()) { approveStoryboard(); return; }
        wizardGo(3); return;
    }
    if (st < 5) { wizardGo(st + 1); return; }
    navOpen('videos', state.finalBlob ? 'video' : 'videos');
}
function approveStoryboard() {
    unlockAudio();
    state.storyboardApproved = true; state.storyboardSig = currentScriptSignature();
    showToast('Storyboard validé ✓ Choisis où générer, puis lance la génération', 'success', 4000);
    wizardGo(3);
}
function renderCharChip() {
    const box = document.getElementById('char-chip'); if (!box) return;
    const img = state.images[0];
    box.innerHTML = img
        ? '<div class="char-chip"><img src="' + (img.thumbnail || img.dataUri) + '" alt=""><div class="grow"><b>Personnage</b><br><span class="hmuted">' + (state.poses.length ? state.poses.length + ' pose' + (state.poses.length > 1 ? 's' : '') + ' en plus' : 'Photo principale') + '</span></div><button type="button" data-open="settings:set-brand">Changer</button></div>'
        : '<div class="char-chip missing"><div class="grow"><b>Ajoute la photo de ton personnage</b><br><span class="hmuted">Obligatoire pour générer (une seule fois, elle est gardée).</span></div><button type="button" data-open="settings:set-brand">Ajouter</button></div>';
}

// ─────────────── Accueil ───────────────
function renderHome() {
    const setup = document.getElementById('home-setup'), live = document.getElementById('home-live');
    const last = document.getElementById('home-last'), costs = document.getElementById('home-costs');
    if (!setup) return;
    const missing = [];
    if (!getAgnesKey()) missing.push(['🔑 Clé Agnes (obligatoire)', 'settings:set-keys']);
    if (!state.images.length) missing.push(['👤 Photo du personnage (obligatoire)', 'settings:set-brand']);
    if (!getClaudeKey()) missing.push(['🤖 Clé Claude (recommandée)', 'settings:set-keys']);
    setup.innerHTML = missing.length ? '<div class="hcard"><div class="t">Pour commencer</div>' + missing.map(([l, t]) => '<button type="button" class="btn-secondary" data-open="' + t + '">' + l + '</button>').join('') + '</div>' : '';
    // En cours
    const cards = [];
    const bg = document.getElementById('bg-panel');
    if (bg && !bg.classList.contains('hidden')) {
        const ready = !document.getElementById('bg-finish-btn').classList.contains('hidden');
        cards.push('<div class="hcard"><div class="row"><div class="grow t">' + esc(document.getElementById('bg-title').textContent) + '</div>' + (ready ? '<span class="pill ok">Scènes prêtes</span>' : '') + '</div>' +
            '<div class="hmuted">' + esc(document.getElementById('bg-text').textContent) + '</div>' +
            (ready ? '<button type="button" class="btn-primary" id="home-finish-btn">🎞️ Terminer la vidéo</button>' : '<button type="button" class="btn-secondary" data-wizard="3">Voir l\'avancement</button>') + '</div>');
    } else if (state.isRunning) {
        cards.push('<div class="hcard"><div class="t">⏳ Génération en cours sur le téléphone</div><div class="hmuted">' + state.completed + '/' + state.queue.length + ' scènes prêtes · garde l\'appli ouverte</div><button type="button" class="btn-secondary" data-wizard="3">Voir l\'avancement</button></div>');
    } else {
        const done = state.queue.filter(q => q.status === 'done').length;
        if (done && !state.finalBlob) cards.push('<div class="hcard"><div class="row"><div class="grow t">' + esc(state.theme || 'Projet en cours') + '</div><span class="pill ok">' + done + ' scènes prêtes</span></div><div class="hmuted">Il ne reste que le montage (1 à 2 min, appli ouverte).</div><button type="button" class="btn-primary" data-wizard="4">🎞️ Terminer la vidéo</button></div>');
    }
    refreshProjects().then(() => {});
    const others = getProjects().filter(p => p.id !== state.projectId && ['ready', 'generating'].includes(p.status));
    const autoReady = others.filter(p => p.auto && p.status === 'ready').length;
    if (autoReady) cards.push('<div class="hcard"><div class="row"><div class="grow t">🤖 ' + autoReady + ' vidéo' + (autoReady > 1 ? 's' : '') + ' du pilote prête' + (autoReady > 1 ? 's' : '') + '</div></div><button type="button" class="btn-primary" data-push="autopilot">🎞️ Tout monter et programmer</button></div>');
    others.filter(p => !(p.auto && p.status === 'ready')).slice(0, 4).forEach(p => cards.push('<div class="hcard"><div class="row"><div class="grow t">' + esc(p.title || 'Sans titre') + '</div><span class="pill ' + (p.status === 'ready' ? 'ok' : '') + '">' + (PROJECT_STATUS[p.status] || [p.status])[0] + '</span></div>' + (p.status === 'ready' ? '<button type="button" class="btn-primary" data-project="' + p.id + '">🎞️ Terminer la vidéo</button>' : '<div class="hmuted">' + esc(p.note || 'Génération sur ton serveur') + (p.plan?.at ? ' · prévue le ' + new Date(p.plan.at).toLocaleDateString('fr-FR') : '') + '</div>') + '</div>'));
    live.innerHTML = cards.length ? '<p class="label">En cours</p>' + cards.join('') : '';
    const aps = document.getElementById('ap-home-sub');
    if (aps) { const n = getProjects().filter(p => p.auto && !['published', 'failed'].includes(p.status)).length; aps.textContent = n ? n + ' vidéo' + (n > 1 ? 's' : '') + ' au programme' : 'Claude prépare ta semaine de vidéos'; }
    // Dernière vidéo
    const h = getJSON(STORAGE.HISTORY, [])[0];
    last.innerHTML = state.finalBlob
        ? '<p class="label">Dernière vidéo</p><button type="button" class="list-item hcard" data-open="videos:video" style="flex-direction:row"><span class="ico">🎬</span><span class="grow"><b>' + esc(state.theme || 'Ma vidéo') + '</b><small>Prête · formats, versions et publication</small></span><span class="chev">›</span></button>'
        : h ? '<p class="label">Dernière vidéo</p><button type="button" class="list-item hcard" data-open="videos:videos" style="flex-direction:row"><span class="ico">🎬</span><span class="grow"><b>' + esc(h.theme || 'Sans titre') + '</b><small>' + new Date(h.date).toLocaleDateString('fr-FR') + (h.duration ? ' · ' + esc(h.duration) : '') + '</small></span><span class="chev">›</span></button>' : '';
    const c = getJSON(STORAGE.COSTS, { months: {} }), m = c.months?.[new Date().toISOString().slice(0, 7)] || {};
    const total = Object.values(m).reduce((a, b) => a + (+b || 0), 0);
    costs.innerHTML = '<div class="hcard"><div class="row"><div class="grow"><p class="label" style="margin:0 0 2px">Dépenses du mois</p><div class="money">' + total.toFixed(2).replace('.', ',') + ' €</div></div><button type="button" class="btn-secondary" style="width:auto;margin:0;padding:0.6rem 0.9rem" data-open="stats:stats">Détail</button></div></div>';
}
// ─────────────── Mes vidéos ───────────────
function renderVideosTab() {
    const box = document.getElementById('videos-current'); if (!box) return;
    box.innerHTML = state.finalBlob
        ? '<button type="button" class="list-item hcard" data-open="videos:video" style="flex-direction:row"><span class="ico">🎬</span><span class="grow"><b>' + esc(state.theme || 'Ma vidéo') + '</b><small>Vidéo actuelle · enregistrer, formats, versions</small></span><span class="pill ok">Prête</span><span class="chev">›</span></button>'
        : '<div class="hcard"><div class="hmuted">Aucune vidéo terminée dans cette session. Les vidéos sauvegardées sur ton Cloudflare sont ci-dessous.</div></div>';
    renderLibrary();
}
function syncFicheVideo() {
    const v = document.getElementById('fiche-video');
    if (v && state.finalVideoUrl && v.src !== state.finalVideoUrl) v.src = state.finalVideoUrl;
}
function onFinalReady() {
    syncFicheVideo();
    projectFinalReady();
    if (NAV.tab === 'create' && NAV.step < 4) wizardGo(4);
    else if (NAV.tab === 'create') renderWizard();
}
// ─────────────── Réglages ───────────────
function renderSettingsList() {
    const k = document.getElementById('keys-pill'), b = document.getElementById('brand-pill');
    if (k) { const ok = getAgnesKey() && getProxyUrl(); k.textContent = ok ? 'OK' : 'À configurer'; k.className = 'pill ' + (ok ? 'ok' : 'warn'); }
    if (b) { b.textContent = state.images.length ? '' : 'Photo manquante'; b.className = 'pill warn'; }
}
// Photo principale gardée sur le téléphone (plus besoin de la remettre à chaque fois)
async function saveMainImages() {
    try { await idbPut('mainImages', state.images.map(i => ({ id: i.id, dataUri: i.dataUri, thumbnail: i.thumbnail }))); } catch (e) {}
}
async function loadMainImages() {
    try {
        const list = await idbGet('mainImages');
        if (Array.isArray(list) && list.length && !state.images.length) { state.images = list; renderImages(); updateGenerateBtn(); }
    } catch (e) {}
    if (NAV.tab === 'home') renderHome();
}

document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('button'); if (!b) return;
    if (b.dataset.tab) { navTab(b.dataset.tab); return; }
    if (b.id === 'nav-back') { navBack(); return; }
    if (b.dataset.push) { navPush(b.dataset.push); return; }
    if (b.dataset.open) { const [t, p] = b.dataset.open.split(':'); navOpen(t, p); return; }
    if (b.dataset.wizard) { wizardGo(+b.dataset.wizard); return; }
    if (b.dataset.stepGo) { wizardGo(+b.dataset.stepGo); return; }
    if (b.id === 'wiz-next') { wizardNext(); return; }
    if (b.id === 'wiz-prev') { wizardGo(NAV.step - 1); return; }
    if (b.id === 'home-new-btn') { newVideo(); return; }
    if (b.id === 'home-finish-btn') { wizardGo(4); finishBackgroundJob(); return; }
    if (b.id === 'goto-fiche-btn') { navOpen('videos', 'video'); return; }
    if (b.dataset.sheet) { document.getElementById('sheet-wrap').hidden = false; return; }
    if (b.id === 'sheet-close') { document.getElementById('sheet-wrap').hidden = true; updateEstimate(); return; }
});
document.addEventListener('click', e => { if (e.target.id === 'sheet-back') document.getElementById('sheet-wrap').hidden = true; });
// L'accueil se met à jour tout seul (générations, publications)
setInterval(() => { if (!document.hidden && NAV.tab === 'home' && NAV.stacks.home.length === 1) renderHome(); }, 4000);
