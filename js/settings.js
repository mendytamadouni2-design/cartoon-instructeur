// Cartoon Instructeur · Voix calée, réglages, notifications, coûts, journal, fichiers locaux
// (scripts classiques chargés dans l'ordre par index.html : ils partagent les mêmes variables globales)

// ══════════════════════════════════════════════════════════════════
// VOIX ELEVENLABS CALÉE SUR LES LÈVRES (prononciation parfaite, synchronisation gardée)
// ══════════════════════════════════════════════════════════════════
async function prepareFitVoice(item) {
    const voiceId = elevenlabsSelectedVoiceId || getLS(STORAGE.ELEVENLABS_VOICE);
    if (!getElevenLabsKey() || !voiceId) throw new Error('choisis une voix ElevenLabs dans la section Voix');
    const text = scenePlanFor(item.sceneIndex).spoken || item.sceneText;
    const model = document.getElementById('elevenlabs-model-select')?.value || 'eleven_multilingual_v2';
    const target = item.speech && !item.speech.silent ? item.speech.end - item.speech.start : null;
    let blob = await generateElevenLabsAudio(text, voiceId, model, '0.5', '0.75', 1);
    let buf = await decodeAudioBlob(blob), sp = analyzeSpeech(buf);
    if (target && sp && !sp.silent) {
        const ratio = (sp.end - sp.start) / target;
        if (Math.abs(ratio - 1) > 0.08) {
            blob = await generateElevenLabsAudio(text, voiceId, model, '0.5', '0.75', Math.max(0.7, Math.min(1.2, ratio)));
            buf = await decodeAudioBlob(blob); sp = analyzeSpeech(buf);
        }
    }
    if (!buf) throw new Error('voix illisible');
    item.fitBuffer = buf; item.fitSpeech = sp;
}

// ══════════════════════════════════════════════════════════════════
// RÉGLAGES MÉMORISÉS + KIT DE CHAÎNE
// ══════════════════════════════════════════════════════════════════
const SET_BOOL = [v => v === "on", v => (v ? "on" : "off")];
const SETTINGS = [
    ['gen-mode-select', 'genMode'], ['storyboard-select', 'storyboardOn', ...SET_BOOL], ['chain-select', 'chainScenes', ...SET_BOOL],
    ['camera-select', 'camera'], ['transition-select', 'transition'], ['trim-select', 'trimMode'], ['zoom-select', 'zoomOn', ...SET_BOOL],
    ['intro-select', 'introOn', ...SET_BOOL], ['sections-select', 'sectionCards', ...SET_BOOL], ['outro-select', 'outroOn', ...SET_BOOL],
    ['quality-select', 'exportQuality'], ['video-format-select', 'videoFormat'], ['sync-select', 'syncWords', ...SET_BOOL],
    ['music-source-select', 'musicSource'], ['music-volume-select', 'musicVolume', v => parseFloat(v) || 0.35, v => String(v)],
    ['sfx-select', 'sfxOn', ...SET_BOOL], ['subtitles-style-select', 'subtitlesStyle'], ['voice-source-select', 'voiceSource'],
    ['tts-engine-select', 'ttsEngine'], ['audience-select', 'audience'], ['tone-select', 'tone'], ['language-select', 'language'],
    ['lipsync-select', 'lipsync'], ['brand-color-input', 'brandColor'], ['caption-font-select', 'captionFont'], ['youtube-privacy-select', 'youtubePrivacy']
];
function collectSettings() {
    const o = { selectedStyle: state.selectedStyle, pedagoFx: state.pedagoFx };
    SETTINGS.forEach(([, k]) => { o[k] = state[k]; });
    return o;
}
function saveSettings() { setJSON(STORAGE.SETTINGS, collectSettings()); updateEstimate(); }
function applySettings(o) {
    if (!o || typeof o !== 'object') return;
    SETTINGS.forEach(([id, k, parse, fmt]) => {
        if (o[k] === undefined) return;
        state[k] = o[k];
        const el = document.getElementById(id);
        if (el) el.value = fmt ? fmt(o[k]) : o[k];
    });
    if (o.selectedStyle && CARTOON_STYLES.some(s => s.id === o.selectedStyle)) state.selectedStyle = o.selectedStyle;
    if (Array.isArray(o.pedagoFx)) {
        state.pedagoFx = o.pedagoFx;
        const sel = document.getElementById('pedago-fx-select');
        if (sel) Array.from(sel.options).forEach(op => { op.selected = o.pedagoFx.includes(op.value); });
    }
    state.subtitlesMode = state.subtitlesStyle === 'off' ? 'off' : 'on';
    renderStyles(); showTTSPanel(state.ttsEngine); updateMusicStatus(); updateGenModeHint();
}
document.addEventListener('change', e => { if (SETTINGS.some(([id]) => id === e.target.id)) { const d = SETTINGS.find(([id]) => id === e.target.id); if (d[2]) state[d[1]] = d[2](e.target.value); else state[d[1]] = e.target.value; saveSettings(); } });
document.addEventListener('input', e => { if (e.target.id === 'brand-color-input') { state.brandColor = e.target.value; saveSettings(); } });
document.addEventListener('click', e => { if (e.target.closest && e.target.closest('[data-style]')) setTimeout(saveSettings, 0); });

