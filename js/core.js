// Cartoon Instructeur · Configuration, état, outils, clés API
// (scripts classiques chargés dans l'ordre par index.html : ils partagent les mêmes variables globales)

// ══════════════════════════════════════════════════════════════════
// CONFIGURATION GÉNÉRALE
// ══════════════════════════════════════════════════════════════════
const API_BASE = 'https://apihub.agnes-ai.com/v1';
const POLL_BASE = 'https://apihub.agnes-ai.com/agnesapi';
const MODEL_VIDEO = 'agnes-video-v2.0';
const FRAME_RATE = 24;

let createIntervalMs = 62000;
const CREATE_INTERVAL_MIN = 62000;
const CREATE_INTERVAL_MAX = 90000;
const CREATE_INTERVAL_SAFE = 75000;
const POLL_INTERVAL_SEC = 8;
const MAX_POLL_ATTEMPTS = 100;

// Historique des versions (affiché en bas de l'accueil). Règle : grosse mise à jour → X.0, petite → X.1, X.2…
// Ajouter la nouvelle version EN PREMIER à chaque mise en ligne.
const APP_VERSIONS = [
    { num: '8.4', date: '2026-10-04', note: '30 transitions choisies par Claude à chaque raccord (flash, filé, iris, glitch, morphing…), autocollants animés (flèche, mot entouré, « Le savais-tu ? », validé, faux, badge, confettis), carte « Suivre » TikTok / Instagram, 7 styles de sous-titres en plus, rythme serré (silences coupés) et contrôle de chaque coupe' },
    { num: '8.3', date: '2026-10-01', note: 'Demandes à Agnes réécrites selon le guide LTX : un seul paragraphe chronologique (action, parole, apparence, décor, caméra, son), interdits dans la consigne « à éviter »' },
    { num: '8.2', date: '2026-09-30', note: 'Casting et image de référence en quelques secondes avec Agnes Image, consigne « à éviter » (doigts, couleurs, texte), format vertical 9:16 natif, enchaînement parfait entre scènes (option)' },
    { num: '8.1', date: '2026-09-30', note: 'Appli réorganisée : mise en route guidée, écran Script simplifié (format en puces, Claude l\'écrit ou je l\'écris, outils repliables), Ma chaîne dans l\'ordre, personnage stable partout' },
    { num: '8.0', date: '2026-09-29', note: 'Personnage stable (casting de poses, bouche qui suit la voix), priorité Shorts/TikTok, brouillon animé, retouches en discutant, charte de chaîne, mode objectif avec recherche internet, tes images, compteur ElevenLabs, série de Shorts, miniatures' },
    { num: '7.2', date: '2026-09-29', note: 'Sauvegarde des longues vidéos sur Cloudflare, bouton Partager fiable, journal plus lisible' },
    { num: '7.1', date: '2026-09-28', note: 'Icônes 3D modernes, numéro de version, son de l\'aperçu même en mode silencieux' },
    { num: '7.0', date: '2026-09-28', note: 'Motion design (animations, frises, chaînes, avant/après) et montage image par image' },
    { num: '6.4', date: '2026-09-28', note: 'Plus de blanc entre les scènes, indicateur de voix corrigé' },
    { num: '6.3', date: '2026-09-28', note: 'Personnage plus stable, transitions propres, illustrations lisibles' },
    { num: '6.2', date: '2026-09-28', note: 'Claude moins cher (Opus 5.5, cache)' },
    { num: '6.1', date: '2026-09-28', note: 'Importer sa propre image de référence' },
    { num: '6.0', date: '2026-09-27', note: 'Fond vert, couleurs harmonisées, graphiques animés' },
    { num: '5.0', date: '2026-09-27', note: 'Personnage identique, scènes riches, contrôle par l\'IA' },
    { num: '4.4', date: '2026-09-27', note: 'Mode test rapide (3 scènes)' },
    { num: '4.3', date: '2026-09-27', note: 'Appli disponible hors ligne' },
    { num: '4.2', date: '2026-09-27', note: 'Projets en parallèle, pilote automatique, Shorts, Instagram, fiche PDF' },
    { num: '4.1', date: '2026-09-27', note: 'Mêmes corrections pour tous les styles' },
    { num: '4.0', date: '2026-09-27', note: 'Nouvelle interface : onglets et création en 5 étapes' },
    { num: '3.2', date: '2026-09-27', note: 'TikTok et programmation des publications' },
    { num: '3.1', date: '2026-09-27', note: 'Aperçu, éditeur de montage, séries, autres langues' },
    { num: '3.0', date: '2026-09-26', note: 'Montage pro, storyboard, voix ElevenLabs' },
    { num: '2.1', date: '2026-09-26', note: 'Serveur Cloudflare connecté par défaut' },
    { num: '2.0', date: '2026-09-23', note: 'Génération en arrière-plan (téléphone éteint)' },
    { num: '1.3', date: '2026-09-23', note: 'Relais Cloudflare, reprise du dernier projet' },
    { num: '1.2', date: '2026-09-23', note: 'Style tableau blanc, sauvegarde des clés' },
    { num: '1.1', date: '2026-09-23', note: 'Montage sur iPhone corrigé, Claude' },
    { num: '1.0', date: '2026-09-23', note: 'Première version' }
];
const APP_VERSION = APP_VERSIONS[0];
const STORAGE = {
    TIMING: 'agnes_timing_cache_v11',
    AGNES_KEY: 'agnes_api_key',
    ELEVENLABS_KEY: 'elevenlabs_api_key',
    ELEVENLABS_VOICE: 'elevenlabs_voice_id',
    GCLOUD_KEY: 'gcloud_tts_api_key',
    GCLOUD_VOICE: 'gcloud_voice_name',
    AZURE_KEY: 'azure_speech_key',
    AZURE_REGION: 'azure_speech_region',
    AZURE_VOICE: 'azure_voice_name',
    POLLY_KEY: 'aws_access_key',
    POLLY_SECRET: 'aws_secret_key',
    POLLY_REGION: 'aws_region',
    POLLY_VOICE: 'polly_voice_id',
    OPENAI_KEY: 'openai_api_key',
    CLAUDE_KEY: 'claude_api_key',
    CLAUDE_MODEL: 'claude_model',
    PROXY_URL: 'download_proxy_url',
    DEEPL_KEY: 'deepl_api_key',
    GTRANSLATE_KEY: 'gtranslate_api_key',
    AVATAR_KEY: 'avatar_api_key',
    SD_KEY: 'sd_api_key',
    YOUTUBE_CLIENT: 'youtube_client_id',
    YOUTUBE_APIKEY: 'youtube_api_key',
    YOUTUBE_TOKEN: 'youtube_oauth_token',
    FIREBASE_CONFIG: 'firebase_config',
    CLOUD_CONFIG: 'cloud_config',
    HISTORY: 'cartoon_history_v2',
    SERIES: 'cartoon_series',
    WAKE_LOCK: 'agnes_wakelock_enabled',
    YOUTUBE_TOKEN_EXP: 'youtube_oauth_token_exp',
    ANALYTICS: 'cartoon_analytics',
    LAST_PROJECT: 'cartoon_last_project',
    SIMPLE_MODE: 'cartoon_simple_mode',
    PROJECTS: 'cartoon_projects',
    IG_TOKEN: 'cartoon_instagram_token',
    IG_STATE: 'cartoon_instagram_oauth_state',
    AUTOPILOT: 'cartoon_autopilot',
    TT_TOKEN: 'cartoon_tiktok_token',
    TT_STATE: 'cartoon_tiktok_oauth_state',
    TT_SHOTS: 'cartoon_tiktok_screenshots',
    TT_PUBLISHED: 'cartoon_tiktok_published',
    SCHEDULE: 'cartoon_schedule',
    INSIGHTS: 'cartoon_platform_insights',
    COSTS: 'cartoon_costs',
    COSTS_JOBS: 'cartoon_costs_jobs',
    END_QUESTION: 'cartoon_end_question',
    SAFE_ZONES: 'cartoon_safe_zones',
    TEST_MODE: 'cartoon_test_mode',
    DEFAULTS_V3: 'cartoon_defaults_v3', DEFAULTS_V8: 'cartoon_defaults_v8',
    RICH: 'cartoon_rich_scenes',
    QA_ON: 'cartoon_qa_on',
    ONE_SHOT: 'cartoon_one_shot',
    GREEN: 'cartoon_green_screen',
    COLOR_MATCH: 'cartoon_color_match',
    ALT_FRAMING: 'cartoon_alt_framing',
    FAST_EXPORT: 'cartoon_fast_export',
    ICON_STYLE: 'cartoon_icon_style',
    CHARTER: 'cartoon_charter', USER_IMAGES: 'cartoon_user_images',
    ELEVEN_USAGE: 'cartoon_eleven_usage', ELEVEN_EXHAUSTED: 'cartoon_eleven_exhausted', TTS_INDEX: 'cartoon_tts_index',
    BANK_USE: 'cartoon_bank_use',
    BACKUP_ON: 'cartoon_backup_on',
    BG_SERIES: 'cartoon_background_series',
    YT_PUBLISHED: 'cartoon_youtube_published',
    BG_JOB: 'cartoon_background_job',
    GEN_MODE: 'cartoon_generation_mode',
    MUSIC_NAME: 'cartoon_music_name',
    SETTINGS: 'cartoon_settings',
    PUSH_SUB: 'cartoon_push_subscription',
    LOGO_SET: 'cartoon_logo_set'
};

