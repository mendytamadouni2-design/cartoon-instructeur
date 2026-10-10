// Cartoon Instructeur · Claude, poses, storyboard
// (scripts classiques chargés dans l'ordre par index.html : ils partagent les mêmes variables globales)

// ══════════════════════════════════════════════════════════════════
// CLAUDE (script, mise en scène, traduction, quiz, SEO)
// ══════════════════════════════════════════════════════════════════
const CLAUDE_API = 'https://api.anthropic.com/v1/messages';
const CLAUDE_FALLBACK_MODELS = ['claude-opus-5'];   // modèles qui acceptent fallbacks: "default"
function getClaudeKey() { return getLS(STORAGE.CLAUDE_KEY).trim(); }
const CLAUDE_DEFAULT_MODEL = 'claude-opus-5-5';   // plus récent et ~20 % moins cher qu'Opus 5
function getClaudeModel() { return getLS(STORAGE.CLAUDE_MODEL) || CLAUDE_DEFAULT_MODEL; }
// une fois : l'ancien choix par défaut (Opus 5) passe à Opus 5.5
try { if (!localStorage.getItem('claude_model_v55') && localStorage.getItem(STORAGE.CLAUDE_MODEL) === 'claude-opus-5') localStorage.setItem(STORAGE.CLAUDE_MODEL, CLAUDE_DEFAULT_MODEL); localStorage.setItem('claude_model_v55', '1'); } catch (e) {}
// Effort (réflexion) : « low » pour les petits textes, « medium » pour le courant, « high » pour ce qui compte le plus
const claudeSupportsEffort = model => !/haiku/.test(model);

// webSearch : nombre maximal de recherches internet (outil web_search d'Anthropic, ≈ 0,01 $ la recherche)
async function callClaude({ system, prompt, schema = null, maxTokens = 16000, images = null, effort = 'medium', webSearch = 0 }) {
    const key = getClaudeKey();
    if (!key) throw new Error('clé Claude manquante');
    const model = getClaudeModel();
    // images : liste de data URI (captures d'écran de statistiques…)
    const content = images && images.length
        ? [...images.map(d => ({ type: 'image', source: { type: 'base64', media_type: d.slice(5, d.indexOf(';')), data: d.slice(d.indexOf(',') + 1) } })), { type: 'text', text: prompt }]
        : prompt;
    // Cache des consignes : le « system » (identique d'un appel à l'autre) est gardé 5 min par Anthropic ;
    // les appels suivants le relisent à ~10 % du prix (ignoré s'il est trop court pour être mis en cache)
    const body = { model, max_tokens: maxTokens, messages: [{ role: 'user', content }] };
    if (system) body.system = [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }];
    if (schema) body.output_config = { format: { type: 'json_schema', schema } };
    if (effort && claudeSupportsEffort(model)) body.output_config = { ...(body.output_config || {}), effort };
    const headers = {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true'
    };
    if (CLAUDE_FALLBACK_MODELS.includes(model)) { body.fallbacks = 'default'; headers['anthropic-beta'] = 'server-side-fallback-2026-07-01'; }
    if (webSearch) body.tools = [{ type: 'web_search_20260209', name: 'web_search', max_uses: webSearch }];
    let data, texts = [];
    // la recherche internet tourne côté Anthropic ; si elle marque une pause (pause_turn), on renvoie le tour pour qu'elle reprenne
    for (let round = 0; round < 4; round++) {
        let res;
        try { res = await fetch(CLAUDE_API, { method: 'POST', headers, body: JSON.stringify(body) }); }
        catch (e) { throw new Error('connexion à Claude impossible'); }
        data = await res.json().catch(() => null);
        if (!res.ok) {
            if (res.status === 401) throw new Error('clé Claude invalide');
            if (res.status === 429) throw new Error('trop de requêtes, réessaie dans une minute');
            if (res.status === 529 || res.status >= 500) throw new Error('Claude est surchargé, réessaie plus tard');
            throw new Error(data?.error?.message || ('erreur HTTP ' + res.status));
        }
        trackClaudeUsage(data, model);
        if (data.stop_reason !== 'pause_turn') break;
        texts.push(...(data.content || []).filter(b => b.type === 'text').map(b => b.text));
        body.messages = [...body.messages, { role: 'assistant', content: data.content }];
    }
    if (data.stop_reason === 'refusal') throw new Error('Claude a refusé cette demande');
    if (data.stop_reason === 'max_tokens') throw new Error('réponse trop longue, coupée');
    const text = (webSearch ? texts.join('') : '') + (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    if (!schema) return text.trim();
    try { return JSON.parse(text); } catch (e) { throw new Error('réponse de Claude illisible'); }
}
function trackClaudeUsage(data, model) {
    if (data.usage && data.usage.server_tool_use?.web_search_requests && typeof trackCost === 'function') trackCost('claude', data.usage.server_tool_use.web_search_requests * 0.0093);
    if (data.usage && typeof trackCost === 'function') {
        const [pi, po] = CLAUDE_PRICES[data.model] || CLAUDE_PRICES[model] || CLAUDE_PRICES['claude-opus-5-5'];
        const u = data.usage, cw = u.cache_creation_input_tokens || 0, cr = u.cache_read_input_tokens || 0;
        // écriture en cache : 1,25 × le prix ; relecture : 0,1 ×
        const rf = CLAUDE_CACHE_READ[data.model] || CLAUDE_CACHE_READ[model] || 0.1;
        trackCost('claude', ((u.input_tokens || 0) * pi + cw * pi * 1.25 + cr * pi * rf + (u.output_tokens || 0) * po) / 1e6);
        if (cr) { state.claudeCacheSaved = (state.claudeCacheSaved || 0) + cr * pi * (1 - rf) / 1e6; log('Claude : ' + cr + ' jetons relus depuis le cache'); }
    }
}