const blobToDataUrl = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
async function exportKit() {
    const kit = { app: 'cartoon-instructeur-kit', version: 1, date: new Date().toISOString(), settings: collectSettings(), poses: state.poses };
    try { const m = await idbGet('music'); if (m) kit.music = { name: getLS(STORAGE.MUSIC_NAME), data: await blobToDataUrl(m) }; } catch (e) {}
    try { const l = await idbGet('logo'); if (l) kit.logo = await blobToDataUrl(l); } catch (e) {}
    saveBlob(new Blob([JSON.stringify(kit)], { type: 'application/json' }), 'kit-ma-chaine.json');
}
async function importKit(file) {
    try {
        const kit = JSON.parse(await file.text());
        if (kit.app !== 'cartoon-instructeur-kit') throw new Error('fichier non reconnu');
        applySettings(kit.settings); saveSettings();
        if (Array.isArray(kit.poses)) { state.poses = kit.poses; await savePoses(); }
        if (kit.music?.data) { const b = await (await fetch(kit.music.data)).blob(); await setMusicFile(b, kit.music.name || 'Musique du kit'); }
        if (kit.logo) { await idbPut('logo', await (await fetch(kit.logo)).blob()); setLS(STORAGE.LOGO_SET, '1'); updateLogoStatus(); }
        showToast('Kit de chaîne appliqué ✓', 'success');
    } catch (e) { showToast('Kit illisible : ' + e.message, 'error', 5000); }
}
const accentColor = () => state.brandColor || '#ffd23f';
function captionFontFamily() {
    if (state.captionFont === 'marker') return MARKER_FONT;
    if (state.captionFont === 'impact') return '"Arial Black", Impact, "Helvetica Neue", sans-serif';
    return UI_FONT;
}

// ══════════════════════════════════════════════════════════════════
// NOTIFICATIONS (génération en arrière-plan terminée)
// ══════════════════════════════════════════════════════════════════
function b64urlToBytes(s) {
    const pad = '='.repeat((4 - s.length % 4) % 4), b = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(b, c => c.charCodeAt(0));
}
function updatePushStatus() {
    const el = document.getElementById('push-status'), btn = document.getElementById('push-btn'); if (!el || !btn) return;
    const on = !!getJSON(STORAGE.PUSH_SUB) && typeof Notification !== 'undefined' && Notification.permission === 'granted';
    el.textContent = on ? '🔔 Notifications activées : ton téléphone te prévient quand les scènes sont prêtes.' : 'Reçois une notification quand la génération en arrière-plan est finie.';
    btn.classList.toggle('hidden', on);
}
async function enablePush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') {
        showToast('Sur iPhone : ouvre l\'appli depuis son icône sur l\'écran d\'accueil (iOS 16.4 ou plus récent)', 'warn', 7000); return;
    }
    try {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') { showToast('Notifications refusées : tu peux les autoriser dans Réglages > Notifications', 'warn', 6000); return; }
        const reg = await navigator.serviceWorker.register('sw.js');
        await navigator.serviceWorker.ready;
        const res = await fetch(getProxyUrl() + '/push/key');
        const data = await res.json();
        if (!res.ok || !data.publicKey) throw new Error(data.error || 'serveur pas à jour');
        let sub = await reg.pushManager.getSubscription();
        if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(data.publicKey) });
        setJSON(STORAGE.PUSH_SUB, sub.toJSON());
        updatePushStatus();
        showToast('Notifications activées ✓', 'success');
    } catch (e) { showToast('Notifications impossibles : ' + e.message, 'error', 6000); }
}

