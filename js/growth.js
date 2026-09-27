// Cartoon Instructeur · Assistant de script, stats, dépenses, TikTok, accroches, parties, publication
// (scripts classiques chargés dans l'ordre par index.html : ils partagent les mêmes variables globales)

// ══════════════════════════════════════════════════════════════════
// ASSISTANT DE SCRIPT : formats qui retiennent + vérification des faits
// ══════════════════════════════════════════════════════════════════
const SCRIPT_FORMATS = {
    short: { label: 'Short / TikTok (30 s)', lines: '5 à 6', rules: 'accroche choc dès la 1re ligne, une seule idée, chute surprenante, pas de salutation' },
    minute: { label: 'Vidéo d\'1 minute', lines: '9 à 11', rules: 'accroche en question ou chiffre étonnant, promesse de ce qu\'on va apprendre, 3 points clés, récapitulatif, appel à s\'abonner' },
    explainer: { label: 'Explication de 3 minutes', lines: '24 à 28', rules: 'accroche, promesse, 3 à 4 parties avec une relance de curiosité à la fin de chaque partie, un exemple concret par partie, récapitulatif, appel à s\'abonner' }
};
async function checkFacts() {
    if (!state.scenes.length) { showToast('Écris d\'abord un script', 'warn'); return; }
    if (!getClaudeKey()) { showToast('Ajoute ta clé Claude', 'error'); return; }
    const box = document.getElementById('factcheck-box');
    setStatus('Claude vérifie les faits…');
    try {
        const out = await callClaude({
            system: 'Tu es un vérificateur de faits rigoureux pour des vidéos pédagogiques. Tu ne signales que les erreurs réelles ou les formulations trompeuses, pas les simplifications acceptables pour le public visé.',
            prompt: claudeContext() + '\nVérifie chaque ligne de ce script. Pour chaque problème, donne le numéro de ligne, le problème et la ligne corrigée (même longueur, facile à prononcer).\n\n' + state.scenes.map((l, i) => (i + 1) + '. ' + l).join('\n'),
            schema: { type: 'object', properties: { issues: { type: 'array', items: { type: 'object', properties: { line: { type: 'integer' }, problem: { type: 'string' }, fix: { type: 'string' } }, required: ['line', 'problem', 'fix'], additionalProperties: false } } }, required: ['issues'], additionalProperties: false }
        });
        state.factIssues = (out.issues || []).filter(x => x.line >= 1 && x.line <= state.scenes.length);
        if (!box) return;
        box.classList.remove('hidden');
        box.innerHTML = state.factIssues.length
            ? '<b>🔍 ' + state.factIssues.length + ' point' + (state.factIssues.length > 1 ? 's' : '') + ' à corriger</b>' + state.factIssues.map(x => '<div class="fc-item"><b>Ligne ' + x.line + '</b> : ' + esc(x.problem) + '<br>➡️ <i>' + esc(x.fix) + '</i></div>').join('') + '<button type="button" class="btn-secondary" id="fc-apply">✅ Appliquer les corrections</button>'
            : '<b>✅ Aucune erreur trouvée.</b>';
    } catch (e) { showToast('Vérification impossible : ' + e.message, 'error', 5000); }
    finally { setStatus(null); }
}
document.addEventListener('click', e => {
    if (e.target.id !== 'fc-apply' || !state.factIssues) return;
    const lines = state.scenes.slice();
    state.factIssues.forEach(x => { lines[x.line - 1] = x.fix; });
    document.getElementById('script-input').value = lines.join('\n');
    updateScriptStats(); renderScenesEditor();
    document.getElementById('factcheck-box').classList.add('hidden');
    showToast('Corrections appliquées ✓', 'success');
});