const LINES_SCHEMA = {
    type: 'object',
    properties: { lines: { type: 'array', items: { type: 'string' } } },
    required: ['lines'], additionalProperties: false
};
function claudeContext() {
    const lang = LANG_NAMES_FR[state.language] || 'français';
    return 'Langue : ' + lang + '. Public : ' + AUDIENCE_PROMPTS[state.audience] + ' Ton : ' + TONE_PROMPTS[state.tone] + '.' + (typeof charterContext === 'function' ? charterContext() : '');
}
const SPEECH_RULES = 'Règles pour une voix de synthèse : phrases courtes (moins de 20 mots), une idée par phrase, nombres et dates écrits en toutes lettres, aucune abréviation, aucun sigle non prononçable, aucun symbole (%, €, &, /), mots simples et courants.';

async function generateScriptAI(theme) {
    if (!getClaudeKey()) { showToast('Ajoute ta clé Claude en haut de la page', 'error'); return null; }
    setStatus('Claude écrit le script…');
    try {
        const out = await callClaude({
            system: 'Tu écris des scripts de vidéos pédagogiques animées. Chaque ligne est dite par un personnage cartoon face caméra et devient une scène de 6 secondes. ' + SPEECH_RULES,
            effort: 'high',
            prompt: (() => {
                const f = typeof SCRIPT_FORMATS !== 'undefined' ? SCRIPT_FORMATS[document.getElementById('script-format-select')?.value] : null;
                return (typeof scriptExtras === 'function' ? scriptExtras() : '') + (f
                    ? claudeContext() + '\nÉcris un script de ' + f.lines + ' lignes sur le sujet : « ' + theme + ' ». Format : ' + f.label + '. Règles pour que les gens regardent jusqu\'au bout : ' + f.rules + '. Chaque ligne doit pouvoir être dite en 6 secondes environ.'
                    : claudeContext() + '\nÉcris un script de 10 à 14 lignes sur le sujet : « ' + theme + ' ». Première ligne : accroche et salutation. Dernière ligne : conclusion chaleureuse. Chaque ligne doit pouvoir être dite en 6 secondes environ.');
            })(),
            schema: LINES_SCHEMA
        });
        const lines = (out.lines || []).map(l => String(l).trim()).filter(Boolean);
        return lines.length ? lines.join('\n') : null;
    } catch (e) { showToast('Script IA impossible : ' + e.message, 'error', 5000); return null; }
    finally { setStatus(null); }
}