// ══════════════════════════════════════════════════════════════════
// ESTIMATION DU COÛT ET DE LA DURÉE
// ══════════════════════════════════════════════════════════════════
const CLAUDE_PRICES = { 'claude-opus-5': [5, 25], 'claude-sonnet-5': [2, 10], 'claude-haiku-4-5': [1, 5] };
function updateEstimate() {
    const el = document.getElementById('estimate-line'); if (!el) return;
    const n = state.scenes.length;
    if (!n) { el.textContent = ''; return; }
    const bg = state.genMode === 'background' && state.proxyJobs;
    const genMin = Math.ceil(bg ? n * 1.1 + 1 : n * (state.chainScenes ? 1.6 : 1.2) + 1);
    const montageMin = Math.max(1, Math.ceil((n * 6 + 12) / 60 + n * 0.1));
    let claude = 0;
    if (getClaudeKey()) {
        const [pi, po] = CLAUDE_PRICES[getClaudeModel()] || CLAUDE_PRICES['claude-opus-5'];
        claude += ((2500 + 80 * n) * pi + (2000 + 180 * n) * po) / 1e6;
        if (isWhiteboard()) claude += n * (900 * pi + 2200 * po) / 1e6;
        claude *= 0.92;
    }
    const agnes = n * 0.02;
    const fmt = x => x.toFixed(2).replace('.', ',') + ' €';
    el.textContent = '⏱️ ≈ ' + genMin + ' min de génération' + (bg ? ' (téléphone éteint possible)' : '') + ' + ' + montageMin + ' min de montage · 💶 ≈ ' + fmt(agnes) + ' Agnes' + (claude ? ' + ' + fmt(claude) + ' Claude' : '') +
        (state.syncWords && getElevenLabsKey() ? ' + transcription ElevenLabs' : '') + (state.voiceSource === 'fit' ? ' + voix ElevenLabs' : '') + ' (estimation)';
}

// ══════════════════════════════════════════════════════════════════
// JOURNAL (à m'envoyer en cas de souci — les clés sont masquées)
// ══════════════════════════════════════════════════════════════════
function journalText() {
    const lines = getJournal();
    const s = collectSettings();
    const head = [
        'Cartoon Instructeur — journal du ' + new Date().toLocaleString('fr-FR'),
        'Appareil : ' + navigator.userAgent,
        'Serveur : ' + (document.getElementById('proxy-status-text')?.textContent || '?'),
        'Clés présentes : ' + ['AGNES_KEY', 'CLAUDE_KEY', 'ELEVENLABS_KEY', 'OPENAI_KEY'].filter(k => getLS(STORAGE[k])).map(k => k.replace('_KEY', '')).join(', '),
        'Réglages : ' + JSON.stringify(s),
        'Scènes : ' + state.queue.map(q => (q.sceneIndex + 1) + ':' + q.status + (q.error ? '(' + q.error + ')' : '')).join(' '),
        'Arrière-plan : ' + JSON.stringify(getJSON(STORAGE.BG_JOB) ? { id: getJSON(STORAGE.BG_JOB).id, finished: !!getJSON(STORAGE.BG_JOB).finished } : null),
        '──────────'
    ];
    return sanitizeForJournal(head.join('\n') + '\n' + lines.join('\n'));
}
function exportJournal() { saveBlob(new Blob([journalText()], { type: 'text/plain' }), 'journal-cartoon-instructeur.txt'); }
async function copyJournal() {
    try { await navigator.clipboard.writeText(journalText()); showToast('Journal copié : colle-le dans notre conversation', 'success', 4000); }
    catch (e) { exportJournal(); }
}