// ══════════════════════════════════════════════════════════════════
// STATISTIQUES YOUTUBE + CONSEILS DE CLAUDE
// ══════════════════════════════════════════════════════════════════
function publishedVideos() { return getJSON(STORAGE.YT_PUBLISHED, []); }
async function loadYouTubeStats() {
    const box = document.getElementById('ytstats-box'); if (!box) return;
    const vids = publishedVideos();
    if (!vids.length) { box.innerHTML = '<div class="prompt-main-hint">Publie une vidéo depuis l\'appli pour voir ses statistiques ici.</div>'; return; }
    const token = getYouTubeToken();
    if (!token) { box.innerHTML = '<div class="prompt-main-hint">Reconnecte-toi à YouTube (section Publication) pour voir les statistiques.</div>'; return; }
    box.innerHTML = '⏳ Chargement…';
    try {
        const ids = vids.slice(0, 50).map(v => v.id).join(',');
        const r = await fetch('https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=' + ids, { headers: { Authorization: 'Bearer ' + token } });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error?.message || r.status);
        let retention = {};
        try {
            const end = new Date().toISOString().slice(0, 10);
            const a = await fetch('https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=2020-01-01&endDate=' + end + '&metrics=views,averageViewDuration,averageViewPercentage&dimensions=video&filters=video==' + ids, { headers: { Authorization: 'Bearer ' + token } });
            const ad = await a.json();
            (ad.rows || []).forEach(row => { retention[row[0]] = { avgDur: row[2], avgPct: row[3] }; });
        } catch (e) {}
        state.ytStats = (data.items || []).map(it => ({ id: it.id, title: it.snippet.title, views: +it.statistics.viewCount || 0, likes: +it.statistics.likeCount || 0, comments: +it.statistics.commentCount || 0, ...(retention[it.id] || {}), script: vids.find(v => v.id === it.id)?.script || '', hook: vids.find(v => v.id === it.id)?.hook || '' }));
        box.innerHTML = '<table class="yt-table"><tr><th>Vidéo YouTube</th><th>Vues</th><th>👍</th><th>Regardé</th><th></th></tr>' + state.ytStats.map((s, i) => '<tr><td>' + esc(s.title) + '</td><td>' + s.views + '</td><td>' + s.likes + '</td><td>' + (s.avgPct ? Math.round(s.avgPct) + ' %' : '—') + '</td><td>' + (s.script ? '<button type="button" data-same="yt:' + i + '" title="Même structure">♻️</button>' : '') + '</td></tr>').join('') + '</table>' +
            '<button type="button" class="btn-secondary" id="yt-advice-btn" style="margin-top:0.5rem;">🤖 Conseils de Claude (YouTube + TikTok)</button>';
    } catch (e) { box.innerHTML = '<div class="prompt-main-hint">Statistiques indisponibles : ' + esc(e.message) + '. Reconnecte-toi à YouTube pour autoriser la lecture des statistiques.</div>'; }
}
document.addEventListener('click', e => { if (e.target.id === 'yt-advice-btn') platformAdvice(); });

// ══════════════════════════════════════════════════════════════════
// DÉPENSES (estimation : Agnes par scène, Claude selon les jetons, ElevenLabs selon les caractères)
// ══════════════════════════════════════════════════════════════════
const AGNES_SCENE_PRICE = 0.02, ELEVENLABS_PRICE_1K = 0.2;
const COST_LABELS = { agnes: 'Agnes', claude: 'Claude', elevenlabs: 'ElevenLabs' };
function trackCost(service, eur) {
    if (!(eur > 0)) return;
    const c = getJSON(STORAGE.COSTS, { months: {}, projects: [] });
    const m = new Date().toISOString().slice(0, 7);
    c.months[m] = c.months[m] || {}; c.months[m][service] = (c.months[m][service] || 0) + eur;
    const name = (state.theme || document.getElementById('theme-input')?.value || 'Sans titre').trim().slice(0, 80) || 'Sans titre';
    let p = c.projects.find(x => x.name === name && Date.now() - x.last < 3 * 24 * 3600000);
    if (!p) { p = { name, first: Date.now(), last: Date.now() }; c.projects.unshift(p); }
    p[service] = (p[service] || 0) + eur; p.last = Date.now();
    c.projects = c.projects.slice(0, 40);
    setJSON(STORAGE.COSTS, c);
}
function trackJobCost(jobId, scenes) {
    if (!jobId) return;
    const done = getJSON(STORAGE.COSTS_JOBS, []);
    if (done.includes(jobId)) return;
    trackCost('agnes', scenes * AGNES_SCENE_PRICE);
    setJSON(STORAGE.COSTS_JOBS, [jobId, ...done].slice(0, 100));
}
function renderCosts() {
    const box = document.getElementById('costs-box'); if (!box) return;
    const c = getJSON(STORAGE.COSTS, { months: {}, projects: [] });
    const eur = x => (x || 0).toFixed(2).replace('.', ',') + ' €';
    const sum = o => Object.keys(COST_LABELS).reduce((a, k) => a + (o[k] || 0), 0);
    const m = new Date().toISOString().slice(0, 7), cur = c.months[m] || {};
    const months = Object.keys(c.months).sort().reverse().slice(0, 6);
    box.innerHTML = '<div class="stat-line"><b>Ce mois-ci : ' + eur(sum(cur)) + '</b><span>' + Object.keys(COST_LABELS).map(k => COST_LABELS[k] + ' ' + eur(cur[k])).join(' · ') + '</span></div>' +
        (months.length > 1 ? '<div class="prompt-main-hint" style="margin:0.3rem 0;">' + months.map(k => k + ' : ' + eur(sum(c.months[k]))).join(' · ') + '</div>' : '') +
        (c.projects.length ? '<table class="yt-table" style="margin-top:0.4rem;"><tr><th>Vidéo</th><th>Agnes</th><th>Claude</th><th>Voix</th><th>Total</th></tr>' +
            c.projects.slice(0, 15).map(p => '<tr><td>' + esc(p.name) + '</td><td>' + eur(p.agnes) + '</td><td>' + eur(p.claude) + '</td><td>' + eur(p.elevenlabs) + '</td><td><b>' + eur(sum(p)) + '</b></td></tr>').join('') + '</table>'
            : '<div class="prompt-main-hint">Aucune dépense enregistrée pour l\'instant.</div>') +
        '<div class="prompt-main-hint" style="margin-top:0.4rem;">Estimations : Agnes ≈ ' + eur(AGNES_SCENE_PRICE) + ' par scène, ElevenLabs ≈ ' + eur(ELEVENLABS_PRICE_1K) + ' pour 1000 caractères, Claude selon le nombre de mots échangés. Les montants exacts sont sur chaque site.</div>';
}

