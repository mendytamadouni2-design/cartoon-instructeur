// Cartoon Instructeur · Script, images, prompts Agnes, sous-titres
// (scripts classiques chargés dans l'ordre par index.html : ils partagent les mêmes variables globales)

// ══════════════════════════════════════════════════════════════════
// SCRIPT → SCÈNES
// ══════════════════════════════════════════════════════════════════
function splitScriptIntoScenes(script) { return script.split(/\n+/).map(l => l.trim()).filter(l => l.length > 0); }
function updateScriptStats() {
    const scriptInput = document.getElementById('script-input');
    const statsEl = document.getElementById('script-stats');
    const durEl = document.getElementById('script-duration');
    if (!scriptInput || !statsEl || !durEl) return;
    const script = scriptInput.value.trim();
    const lines = splitScriptIntoScenes(script);
    // Mode test : seulement 3 scènes (début, milieu, fin) pour essayer vite, tout le reste identique
    const idx = state.testMode ? testPick(lines.length) : null;
    const scenes = idx ? idx.map(k => lines[k]) : lines;
    const estimatedDuration = scenes.length * TARGET_SCENE_DURATION;
    statsEl.textContent = lines.length + ' phrase' + (lines.length > 1 ? 's' : '') + ' · ' + script.length + ' car.' + (idx ? ' · 🧪 test : 3 scènes' : '');
    durEl.textContent = 'Durée : ' + formatEta(estimatedDuration) + (idx ? ' 🧪' : estimatedDuration < 60 ? ' ⚠️' : ' ✓');
    state.testIdx = idx;
    state.scenes = scenes; state.script = script;
    updateGenerateBtn();
    if (typeof updateEstimate === 'function') updateEstimate();
}
function testPick(n) { return n > 3 ? [0, Math.floor(n / 2), n - 1] : null; }
// Écrit les lignes modifiées dans le script (en mode test, seules les 3 lignes testées sont remplacées)
function writeSceneLines(lines) {
    const el = document.getElementById('script-input'); if (!el) return;
    if (state.testMode && state.testIdx && lines.length === state.testIdx.length) {
        const all = splitScriptIntoScenes(el.value.trim());
        state.testIdx.forEach((k, j) => { all[k] = lines[j]; });
        el.value = all.join('\n');
    } else el.value = lines.join('\n');
}
function renderScenesEditor() {
    const editor = document.getElementById('scenes-editor'); if (!editor) return;
    if (state.testMode && state.testIdx) { editor.innerHTML = '<div style="font-size:0.78rem;color:var(--ink-dim);padding:0.5rem;">🧪 Mode test : désactive-le pour éditer scène par scène.</div>'; return; }
    if (!state.scenes.length) { editor.innerHTML = '<div style="font-size:0.78rem;color:var(--ink-dim);padding:0.5rem;">Écrivez un script d\'abord.</div>'; return; }
    editor.innerHTML = state.scenes.map((scene, i) => `
        <div class="scene-editor">
            <div class="scene-header"><span>Scène ${i + 1} / ${state.scenes.length}</span><span>~${TARGET_SCENE_DURATION}s</span></div>
            <textarea data-scene-index="${i}">${esc(scene)}</textarea>
            <div class="scene-actions">
                <button data-action="up" data-index="${i}">↑ Monter</button>
                <button data-action="down" data-index="${i}">↓ Descendre</button>
                <button data-action="delete" data-index="${i}">🗑️ Supprimer</button>
                <button data-action="duplicate" data-index="${i}">📋 Dupliquer</button>
            </div>
        </div>
    `).join('');
    editor.querySelectorAll('textarea[data-scene-index]').forEach(ta => {
        ta.addEventListener('input', e => { state.scenes[parseInt(ta.dataset.sceneIndex, 10)] = e.target.value; syncScenesToScript(); });
    });
    editor.querySelectorAll('button[data-action]').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.index, 10), action = btn.dataset.action;
            if (action === 'up' && idx > 0) [state.scenes[idx - 1], state.scenes[idx]] = [state.scenes[idx], state.scenes[idx - 1]];
            else if (action === 'down' && idx < state.scenes.length - 1) [state.scenes[idx + 1], state.scenes[idx]] = [state.scenes[idx], state.scenes[idx + 1]];
            else if (action === 'delete') state.scenes.splice(idx, 1);
            else if (action === 'duplicate') state.scenes.splice(idx + 1, 0, state.scenes[idx]);
            syncScenesToScript(); renderScenesEditor(); updateScriptStats();
        });
    });
}
function syncScenesToScript() { writeSceneLines(state.scenes); }