// ══════════════════════════════════════════════════════════════════
// FICHIERS LOCAUX (musique, logo) — IndexedDB, reste sur le téléphone
// ══════════════════════════════════════════════════════════════════
function idbOpen() {
    return new Promise((res, rej) => {
        const r = indexedDB.open('cartoon-instructeur', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('files');
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
}
async function idbTx(mode, fn) {
    const db = await idbOpen();
    return new Promise((res, rej) => {
        const tx = db.transaction('files', mode), store = tx.objectStore('files');
        const req = fn(store);
        tx.oncomplete = () => res(req ? req.result : undefined); tx.onerror = () => rej(tx.error);
    });
}
const idbPut = (k, v) => idbTx('readwrite', st => st.put(v, k));
const idbGet = k => idbTx('readonly', st => st.get(k));
const idbDel = k => idbTx('readwrite', st => st.delete(k));

// Musique réellement utilisée : celle de l'appli seulement si un fichier est choisi.
function effectiveMusicMode() {
    if (state.musicSource === 'none') return 'none';
    if (state.musicSource === 'app' && getLS(STORAGE.MUSIC_NAME)) return 'app';
    return 'agnes';
}
function updateMusicStatus() {
    const el = document.getElementById('music-status'); if (!el) return;
    const name = getLS(STORAGE.MUSIC_NAME);
    document.getElementById('music-pick-row')?.classList.toggle('hidden', state.musicSource !== 'app');
    if (state.musicSource === 'none') el.textContent = 'Pas de musique : seule la voix du personnage.';
    else if (state.musicSource === 'agnes') el.textContent = 'Chaque scène garde la musique générée par Agnes (elle change à chaque scène).';
    else el.textContent = name ? '✅ Musique : ' + name + ' · Agnes générera la voix seule.' : 'Aucune musique choisie : en attendant, Agnes garde sa propre musique.';
}
async function setMusicFile(blob, name) {
    try {
        await idbPut('music', blob);
        setLS(STORAGE.MUSIC_NAME, name.slice(0, 60));
        state.musicSource = 'app';
        const sel = document.getElementById('music-source-select'); if (sel) sel.value = 'app';
        updateMusicStatus();
        showToast('Musique enregistrée ✓', 'success');
    } catch (e) { showToast('Musique impossible à enregistrer', 'error'); }
}
const MUSIC_PROMPTS = {
    calm: 'calm, warm and gentle educational background music, soft piano and light acoustic guitar',
    lofi: 'relaxed lo-fi hip hop background music, mellow keys, soft drums',
    upbeat: 'upbeat, cheerful and energetic background music, ukulele, claps and light percussion',
    kids: 'playful and joyful children background music, xylophone, pizzicato strings',
    cinematic: 'inspiring cinematic background music, light strings and piano, hopeful mood'
};
async function generateMusicWithEleven() {
    const key = getElevenLabsKey();
    if (!key) { showToast('Ajoute ta clé ElevenLabs (section Voix)', 'error'); return; }
    const btn = document.getElementById('music-gen-btn');
    const style = document.getElementById('music-style-select')?.value || 'calm';
    const seconds = Math.max(30, Math.min(180, Math.round((state.scenes.length || 10) * 6.5 + 10)));
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Création de la musique (≈ 1 min)…'; }
    try {
        const res = await withTimeout(fetch(ELEVENLABS_API + '/music', {
            method: 'POST',
            headers: { 'xi-api-key': key, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
            body: JSON.stringify({ prompt: MUSIC_PROMPTS[style] + ', instrumental only, no vocals, steady and loopable, suitable under a voice-over', music_length_ms: seconds * 1000 })
        }), 180000, 'ElevenLabs ne répond pas');
        if (!res.ok) { const t = await res.text(); throw new Error('ElevenLabs ' + res.status + ' ' + t.slice(0, 120)); }
        const blob = await res.blob();
        if (!blob.size) throw new Error('musique vide');
        await setMusicFile(blob, 'ElevenLabs · ' + (document.getElementById('music-style-select')?.selectedOptions?.[0]?.textContent || style));
    } catch (e) { showToast('Création impossible : ' + e.message, 'error', 7000); }
    finally { if (btn) { btn.disabled = false; btn.textContent = '🎼 Créer une musique avec ElevenLabs'; } }
}
function updateLogoStatus() {
    const has = !!getLS(STORAGE.LOGO_SET);
    const b = document.getElementById('logo-btn'), r = document.getElementById('logo-remove-btn');
    if (b) b.textContent = has ? '✅ Logo ajouté · changer' : '🖼️ Choisir un logo';
    r?.classList.toggle('hidden', !has);
}