// ══════════════════════════════════════════════════════════════════
// TIKTOK : connexion, jetons, statistiques
// ══════════════════════════════════════════════════════════════════
function tiktokReady() { return !!getProxyUrl() && state.proxyTikTok; }
function getTikTokToken() { return getJSON(STORAGE.TT_TOKEN); }
function saveTikTokToken(d) {
    setJSON(STORAGE.TT_TOKEN, { access: d.accessToken, refresh: d.refreshToken, exp: Date.now() + ((d.expiresIn || 86400) - 300) * 1000, refreshExp: Date.now() + (d.refreshExpiresIn || 31536000) * 1000, openId: d.openId, scope: d.scope || '' });
}
async function postProxy(path, body) {
    const res = await withTimeout(fetch(getProxyUrl() + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }), 60000, 'le serveur ne répond pas');
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || ('HTTP ' + res.status));
    return d;
}
async function connectTikTok() {
    let cfg = {};
    try { cfg = await (await fetch(getProxyUrl() + '/tiktok/config')).json(); } catch (e) {}
    if (!cfg.ready) { showToast('TikTok n\'est pas encore configuré sur ton serveur Cloudflare (voir le guide d\'installation)', 'warn', 7000); return; }
    const st = Math.random().toString(36).slice(2) + Date.now().toString(36);
    setLS(STORAGE.TT_STATE, st);
    const redirect = window.location.origin + window.location.pathname;
    window.location.href = 'https://www.tiktok.com/v2/auth/authorize/?client_key=' + encodeURIComponent(cfg.clientKey) +
        '&scope=' + encodeURIComponent('user.info.basic,video.list,video.upload,video.publish') +
        '&response_type=code&redirect_uri=' + encodeURIComponent(redirect) + '&state=' + st;
}
async function checkTikTokCallback() {
    const q = new URLSearchParams(window.location.search);
    const code = q.get('code'), st = q.get('state');
    if (!st || st !== getLS(STORAGE.TT_STATE)) return;
    window.history.replaceState({}, '', window.location.pathname);
    localStorage.removeItem(STORAGE.TT_STATE);
    if (!code) { showToast('Connexion TikTok annulée' + (q.get('error_description') ? ' : ' + q.get('error_description') : ''), 'warn', 6000); return; }
    try {
        saveTikTokToken(await postProxy('/tiktok/token', { code, redirectUri: window.location.origin + window.location.pathname }));
        showToast('Connecté à TikTok ✓', 'success');
    } catch (e) { showToast('Connexion TikTok impossible : ' + e.message, 'error', 7000); }
    updateTikTokStatus();
}
// Jeton valide (renouvelé automatiquement : il dure 24 h, le renouvellement 1 an)
async function getTikTokAccess() {
    const t = getTikTokToken(); if (!t) return null;
    if (Date.now() < t.exp) return t.access;
    try { saveTikTokToken(await postProxy('/tiktok/refresh', { refreshToken: t.refresh })); return getTikTokToken().access; }
    catch (e) { localStorage.removeItem(STORAGE.TT_TOKEN); updateTikTokStatus(); throw new Error('connexion TikTok expirée, reconnecte-toi'); }
}
function updateTikTokStatus() {
    const el = document.getElementById('tiktok-status'); if (!el) return;
    const t = getTikTokToken();
    el.textContent = !getProxyUrl() ? 'Serveur Cloudflare manquant' : !state.proxyTikTok ? '⚙️ TikTok pas encore configuré sur ton Cloudflare' : t ? '✅ TikTok connecté' : 'Non connecté';
    document.getElementById('tiktok-connect-btn')?.classList.toggle('hidden', !!t);
    document.getElementById('tiktok-disconnect-btn')?.classList.toggle('hidden', !t);
    updatePublishUI();
}
async function loadTikTokStats() {
    const box = document.getElementById('ttstats-box'); if (!box) return;
    box.innerHTML = '⏳ Chargement…';
    let api = [];
    try {
        const token = getTikTokToken() ? await getTikTokAccess() : null;
        if (token) {
            const d = await postProxy('/tiktok/videos', { accessToken: token });
            api = (d.videos || []).map(v => ({ id: v.id, title: v.title || v.video_description || '', views: v.view_count || 0, likes: v.like_count || 0, comments: v.comment_count || 0, shares: v.share_count || 0, duration: v.duration || 0, date: (v.create_time || 0) * 1000, url: v.share_url }));
        }
    } catch (e) { showToast('Statistiques TikTok : ' + e.message, 'warn', 6000); }
    const shots = getJSON(STORAGE.TT_SHOTS, []);
    state.ttStats = mergeTikTokStats(api, shots);
    renderTikTokStats();
}
// Les chiffres de l'API (vues, likes…) et ceux lus sur les captures (temps regardé, % jusqu'au bout) sont réunis par titre.
function mergeTikTokStats(api, shots) {
    const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '').slice(0, 40);
    const out = api.map(v => ({ ...v }));
    shots.forEach(sh => {
        const m = out.find(v => norm(v.title) && norm(sh.title) && (norm(v.title).startsWith(norm(sh.title).slice(0, 20)) || norm(sh.title).startsWith(norm(v.title).slice(0, 20))));
        const extra = { avgWatch: sh.avgWatch, fullPct: sh.fullPct, notes: sh.notes };
        if (m) Object.assign(m, Object.fromEntries(Object.entries(extra).filter(([, x]) => x != null && x >= 0 || typeof x === 'string')));
        else out.push({ id: 'shot-' + sh.date, title: sh.title, views: sh.views, likes: sh.likes, comments: sh.comments, shares: sh.shares, duration: sh.duration, ...extra, date: sh.date });
    });
    const pub = getJSON(STORAGE.TT_PUBLISHED, []);
    out.forEach(v => { const p = pub.find(x => norm(x.caption).slice(0, 20) && norm(v.title).startsWith(norm(x.caption).slice(0, 20))); if (p) { v.script = p.script; v.hook = p.hook; } });
    return out;
}
function renderTikTokStats() {
    const box = document.getElementById('ttstats-box'); if (!box) return;
    const s = state.ttStats || [];
    if (!s.length) { box.innerHTML = '<div class="prompt-main-hint">Aucune statistique TikTok. Connecte TikTok ou ajoute une capture d\'écran des statistiques d\'une vidéo.</div>'; return; }
    const n = x => x == null || x < 0 ? '—' : x;
    box.innerHTML = '<table class="yt-table"><tr><th>Vidéo TikTok</th><th>Vues</th><th>👍</th><th>↗️</th><th>Regardé</th><th></th></tr>' + s.map((v, i) =>
        '<tr><td>' + esc(String(v.title).slice(0, 60)) + '</td><td>' + n(v.views) + '</td><td>' + n(v.likes) + '</td><td>' + n(v.shares) + '</td><td>' + (v.fullPct >= 0 ? Math.round(v.fullPct) + ' %' : v.avgWatch >= 0 ? v.avgWatch + ' s' : '—') + '</td><td>' + (v.script ? '<button type="button" data-same="tt:' + i + '" title="Même structure">♻️</button>' : '') + '</td></tr>').join('') + '</table>';
}
// Capture d'écran des statistiques TikTok → Claude lit les chiffres
async function readTikTokScreenshot(file) {
    if (!getClaudeKey()) { showToast('Ajoute ta clé Claude', 'error'); return; }
    setStatus('Claude lit ta capture TikTok…');
    try {
        const raw = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
        const img = await downscaleImage(raw, 1600, 0.9);
        const num = { type: 'number' };
        const out = await callClaude({
            system: 'Tu lis des captures d\'écran des statistiques TikTok (TikTok Studio, analyses d\'une vidéo). Tu recopies les chiffres exactement, sans inventer. Mets -1 quand un chiffre n\'est pas visible. Convertis « 1,2 k » en 1200 et les durées en secondes.',
            prompt: 'Donne pour chaque vidéo visible : title (titre ou début de la description), views, likes, comments, shares, avg_watch_seconds (temps de visionnage moyen), full_watch_pct (pourcentage ayant regardé la vidéo en entier), duration_seconds, notes (en une phrase : à quel moment les gens décrochent si une courbe de rétention est visible, sources du trafic…).',
            images: [img],
            schema: { type: 'object', properties: { videos: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, views: num, likes: num, comments: num, shares: num, avg_watch_seconds: num, full_watch_pct: num, duration_seconds: num, notes: { type: 'string' } }, required: ['title', 'views', 'likes', 'comments', 'shares', 'avg_watch_seconds', 'full_watch_pct', 'duration_seconds', 'notes'], additionalProperties: false } } }, required: ['videos'], additionalProperties: false }
        });
        const vids = (out.videos || []).filter(v => v.title || v.views >= 0);
        if (!vids.length) throw new Error('aucun chiffre trouvé sur l\'image');
        const shots = getJSON(STORAGE.TT_SHOTS, []);
        vids.forEach(v => {
            const rec = { title: v.title, views: v.views, likes: v.likes, comments: v.comments, shares: v.shares, avgWatch: v.avg_watch_seconds, fullPct: v.full_watch_pct, duration: v.duration_seconds, notes: v.notes, date: Date.now() };
            const i = shots.findIndex(x => x.title === rec.title);
            if (i >= 0) shots[i] = rec; else shots.unshift(rec);
        });
        setJSON(STORAGE.TT_SHOTS, shots.slice(0, 60));
        showToast(vids.length + ' vidéo' + (vids.length > 1 ? 's' : '') + ' TikTok ajoutée' + (vids.length > 1 ? 's' : '') + ' ✓', 'success');
        await loadTikTokStats();
    } catch (e) { showToast('Lecture de la capture impossible : ' + e.message, 'error', 6000); }
    finally { setStatus(null); }
}