// ══════════════════════════════════════════════════════════════════
// IMAGES
// ══════════════════════════════════════════════════════════════════
function fileToDataUri(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = () => rej(new Error('lecture')); r.readAsDataURL(file); }); }
function generateThumbnail(dataUri) {
    return new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                const ratio = img.height / img.width;
                canvas.width = THUMBNAIL_MAX_WIDTH; canvas.height = Math.round(THUMBNAIL_MAX_WIDTH * ratio);
                const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            } catch (e) { resolve(dataUri); }
        };
        img.onerror = () => resolve(dataUri); img.src = dataUri;
    });
}
async function processOneFile(file) {
    if (!file.type.startsWith('image/')) return null;
    if (file.size > MAX_IMAGE_SIZE) return null;
    try { const dataUri = await fileToDataUri(file); const thumbnail = await generateThumbnail(dataUri); return { file, dataUri, thumbnail, id: Date.now() + Math.random() }; } catch (e) { return null; }
}
async function handleFiles(files) {
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (!imageFiles.length) return;
    state.isLoadingImages = true; updateGenerateBtn();
    const BATCH = 5;
    for (let i = 0; i < imageFiles.length; i += BATCH) {
        const results = await Promise.allSettled(imageFiles.slice(i, i + BATCH).map(f => processOneFile(f)));
        for (const r of results) if (r.status === 'fulfilled' && r.value) state.images.push(r.value);
        renderImages();
    }
    state.isLoadingImages = false; updateGenerateBtn();
    saveMainImages();
}
function removeImage(id) { state.images = state.images.filter(i => i.id !== id); renderImages(); updateGenerateBtn(); saveMainImages(); }
function renderImages() {
    const grid = document.getElementById('images-grid');
    grid.innerHTML = state.images.map(img =>
        '<div class="image-card"><img src="' + (img.thumbnail || img.dataUri) + '" loading="lazy"><button class="remove-btn" data-remove="' + img.id + '">✕</button></div>'
    ).join('');
    grid.querySelectorAll('[data-remove]').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); removeImage(parseFloat(btn.dataset.remove)); }));
}

// ══════════════════════════════════════════════════════════════════
// RENDU UI
// ══════════════════════════════════════════════════════════════════
function renderScriptPresets() {
    const container = document.getElementById('prompt-presets'); if (!container) return;
    container.innerHTML = SCRIPT_PRESETS.map((p, i) => '<div class="prompt-preset" data-preset="' + i + '">' + esc(p.label) + '</div>').join('');
    container.querySelectorAll('.prompt-preset').forEach(el => el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.preset, 10);
        document.getElementById('script-input').value = SCRIPT_PRESETS[idx].text;
        updateScriptStats(); renderScenesEditor();
        showToast('Exemple appliqué', 'success', 1200);
    }));
}
function renderStyles() {
    const container = document.getElementById('styles-grid');
    let html = '<div class="style-category-header">🎨 Styles cartoon</div><div class="style-category-desc">Chaque style conserve l\'identité du personnage.</div>';
    html += CARTOON_STYLES.map(s =>
        '<div class="style-card ' + (state.selectedStyle === s.id ? 'selected' : '') + '" data-style="' + s.id + '">' +
        '<div class="style-emoji">' + s.emoji + '</div><div><div class="style-name">' + esc(s.name) + '</div><div class="style-desc">' + esc(s.desc) + '</div></div></div>'
    ).join('');
    container.innerHTML = html;
    container.querySelectorAll('[data-style]').forEach(el => el.addEventListener('click', () => { state.selectedStyle = el.dataset.style; renderStyles(); if (typeof loadReference === 'function') { loadReference(); loadDecorImage(); } }));
}