const MAX_IMAGE_SIZE = 12 * 1024 * 1024;
const THUMBNAIL_MAX_WIDTH = 200;
const TARGET_SCENE_DURATION = 7;
// Cible principale : Shorts / TikTok (vertical, 30 à 60 s) ou YouTube classique
const SHORT_MAX_SEC = 60;
function shortsMode() { return state.target !== 'youtube'; }
// Format de sortie réel : « automatique » donne du vertical quand la cible est Shorts / TikTok
function outputFormat() { return state.videoFormat === 'auto' && shortsMode() ? 'portrait' : state.videoFormat; }

// ══════════════════════════════════════════════════════════════════
// ÉTAT GLOBAL
// ══════════════════════════════════════════════════════════════════
const state = {
    images: [], isRunning: false, stopRequested: false,
    queue: [], completed: 0, failed: 0,
    selectedStyle: 'whiteboard',
    theme: '', script: '', scenes: [],
    audience: 'teens', tone: 'friendly', motion: 'auto',
    pedagoFx: ['arrows', 'bubbles', 'highlight', 'schemas'],
    lipsync: 'basic',
    quizCount: 0,
    voiceEnabled: true, voicePref: '', voiceRate: 1, voicePitch: 1,
    subtitlesMode: 'on', subtitlesStyle: 'words', syncWords: true,
    language: 'fr-FR', ttsEngine: 'elevenlabs', voiceSource: 'agnes',
    translateEngine: 'claude',
    chainScenes: true, camera: 'static', transition: 'smart', stickersOn: true, followCard: 'tiktok', trimMode: 'auto', videoFormat: 'auto', target: 'shorts', stableChar: 'auto', cast: null, keyframes: 'off',
    zoomOn: true, introOn: true, outroOn: true, sectionCards: true, exportQuality: '1080',
    musicSource: 'app', musicVolume: 0.35, sfxOn: true, photoSmall: null, regenerating: false,
    poses: [], storyboardOn: true, storyboardApproved: false, storyboardSig: '', storyboarding: false,
    brandColor: '#ffd23f', captionFont: 'rounded', youtubePrivacy: 'unlisted',
    durationFrames: 153,
    extraExports: ['zip', 'shorts', 'chapters'],
    avatarProvider: 'off',
    cloudProvider: 'local',
    isLoadingImages: false, creationAttemptsSinceLastError: 0,
    scenePlan: null, timeline: null, drawings: [], drawingsPromise: null,
    genMode: 'background', proxyJobs: false, proxyMedia: false, proxyTikTok: false, proxyInstagram: false, safeZones: true, testMode: false, testIdx: null, reference: null, richMode: true, qaOn: true, qaFrames: null, qaReport: null, oneShot: false, greenScreen: false, colorMatch: true, altFraming: true, fastExport: true, iconStyle: 'auto', decorImage: null, decorImg: null, apPlan: null, comments: null, autoRun: false, finalFresh: false,
    ttStats: null, hooks: null, parts: null, langSrt: {}, lastYouTubeId: null,
    bankItems: [], bankUse: true, backupOn: true, projectId: null, factIssues: null, ytStats: null,
    finalVideoUrl: null, finalBlob: null, finalExt: 'mp4',
    finalAudioBlob: null, exportCache: {},
    isSeriesMode: false, seriesAbort: false, seriesEpisodes: [], seriesResults: [],
    firebaseApp: null, firebaseDb: null, firebaseUser: null,
    youtubeToken: null,
    quota: { agnes: 0, elevenlabs: 0, gcloud: 0, azure: 0, polly: 0 }
};