// ══════════════════════════════════════════════════════════════════
// CONSEILS YOUTUBE + TIKTOK → règles appliquées aux prochains scripts
// ══════════════════════════════════════════════════════════════════
async function platformAdvice() {
    const out = document.getElementById('platform-advice'); if (!out) return;
    if (!getClaudeKey()) { showToast('Ajoute ta clé Claude', 'error'); return; }
    const yt = state.ytStats || [], tt = state.ttStats || [];
    if (!yt.length && !tt.length) { out.textContent = 'Charge d\'abord tes statistiques YouTube ou TikTok.'; return; }
    out.textContent = '⏳ Claude analyse tes vidéos…';
    try {
        const r = await callClaude({
            system: 'Tu es un coach YouTube et TikTok spécialisé dans les vidéos pédagogiques animées. Conseils concrets, en français simple, sans jargon.',
            prompt: 'Voici mes vidéos avec leurs statistiques et, quand je l\'ai, leur script et leur accroche (première phrase). Compare les deux plateformes : ce qui marche, où les gens décrochent, quelles accroches gagnent. Donne 5 conseils précis, 3 idées de sujets, et des règles d\'écriture courtes à appliquer automatiquement à mes prochains scripts (une par plateforme si elles diffèrent).\n\nYOUTUBE :\n' +
                JSON.stringify(yt.map(s => ({ titre: s.title, vues: s.views, likes: s.likes, commentaires: s.comments, regardé_pct: s.avgPct ? Math.round(s.avgPct) : null, accroche: s.hook || (s.script || '').split('\n')[0], script: (s.script || '').slice(0, 1200) }))) +
                '\n\nTIKTOK :\n' + JSON.stringify(tt.map(s => ({ titre: s.title, vues: s.views, likes: s.likes, partages: s.shares, commentaires: s.comments, durée_s: s.duration, regardé_moyen_s: s.avgWatch >= 0 ? s.avgWatch : null, en_entier_pct: s.fullPct >= 0 ? s.fullPct : null, notes: s.notes || '', accroche: s.hook || '', script: (s.script || '').slice(0, 1200) }))),
            schema: { type: 'object', properties: { analysis: { type: 'string' }, tips: { type: 'array', items: { type: 'string' } }, ideas: { type: 'array', items: { type: 'string' } }, script_rules: { type: 'string' } }, required: ['analysis', 'tips', 'ideas', 'script_rules'], additionalProperties: false }
        });
        setJSON(STORAGE.INSIGHTS, { rules: r.script_rules, date: Date.now() });
        out.textContent = r.analysis + '\n\n💡 Conseils\n' + r.tips.map(t => '• ' + t).join('\n') + '\n\n🎯 Idées de sujets\n' + r.ideas.map(t => '• ' + t).join('\n') + '\n\n✍️ Appliqué à tes prochains scripts :\n' + r.script_rules;
        updateInsightsLine();
    } catch (e) { out.textContent = 'Conseils impossibles : ' + e.message; }
}
function updateInsightsLine() {
    const el = document.getElementById('insights-line'); if (!el) return;
    const ins = getJSON(STORAGE.INSIGHTS);
    el.classList.toggle('hidden', !ins);
    if (ins) el.querySelector('span').textContent = 'Utiliser les leçons de mes statistiques (' + new Date(ins.date).toLocaleDateString('fr-FR') + ')';
}
// Consignes ajoutées au script écrit par Claude : leçons des stats + question de fin
function scriptExtras() {
    let x = '';
    const ins = getJSON(STORAGE.INSIGHTS);
    if (ins && document.getElementById('use-insights')?.checked !== false) x += 'Leçons tirées de mes statistiques, à respecter : ' + ins.rules + '\n';
    if (getLS(STORAGE.END_QUESTION) !== '0') x += 'Dernière ligne : une question simple et amusante adressée au spectateur, qui donne envie de répondre en commentaire.\n';
    return x;
}
async function addEndQuestion() {
    if (!state.scenes.length) { showToast('Écris d\'abord un script', 'warn'); return; }
    if (!getClaudeKey()) { showToast('Ajoute ta clé Claude', 'error'); return; }
    setStatus('Claude écrit la question de fin…');
    try {
        const out = await callClaude({
            system: 'Tu écris la dernière réplique de vidéos pédagogiques pour faire réagir en commentaire. ' + SPEECH_RULES,
            prompt: claudeContext() + '\nVoici le script. Écris UNE question courte, amusante et facile à répondre en commentaire, en lien avec le sujet (moins de 15 mots).\n\n' + state.scenes.join('\n'),
            schema: { type: 'object', properties: { question: { type: 'string' } }, required: ['question'], additionalProperties: false }
        });
        const input = document.getElementById('script-input');
        input.value = input.value.replace(/\s+$/, '') + '\n' + out.question.trim();
        updateScriptStats(); renderScenesEditor();
        showToast('Question ajoutée à la fin ✓', 'success');
    } catch (e) { showToast('Impossible : ' + e.message, 'error'); }
    finally { setStatus(null); }
}

