// Cartoon Instructeur · Ma chaîne (charte), « Fais comme cette vidéo », mode objectif, tes images dans la vidéo
// (scripts classiques chargés dans l'ordre par index.html : ils partagent les mêmes variables globales)

// ══════════════════════════════════════════════════════════════════
// CHARTE DE LA CHAÎNE — relue par Claude à chaque script et chaque mise en scène
// ══════════════════════════════════════════════════════════════════
const CHARTER_PRESETS = {
    sobre: { label: '🧊 Sobre', brandColor: '#4f8cff', captionFont: 'rounded', energy: 'calm', voice: 'posé, précis, rassurant, sans points d\'exclamation ni superlatifs', avoid: 'blagues, onomatopées, emojis dans le texte' },
    energique: { label: '⚡ Énergique', brandColor: '#ff3d6e', captionFont: 'impact', energy: 'punchy', voice: 'direct, rythmé, phrases très courtes, tutoiement, questions au spectateur', avoid: 'longues introductions, phrases de plus de 15 mots' },
    enfant: { label: '🧸 Enfants', brandColor: '#ffb800', captionFont: 'marker', energy: 'normal', voice: 'bienveillant, émerveillé, mots simples, comparaisons avec la vie de tous les jours', avoid: 'mots techniques non expliqués, chiffres trop précis, sujets qui font peur' },
    corporate: { label: '💼 Pro / entreprise', brandColor: '#1f3a5f', captionFont: 'rounded', energy: 'calm', voice: 'professionnel, concret, orienté résultats, vouvoiement', avoid: 'argot, familiarité, exagérations' }
};
const CHARTER_FIELDS = ['name', 'promise', 'audience', 'voice', 'avoid', 'signature'];
function getCharter() { return getJSON(STORAGE.CHARTER) || {}; }
function saveCharter(c) { setJSON(STORAGE.CHARTER, c); renderCharterRef(); }
// Rythme de l'animation choisi par la charte : calme, normal ou percutant
function charterEnergy() { const e = getCharter().energy; return e === 'calm' || e === 'punchy' ? e : 'normal'; }
function charterContext() {
    const c = getCharter(), parts = [];
    if (c.name) parts.push('Chaîne : « ' + c.name + ' »');
    if (c.promise) parts.push('Ce que la chaîne apporte : ' + c.promise);
    if (c.audience) parts.push('Public précis : ' + c.audience);
    if (c.voice) parts.push('Ton et façon de parler : ' + c.voice);
    if (c.avoid) parts.push('À éviter absolument : ' + c.avoid);
    if (c.signature) parts.push('Phrase signature à glisser naturellement quand c\'est possible : « ' + c.signature + ' »');
    if (c.refStyle?.rules?.length) parts.push('Style de la vidéo modèle à imiter : ' + c.refStyle.summary + ' Règles : ' + c.refStyle.rules.join(' ; '));
    return parts.length ? '\nCHARTE DE LA CHAÎNE (à respecter) — ' + parts.join('. ') + '.' : '';
}
function loadCharterForm() {
    const c = getCharter();
    CHARTER_FIELDS.forEach(f => { const el = document.getElementById('charter-' + f); if (el) el.value = c[f] || ''; });
    const en = document.getElementById('charter-energy'); if (en) en.value = charterEnergy();
    renderCharterRef();
}
function readCharterForm() {
    const c = getCharter();
    CHARTER_FIELDS.forEach(f => { const el = document.getElementById('charter-' + f); if (el) c[f] = el.value.trim().slice(0, 400); });
    const en = document.getElementById('charter-energy'); if (en) c.energy = en.value;
    saveCharter(c);
}
function applyCharterPreset(id) {
    const p = CHARTER_PRESETS[id]; if (!p) return;
    const c = { ...getCharter(), voice: p.voice, avoid: p.avoid, energy: p.energy };
    saveCharter(c); loadCharterForm();
    state.brandColor = p.brandColor; state.captionFont = p.captionFont;
    const bc = document.getElementById('brand-color-input'); if (bc) bc.value = p.brandColor;
    const cf = document.getElementById('caption-font-select'); if (cf) cf.value = p.captionFont;
    if (typeof saveSettings === 'function') saveSettings();
    showToast('Charte « ' + p.label.replace(/^\S+\s/, '') + ' » appliquée ✓ (tu peux la retoucher)', 'success', 4000);
}
function renderCharterRef() {
    const el = document.getElementById('charter-ref-summary'); if (!el) return;
    const r = getCharter().refStyle;
    el.innerHTML = r ? '🎬 <b>Style modèle retenu</b> : ' + esc(r.summary) + '<br><button type="button" class="btn-link" id="charter-ref-clear">Oublier ce style</button>' : '';
    el.classList.toggle('hidden', !r);
}