async function improveScriptForSpeech() {
    if (!state.scenes.length) { showToast('Écris d\'abord un script', 'warn'); return; }
    if (!getClaudeKey()) { showToast('Ajoute ta clé Claude en haut de la page', 'error'); return; }
    setStatus('Claude simplifie la prononciation…');
    try {
        const out = await callClaude({
            system: 'Tu adaptes des scripts pour qu\'une voix d\'IA les prononce parfaitement, sans changer le sens. ' + SPEECH_RULES,
            prompt: claudeContext() + '\nRéécris chacune de ces ' + state.scenes.length + ' lignes. Renvoie exactement ' + state.scenes.length + ' lignes, dans le même ordre :\n\n' + state.scenes.map((l, i) => (i + 1) + '. ' + l).join('\n'),
            schema: LINES_SCHEMA
        });
        const lines = (out.lines || []).map(l => String(l).replace(/^\d+[.)]\s*/, '').trim()).filter(Boolean);
        if (!lines.length) throw new Error('réponse vide');
        writeSceneLines(lines);
        updateScriptStats(); renderScenesEditor();
        showToast('Script adapté à la voix ✓', 'success');
    } catch (e) { showToast('Impossible : ' + e.message, 'error', 5000); }
    finally { setStatus(null); }
}

const PLAN_SCHEMA = {
    type: 'object',
    properties: {
        setting: { type: 'string' },
        scenes: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    spoken: { type: 'string' },
                    action: { type: 'string' },
                    keywords: { type: 'array', items: { type: 'string' } },
                    camera: { type: 'string', enum: CAMERA_SHOTS },
                    bubble: { type: 'string' },
                    zoom: { type: 'string', enum: ['in', 'none'] },
                    emphasis: { type: 'string' },
                    section: { type: 'string' },
                    hook: { type: 'string' },
                    shot: { type: 'string', enum: ['character', 'board'] },
                    highlight: { type: 'string' },
                    narration: { type: 'string' },
                    visual: { type: 'string' },
                    graphic: {
                        type: 'object',
                        properties: {
                            type: { type: 'string', enum: ['none', 'counter', 'bars', 'list', 'compare', 'timeline', 'chain', 'beforeafter'] },
                            title: { type: 'string' }, unit: { type: 'string' },
                            items: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, value: { type: 'number' }, icon: { type: 'string' } }, required: ['label', 'value', 'icon'], additionalProperties: false } }
                        },
                        required: ['type', 'title', 'unit', 'items'], additionalProperties: false
                    }
                },
                required: ['spoken', 'action', 'keywords', 'camera', 'bubble', 'zoom', 'emphasis', 'section', 'hook', 'shot', 'highlight', 'narration', 'visual', 'graphic'], additionalProperties: false
            }
        }
    },
    required: ['setting', 'scenes'], additionalProperties: false
};
function planSchema() {
    const sc = JSON.parse(JSON.stringify(PLAN_SCHEMA));
    const imgs = typeof userImages === 'function' ? userImages() : [];
    if (imgs.length) {
        sc.properties.scenes.items.properties.image = { type: 'string', enum: ['none'].concat(imgs.map(x => x.id)) };
        sc.properties.scenes.items.required.push('image');
    }
    if (state.stickersOn !== false && typeof STICKER_NAMES !== 'undefined') {
        sc.properties.scenes.items.properties.sticker = { type: 'string', enum: ['none'].concat(STICKER_NAMES) };
        sc.properties.scenes.items.properties.stickerText = { type: 'string' };
        sc.properties.scenes.items.required.push('sticker', 'stickerText');
    }
    if (state.transition === 'smart' && typeof TRANSITION_NAMES !== 'undefined') {
        sc.properties.scenes.items.properties.transition = { type: 'string', enum: ['none'].concat(TRANSITION_NAMES) };
        sc.properties.scenes.items.required.push('transition');
    }
    if (typeof stableActive === 'function' && stableActive()) {
        sc.properties.scenes.items.properties.pose = { type: 'string', enum: castPoses().map(p => p.id) };
        sc.properties.scenes.items.required.push('pose');
    } else if (state.poses.length && !referenceImage()) {
        sc.properties.scenes.items.properties.pose = { type: 'string', enum: ['main'].concat(state.poses.map(p => p.id)) };
        sc.properties.scenes.items.required.push('pose');
    }
    return sc;
}
function planRequestFor(scenes) {
    const style = CARTOON_STYLES.find(s => s.id === state.selectedStyle);
    const wbRules = isWhiteboard()
        ? '\nMODE TABLEAU BLANC : le décor est un fond blanc vide ; "setting" doit valoir "". Le personnage reste à gauche de l\'image ; ses actions consistent à dessiner avec un feutre, montrer ou expliquer vers l\'espace vide à sa droite (où apparaîtront les dessins). "camera" vaut toujours "medium-wide shot".'
        : '';
    return {
        effort: 'high',
        system: 'Tu es réalisateur de dessins animés pédagogiques. Tu prépares la mise en scène d\'une vidéo générée scène par scène par une IA vidéo à partir de la photo d\'un personnage. Toutes les scènes doivent donner l\'impression d\'un seul plan-séquence continu : même décor, même lumière, gestes qui s\'enchaînent logiquement d\'une scène à l\'autre.',
        prompt: claudeContext() + '\nStyle visuel : ' + (style ? style.name : 'cartoon') + '.\n' +
            'Pour la vidéo entière, donne "setting" : une description en anglais (1 à 2 phrases) d\'un décor unique, SIMPLE et épuré (peu d\'objets, fond calme qui ne détourne pas l\'attention du personnage), lié au sujet, qui restera identique dans toutes les scènes. Aucun texte, panneau écrit ou lettre dans le décor.\n' +
            'Puis pour CHACUNE des ' + scenes.length + ' répliques ci-dessous, dans le même ordre, donne :\n' +
            '- "spoken" : la réplique à prononcer, dans la langue de la vidéo, sans changer le sens, adaptée à une voix de synthèse (' + SPEECH_RULES + ')\n' +
            '- "action" : en anglais, un geste SIMPLE du personnage, les mains vides (commence par un verbe, ex. "gestures with an open hand toward the side", "counts on their fingers", "raises one finger"), qui prolonge naturellement le geste précédent. INTERDIT : tenir, montrer ou faire apparaître un objet, un document, une carte, un écran, un panneau, un accessoire ou un effet visuel (l\'IA vidéo les dessine mal) ; tout ce qui illustre passe par "visual"\n' +
            '- "keywords" : 2 ou 3 mots-clés très courts (1 à 3 mots chacun) qui résument l\'idée de la réplique' + (richActive() ? ' et de sa narration' : '') + ', dans la langue de la vidéo\n' +
            '- "camera" : le cadrage, en variant les plans d\'une scène à l\'autre\n' +
            '- "bubble" : 2 à 5 mots-clés à afficher dans une bulle, dans la langue de la vidéo, ou "" si la scène n\'en a pas besoin (une scène sur deux environ)\n' +
            '- "zoom" : "in" pour les moments forts (environ une scène sur trois, jamais deux de suite), sinon "none"\n' +
            '- "emphasis" : si zoom vaut "in", LE mot de "spoken" (écrit exactement pareil) sur lequel le zoom démarre, sinon ""\n' +
            '- "section" : si cette réplique ouvre une nouvelle partie de la vidéo, un titre très court (2 à 4 mots) ; sinon "". 2 à 4 parties au total, jamais sur la première réplique, aucune partie si la vidéo a moins de 6 répliques\n\n' +
            '- "hook" : ' + (shortsMode() ? 'pour la PREMIÈRE réplique seulement : l\'accroche écrite en très gros à l\'écran pendant les 2 premières secondes du Short (2 à 5 mots-chocs, dans la langue de la vidéo : question, chiffre, promesse ; elle complète la réplique sans la répéter mot pour mot) ; "" pour toutes les autres' : 'toujours ""') + '\n' +
            '- "shot" : ' + (isWhiteboard() ? '"board" quand le dessin explique mieux que le personnage (environ une réplique sur quatre, jamais la première ni la dernière, jamais deux de suite) : on ne verra alors que le tableau en plein écran ; sinon "character"' : 'toujours "character"') + '\n' +
            '- "highlight" : si la réplique contient un chiffre clé, une date ou une définition courte à retenir, ce texte très court (1 à 5 mots, ex. "70 %", "1789", "H₂O") ; sinon "" (au plus une réplique sur trois)\n' +
            '- "visual" : en français, ce qu\'il faut dessiner pour illustrer PRÉCISÉMENT l\'idée de la réplique' + (richActive() ? ' et de sa narration' : '') + ' : objets concrets, composition simple, sans aucun texte (1 phrase)\n' +
            (richActive()
                ? (shortsMode() ? 'FORMAT SHORT : "narration" au plus 1 phrase courte, et seulement pour 1 ou 2 répliques qui en ont vraiment besoin (la vidéo doit rester sous 60 secondes). ' : '') + '- "narration" : SCÈNES RICHES. Si la réplique contient plusieurs phrases, "spoken" = la première phrase (courte, dite face caméra) et "narration" = la suite, sans la changer. Si elle n\'a qu\'une phrase, "narration" = 1 à 2 phrases (dans la langue de la vidéo) qui approfondissent l\'idée (exemple concret, chiffre juste, comparaison), exactes et faciles à prononcer, dites par la voix off pendant qu\'on montre l\'illustration en plein écran. "narration" vaut "" pour la toute première et la toute dernière réplique.\n'
                : '- "narration" : toujours ""\n') +
            '- "graphic" : ' + (richActive() ? 'pour les scènes qui ont une narration, un graphique animé (motion design) affiché sur le plan illustré QUAND il explique mieux qu\'un dessin : "counter" (un chiffre clé : 1 élément), "bars" (2 à 5 valeurs comparables), "list" (2 à 4 étapes ou idées courtes, "value" = 0), "compare" (2 éléments face à face), "timeline" (frise : 2 à 6 dates dans l\'ordre, "value" = l\'année, ex. 1789, "label" = l\'événement), "chain" (2 à 4 étapes de cause à conséquence, "value" = 0), "beforeafter" (exactement 2 éléments : la situation avant puis après, "value" = 0) ; "title" très court, "unit" (ex. "%", "km", "°C" ou ""), labels de 1 à 4 mots ; "icon" de chaque élément = 1 à 3 mots-clés ANGLAIS d\'un pictogramme simple (ex. "crown", "scale, justice", "factory") ou "". Varie les types d\'une scène à l\'autre. Les chiffres et les dates doivent être EXACTS (ne rien inventer). Au plus une scène sur trois ; sinon type "none" avec des champs vides' : 'toujours type "none", title "", unit "", items []') + '\n' +
            (typeof userImagesPlanLine === 'function' ? userImagesPlanLine() : '') +
            (state.transition === 'smart' && typeof transitionPlanLine === 'function' ? transitionPlanLine() : '') +
            (state.stickersOn !== false && typeof stickerPlanLine === 'function' ? stickerPlanLine() : '') +
            (typeof stableActive === 'function' && stableActive() ? '- "pose" : la pose du personnage pendant la réplique, parmi : ' + castPoses().map(p => '"' + p.id + '" (' + (CAST_POSES.find(c => c.id === p.id)?.label || p.id) + ')').join(', ') + '. Choisis celle qui colle au sens (salue au début, montre pour un exemple, réfléchit pour une question, surpris pour un chiffre étonnant, content pour la conclusion) ; varie, mais garde « main » pour environ une réplique sur trois.\n' : '') +
            (!(typeof stableActive === 'function' && stableActive()) && state.poses.length && !referenceImage() ? '- "pose" : la pose de départ du personnage la plus adaptée, parmi : "main" (pose normale), ' + state.poses.map(p => '"' + p.id + '" (' + (POSE_TYPES.find(t => t.id === p.id)?.label || p.id) + ')').join(', ') + '. Varie les poses.\n' : '') +
            wbRules + '\n\nRépliques :\n' + scenes.map((l, i) => (i + 1) + '. ' + l).join('\n'),
        schema: planSchema()
    };
}
async function planScenesWithClaude(scenes) {
    const out = await callClaude(planRequestFor(scenes));
    if (!out || !Array.isArray(out.scenes) || !out.scenes.length) throw new Error('mise en scène vide');
    const fb = fallbackScenePlan(scenes).scenes;
    return {
        setting: isWhiteboard() ? '' : String(out.setting || '').replace(/"/g, "'"),
        scenes: scenes.map((text, i) => {
            const p = out.scenes[i] || {};
            return { spoken: p.spoken || text, action: p.action || fb[i].action, camera: p.camera || fb[i].camera, bubble: String(p.bubble || '').slice(0, 60),
                zoom: p.zoom === 'in' ? 'in' : 'none', emphasis: String(p.emphasis || '').slice(0, 40), section: i > 0 ? String(p.section || '').slice(0, 40) : '', hook: i === 0 ? String(p.hook || '').trim().slice(0, 48) : '',
                shot: isWhiteboard() && p.shot === 'board' && i > 0 && i < scenes.length - 1 ? 'board' : 'character', highlight: String(p.highlight || '').slice(0, 40),
                narration: richActive() && i > 0 && i < scenes.length - 1 ? String(p.narration || '').trim() : (richActive() && splitSentences(text).length > 1 ? splitSentences(text).slice(1).join(' ') : ''), visual: String(p.visual || '').slice(0, 300), graphic: normalizeGraphic(p.graphic), keywords: normKeywords(p.keywords),
                pose: (typeof stableActive === 'function' && stableActive() ? castPoses() : state.poses).some(x => x.id === p.pose) ? p.pose : 'main',
                image: i > 0 && typeof userImages === 'function' && userImages().some(x => x.id === p.image) ? p.image : 'none',
                transition: i > 0 && typeof TRANSITIONS !== 'undefined' && TRANSITIONS[p.transition] ? p.transition : 'none',
                sticker: i > 0 && typeof STICKERS !== 'undefined' && STICKERS[p.sticker] ? p.sticker : 'none', stickerText: String(p.stickerText || '').trim().slice(0, 70) };
        })
    };
}

// ══════════════════════════════════════════════════════════════════
// POSES DU PERSONNAGE (planche) — Claude choisit la pose de départ de chaque scène
// ══════════════════════════════════════════════════════════════════
const POSE_TYPES = [
    { id: 'explique', label: 'Explique (mains ouvertes)' },
    { id: 'montre', label: 'Montre / pointe' },
    { id: 'dessine', label: 'Dessine au feutre' },
    { id: 'reflechit', label: 'Réfléchit' },
    { id: 'salue', label: 'Salue / accueille' },
    { id: 'surpris', label: 'Surpris' },
    { id: 'rigole', label: 'Rigole' }
];
async function loadPoses() {
    try { state.poses = (await idbGet('poses')) || []; } catch (e) { state.poses = []; }
    renderPoses();
}
async function savePoses() {
    try { await idbPut('poses', state.poses); } catch (e) { showToast('Poses impossibles à enregistrer', 'error'); }
    renderPoses(); updateEstimate();
}
function renderPoses() {
    const box = document.getElementById('poses-list'); if (!box) return;
    if (!state.poses.length) { box.innerHTML = '<div class="prompt-main-hint">Aucune pose : toutes les scènes partent de la photo principale.</div>'; return; }
    box.innerHTML = state.poses.map(p => '<div class="pose-item"><img src="' + p.image + '" alt=""><span>' + esc(POSE_TYPES.find(t => t.id === p.id)?.label || p.id) + '</span><button type="button" data-pose-del="' + esc(p.id) + '">✕</button></div>').join('');
}
async function addPoseFromFile(file, id) {
    if (!file || !file.type.startsWith('image/')) return;
    const small = await downscaleImage(await fileToDataUri(file), 1024, 0.88);
    state.poses = state.poses.filter(p => p.id !== id).concat([{ id, image: small }]);
    await savePoses();
    showToast('Pose « ' + (POSE_TYPES.find(t => t.id === id)?.label || id) + ' » ajoutée ✓', 'success');
}
function imageForScene(i) {
    const ref = referenceImage();
    if (ref) return ref;
    const pid = scenePlanFor(i).pose;
    const p = pid && pid !== 'main' ? state.poses.find(x => x.id === pid) : null;
    return p ? p.image : null;
}

// ══════════════════════════════════════════════════════════════════
// STORYBOARD — mise en scène et dessins validés AVANT de payer les scènes Agnes
// ══════════════════════════════════════════════════════════════════
function storyboardValid() { return state.storyboardApproved && state.storyboardSig === currentScriptSignature() && !!state.scenePlan; }
async function prepareStoryboardFlow() {
    if (state.storyboarding) return;
    state.storyboarding = true; state.storyboardApproved = false; updateGenerateBtn();
    try {
        await ensureIdentity();
        await prepareScenePlan();
        if (needsDrawings() && getClaudeKey()) { setStatus('Claude dessine les illustrations…'); await prepareDrawings(); }
        state.storyboardSig = currentScriptSignature();
        renderStoryboard();
        if (NAV.tab !== 'create' || NAV.step !== 2) wizardGo(2); else renderWizard();
        showToast('Storyboard prêt : vérifie, modifie si besoin, puis valide', 'success', 5000);
    } catch (e) { showToast('Storyboard impossible : ' + e.message, 'error', 6000); }
    finally { state.storyboarding = false; setStatus(null); updateGenerateBtn(); }
}
function renderStoryboard() {
    const box = document.getElementById('storyboard'); if (!box || !state.scenePlan) return;
    const wb = needsDrawings();
    const poseOpts = [['main', 'Photo principale']].concat(state.poses.map(p => [p.id, POSE_TYPES.find(t => t.id === p.id)?.label || p.id]));
    // personnage stable : les poses validées au casting
    const stablePoses = typeof stableActive === 'function' && stableActive() ? castPoses().map(x => [x.id, '🎭 ' + (CAST_POSES.find(c => c.id === x.id)?.label || x.id)]) : null;
    const opt = (list, cur) => list.map(([v, l]) => '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(l) + '</option>').join('');
    box.innerHTML = '<div class="sb-title">📋 Storyboard — vérifie avant de générer</div>' +
        '<div class="prompt-main-hint" style="margin-bottom:0.7rem;">Rien n\'est encore payé chez Agnes. Modifie ce que tu veux, puis valide le storyboard.</div>' +
        '<button type="button" class="btn-secondary" id="sb-animatic">🎬 Voir le brouillon animé (≈ 1 min, sans Agnes)</button><div class="preview-box hidden" id="animatic-box"></div>' +
        state.scenes.map((line, i) => {
            const p = scenePlanFor(i);
            return '<div class="sb-card">' +
                '<div class="sb-head"><b>Scène ' + (i + 1) + '</b>' + (p.section ? '<span class="sb-part">📌 ' + esc(p.section) + '</span>' : '') + '</div>' +
                (wb ? '<canvas class="sb-draw' + (state.drawings[i] ? '' : ' hidden') + '" data-sb-canvas="' + i + '" width="400" height="300"></canvas><button type="button" class="sb-mini" data-sb-redraw="' + i + '">' + (state.drawings[i] ? '🔄 Redessiner' : '🖊️ Dessiner cette scène') + '</button><button type="button" class="sb-mini" data-sb-photo="' + i + '">📷 Depuis une image</button>' : '') +
                '<label class="control-label">Texte dit par le personnage</label><textarea class="sb-text" data-sb-field="spoken" data-i="' + i + '">' + esc(p.spoken || line) + '</textarea>' +
                '<div class="sb-grid">' +
                (p.narration || richActive() ? '<label class="control-label">Voix off sur le plan illustré</label><textarea class="sb-text" data-sb-field="narration" data-i="' + i + '" placeholder="(aucune)">' + esc(p.narration || '') + '</textarea>' : '') +
                (p.visual ? '<div class="prompt-main-hint">🖊️ ' + esc(p.visual) + '</div>' : '') +
                (isWhiteboard() ? '<select data-sb-field="shot" data-i="' + i + '">' + opt([['character', '🧑 Personnage'], ['board', '🖊️ Tableau seul']], p.shot || 'character') + '</select>' : '') +
                '<select data-sb-field="zoom" data-i="' + i + '">' + opt([['none', 'Pas de zoom'], ['in', '🔍 Zoom' + (p.emphasis ? ' sur « ' + p.emphasis + ' »' : '')]], p.zoom || 'none') + '</select>' +
                (stablePoses ? '<select data-sb-field="pose" data-i="' + i + '">' + opt(stablePoses, p.pose || 'main') + '</select>' : state.poses.length ? '<select data-sb-field="pose" data-i="' + i + '">' + opt(poseOpts, p.pose || 'main') + '</select>' : '') +
                (i > 0 && state.transition === 'smart' && typeof TRANSITIONS !== 'undefined' ? '<select data-sb-field="transition" data-i="' + i + '">' + opt([['', '🎲 Choix automatique'], ['none', '✂️ Raccord simple']].concat(TRANSITION_NAMES.map(n => [n, '✨ ' + TRANSITIONS[n].label])), p.transition || '') + '</select>' : '') +
                (typeof STICKERS !== 'undefined' && state.stickersOn !== false ? '<select data-sb-field="sticker" data-i="' + i + '">' + opt([['none', 'Pas d\'autocollant']].concat(Object.keys(STICKERS).map(n => [n, STICKERS[n].label])), p.sticker || 'none') + '</select>' : '') +
                '</div>' +
                (i === 0 && shortsMode() ? '<input class="text-input" data-sb-field="hook" data-i="0" placeholder="Accroche écrite en gros (2 premières secondes)" value="' + esc(p.hook || '') + '">' : '') +
                (p.sticker && p.sticker !== 'none' && state.stickersOn !== false ? '<input class="text-input" data-sb-field="stickerText" data-i="' + i + '" placeholder="Texte de l\'autocollant" value="' + esc(p.stickerText || '') + '">' : '') +
                '<input class="text-input" data-sb-field="bubble" data-i="' + i + '" placeholder="Mot-clé écrit (optionnel)" value="' + esc(p.bubble || '') + '">' +
                '<input class="text-input" data-sb-field="highlight" data-i="' + i + '" placeholder="Chiffre ou définition en grand (optionnel)" value="' + esc(p.highlight || '') + '">' +
                (i > 0 && !shortsMode() ? '<input class="text-input" data-sb-field="section" data-i="' + i + '" placeholder="Titre de nouvelle partie (optionnel)" value="' + esc(p.section || '') + '">' : '') +
                '</div>';
        }).join('') +
        '<button type="button" class="btn-primary" id="sb-approve">✅ Valider le storyboard</button>' +
        '<button type="button" class="btn-secondary" id="sb-redo" style="margin-top:0.4rem;">↺ Refaire tout le storyboard</button>';
    box.classList.remove('hidden');
    if (wb) state.scenes.forEach((_, i) => drawStoryboardCanvas(i));
}
function drawStoryboardCanvas(i) {
    const c = document.querySelector('[data-sb-canvas="' + i + '"]'); if (!c) return;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    const d = state.drawings[i];
    if (d) drawSketch(g, { x: 0, y: 0, w: c.width, h: c.height }, d, 1, 1);
    else { g.fillStyle = '#aaa'; g.font = '600 16px ' + UI_FONT; g.textAlign = 'center'; g.fillText(getClaudeKey() ? 'Pas de dessin' : 'Dessins : clé Claude requise', c.width / 2, c.height / 2); }
}
function ensurePlanScene(i) {
    if (!state.scenePlan) state.scenePlan = fallbackScenePlan(state.scenes);
    if (!state.scenePlan.scenes[i]) state.scenePlan.scenes[i] = fallbackScenePlan(state.scenes).scenes[i];
    return state.scenePlan.scenes[i];
}
document.addEventListener('input', e => {
    const f = e.target.dataset?.sbField; if (!f) return;
    ensurePlanScene(parseInt(e.target.dataset.i, 10))[f] = e.target.value;
});
document.addEventListener('change', e => {
    const f = e.target.dataset?.sbField; if (!f) return;
    ensurePlanScene(parseInt(e.target.dataset.i, 10))[f] = e.target.value;
    if (f === 'section' || f === 'sticker') renderStoryboard();
});
document.addEventListener('click', async e => {
    const t = e.target.closest ? e.target : null; if (!t) return;
    if (t.id === 'sb-approve') approveStoryboard(); else if (t.id === 'sb-redo') { prepareStoryboardFlow(); }
    else if (t.id === 'sb-close') { document.getElementById('storyboard')?.classList.add('hidden'); }
    else if (t.dataset?.sbRedraw !== undefined) {
        const i = parseInt(t.dataset.sbRedraw, 10);
        t.disabled = true; t.textContent = '⏳ Dessin…';
        try { state.drawings[i] = await generateDrawing(scenePlanFor(i).spoken || state.scenes[i], i, state.scenes.length); document.querySelector('[data-sb-canvas="' + i + '"]')?.classList.remove('hidden'); drawStoryboardCanvas(i); }
        catch (err) { showToast('Dessin impossible : ' + err.message, 'error'); }
        finally { t.disabled = false; t.textContent = '🔄 Redessiner'; }
    } else if (t.dataset?.sbPhoto !== undefined) {
        // 8.8 : une photo ou un dessin de l'utilisateur, retracé au feutre (gratuit, rien n'est envoyé)
        const i = parseInt(t.dataset.sbPhoto, 10), input = document.createElement('input');
        input.type = 'file'; input.accept = 'image/*';
        input.onchange = async () => {
            const file = input.files && input.files[0]; if (!file) return;
            t.disabled = true; t.textContent = '⏳ Dessin…';
            try {
                const uri = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('image illisible')); r.readAsDataURL(file); });
                await drawingFromImage(i, uri);
                document.querySelector('[data-sb-canvas="' + i + '"]')?.classList.remove('hidden'); drawStoryboardCanvas(i);
            } catch (err) { showToast('Dessin impossible : ' + err.message, 'error'); }
            finally { t.disabled = false; t.textContent = '📷 Depuis une image'; }
        };
        input.click();
    } else if (t.dataset?.poseDel) {
        state.poses = state.poses.filter(p => p.id !== t.dataset.poseDel); savePoses();
    }
});