// ══════════════════════════════════════════════════════════════════
// ACCROCHES À TESTER + « MÊME STRUCTURE »
// ══════════════════════════════════════════════════════════════════
async function proposeHooks() {
    if (!state.scenes.length) { showToast('Écris d\'abord un script', 'warn'); return; }
    if (!getClaudeKey()) { showToast('Ajoute ta clé Claude', 'error'); return; }
    const box = document.getElementById('hooks-box');
    setStatus('Claude cherche des accroches…');
    try {
        const ins = getJSON(STORAGE.INSIGHTS);
        const out = await callClaude({
            system: 'Tu écris des accroches de vidéos courtes qui retiennent le spectateur dans les 3 premières secondes. ' + SPEECH_RULES,
            prompt: claudeContext() + (ins ? '\nLeçons de mes statistiques : ' + ins.rules : '') + '\nPropose 3 accroches très différentes (question intrigante, chiffre étonnant, affirmation surprenante) pour remplacer la première ligne de ce script. Chacune se dit en moins de 5 secondes. Pour chacune, dis en quelques mots pourquoi elle retient.\n\n' + state.scenes.join('\n'),
            schema: { type: 'object', properties: { hooks: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, why: { type: 'string' } }, required: ['text', 'why'], additionalProperties: false } } }, required: ['hooks'], additionalProperties: false }
        });
        state.hooks = out.hooks || [];
        box.classList.remove('hidden');
        box.innerHTML = '<b>🎣 Accroches à tester</b><div class="prompt-main-hint">Essaie-en une par vidéo : les statistiques diront laquelle retient le mieux.</div>' + state.hooks.map((h, i) =>
            '<div class="fc-item">« ' + esc(h.text) + ' »<br><small>' + esc(h.why) + '</small><br><button type="button" class="btn-secondary" data-hook="' + i + '" style="margin-top:0.3rem;">Utiliser comme première ligne</button></div>').join('');
    } catch (e) { showToast('Accroches impossibles : ' + e.message, 'error'); }
    finally { setStatus(null); }
}
document.addEventListener('click', e => {
    const h = e.target.closest && e.target.closest('[data-hook]'); if (!h || !state.hooks) return;
    const lines = state.scenes.slice(); lines[0] = state.hooks[+h.dataset.hook].text;
    document.getElementById('script-input').value = lines.join('\n');
    updateScriptStats(); renderScenesEditor();
    document.getElementById('hooks-box').classList.add('hidden');
    showToast('Accroche appliquée ✓', 'success');
});
async function sameStructure(script) {
    if (!getClaudeKey()) { showToast('Ajoute ta clé Claude', 'error'); return; }
    let theme = document.getElementById('theme-input').value.trim();
    if (!theme) theme = (prompt('Sur quel sujet faire la nouvelle vidéo ?') || '').trim();
    if (!theme) return;
    setStatus('Claude reprend la structure de ta vidéo…');
    try {
        const out = await callClaude({
            system: 'Tu écris des scripts de vidéos pédagogiques animées. Chaque ligne est dite par un personnage cartoon et devient une scène de 6 secondes. ' + SPEECH_RULES,
            prompt: claudeContext() + '\n' + scriptExtras() + 'Cette vidéo a très bien marché. Écris un script sur un NOUVEAU sujet, « ' + theme + ' », en reprenant exactement sa structure : même nombre de lignes, même type d\'accroche, même rythme, mêmes relances et même type de fin.\n\nSCRIPT MODÈLE :\n' + script,
            schema: LINES_SCHEMA
        });
        const lines = (out.lines || []).map(l => String(l).trim()).filter(Boolean);
        if (!lines.length) throw new Error('réponse vide');
        document.getElementById('theme-input').value = theme; state.theme = theme;
        document.getElementById('script-input').value = lines.join('\n');
        updateScriptStats(); renderScenesEditor();
        wizardGo(1);
        showToast('Nouveau script écrit sur le même modèle ✓', 'success');
    } catch (e) { showToast('Impossible : ' + e.message, 'error'); }
    finally { setStatus(null); }
}
document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-same]'); if (!b) return;
    const [src, i] = b.dataset.same.split(':');
    const v = (src === 'tt' ? state.ttStats : state.ytStats)?.[+i];
    if (v?.script) sameStructure(v.script);
});