// ══════════════════════════════════════════════════════════════════
// « FAIS COMME CETTE VIDÉO » : captures d'écran analysées par Claude
// ══════════════════════════════════════════════════════════════════
const fileToDataUrl = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(f); });
async function analyzeReferenceShots(files) {
    const list = Array.from(files || []).filter(f => /^image\//.test(f.type)).slice(0, 4);
    if (!list.length) { showToast('Choisis 1 à 4 captures d\'écran', 'warn'); return; }
    if (!getClaudeKey()) { showToast('Ajoute ta clé Claude', 'error'); return; }
    setStatus('Claude étudie la vidéo modèle…');
    try {
        const images = [];
        for (const f of list) images.push(await downscaleImage(await fileToDataUrl(f), 900, 0.8));
        const out = await callClaude({
            effort: 'medium', images,
            prompt: 'Voici ' + images.length + ' captures d\'écran d\'une vidéo courte que j\'aimerais imiter (sans la copier) pour ma chaîne de vidéos pédagogiques animées. ' +
                'Analyse ce qui la rend efficace : rythme apparent, façon d\'afficher les textes (taille, position, couleurs, animation probable), accroche, cadrage du personnage, couleurs dominantes. ' +
                'Donne : "summary" (1 à 2 phrases en français), "rules" (3 à 6 règles concrètes et applicables pour le script et la mise en scène, en français), "energy" (rythme : "calm", "normal" ou "punchy"), ' +
                '"brandColor" (la couleur d\'accent la plus marquante, en hexadécimal #rrggbb), "captionFont" ("rounded" pour une police moderne grasse, "marker" pour une écriture à la main, "impact" pour une police très épaisse).',
            schema: { type: 'object', properties: { summary: { type: 'string' }, rules: { type: 'array', items: { type: 'string' } }, energy: { type: 'string', enum: ['calm', 'normal', 'punchy'] }, brandColor: { type: 'string' }, captionFont: { type: 'string', enum: ['rounded', 'marker', 'impact'] } }, required: ['summary', 'rules', 'energy', 'brandColor', 'captionFont'], additionalProperties: false }
        });
        const c = getCharter();
        c.refStyle = { summary: String(out.summary || '').slice(0, 300), rules: (out.rules || []).map(r => String(r).slice(0, 200)).slice(0, 6), date: Date.now() };
        c.energy = out.energy || c.energy;
        saveCharter(c); loadCharterForm();
        const color = /^#[0-9a-f]{6}$/i.test(out.brandColor || '') ? out.brandColor : null;
        if (confirm('🎬 ' + c.refStyle.summary + '\n\nReprendre aussi sa couleur' + (color ? ' (' + color + ')' : '') + ' et son style de police pour tes sous-titres ?')) {
            if (color) { state.brandColor = color; const bc = document.getElementById('brand-color-input'); if (bc) bc.value = color; }
            state.captionFont = out.captionFont || state.captionFont;
            const cf = document.getElementById('caption-font-select'); if (cf) cf.value = state.captionFont;
            if (typeof saveSettings === 'function') saveSettings();
        }
        showToast('Style modèle retenu ✓ : tes prochains scripts et montages s\'en inspireront', 'success', 5000);
    } catch (e) { showToast('Analyse impossible : ' + e.message, 'error', 5000); }
    finally { setStatus(null); }
}

// ══════════════════════════════════════════════════════════════════
// MODE OBJECTIF : tu donnes le but, Claude pose ses questions, cherche si besoin, puis écrit le script
// ══════════════════════════════════════════════════════════════════
const objective = { text: '', questions: [], answers: [] };
async function startObjective() {
    const text = (document.getElementById('objective-input')?.value || '').trim();
    if (text.length < 8) { showToast('Décris ton objectif en une ou deux phrases', 'warn'); return; }
    if (!getClaudeKey()) { showToast('Ajoute ta clé Claude', 'error'); return; }
    objective.text = text; objective.questions = []; objective.answers = [];
    setStatus('Claude lit ton objectif…');
    try {
        const out = await callClaude({
            effort: 'low',
            prompt: claudeContext() + '\nUn créateur veut une vidéo pédagogique animée avec cet objectif : « ' + text + ' ».\n' +
                'Si des informations indispensables manquent pour écrire un bon script (public visé, niveau, angle, exemple attendu…), pose 1 à 3 questions très courtes, simples, en tutoyant. ' +
                'Si l\'objectif est assez clair, renvoie une liste vide. Ne pose jamais de question sur la durée, le format ou le style visuel (déjà réglés).',
            schema: { type: 'object', properties: { questions: { type: 'array', items: { type: 'string' } } }, required: ['questions'], additionalProperties: false }
        });
        objective.questions = (out.questions || []).map(q => String(q).trim()).filter(Boolean).slice(0, 3);
    } catch (e) { showToast('Claude indisponible : ' + e.message, 'error', 5000); setStatus(null); return; }
    setStatus(null);
    if (!objective.questions.length) { await writeScriptFromObjective(); return; }
    const box = document.getElementById('objective-questions'); if (!box) return;
    box.innerHTML = '<div class="prompt-main-hint">🤔 Claude a besoin de quelques précisions :</div>' +
        objective.questions.map((q, i) => '<label class="control-label">' + esc(q) + '</label><input class="text-input" data-objective-answer="' + i + '">').join('') +
        '<button type="button" class="btn-primary" id="objective-write-btn" style="margin-top:0.6rem;">✍️ Écrire le script</button>';
    box.classList.remove('hidden');
}
// Recherche internet (outil de recherche web de l'API Claude, ≈ 1 centime par recherche) : des faits récents et sourcés
async function researchTopic(topic) {
    const notes = await callClaude({
        effort: 'medium', webSearch: 4, maxTokens: 6000,
        prompt: 'Cherche sur internet des informations fiables et récentes pour une vidéo pédagogique courte sur : « ' + topic + ' ». ' +
            'Rends 5 à 8 faits clés vérifiés (chiffres exacts, dates, exemples concrets), chacun sur une ligne, suivi entre parenthèses du nom du site source. En français, sans introduction.'
    });
    return String(notes || '').slice(0, 4000);
}
async function writeScriptFromObjective() {
    const answers = Array.from(document.querySelectorAll('[data-objective-answer]')).map(el => el.value.trim());
    const qa = objective.questions.map((q, i) => answers[i] ? '- ' + q + ' → ' + answers[i] : '').filter(Boolean).join('\n');
    const brief = objective.text + (qa ? '\nPrécisions :\n' + qa : '');
    let notes = '';
    if (document.getElementById('objective-research')?.checked) {
        setStatus('Claude cherche des informations à jour sur internet…');
        try { notes = await researchTopic(brief); } catch (e) { showToast('Recherche internet impossible (' + e.message + ') : script écrit sans', 'warn', 5000); }
    }
    setStatus('Claude écrit le script…');
    try {
        const f = SCRIPT_FORMATS[document.getElementById('script-format-select')?.value] || SCRIPT_FORMATS[shortsMode() ? 'short60' : 'minute'];
        const out = await callClaude({
            effort: 'high',
            system: 'Tu écris des scripts de vidéos pédagogiques animées. Chaque ligne est dite par un personnage cartoon face caméra et devient une scène. ' + SPEECH_RULES,
            prompt: (typeof scriptExtras === 'function' ? scriptExtras() : '') + claudeContext() +
                '\nObjectif du créateur : ' + brief +
                (notes ? '\n\nFaits vérifiés trouvés sur internet (utilise-les, n\'invente aucun chiffre) :\n' + notes : '') +
                '\n\nÉcris un script de ' + f.lines + ' lignes. Format : ' + f.label + '. Règles pour que les gens regardent jusqu\'au bout : ' + f.rules + '. Donne aussi "title" : un titre court et accrocheur (moins de 60 caractères).',
            schema: { type: 'object', properties: { title: { type: 'string' }, lines: { type: 'array', items: { type: 'string' } } }, required: ['title', 'lines'], additionalProperties: false }
        });
        const lines = (out.lines || []).map(l => String(l).trim()).filter(Boolean);
        if (!lines.length) throw new Error('script vide');
        const si = document.getElementById('script-input'); if (si) si.value = lines.join('\n');
        const ti = document.getElementById('theme-input'); if (ti && out.title) { ti.value = String(out.title).slice(0, 80); state.theme = ti.value; }
        updateScriptStats(); if (typeof renderScenesEditor === 'function') renderScenesEditor();
        document.getElementById('objective-questions')?.classList.add('hidden');
        showToast('Script écrit ✓' + (notes ? ' avec des infos vérifiées sur internet' : '') + ' : relis-le avant de lancer', 'success', 5000);
    } catch (e) { showToast('Script impossible : ' + e.message, 'error', 5000); }
    finally { setStatus(null); }
}

// ══════════════════════════════════════════════════════════════════
// TES IMAGES DANS LA VIDÉO (logo, captures d'écran, photos) — placées par Claude, animées au montage
// ══════════════════════════════════════════════════════════════════
function userImages() { return getJSON(STORAGE.USER_IMAGES) || []; }
function saveUserImages(list) { setJSON(STORAGE.USER_IMAGES, list); renderUserImages(); }
async function addUserImages(files) {
    const list = userImages();
    for (const f of Array.from(files || []).filter(x => /^image\//.test(x.type))) {
        if (list.length >= 12) { showToast('12 images au plus', 'warn'); break; }
        const id = 'img' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
        const data = await downscaleImage(await fileToDataUrl(f), 1400, 0.88);
        await idbPut('uimg:' + id, data);
        const item = { id, name: f.name.replace(/\.[^.]+$/, '').slice(0, 40), desc: '' };
        // description automatique (courte, peu coûteuse) pour que Claude sache où la placer
        if (getClaudeKey()) {
            try { item.desc = String(await callClaude({ effort: 'low', maxTokens: 300, images: [await downscaleImage(data, 512, 0.7)], prompt: 'Décris cette image en une phrase courte en français (ce qu\'elle montre), sans introduction.' })).slice(0, 160); } catch (e) {}
        }
        list.push(item);
    }
    saveUserImages(list);
}
async function removeUserImage(id) { await idbDel('uimg:' + id).catch(() => {}); saveUserImages(userImages().filter(x => x.id !== id)); }
function renderUserImages() {
    const box = document.getElementById('user-images-list'); if (!box) return;
    const list = userImages();
    const cnt = document.getElementById('user-images-count'); if (cnt) cnt.textContent = list.length ? String(list.length) : '';
    box.innerHTML = list.length ? list.map(x => '<div class="series-item"><span>🖼️ <input class="text-input" data-uimg-desc="' + esc(x.id) + '" value="' + esc(x.desc || x.name) + '" style="width:70%;"></span><button type="button" data-uimg-del="' + esc(x.id) + '">🗑️</button></div>').join('')
        : '<div class="prompt-main-hint">Aucune image : ajoute ton logo, une capture d\'écran ou une photo, Claude la placera au bon moment.</div>';
}
// Ligne ajoutée à la consigne de mise en scène quand des images sont disponibles
function userImagesPlanLine() {
    const list = userImages();
    if (!list.length) return '';
    return '- "image" : si une de MES IMAGES illustre parfaitement la réplique, son identifiant (chaque image au plus une fois, jamais sur la première réplique), sinon "none". Mes images : ' +
        list.map(x => '"' + x.id + '" = ' + (x.desc || x.name)).join(' ; ') + '\n';
}
const userImageCache = new Map();
async function preloadUserImages(ids) {
    for (const id of new Set(ids)) {
        if (!id || id === 'none' || userImageCache.has(id)) continue;
        try {
            const data = await idbGet('uimg:' + id); if (!data) continue;
            const img = new Image(); await new Promise(r => { img.onload = r; img.onerror = r; img.src = data; });
            if (img.width) userImageCache.set(id, img);
        } catch (e) {}
    }
}
// Carte-image : entrée sur un ressort, léger zoom lent, ombre ; au-dessus du personnage en vertical, à droite en paysage
function drawUserImage(ctx, W, H, img, t, dur) {
    if (!img || t < 0) return;
    const portrait = H > W * 1.1, a = spring(t, SPRINGS.snappy), out = clamp01((t - (dur - 0.35)) / 0.35);
    const box = portrait ? { x: W * 0.1, y: H * 0.1, w: W * 0.8, h: H * 0.34 } : { x: W * 0.52, y: H * 0.1, w: W * 0.42, h: H * 0.56 };
    const s = Math.min(box.w / img.width, box.h / img.height), w = img.width * s, h = img.height * s;
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2, pad = Math.min(W, H) * 0.012;
    ctx.save();
    ctx.globalAlpha = 1 - out;
    ctx.translate(cx, cy + (1 - a) * H * 0.04); ctx.scale(0.7 + 0.3 * a, 0.7 + 0.3 * a); ctx.rotate((1 - a) * -0.05);
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = Math.min(W, H) * 0.03; ctx.shadowOffsetY = Math.min(W, H) * 0.01;
    ctx.fillStyle = '#fff'; roundRectPath(ctx, -w / 2 - pad, -h / 2 - pad, w + pad * 2, h + pad * 2, pad * 1.6); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.save(); roundRectPath(ctx, -w / 2, -h / 2, w, h, pad); ctx.clip();
    const z = 1 + 0.05 * clamp01(t / Math.max(1, dur));
    ctx.drawImage(img, -w / 2 * z, -h / 2 * z, w * z, h * z);
    ctx.restore();
    ctx.restore();
}

// ══════════════════════════════════════════════════════════════════
// Branchements de l'interface
// ══════════════════════════════════════════════════════════════════
document.addEventListener('click', e => {
    const t = e.target.closest ? e.target.closest('button') : null; if (!t) return;
    if (t.dataset.charterPreset) applyCharterPreset(t.dataset.charterPreset);
    else if (t.id === 'charter-ref-btn') document.getElementById('charter-ref-input')?.click();
    else if (t.id === 'charter-ref-clear') { const c = getCharter(); delete c.refStyle; saveCharter(c); }
    else if (t.id === 'objective-btn') startObjective();
    else if (t.id === 'objective-write-btn') writeScriptFromObjective();
    else if (t.id === 'user-images-btn') document.getElementById('user-images-input')?.click();
    else if (t.dataset.uimgDel) removeUserImage(t.dataset.uimgDel);
});
document.addEventListener('change', e => {
    const id = e.target.id || '';
    if (id.startsWith('charter-') && id !== 'charter-ref-input') readCharterForm();
    else if (id === 'charter-ref-input') { analyzeReferenceShots(e.target.files); e.target.value = ''; }
    else if (id === 'user-images-input') { addUserImages(e.target.files).catch(err => showToast('Images : ' + err.message, 'error')); e.target.value = ''; }
    else if (e.target.dataset?.uimgDesc) saveUserImages(userImages().map(x => x.id === e.target.dataset.uimgDesc ? { ...x, desc: e.target.value.trim().slice(0, 160) } : x));
});

// ══════════════════════════════════════════════════════════════════
// Créer › Script : format en puces, « Claude l'écrit / je l'écris »
// ══════════════════════════════════════════════════════════════════
function syncFmtChips() {
    const v = document.getElementById('script-format-select')?.value || '';
    document.querySelectorAll('#fmt-chips [data-fmt]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.fmt === v)));
}
function setWriteMode(mode) {
    try { localStorage.setItem('cartoon_write_mode', mode); } catch (e) {}
    document.querySelectorAll('#write-mode [data-write]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.write === mode)));
    document.getElementById('objective-box')?.classList.toggle('hidden', mode !== 'ai');
}
document.addEventListener('click', e => {
    const f = e.target.closest ? e.target.closest('#fmt-chips [data-fmt]') : null;
    if (f) {
        const sel = document.getElementById('script-format-select');
        if (sel) { sel.value = f.dataset.fmt; sel.dataset.touched = '1'; }
        syncFmtChips();
    }
    const w = e.target.closest ? e.target.closest('#write-mode [data-write]') : null;
    if (w) setWriteMode(w.dataset.write);
});
function initCreateUi() {
    let mode = 'ai'; try { mode = localStorage.getItem('cartoon_write_mode') || (document.getElementById('script-input')?.value.trim() ? 'me' : 'ai'); } catch (e) {}
    setWriteMode(mode); syncFmtChips();
}