// ══════════════════════════════════════════════════════════════════
// TOAST
// ══════════════════════════════════════════════════════════════════
let toastTimeout = null;
function showToast(message, type = 'success', duration = 2500) {
    const toast = document.getElementById('toast');
    const icon = document.getElementById('toast-icon');
    const text = document.getElementById('toast-text');
    if (!toast || !icon || !text) return;
    toast.classList.remove('visible', 'success', 'error', 'warn');
    void toast.offsetWidth;
    icon.textContent = { success: '✓', error: '✕', warn: '⚠' }[type] || '✓';
    text.textContent = message;
    toast.classList.add(type);
    if (type === 'error' || type === 'warn') journal(type === 'error' ? 'ERREUR' : 'alerte', message);
    requestAnimationFrame(() => toast.classList.add('visible'));
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove('visible'), duration);
}

// ══════════════════════════════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════════════════════════════
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Journal local (à m'envoyer en cas de souci) : les clés API sont toujours masquées.
const JOURNAL_KEY = 'cartoon_journal';
let journalBuf = null;
function sanitizeForJournal(s) {
    return String(s)
        .replace(/sk-ant-[\w-]{6,}/g, '[clé masquée]').replace(/sk[-_][\w-]{10,}/g, '[clé masquée]')
        .replace(/AKIA[0-9A-Z]{8,}/g, '[clé masquée]').replace(/AIza[\w-]{10,}/g, '[clé masquée]').replace(/gh[pousr]_\w{10,}/g, '[clé masquée]')
        .replace(/("(?:key|token|secret|apiKey|agnesKey|claudeKey)"\s*:\s*")[^"]+"/gi, '$1[masqué]"');
}
function getJournal() {
    if (!journalBuf) { try { journalBuf = JSON.parse(localStorage.getItem(JOURNAL_KEY) || '[]'); } catch (e) { journalBuf = []; } }
    return journalBuf;
}
function journal(level, msg) {
    const b = getJournal();
    b.push(new Date().toISOString().slice(5, 19).replace('T', ' ') + ' ' + level + ' ' + sanitizeForJournal(msg).slice(0, 500));
    if (b.length > 300) b.splice(0, b.length - 300);
    try { localStorage.setItem(JOURNAL_KEY, JSON.stringify(b.slice(-200))); } catch (e) {}
}
// Erreurs : une même erreur répétée n'est notée qu'une fois toutes les 30 s, et les « Script error. »
// sans fichier (venues d'en dehors de l'appli : feuille de partage iOS, extensions…) une seule fois.
const seenErrors = new Map();
window.addEventListener('error', e => {
    const external = !e.filename && /^Script error\.?$/i.test(e.message || '');
    const msg = external ? 'Script error. (erreur extérieure à l\'appli, sans effet)' : (e.message || '') + ' @' + String(e.filename || '').split('/').pop() + ':' + (e.lineno || '');
    const last = seenErrors.get(msg);
    if (last && (external || Date.now() - last < 30000)) return;
    seenErrors.set(msg, Date.now());
    journal('ERREUR', msg);
});
window.addEventListener('unhandledrejection', e => journal('ERREUR', 'promesse : ' + ((e.reason && e.reason.message) || e.reason)));
const log = msg => { console.log('[Cartoon] ' + msg); journal('info', msg); };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const randomItem = arr => arr[Math.floor(Math.random() * arr.length)];
function formatEta(seconds) { if (seconds < 60) return Math.round(seconds) + 's'; const m = Math.floor(seconds / 60); const s = Math.round(seconds % 60); return m + 'm' + (s > 0 ? ' ' + s + 's' : ''); }
function setStatus(text) {
    const bar = document.getElementById('status-bar'), txt = document.getElementById('status-text');
    if (!bar || !txt) return;
    if (text) { bar.classList.add('visible'); txt.textContent = text; } else bar.classList.remove('visible');
}
function setProgress(pct) {
    const wrap = document.getElementById('progress-bar-wrap'), bar = document.getElementById('progress-bar');
    if (!wrap || !bar) return;
    if (pct <= 0) { wrap.classList.add('hidden'); bar.style.width = '0%'; return; }
    wrap.classList.remove('hidden'); bar.style.width = Math.min(100, pct) + '%';
}
function getLS(key, def = '') { try { return localStorage.getItem(key) || def; } catch (e) { return def; } }
function setLS(key, val) { try { localStorage.setItem(key, val); } catch (e) {} }
function getJSON(key, def = null) { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? def; } catch (e) { return def; } }
function setJSON(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }

// ══════════════════════════════════════════════════════════════════
// ANTI-VEILLE
// ══════════════════════════════════════════════════════════════════
let wakeLockSentinel = null, wakeLockEnabled = false, canvasStream = null, canvasInterval = null;
function isWakeLockSupported() { return 'wakeLock' in navigator && typeof navigator.wakeLock.request === 'function'; }
async function requestWakeLockAPI() {
    if (!isWakeLockSupported()) return false;
    try { wakeLockSentinel = await navigator.wakeLock.request('screen'); wakeLockSentinel.addEventListener('release', () => { wakeLockSentinel = null; updateWakeStatus(); }); return true; } catch (e) { return false; }
}
async function releaseWakeLockAPI() { if (wakeLockSentinel) { try { await wakeLockSentinel.release(); } catch (e) {} wakeLockSentinel = null; } }
function startCanvasStream() {
    if (canvasStream) return true;
    try {
        const canvas = document.getElementById('noSleepCanvas'), video = document.getElementById('noSleepVideo');
        if (!canvas || !video) return false;
        const ctx = canvas.getContext('2d'); if (!ctx) return false;
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (typeof canvas.captureStream !== 'function') return false;
        canvasStream = canvas.captureStream(1);
        let toggle = false;
        canvasInterval = setInterval(() => { toggle = !toggle; ctx.fillStyle = toggle ? '#000' : '#010101'; ctx.fillRect(0, 0, canvas.width, canvas.height); }, 1000);
        video.srcObject = canvasStream; video.muted = true; video.playsInline = true;
        const p = video.play(); if (p && p.catch) p.catch(() => {});
        return true;
    } catch (e) { return false; }
}
function stopCanvasStream() {
    if (canvasInterval) { clearInterval(canvasInterval); canvasInterval = null; }
    const video = document.getElementById('noSleepVideo');
    if (video) { try { video.pause(); video.srcObject = null; } catch (e) {} }
    if (canvasStream) { try { canvasStream.getTracks().forEach(t => t.stop()); } catch (e) {} canvasStream = null; }
}
async function activateWakeLock() {
    let success = false;
    if (isWakeLockSupported()) success = await requestWakeLockAPI();
    if (!success) success = startCanvasStream();
    if (!success && !canvasStream) success = startCanvasStream();
    return success;
}
async function deactivateWakeLock() { await releaseWakeLockAPI(); stopCanvasStream(); }
function updateWakeStatus() {
    const el = document.getElementById('wake-status'), txt = document.getElementById('wake-status-text'), btn = document.getElementById('wake-toggle-btn');
    if (!el || !txt || !btn) return;
    el.classList.remove('active', 'warn');
    const hasAny = isWakeLockSupported() || (document.getElementById('noSleepCanvas')?.captureStream);
    if (!hasAny) { el.classList.add('warn'); txt.textContent = '⚠️ Non supporté'; btn.style.display = 'none'; return; }
    btn.style.display = 'inline-block';
    const isActive = wakeLockSentinel !== null || canvasStream !== null;
    if (wakeLockEnabled && isActive) { el.classList.add('active'); txt.textContent = '✅ Écran allumé'; btn.textContent = 'Désactiver'; }
    else if (wakeLockEnabled && !isActive) { el.classList.add('warn'); txt.textContent = '⏳ En attente'; btn.textContent = 'Désactiver'; }
    else { txt.textContent = '💤 Veille automatique'; btn.textContent = 'Garder l\'écran allumé'; }
}
async function toggleWakeLock() {
    if (wakeLockEnabled) { wakeLockEnabled = false; await deactivateWakeLock(); setLS(STORAGE.WAKE_LOCK, '0'); showToast('Veille réactivée', 'warn'); }
    else { wakeLockEnabled = true; const ok = await activateWakeLock(); setLS(STORAGE.WAKE_LOCK, '1'); showToast(ok ? 'Écran allumé' : 'Activez manuellement', ok ? 'success' : 'warn'); }
    updateWakeStatus();
}
document.addEventListener('visibilitychange', async () => { if (document.visibilityState === 'visible' && wakeLockEnabled) { await activateWakeLock(); updateWakeStatus(); } });
async function ensureWakeLockActive() { if (!wakeLockEnabled) return; if (wakeLockSentinel === null && canvasStream === null) { await activateWakeLock(); updateWakeStatus(); } }

// ══════════════════════════════════════════════════════════════════
// TIMING CACHE
// ══════════════════════════════════════════════════════════════════
function loadTimingCache() { return getJSON(STORAGE.TIMING, {}); }
function saveTimingCache(c) { setJSON(STORAGE.TIMING, c); }
function recordGenerationTime(numFrames, durationMs) {
    const cache = loadTimingCache(); const key = String(numFrames);
    if (!cache[key]) cache[key] = []; cache[key].push(durationMs);
    if (cache[key].length > 10) cache[key] = cache[key].slice(-10);
    saveTimingCache(cache); updateTimingDisplay();
}
function estimateGenerationTime(numFrames) {
    const cache = loadTimingCache(); const samples = cache[String(numFrames)];
    if (samples && samples.length > 0) { const sorted = [...samples].sort((a, b) => a - b); const mid = Math.floor(sorted.length / 2); return sorted.length % 2 === 0 ? (sorted[mid-1] + sorted[mid]) / 2 : sorted[mid]; }
    return 30000 + numFrames * 500;
}
function updateTimingDisplay() {
    const cache = loadTimingCache(); const all = Object.values(cache).flat();
    const speedEl = document.getElementById('stat-speed'), samplesEl = document.getElementById('stat-samples');
    if (!speedEl || !samplesEl) return;
    if (all.length === 0) { speedEl.textContent = 'en attente'; samplesEl.textContent = '0 génération'; return; }
    const avg = all.reduce((a, b) => a + b, 0) / all.length;
    speedEl.textContent = (avg / 1000).toFixed(1) + ' s';
    samplesEl.textContent = all.length + ' génération' + (all.length > 1 ? 's' : '');
}

// ══════════════════════════════════════════════════════════════════
// ANALYTICS
// ══════════════════════════════════════════════════════════════════
function getAnalytics() { return getJSON(STORAGE.ANALYTICS, { generations: 0, scenes: 0, timeSpent: 0, byStyle: {}, byLanguage: {}, byTTS: {}, firstUse: Date.now(), lastUse: Date.now() }); }
function saveAnalytics(a) { a.lastUse = Date.now(); setJSON(STORAGE.ANALYTICS, a); }
function trackAnalytics(field, value) {
    const a = getAnalytics();
    if (typeof a[field] === 'number') a[field]++;
    else if (typeof a[field] === 'object') a[field][value] = (a[field][value] || 0) + 1;
    saveAnalytics(a);
}
function renderAnalytics() {
    const grid = document.getElementById('analytics-grid'); if (!grid) return;
    const a = getAnalytics();
    const cards = [
        { v: a.generations, l: 'Générations' },
        { v: a.scenes, l: 'Scènes créées' },
        { v: formatEta(a.timeSpent / 1000), l: 'Temps total' },
        { v: new Date(a.firstUse).toLocaleDateString('fr-FR'), l: 'Première utilisation' },
        { v: Object.keys(a.byStyle).length, l: 'Styles utilisés' },
        { v: Object.keys(a.byLanguage).length, l: 'Langues' },
        { v: Object.keys(a.byTTS).length, l: 'Moteurs TTS' }
    ];
    grid.innerHTML = cards.map(c => '<div class="analytics-card"><div class="a-value">' + esc(String(c.v)) + '</div><div class="a-label">' + esc(c.l) + '</div></div>').join('');
}

// ══════════════════════════════════════════════════════════════════
// QUOTAS & COÛTS
// ══════════════════════════════════════════════════════════════════
function renderQuota() {
    const qEl = document.getElementById('quota-text');
    const cEl = document.getElementById('cost-text');
    if (!qEl || !cEl) return;
    const total = state.completed + state.failed;
    qEl.textContent = total + ' scène' + (total > 1 ? 's' : '') + ' traitée' + (total > 1 ? 's' : '');
    cEl.textContent = '≈ ' + (state.completed * 0.02).toFixed(2).replace('.', ',') + ' € (estimation Agnes)';
}

// ══════════════════════════════════════════════════════════════════
// STYLES CARTOON
// ══════════════════════════════════════════════════════════════════
const CARTOON_STYLES = [
    { id: 'whiteboard', name: 'Tableau blanc dessiné', emoji: '✏️', desc: 'Fond blanc + dessins', prompt: 'clean whiteboard explainer animation style: pure plain white background, flat cartoon character with clean dark outlines and soft flat colors. Character keeps the same face, hairstyle, and identity as the source photo.' },
    { id: 'vector-edu', name: 'Vecteur éducatif', emoji: '📐', desc: 'TED-Ed / Duolingo', prompt: 'flat vector illustration style, clean geometric shapes, bright educational colors, thick outlines, simple shading, modern infographic aesthetic. Character keeps the same face, hairstyle, and identity as the source photo.' },
    { id: 'cartoon-modern', name: 'Cartoon moderne', emoji: '🎨', desc: 'Contours épais', prompt: 'modern cartoon style, thick black outlines, flat saturated colors, expressive characters, Adventure Time aesthetic. Character keeps the same identity as the source photo.' },
    { id: 'ghibli', name: 'Studio Ghibli', emoji: '🌿', desc: 'Anime poétique', prompt: 'Studio Ghibli anime style, Hayao Miyazaki aesthetic, soft watercolor backgrounds, warm lighting. Character keeps identity.' },
    { id: 'pixar', name: 'Pixar 3D', emoji: '✨', desc: '3D chaleureux', prompt: 'Pixar-style 3D animation, subsurface scattering, expressive big eyes, soft cinematic lighting. Character keeps identity.' },
    { id: 'comic-bd', name: 'BD franco-belge', emoji: '📘', desc: 'Ligne claire', prompt: 'Franco-Belgian bande dessinée style, ligne claire technique, uniform clean ink outlines, no speech balloons. Character keeps identity.' },
    { id: 'chalkboard', name: 'Tableau noir', emoji: '📋', desc: 'Craie', prompt: 'chalkboard illustration style, white and colored chalk on dark green blackboard, hand-drawn educational look; the board only shows simple chalk pictures, never any writing. Character keeps the same face and identity as the source photo.' },
    { id: 'kids-book', name: 'Livre enfants', emoji: '📖', desc: 'Illustration douce', prompt: 'children\'s book illustration style, soft pastel colors, gentle watercolor textures. Character keeps the same face and identity as the source photo.' },
    { id: 'papercut', name: 'Papercut', emoji: '✂️', desc: 'Découpage', prompt: 'paper cut-out animation style, layered paper shapes, subtle drop shadows. Character keeps the same face and identity as the source photo.' },
    { id: 'claymation', name: 'Claymation', emoji: '🧱', desc: 'Pâte à modeler', prompt: 'claymation stop-motion style, plasticine texture, fingerprint details. Character keeps the same face and identity as the source photo.' },
    { id: 'manga-edu', name: 'Manga pédagogique', emoji: '📚', desc: 'Manga N&B', prompt: 'Japanese educational manga style, black and white ink, screentones, no speech balloons and no sound-effect lettering. Character keeps the same face and identity as the source photo.' },
    { id: 'watercolor-edu', name: 'Aquarelle', emoji: '🎨', desc: 'Aquarelle douce', prompt: 'soft educational watercolor style, translucent washes, paper texture. Character keeps the same face and identity as the source photo.' },
    { id: 'infographic', name: 'Infographie', emoji: '📊', desc: 'Data / schéma', prompt: 'animated infographic style, clean pictogram icons and simple shapes, flat design; charts and icons never contain numbers, labels or letters. Character keeps the same face and identity as the source photo.' }
];

const AUDIENCE_PROMPTS = {
    kids: 'The explanation is for children aged 5 to 10. Use very simple words, playful tone, friendly expressions.',
    teens: 'The explanation is for teenagers. Use clear modern language, dynamic pacing, relatable examples.',
    adults: 'The explanation is for adults. Use precise vocabulary, structured reasoning, professional tone.',
    experts: 'The explanation is for experts. Use technical vocabulary, dense information, precise diagrams.'
};
const TONE_PROMPTS = {
    friendly: 'warm, friendly, encouraging tone, like a helpful teacher',
    enthusiastic: 'enthusiastic, energetic, excited tone',
    calm: 'calm, measured, soothing tone',
    funny: 'humorous, playful tone with light jokes',
    serious: 'serious, professional, authoritative tone'
};
const MOTION_PROMPTS = {
    explain: 'character gestures with open hands while explaining',
    point: 'character points toward the information',
    think: 'character puts hand on chin, thinking',
    show: 'character presents with an open palm, holding nothing',
    nod: 'character nods approvingly',
    count: 'character counts on their fingers',
    draw: 'character traces simple shapes in the air with one finger'
};
// L'IA vidéo ne dessine plus aucun effet : elle les rate (flous, verts, faux texte). L'appli s'en charge au montage.
const PEDAGO_FX_PROMPTS = {
    arrows: '', bubbles: '', highlight: '', schemas: '', icons: '', particles: '', chalkboard: '', progress: ''
};
const LIPSYNC_PROMPTS = {
    basic: 'character\'s mouth opens and closes naturally as they speak',
    advanced: 'character\'s mouth forms precise syllables synchronized with speech',
    'audio-driven': 'character\'s mouth movements precisely synchronized with the audio waveform',
    off: 'character\'s mouth remains mostly closed'
};

const SCRIPT_PRESETS = [
    { label: '💧 Cycle de l\'eau', text: `Bonjour les amis ! Aujourd'hui, nous allons découvrir le cycle de l'eau.
L'eau des océans s'évapore sous l'effet du soleil.
La vapeur monte dans l'atmosphère et forme des nuages.
Quand les nuages sont trop lourds, la pluie tombe.
L'eau retourne dans les rivières, puis dans les océans.
Et le cycle recommence, encore et encore !
Grâce à ce phénomène, la vie sur Terre est possible.
L'eau que tu bois aujourd'hui a peut-être été bue par un dinosaure !
C'est pour cela qu'il faut la protéger et ne pas la gaspiller.
Merci de m'avoir écouté, et à bientôt pour une nouvelle aventure !` },
    { label: '🌱 Photosynthèse', text: `Salut ! Aujourd'hui, je vais t'expliquer la photosynthèse.
C'est le processus qui permet aux plantes de fabriquer leur nourriture.
Tout commence par la lumière du soleil.
Les feuilles capturent cette lumière grâce à la chlorophylle.
La plante absorbe aussi de l'eau par ses racines.
Et du dioxyde de carbone par ses feuilles.
Avec tout ça, elle fabrique du sucre et rejette de l'oxygène.
C'est cet oxygène que nous respirons !
Sans les plantes, nous ne pourrions pas vivre.
Alors, prenons soin d'elles chaque jour.` },
    { label: '🚀 Système solaire', text: `Bonjour les explorateurs ! Prêts à voyager dans le système solaire ?
Tout commence par le Soleil, notre étoile.
Autour de lui tournent huit planètes.
Mercure, Vénus, Terre, Mars, Jupiter, Saturne, Uranus et Neptune.
La Terre est la troisième planète, et c'est la nôtre.
Elle est la seule à abriter la vie telle que nous la connaissons.
Jupiter est la plus grande, avec ses tempêtes géantes.
Saturne est célèbre pour ses anneaux de glace.
Plus loin, Uranus et Neptune sont des géantes de glace.
L'univers est immense, et nous n'en connaissons qu'une infime partie.` },
    { label: '📜 Révolution française', text: `Bonjour à tous. Aujourd'hui, parlons de la Révolution française.
Nous sommes en 1789, en France.
Le peuple souffre de la famine et des inégalités.
Le roi Louis XVI règne sur un pays au bord de la crise.
Le 14 juillet, le peuple prend la Bastille.
C'est le début de la Révolution.
Les droits de l'homme sont proclamés.
La monarchie est renversée.
La République est instaurée.
Cet événement a changé l'histoire de France et du monde.` },
    { label: '🧠 Le cerveau', text: `Bonjour ! Aujourd'hui, découvrons le cerveau humain.
C'est l'organe le plus complexe de notre corps.
Il pèse environ 1,4 kilogramme.
Il contient des milliards de neurones.
Ces neurones communiquent entre eux par des signaux électriques.
Le cerveau contrôle nos pensées, nos mouvements et nos émotions.
Il est divisé en plusieurs régions spécialisées.
Le cortex est la partie la plus récente de l'évolution.
Chaque apprentissage modifie physiquement le cerveau.
C'est ce qu'on appelle la neuroplasticité.` }
];

// ══════════════════════════════════════════════════════════════════
// API KEYS — Helpers génériques
// ══════════════════════════════════════════════════════════════════
function getAgnesKey() { return getLS(STORAGE.AGNES_KEY).trim(); }
function getElevenLabsKey() { return getLS(STORAGE.ELEVENLABS_KEY).trim(); }
function getGCloudKey() { return getLS(STORAGE.GCLOUD_KEY).trim(); }
function getAzureKey() { return getLS(STORAGE.AZURE_KEY).trim(); }
function getAzureRegion() { return getLS(STORAGE.AZURE_REGION).trim(); }
function getPollyKey() { return getLS(STORAGE.POLLY_KEY).trim(); }
function getPollySecret() { return getLS(STORAGE.POLLY_SECRET).trim(); }
function getPollyRegion() { return getLS(STORAGE.POLLY_REGION).trim(); }
function getOpenAIKey() { return getLS(STORAGE.OPENAI_KEY).trim(); }
function getDeepLKey() { return getLS(STORAGE.DEEPL_KEY).trim(); }
function getGTranslateKey() { return getLS(STORAGE.GTRANSLATE_KEY).trim(); }
function getAvatarKey() { return getLS(STORAGE.AVATAR_KEY).trim(); }
function getSDKey() { return getLS(STORAGE.SD_KEY).trim(); }
function getYouTubeClientId() { return getLS(STORAGE.YOUTUBE_CLIENT).trim(); }
function getYouTubeApiKey() { return getLS(STORAGE.YOUTUBE_APIKEY).trim(); }

function saveAgnesKey() {
    const input = document.getElementById('api-key-input');
    const key = input.value.trim();
    if (!key) { localStorage.removeItem(STORAGE.AGNES_KEY); updateApiPanel(); showToast('Clé supprimée', 'warn'); return; }
    setLS(STORAGE.AGNES_KEY, key); updateApiPanel(); showToast('Clé Agnes enregistrée ✓', 'success');
}
function updateApiPanel() {
    const panel = document.getElementById('api-panel'), input = document.getElementById('api-key-input');
    const statusLine = document.getElementById('api-status-line'), statusText = document.getElementById('api-status-text');
    const key = getAgnesKey();
    if (!panel || !input || !statusLine || !statusText) return;
    if (key) { panel.classList.add('ok'); statusLine.classList.add('ok'); statusText.textContent = 'Clé active · ' + key.slice(0, 8) + '…' + key.slice(-4); input.value = key; }
    else { panel.classList.remove('ok'); statusLine.classList.remove('ok'); statusText.textContent = 'Aucune clé API Agnes'; input.value = ''; }
    updateGenerateBtn();
}
function saveClaudeKey() {
    const input = document.getElementById('claude-key-input');
    const key = input.value.trim();
    const model = document.getElementById('claude-model-select')?.value;
    if (model) setLS(STORAGE.CLAUDE_MODEL, model);
    if (!key) { localStorage.removeItem(STORAGE.CLAUDE_KEY); updateClaudePanel(); showToast('Clé Claude supprimée', 'warn'); return; }
    if (!key.startsWith('sk-ant-')) showToast('Attention : une clé Claude commence normalement par « sk-ant- »', 'warn', 4000);
    setLS(STORAGE.CLAUDE_KEY, key); updateClaudePanel(); showToast('Clé Claude enregistrée ✓', 'success');
}
function updateClaudePanel() {
    const panel = document.getElementById('claude-panel'), input = document.getElementById('claude-key-input');
    const line = document.getElementById('claude-status-line'), txt = document.getElementById('claude-status-text');
    const sel = document.getElementById('claude-model-select');
    if (!panel || !input || !line || !txt) return;
    const key = getLS(STORAGE.CLAUDE_KEY).trim();
    const model = getClaudeModel();
    if (sel) sel.value = model;
    const modelName = sel?.selectedOptions?.[0]?.textContent.split(' (')[0] || model;
    if (key) { panel.classList.add('ok'); line.classList.add('ok'); txt.textContent = 'Clé active · ' + key.slice(0, 10) + '…' + key.slice(-4) + ' · ' + modelName; input.value = key; }
    else { panel.classList.remove('ok'); line.classList.remove('ok'); txt.textContent = 'Aucune clé Claude (mise en scène automatique)'; input.value = ''; }
}
// Serveur Cloudflare de l'appli (relais + génération en arrière-plan). Pas un secret :
// il n'accepte que les requêtes venant du site de l'appli.
const DEFAULT_PROXY_URL = 'https://cartoon-instructeur.mendy-tamadouni2.workers.dev';
function getProxyUrl() { return (getLS(STORAGE.PROXY_URL) || DEFAULT_PROXY_URL).trim(); }
function updateGenModeHint() {
    const el = document.getElementById('gen-mode-hint'); if (!el) return;
    if (state.genMode !== 'background') { el.textContent = 'Garde l\'appli ouverte et l\'écran allumé jusqu\'à la fin.'; return; }
    if (!getProxyUrl()) el.textContent = '⚠️ Nécessite le relais Cloudflare (bloc en haut de la page).';
    else if (!state.proxyJobs) el.textContent = '⚠️ Ton serveur Cloudflare n\'est pas encore à jour : la génération se fera sur le téléphone.';
    else el.textContent = 'Tu peux fermer l\'appli et éteindre le téléphone. En revenant, un bouton te permettra de terminer la vidéo (1 à 2 min, appli ouverte).';
}
function normalizeProxyUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    return u.replace(/[?#].*$/, '').replace(/\/+$/, '');
}
function proxied(url) { const p = getProxyUrl(); return p ? p + '/?url=' + encodeURIComponent(url) : url; }
function setProxyStatus(text, ok) {
    const line = document.getElementById('proxy-status-line'), txt = document.getElementById('proxy-status-text'), panel = document.getElementById('proxy-panel');
    if (!line || !txt) return;
    txt.textContent = text;
    line.classList.toggle('ok', !!ok); panel?.classList.toggle('ok', !!ok);
}
async function testProxy() {
    const p = getProxyUrl();
    if (!p) { setProxyStatus('Aucun relais : le montage final ne pourra pas se faire', false); return false; }
    setProxyStatus('Test du relais…', false);
    try {
        const res = await withTimeout(fetch(p + '/'), 15000, 'pas de réponse');
        const body = await res.text();
        if (res.ok && body.includes('Relais OK')) {
            state.proxyJobs = body.includes('jobs');
            state.proxyMedia = body.includes('media');
            state.proxyParts = body.includes('parts');
            state.proxyTikTok = body.includes('tiktok');
            state.proxyInstagram = body.includes('instagram');
            setProxyStatus('✅ Relais opérationnel' + (state.proxyJobs ? ' · arrière-plan disponible' : ''), true);
            updateGenModeHint();
            return true;
        }
        if (res.status === 403) setProxyStatus('❌ Relais refusé : l\'adresse de l\'appli n\'est pas autorisée dans le code du relais (' + body.slice(0, 80) + ')', false);
        else setProxyStatus('❌ Réponse inattendue (' + res.status + ') : vérifie que le code du relais a bien été collé et déployé', false);
    } catch (e) { setProxyStatus('❌ Relais injoignable : vérifie l\'adresse (' + e.message + ')', false); }
    return false;
}
async function saveProxy() {
    const input = document.getElementById('proxy-url-input');
    const u = normalizeProxyUrl(input.value);
    if (!u) { localStorage.removeItem(STORAGE.PROXY_URL); input.value = DEFAULT_PROXY_URL; testProxy(); showToast('Adresse par défaut rétablie', 'success'); return; }
    input.value = u; setLS(STORAGE.PROXY_URL, u);
    const ok = await testProxy();
    showToast(ok ? 'Relais enregistré et opérationnel ✓' : 'Relais enregistré, mais le test a échoué', ok ? 'success' : 'error', 4000);
}
const BACKUP_KEYS = ['AGNES_KEY', 'CLAUDE_KEY', 'CLAUDE_MODEL', 'PROXY_URL', 'ELEVENLABS_KEY', 'ELEVENLABS_VOICE', 'GCLOUD_KEY', 'GCLOUD_VOICE', 'AZURE_KEY', 'AZURE_REGION', 'AZURE_VOICE', 'POLLY_KEY', 'POLLY_SECRET', 'POLLY_REGION', 'POLLY_VOICE', 'OPENAI_KEY', 'DEEPL_KEY', 'GTRANSLATE_KEY', 'AVATAR_KEY', 'YOUTUBE_CLIENT', 'YOUTUBE_APIKEY'];
function exportKeys() {
    const data = { app: 'cartoon-instructeur', version: 1, date: new Date().toISOString(), keys: {} };
    BACKUP_KEYS.forEach(k => { const v = getLS(STORAGE[k]); if (v) data.keys[k] = v; });
    if (!Object.keys(data.keys).length) { showToast('Aucune clé à sauvegarder', 'warn'); return; }
    saveBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'cles-cartoon-instructeur.json');
}
async function importKeys(file) {
    try {
        const data = JSON.parse(await file.text());
        if (!data || data.app !== 'cartoon-instructeur' || !data.keys) throw new Error('fichier non reconnu');
        let n = 0;
        BACKUP_KEYS.forEach(k => { if (typeof data.keys[k] === 'string' && data.keys[k]) { setLS(STORAGE[k], data.keys[k]); n++; } });
        showToast(n + ' réglage' + (n > 1 ? 's' : '') + ' restauré' + (n > 1 ? 's' : '') + ' ✓', 'success');
        refreshKeyFields();
    } catch (e) { showToast('Restauration impossible : ' + e.message, 'error', 5000); }
}
// Affiche dans les champs les clés déjà enregistrées, pour qu'on voie qu'elles sont bien là.
function refreshKeyFields() {
    const fill = (id, k) => { const el = document.getElementById(id); const v = getLS(STORAGE[k]); if (el && v) el.value = v; };
    fill('elevenlabs-key', 'ELEVENLABS_KEY'); fill('gcloud-key', 'GCLOUD_KEY');
    fill('azure-key', 'AZURE_KEY'); fill('azure-region', 'AZURE_REGION');
    fill('polly-key', 'POLLY_KEY'); fill('polly-secret', 'POLLY_SECRET'); fill('polly-region', 'POLLY_REGION');
    fill('whisper-api-key', 'OPENAI_KEY'); fill('avatar-key-input', 'AVATAR_KEY');
    fill('youtube-client-id', 'YOUTUBE_CLIENT'); fill('youtube-api-key', 'YOUTUBE_APIKEY');
    { const el = document.getElementById('proxy-url-input'); if (el) el.value = getProxyUrl(); }
    updateApiPanel(); updateClaudePanel();
    updateElevenLabsStatus(); updateGCloudStatus(); updateAzureStatus(); updatePollyStatus();
    const names = { AGNES_KEY: 'Agnes', CLAUDE_KEY: 'Claude', PROXY_URL: 'Relais', ELEVENLABS_KEY: 'ElevenLabs', GCLOUD_KEY: 'Google Cloud', AZURE_KEY: 'Azure', POLLY_KEY: 'Amazon Polly', OPENAI_KEY: 'OpenAI', DEEPL_KEY: 'DeepL', GTRANSLATE_KEY: 'Google Translate', AVATAR_KEY: 'Avatar' };
    const saved = Object.keys(names).filter(k => getLS(STORAGE[k])).map(k => names[k]);
    const sum = document.getElementById('keys-summary');
    if (sum) sum.textContent = saved.length ? '✅ Clés enregistrées sur ce téléphone : ' + saved.join(', ') : 'Aucune clé enregistrée pour l\'instant.';
    if (getElevenLabsKey() && !elevenlabsVoices.length && typeof loadElevenLabsVoicesQuiet === 'function') loadElevenLabsVoicesQuiet();
    if (getElevenLabsKey() && typeof refreshElevenQuota === 'function' && !elevenQuota) refreshElevenQuota();
}
function updateGenerateBtn() {
    const btn = document.getElementById('generate-btn');
    if (!btn) return;
    const hasImages = state.images.length > 0, hasKey = !!getAgnesKey(), hasScript = state.scenes.length > 0;
    const busy = state.isRunning || state.storyboarding || (typeof assembling !== 'undefined' && assembling);
    const direct = hasScript && typeof puppetOnly === 'function' && puppetOnly();
    btn.disabled = !hasImages || !hasKey || !hasScript || busy || state.isLoadingImages;
    if (state.isLoadingImages) btn.textContent = 'Chargement…';
    else if (state.storyboarding) btn.textContent = 'Préparation du storyboard…';
    else if (state.isRunning) btn.textContent = 'Génération… (' + (state.completed + state.failed) + '/' + state.queue.length + ')';
    else if (busy) btn.textContent = 'Montage en cours…';
    else if (!hasKey) btn.textContent = 'Ajoutez votre clé Agnes';
    else if (!hasImages) btn.textContent = 'Ajoutez une photo';
    else if (!hasScript) btn.textContent = 'Écrivez votre script';
    else btn.textContent = direct ? '🎭 Monter la vidéo (' + state.scenes.length + ' scènes, sans attendre Agnes)' : '🎬 Générer ' + state.scenes.length + ' scène' + (state.scenes.length > 1 ? 's' : '');
    document.getElementById('gen-mode-row')?.classList.toggle('hidden', direct);
}