// ══════════════════════════════════════════════════════════════════
// DÉCOUPAGE EN PLUSIEURS TIKTOKS (Partie 1, 2, 3…)
// ══════════════════════════════════════════════════════════════════
function computeParts(maxSec = 55) {
    const scenes = montageItems().filter(q => q.sceneIndex >= 0);
    const est = it => it.speech && !it.speech.silent ? Math.max(1.5, it.speech.end - it.speech.start + 0.5) : 5;
    const parts = []; let cur = [], dur = 4;
    scenes.forEach(it => { if (cur.length && dur + est(it) > maxSec) { parts.push(cur); cur = []; dur = 4; } cur.push(it); dur += est(it); });
    if (cur.length) parts.push(cur);
    // pas de dernière partie minuscule : on rééquilibre
    if (parts.length > 1 && parts[parts.length - 1].length < 3) { const all = parts.flat(), k = parts.length; return Array.from({ length: k }, (_, i) => all.slice(Math.round(i * all.length / k), Math.round((i + 1) * all.length / k))); }
    return parts;
}
function renderParts() {
    const box = document.getElementById('parts-list'); if (!box) return;
    const parts = computeParts();
    state.parts = parts;
    if (parts.length < 2) { box.innerHTML = '<div class="prompt-main-hint">Ta vidéo tient déjà en un seul TikTok (moins d\'une minute).</div>'; return; }
    box.innerHTML = parts.map((p, i) => '<button type="button" class="btn-secondary" id="part-btn-' + i + '" data-part="' + i + '" style="margin-top:0.3rem;">⬇️ Créer la partie ' + (i + 1) + '/' + parts.length + ' (' + p.length + ' scènes)</button>').join('');
}
document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-part]'); if (!b || !state.parts) return;
    const i = +b.dataset.part, n = state.parts.length, items = state.parts[i];
    prepareThenSave('part-btn-' + i, 'part:' + i + '/' + n, async () => {
        if (assembling || state.isRunning) throw new Error('attends la fin du montage en cours');
        unlockAudio();
        assembling = true; state.stopRequested = false;
        document.getElementById('stop-btn').classList.add('visible');
        await ensureWakeLockActive();
        const theme = state.theme;
        try {
            state.theme = (theme || 'Vidéo') + ' · Partie ' + (i + 1) + '/' + n;
            const r = await assembleVideo({ label: 'Partie ' + (i + 1), format: 'portrait', items });
            return { blob: r.blob, name: 'partie-' + (i + 1) + '-' + Date.now() + '.' + r.ext };
        } finally { state.theme = theme; assembling = false; state.stopRequested = false; setStatus(null); setProgress(0); document.getElementById('stop-btn').classList.remove('visible'); }
    });
});