// ══════════════════════════════════════════════════════════════════
// CONSTRUCTION PROMPT
// ══════════════════════════════════════════════════════════════════
const LANG_NAMES = { 'fr-FR': 'French', 'en-US': 'English', 'en-GB': 'English', 'es-ES': 'Spanish', 'de-DE': 'German', 'it-IT': 'Italian', 'pt-BR': 'Portuguese', 'ar-SA': 'Arabic', 'zh-CN': 'Chinese', 'ja-JP': 'Japanese', 'ko-KR': 'Korean', 'ru-RU': 'Russian' };
const LANG_NAMES_FR = { 'fr-FR': 'français', 'en-US': 'anglais (américain)', 'en-GB': 'anglais (britannique)', 'es-ES': 'espagnol', 'de-DE': 'allemand', 'it-IT': 'italien', 'pt-BR': 'portugais (brésilien)', 'ar-SA': 'arabe', 'zh-CN': 'chinois', 'ja-JP': 'japonais', 'ko-KR': 'coréen', 'ru-RU': 'russe' };
const CAMERA_SHOTS = ['medium shot', 'medium close-up', 'medium-wide shot', 'close-up', 'three-quarter angle medium shot', 'wide shot'];
const AUTO_ACTIONS = ['explains with open, expressive hand gestures', 'points toward something next to them', 'counts on their fingers', 'holds up and presents an object related to the topic', 'thinks with a hand on the chin, then smiles', 'nods enthusiastically', 'draws shapes in the air with one hand'];

// Mise en scène de secours (sans Claude) : plans et gestes variés, décor constant.
const WHITEBOARD_ACTIONS = ['holds a black marker and draws in the air toward the empty white space on the right', 'points with the marker toward the empty space on the right, smiling', 'turns slightly toward the right and sketches with the marker', 'explains with open hands, then gestures toward the right side', 'taps the marker in the air toward the right as if underlining something'];
function isWhiteboard() { return state.selectedStyle === 'whiteboard'; }
function fallbackScenePlan(scenes) {
    const actions = isWhiteboard() ? WHITEBOARD_ACTIONS : AUTO_ACTIONS;
    const rich = typeof richActive === 'function' && richActive();
    return {
        setting: '',
        scenes: scenes.map((text, i) => {
            // scènes riches : 1re phrase dite face caméra, la suite par la voix off sur un plan illustré
            const parts = rich ? splitSentences(text) : [];
            return {
            spoken: parts.length > 1 ? parts[0] : text, narration: parts.length > 1 ? parts.slice(1).join(' ') : '', visual: '', graphic: { type: 'none', title: '', unit: '', items: [] },
            action: state.motion === 'auto' || isWhiteboard() ? actions[i % actions.length] : (MOTION_PROMPTS[state.motion] || AUTO_ACTIONS[0]),
            camera: CAMERA_SHOTS[i % CAMERA_SHOTS.length],
            bubble: i === 0 ? (state.theme || '').slice(0, 40) : '',
            zoom: i % 3 === 1 ? 'in' : 'none', emphasis: '', section: '', shot: 'character', highlight: '', pose: 'main'
        }; })
    };
}
function scenePlanFor(i) {
    if (i < 0) { const b = (state.bankItems || []).find(x => x.sceneIndex === i); return { spoken: b?.sceneText || '', action: '', camera: 'medium shot', bubble: '' }; }
    const p = state.scenePlan?.scenes?.[i];
    return p || fallbackScenePlan(state.scenes).scenes[i] || { spoken: state.scenes[i] || '', action: '', camera: 'medium shot', bubble: '' };
}

function buildScenePrompt(item, override) {
    const sceneIndex = item.sceneIndex, totalScenes = override?.total || state.queue.length || state.scenes.length;
    const plan = override?.plan || scenePlanFor(sceneIndex);
    const style = CARTOON_STYLES.find(s => s.id === state.selectedStyle);
    const audience = AUDIENCE_PROMPTS[state.audience], tone = TONE_PROMPTS[state.tone];
    const lipsync = LIPSYNC_PROMPTS[state.lipsync];
    const fxList = state.pedagoFx.map(fx => PEDAGO_FX_PROMPTS[fx]).filter(Boolean);
    const langName = LANG_NAMES[state.language] || 'French';
    const spoken = String(plan.spoken || item.sceneText).replace(/"/g, "'");
    const parts = [];
    parts.push('Educational cartoon animation. This is shot ' + (sceneIndex + 1) + ' of ' + totalScenes + ' of ONE continuous video.');
    parts.push('The character from the input image MUST stay IDENTICAL: same face, hairstyle, body shape, clothing and colors.');
    const wb = isWhiteboard();
    // Image de référence : le style, le décor et le cadrage sont déjà dans l'image de départ
    const ref = !item.chained && typeof referenceImage === 'function' && !!referenceImage();
    const chained = !!item.chained;
    if (ref) {
        parts.push('The input image is the exact reference frame of this video: keep its art style, colors, character design, background, lighting and framing EXACTLY. Do not restyle, redraw or change anything in it.');
        if (state.greenScreen) parts.push('The background stays flat, evenly lit chroma-key green in every frame.');
    } else {
    if (style) parts.push('Visual style: ' + stylePromptFor(style));
    if (state.greenScreen) {
        parts.push('Background: flat, evenly lit pure chroma-key green (#00B140) backdrop filling the whole frame: no shadows on it, no gradient, no floor, no objects. The character has no green on its body or clothes.');
        if (wb) parts.push('Composition: the character stays on the LEFT side of the frame (left third).');
    } else if (wb) {
        parts.push('Background: pure plain white (#FFFFFF), completely empty in every shot: no floor, no furniture, no objects, no decoration, no scenery. Replace the background of the input image with pure white.');
        parts.push('Composition: the character stays on the LEFT side of the frame (left third). The rest of the frame stays EMPTY white space, where drawings will be added later.');
    } else {
        const setting = override ? override.setting : state.scenePlan?.setting;
        if (setting) parts.push('Setting, identical in every shot: ' + setting + '.');
        parts.push('Background: simple and uncluttered, few details, exactly the same place, colors and lighting in every shot.');
    }
    }
    // Raccords : chaque plan part de l'image de départ et revient à la même pose neutre (sauf en plan-séquence)
    if (chained) parts.push('This shot directly continues the previous one: it starts with the character already in motion, in the same place and the same lighting, with no intro.');
    else parts.push('The shot starts exactly on the input image, with the character in its neutral pose.');
    if (sceneIndex === 0) parts.push('Opening shot: the character greets the viewer.');
    if (sceneIndex === totalScenes - 1 && totalScenes > 1) parts.push('Final shot: the character wraps up warmly.');
    if (plan.action) parts.push('Action: the character ' + plan.action + '.');
    if (!chained) parts.push('In the last second, the character returns to the same neutral pose as at the start (facing the camera, arms relaxed), so that consecutive shots join seamlessly.');
    if (wb) parts.push('Camera: locked-off static medium-wide shot, identical framing in every shot. No zoom, no push-in, no camera movement at all.');
    else if (ref || state.camera === 'static') parts.push('Camera: locked-off static shot with exactly the same framing as the input image. No zoom, no push-in, no camera movement at all.');
    else parts.push('Camera: ' + (plan.camera || 'medium shot') + ', steady. No zoom-in at the start, no push-in intro, no dolly.');
    parts.push('The character talks to the viewer in ' + langName + ' and says (spoken audio only, never written): "' + spoken + '"');
    if (lipsync) parts.push(lipsync + '.');
    parts.push(tone + '.'); parts.push(audience);
    if (fxList.length && !wb) parts.push('Effects: ' + fxList.join(', ') + '.');
    parts.push('STRICTLY NO TEXT anywhere in the image: no letters, words, numbers, captions, subtitles, labels, logos, signs or writing. Speech bubbles, boards and screens stay empty or show simple pictures only.');
    if (state.videoFormat === 'portrait') parts.push('Vertical 9:16 composition.');
    else if (state.videoFormat === 'landscape') parts.push('Horizontal 16:9 composition.');
    if (effectiveMusicMode() !== 'agnes') parts.push('Audio: only the character\'s clear voice. No background music, no sound effects.');
    parts.push('24fps, no watermark.');
    return parts.join(' ');
}

// ══════════════════════════════════════════════════════════════════
// API AGNES
// ══════════════════════════════════════════════════════════════════
async function apiFetch(url, options = {}, label = 'API') {
    for (let attempt = 0; attempt < 7; attempt++) {
        if (state.stopRequested) throw new Error('Arrêt demandé');
        try {
            const res = await fetch(url, options);
            if (res.status === 429) {
                state.creationAttemptsSinceLastError = 0;
                if (createIntervalMs < CREATE_INTERVAL_SAFE) createIntervalMs = Math.min(createIntervalMs + 8000, CREATE_INTERVAL_MAX);
                const wait = [15, 30, 45, 60, 90, 120, 180][Math.min(attempt, 6)];
                setStatus('429… attente ' + wait + 's'); await sleep(wait * 1000); continue;
            }
            if (res.status === 503) { const wait = [5, 10, 15, 20, 30, 45][Math.min(attempt, 5)]; setStatus('503… attente ' + wait + 's'); await sleep(wait * 1000); continue; }
            if (res.ok && createIntervalMs > CREATE_INTERVAL_MIN) {
                state.creationAttemptsSinceLastError++;
                if (state.creationAttemptsSinceLastError >= 3) { createIntervalMs = Math.max(createIntervalMs - 4000, CREATE_INTERVAL_MIN); state.creationAttemptsSinceLastError = 0; }
            }
            return res;
        } catch (e) {
            if (e.message === 'Arrêt demandé') throw e;
            const wait = [3, 5, 8, 12, 20, 30][Math.min(attempt, 5)];
            setStatus('Connexion… ' + wait + 's'); await sleep(wait * 1000);
        }
    }
    return fetch(url, options);
}
async function createVideoTask(imageDataUri, prompt) {
    const body = { model: MODEL_VIDEO, prompt, image: imageDataUri, num_frames: state.durationFrames, frame_rate: FRAME_RATE };
    const res = await apiFetch(API_BASE + '/videos', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + getAgnesKey(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    }, 'Création');
    if (!res.ok) { const err = await res.text(); throw new Error('HTTP ' + res.status + ' ' + err.slice(0, 150)); }
    const data = await res.json();
    const videoId = data.video_id || data.id || data.task_id;
    if (!videoId) throw new Error('Pas de video_id');
    if (typeof trackCost === 'function') trackCost('agnes', AGNES_SCENE_PRICE);
    return videoId;
}
async function pollVideo(videoId, onProgress) {
    const estimatedSec = estimateGenerationTime(state.durationFrames) / 1000;
    let remaining = Math.max(20, Math.floor(estimatedSec * 0.8));
    while (remaining > 0) { if (state.stopRequested) throw new Error('Arrêt demandé'); onProgress('Préparation… ' + remaining + 's'); await sleep(1000); remaining--; }
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
        if (state.stopRequested) throw new Error('Arrêt demandé');
        if (attempt > 0) { let r = POLL_INTERVAL_SEC; while (r > 0) { if (state.stopRequested) throw new Error('Arrêt demandé'); onProgress('Création… ' + r + 's'); await sleep(1000); r--; } }
        const url = POLL_BASE + '?video_id=' + encodeURIComponent(videoId) + '&model_name=' + encodeURIComponent(MODEL_VIDEO);
        const res = await apiFetch(url, { headers: { 'Authorization': 'Bearer ' + getAgnesKey() } }, 'Polling');
        const d = await res.json();
        const status = d.status || 'unknown', progress = d.progress || 0;
        onProgress('Création… ' + progress + '%');
        if (['completed', 'succeeded', 'done'].includes(status)) {
            const videoUrl = (d.metadata && d.metadata.url) || d.url || (d.output && d.output.url);
            if (!videoUrl) throw new Error('Terminé sans URL');
            return videoUrl;
        }
        if (['failed', 'error', 'cancelled'].includes(status)) throw new Error('Échec ' + status);
    }
    throw new Error('Délai dépassé');
}