// ══════════════════════════════════════════════════════════════════
// PUBLICATION ET PROGRAMMATION (YouTube + TikTok)
// ══════════════════════════════════════════════════════════════════
async function writeTikTokCaption() {
    if (!getClaudeKey()) { showToast('Ajoute ta clé Claude', 'error'); return; }
    setStatus('Claude écrit le texte TikTok…');
    try {
        const out = await callClaude({
            system: 'Tu écris les textes de publication TikTok de vidéos pédagogiques : une phrase qui donne envie de regarder jusqu\'au bout, puis des hashtags pertinents (mélange de populaires et de précis). Pas d\'emoji en excès.',
            prompt: claudeContext() + '\nSujet : ' + (state.theme || '') + '\nScript :\n' + state.scenes.join('\n') + '\n\nDonne "caption" (moins de 150 caractères) et "hashtags" (5 à 8, sans le #).',
            schema: { type: 'object', properties: { caption: { type: 'string' }, hashtags: { type: 'array', items: { type: 'string' } } }, required: ['caption', 'hashtags'], additionalProperties: false }
        });
        document.getElementById('tt-caption').value = out.caption.trim() + '\n\n' + out.hashtags.map(h => '#' + String(h).replace(/[#\s]+/g, '')).join(' ');
    } catch (e) { showToast('Texte impossible : ' + e.message, 'error'); }
    finally { setStatus(null); }
}
async function loadTikTokPrivacy() {
    const sel = document.getElementById('pub-tt-privacy'); if (!sel || !getTikTokToken()) return;
    try {
        const d = await postProxy('/tiktok/creator', { accessToken: await getTikTokAccess() });
        const labels = { PUBLIC_TO_EVERYONE: 'Tout le monde', MUTUAL_FOLLOW_FRIENDS: 'Amis', FOLLOWER_OF_CREATOR: 'Abonnés', SELF_ONLY: 'Moi seulement (privé)' };
        const opts = d.privacy_level_options || ['SELF_ONLY'];
        const prev = sel.value;
        sel.innerHTML = opts.map(o => '<option value="' + o + '">' + (labels[o] || o) + '</option>').join('');
        if (sel.dataset.loaded && opts.includes(prev)) sel.value = prev; else if (opts.includes('PUBLIC_TO_EVERYONE')) sel.value = 'PUBLIC_TO_EVERYONE';
        sel.dataset.loaded = '1';
        const who = document.getElementById('tiktok-account'); if (who && d.creator_nickname) who.textContent = 'Compte : ' + d.creator_nickname;
    } catch (e) { log('TikTok créateur : ' + e.message); }
}
function updatePublishUI() {
    const at = document.getElementById('pub-at')?.value;
    const btn = document.getElementById('publish-btn');
    if (btn && !btn.dataset.busy) btn.textContent = at && new Date(at).getTime() > Date.now() + 60000 ? '📅 Programmer la publication' : '🚀 Publier maintenant';
    const yt = document.getElementById('pub-yt'), ys = document.getElementById('pub-ys'), tt = document.getElementById('pub-tt'), ig = document.getElementById('pub-ig');
    const dis = (el, off) => { if (el) { el.disabled = off; if (off) el.checked = false; } };
    dis(yt, !getYouTubeToken()); dis(ys, !getYouTubeToken());
    dis(tt, !(tiktokReady() && getTikTokToken() && mediaAvailable()));
    dis(ig, !(state.proxyInstagram && getIgToken() && mediaAvailable()));
    const hint = document.getElementById('pub-hint');
    if (hint) hint.textContent = [!getYouTubeToken() ? 'YouTube : connecte-toi dans Réglages → Comptes.' : '', !(tiktokReady() && getTikTokToken()) ? 'TikTok : connecte-toi dans Réglages → Comptes.' : '', !(state.proxyInstagram && getIgToken()) ? 'Instagram : connecte-toi dans Réglages → Comptes.' : ''].filter(Boolean).join(' ');
    document.getElementById('tt-options')?.classList.toggle('hidden', !(tt?.checked || ig?.checked || ys?.checked));
    document.getElementById('tt-only')?.classList.toggle('hidden', !tt?.checked);
}
async function renderSchedule() {
    const box = document.getElementById('schedule-list'); if (!box) return;
    const list = getJSON(STORAGE.SCHEDULE, []);
    box.classList.toggle('hidden', !list.length);
    if (!list.length) { box.innerHTML = ''; return; }
    const fmt = t => new Date(t).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
    const rows = await Promise.all(list.slice(0, 15).map(async (p, i) => {
        if (p.platform === 'youtube') {
            const label = p.at > Date.now() ? '📅 Programmée pour le ' + fmt(p.at) : '✅ En ligne depuis le ' + fmt(p.at);
            return '<div class="series-item"><span>▶️ YouTube · ' + esc(p.title) + '<br><small>' + label + '</small></span><a href="https://youtu.be/' + esc(p.id) + '" target="_blank" rel="noopener">Voir</a></div>';
        }
        let st = { status: p.status, message: '' };
        if (!['done', 'failed', 'cancelled'].includes(p.status)) {
            try { const r = await fetch(getProxyUrl() + '/schedule/' + p.id); st = await r.json(); if (r.ok) { list[i].status = st.status; } else st = { status: 'failed', message: st.error }; } catch (e) { st = { status: p.status, message: 'serveur injoignable' }; }
        }
        const label = st.status === 'scheduled' ? '📅 Programmée pour le ' + fmt(p.at) : st.status === 'done' ? '✅ ' + (st.message || 'Publiée') : st.status === 'failed' ? '❌ ' + (st.message || 'Échec') : st.status === 'cancelled' ? '⏹ Annulée' : '⏳ ' + (st.message || 'En cours');
        return '<div class="series-item"><span>🎵 TikTok · ' + esc(p.title) + '<br><small>' + esc(label) + '</small></span>' + (st.status === 'scheduled' ? '<button type="button" data-unschedule="' + i + '">Annuler</button>' : '') + '</div>';
    }));
    setJSON(STORAGE.SCHEDULE, list);
    box.innerHTML = '<div class="section-title" style="margin-bottom:0.5rem;">📅 Mes publications</div>' + rows.join('') +
        '<div class="prompt-main-hint">Une vidéo YouTube programmée se modifie ou s\'annule dans YouTube Studio.</div>' +
        '<button type="button" class="btn-secondary" id="schedule-refresh-btn" style="margin-top:0.4rem;">🔄 Actualiser</button><button type="button" class="btn-secondary" id="schedule-clear-btn" style="margin-top:0.4rem;">Effacer cette liste</button>';
}
document.addEventListener('click', async e => {
    const b = e.target.closest && e.target.closest('[data-unschedule]'); if (!b) return;
    const list = getJSON(STORAGE.SCHEDULE, []), p = list[+b.dataset.unschedule];
    if (!p || !confirm('Annuler cette publication TikTok ?')) return;
    try { await fetch(getProxyUrl() + '/schedule/' + p.id + '/cancel', { method: 'POST' }); } catch (err) {}
    p.status = 'cancelled'; setJSON(STORAGE.SCHEDULE, list); renderSchedule();
});
// Sous-titres traduits ajoutés à la dernière vidéo YouTube
async function addTranslatedCaptions() {
    const token = getYouTubeToken();
    if (!token || !state.lastYouTubeId) { showToast('Publie d\'abord la vidéo sur YouTube', 'warn'); return; }
    const langs = Object.keys(state.langSrt || {});
    if (!langs.length) return;
    setStatus('Envoi des sous-titres traduits…');
    const ok = [];
    for (const l of langs) { try { if (await uploadYouTubeCaption(state.lastYouTubeId, state.langSrt[l], l, 'Sous-titres ' + (LANG_NAMES_FR[l] || l), token)) ok.push(LANG_NAMES_FR[l] || l); } catch (e) {} }
    setStatus(null);
    showToast(ok.length ? 'Sous-titres ajoutés sur YouTube : ' + ok.join(', ') + ' ✓' : 'Envoi des sous-titres impossible', ok.length ? 'success' : 'error', 6000);
}
document.addEventListener('click', e => {
    if (e.target.id === 'schedule-refresh-btn') renderSchedule();
    else if (e.target.id === 'schedule-clear-btn' && confirm('Effacer la liste ? (les publications programmées ne sont pas annulées)')) { localStorage.removeItem(STORAGE.SCHEDULE); renderSchedule(); }
});