// ══════════════════════════════════════════════════════════════════
// ÉDITEUR SOUS-TITRES
// ══════════════════════════════════════════════════════════════════
let subtitleSegments = [], selectedSubtitleIndex = 0, subtitleScriptSignature = '';

function currentScriptSignature() { return state.scenes.join('\n'); }
function initSubtitleSegmentsFromScript() {
    subtitleScriptSignature = currentScriptSignature();
    let currentTime = 0;
    subtitleSegments = state.scenes.map((sceneText, i) => {
        const start = currentTime, end = currentTime + TARGET_SCENE_DURATION;
        currentTime = end;
        return { text: sceneText, start, end, sceneIndex: i };
    });
    selectedSubtitleIndex = 0;
}
function openSubtitleEditor() {
    const c = document.getElementById('subtitle-editor-container');
    if (!c) return;
    if (!subtitleSegments.length || subtitleScriptSignature !== currentScriptSignature()) initSubtitleSegmentsFromScript();
    c.classList.remove('hidden'); renderSubtitleEditor();
}
function renderSubtitleEditor() { renderSubtitleTimeline(); renderSubtitleList(); renderSubtitlePreview(); }
function renderSubtitleTimeline() {
    const t = document.getElementById('subtitle-timeline'); if (!t) return;
    if (!subtitleSegments.length) { t.innerHTML = ''; return; }
    const total = subtitleSegments[subtitleSegments.length - 1].end;
    t.innerHTML = subtitleSegments.map((seg, i) => {
        const fg = Math.max(1, (seg.end - seg.start) / total * 100);
        return '<div class="timeline-seg ' + (i === selectedSubtitleIndex ? 'active' : '') + '" data-seg="' + i + '" style="flex:' + fg + ' 1 0; min-width:20px;"><span class="seg-label">' + (i + 1) + '</span></div>';
    }).join('');
    t.querySelectorAll('[data-seg]').forEach(el => el.addEventListener('click', () => { selectedSubtitleIndex = parseInt(el.dataset.seg, 10); renderSubtitleEditor(); }));
}
function renderSubtitleList() {
    const list = document.getElementById('subtitle-editor-list'); if (!list) return;
    if (!subtitleSegments.length) { list.innerHTML = '<div style="font-size:0.75rem;color:var(--ink-dim);padding:0.5rem;">Aucun segment.</div>'; return; }
    list.innerHTML = subtitleSegments.map((seg, i) => `
        <div class="subtitle-editor" style="${i === selectedSubtitleIndex ? 'border-color:var(--accent);border-width:2px;' : ''}">
            <div class="sub-header"><span>Segment ${i + 1} / ${subtitleSegments.length}</span><span>${formatEta(seg.end - seg.start)} (${formatEta(seg.start)} → ${formatEta(seg.end)})</span></div>
            <textarea data-sub-text="${i}">${esc(seg.text)}</textarea>
            <div class="time-row"><label>Début</label><input type="number" class="time-input" data-sub-start="${i}" value="${seg.start.toFixed(1)}" step="0.1" min="0"><label>Fin</label><input type="number" class="time-input" data-sub-end="${i}" value="${seg.end.toFixed(1)}" step="0.1" min="0"><button type="button" data-sub-reset="${i}" style="padding:0.25rem 0.5rem;border-radius:6px;border:1px solid var(--border);background:var(--panel);font-size:0.65rem;cursor:pointer;">↺ auto</button></div>
            <div class="sub-actions"><button type="button" data-sub-select="${i}">📌 Sélectionner</button><button type="button" data-sub-split="${i}">✂️ Diviser</button><button type="button" data-sub-merge="${i}">🔗 Fusionner</button><button type="button" data-sub-delete="${i}">🗑️ Supprimer</button></div>
        </div>
    `).join('');
    list.querySelectorAll('[data-sub-text]').forEach(ta => ta.addEventListener('input', e => { subtitleSegments[parseInt(ta.dataset.subText, 10)].text = e.target.value; renderSubtitlePreview(); }));
    list.querySelectorAll('[data-sub-start]').forEach(inp => inp.addEventListener('input', e => { subtitleSegments[parseInt(inp.dataset.subStart, 10)].start = parseFloat(e.target.value) || 0; renderSubtitleTimeline(); }));
    list.querySelectorAll('[data-sub-end]').forEach(inp => inp.addEventListener('input', e => { subtitleSegments[parseInt(inp.dataset.subEnd, 10)].end = parseFloat(e.target.value) || 0; renderSubtitleTimeline(); }));
    list.querySelectorAll('[data-sub-reset]').forEach(btn => btn.addEventListener('click', () => { let cur = 0; subtitleSegments.forEach(s => { const d = Math.max(TARGET_SCENE_DURATION, s.text.length / 15); s.start = cur; s.end = cur + d; cur += d; }); renderSubtitleEditor(); }));
    list.querySelectorAll('[data-sub-select]').forEach(btn => btn.addEventListener('click', () => { selectedSubtitleIndex = parseInt(btn.dataset.subSelect, 10); renderSubtitleEditor(); }));
    list.querySelectorAll('[data-sub-split]').forEach(btn => btn.addEventListener('click', () => splitSubtitleSegment(parseInt(btn.dataset.subSplit, 10))));
    list.querySelectorAll('[data-sub-merge]').forEach(btn => btn.addEventListener('click', () => mergeSubtitleSegment(parseInt(btn.dataset.subMerge, 10))));
    list.querySelectorAll('[data-sub-delete]').forEach(btn => btn.addEventListener('click', () => { subtitleSegments.splice(parseInt(btn.dataset.subDelete, 10), 1); if (selectedSubtitleIndex >= subtitleSegments.length) selectedSubtitleIndex = subtitleSegments.length - 1; renderSubtitleEditor(); }));
}
function renderSubtitlePreview() {
    const el = document.getElementById('subtitle-preview-text'); if (!el) return;
    if (!subtitleSegments.length || !subtitleSegments[selectedSubtitleIndex]) { el.textContent = 'Aucun segment sélectionné'; return; }
    el.textContent = subtitleSegments[selectedSubtitleIndex].text || '(vide)';
}
function splitSubtitleSegment(idx) {
    const seg = subtitleSegments[idx]; if (!seg) return;
    const words = seg.text.split(' '); if (words.length < 2) return;
    const mid = Math.floor(words.length / 2); const midTime = (seg.start + seg.end) / 2;
    subtitleSegments.splice(idx, 1,
        { text: words.slice(0, mid).join(' '), start: seg.start, end: midTime, sceneIndex: seg.sceneIndex },
        { text: words.slice(mid).join(' '), start: midTime, end: seg.end, sceneIndex: seg.sceneIndex }
    );
    renderSubtitleEditor();
}
function mergeSubtitleSegment(idx) {
    if (idx >= subtitleSegments.length - 1) return;
    const a = subtitleSegments[idx], b = subtitleSegments[idx + 1];
    subtitleSegments.splice(idx, 2, { text: a.text + ' ' + b.text, start: a.start, end: b.end, sceneIndex: a.sceneIndex });
    renderSubtitleEditor();
}
function applySubtitleChanges() { showToast('Sous-titres appliqués', 'success'); }
function resetSubtitleFromScript() { if (!confirm('Réinitialiser ?')) return; initSubtitleSegmentsFromScript(); renderSubtitleEditor(); }
function addSubtitleSegment() { const lastSeg = subtitleSegments[subtitleSegments.length - 1]; const last = lastSeg?.end || 0; subtitleSegments.push({ text: 'Nouveau', start: last, end: last + TARGET_SCENE_DURATION, sceneIndex: lastSeg ? lastSeg.sceneIndex : 0 }); selectedSubtitleIndex = subtitleSegments.length - 1; renderSubtitleEditor(); }
function clearAllSubtitles() { if (!confirm('Effacer tout ?')) return; subtitleSegments = []; selectedSubtitleIndex = 0; renderSubtitleEditor(); }
function formatSRTTime(seconds) {
    const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = Math.floor(seconds % 60), ms = Math.floor((seconds - Math.floor(seconds)) * 1000);
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + ',' + String(ms).padStart(3, '0');
}
// Texte(s) de sous-titre d'une scène : segments édités s'il y en a, sinon la phrase du script.
function segmentsForScene(sceneIndex) {
    const over = typeof getSceneItem === 'function' ? getSceneItem(sceneIndex)?.edit?.caption : null;
    if (over != null && String(over).trim()) return [{ text: String(over).trim(), weight: 1 }];
    const pl = sceneIndex >= 0 ? state.scenePlan?.scenes?.[sceneIndex] : null;
    if (pl && pl.narration && pl.spoken) return [{ text: pl.spoken, weight: 1 }];   // scène riche : le personnage ne dit que la 1re phrase
    const segs = subtitleSegments.filter(sg => sg.sceneIndex === sceneIndex && String(sg.text || '').trim());
    if (segs.length) return segs.map(sg => ({ text: sg.text, weight: Math.max(0.1, sg.end - sg.start) }));
    const text = state.queue.find(q => q.sceneIndex === sceneIndex)?.sceneText || state.scenes[sceneIndex] || '';
    return text ? [{ text, weight: 1 }] : [];
}
function subtitleTextAt(sceneIndex, progress) {
    const segs = segmentsForScene(sceneIndex);
    if (!segs.length) return { text: '', local: 0 };
    const total = segs.reduce((a, b) => a + b.weight, 0);
    let acc = 0;
    for (const sg of segs) {
        const share = sg.weight / total;
        if (progress < acc + share || sg === segs[segs.length - 1]) return { text: sg.text, local: Math.min(1, Math.max(0, (progress - acc) / share)) };
        acc += share;
    }
    return { text: segs[0].text, local: 0 };
}
function buildSubtitleCues() {
    const cues = [];
    if (state.timeline && state.timeline.length) {
        for (const t of state.timeline) {
            const segs = t.narration ? [{ text: scenePlanFor(t.sceneIndex).narration, weight: 1 }] : segmentsForScene(t.sceneIndex);
            const total = segs.reduce((a, b) => a + b.weight, 0) || 1;
            let cur = t.start;
            for (const sg of segs) { const d = t.duration * sg.weight / total; cues.push({ start: cur, end: cur + d, text: sg.text }); cur += d; }
        }
        return cues;
    }
    if (subtitleSegments.length) return subtitleSegments.map(sg => ({ start: sg.start, end: sg.end, text: sg.text }));
    let cur = 0;
    state.queue.filter(q => q.status === 'done').forEach(item => { cues.push({ start: cur, end: cur + TARGET_SCENE_DURATION, text: item.sceneText }); cur += TARGET_SCENE_DURATION; });
    return cues;
}
function generateSRT() {
    return buildSubtitleCues().map((c, i) => (i + 1) + '\n' + formatSRTTime(c.start) + ' --> ' + formatSRTTime(c.end) + '\n' + c.text + '\n').join('\n');
}
