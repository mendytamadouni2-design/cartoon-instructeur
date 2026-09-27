// Cartoon Instructeur · Avatars, Firebase, YouTube, PWA, sauvegarde cloud
// (scripts classiques chargés dans l'ordre par index.html : ils partagent les mêmes variables globales)

// ══════════════════════════════════════════════════════════════════
// D-ID — AVATAR PARLANT RÉALISTE
// ══════════════════════════════════════════════════════════════════
const DID_API = 'https://api.d-id.com';

async function createDIDTalk(imageUrl, audioUrl) {
    const key = getAvatarKey();
    if (!key) throw new Error('Clé D-ID manquante');
    const auth = 'Basic ' + btoa(key + ':');
    const res = await fetch(DID_API + '/talks', {
        method: 'POST',
        headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            source_url: imageUrl,
            script: { type: 'audio', audio_url: audioUrl },
            config: { stitch: true, result_format: 'mp4' }
        })
    });
    if (!res.ok) { const err = await res.text(); throw new Error('D-ID ' + res.status + ' ' + err.slice(0, 150)); }
    const data = await res.json();
    return data.id;
}

async function pollDIDTalk(id) {
    const key = getAvatarKey();
    const auth = 'Basic ' + btoa(key + ':');
    for (let i = 0; i < 60; i++) {
        await sleep(5000);
        const res = await fetch(DID_API + '/talks/' + id, { headers: { 'Authorization': auth } });
        const d = await res.json();
        if (d.status === 'done') return d.result_url;
        if (d.status === 'error') throw new Error('D-ID échec : ' + (d.error?.description || 'inconnu'));
    }
    throw new Error('D-ID timeout');
}

async function uploadToDID(kind, blob, filename) {
    const fd = new FormData();
    fd.append(kind === 'images' ? 'image' : 'audio', blob, filename);
    const res = await fetch(DID_API + '/' + kind, { method: 'POST', headers: { 'Authorization': 'Basic ' + btoa(getAvatarKey() + ':') }, body: fd });
    if (!res.ok) { const err = await res.text(); throw new Error('envoi ' + kind + ' ' + res.status + ' ' + err.slice(0, 120)); }
    const data = await res.json();
    if (!data.url) throw new Error('D-ID n\'a pas renvoyé de lien');
    return data.url;
}
async function generateDIDVideo() {
    const img = state.images[0];
    if (!img) { showToast('Ajoutez une photo', 'error'); return null; }
    if (!getAvatarKey()) { showToast('Clé D-ID manquante', 'error'); return null; }
    setStatus('Préparation de la voix…');
    let audioBlob = state.finalAudioBlob;
    try {
        if (!audioBlob && state.ttsEngine !== 'browser' && state.script) audioBlob = await generateAudioUnified(state.scenes.join(' '));
    } catch (e) { log('Voix D-ID : ' + e.message); }
    if (!audioBlob) { setStatus(null); showToast('D-ID a besoin de la voix premium (ElevenLabs…) configurée', 'error', 5000); return null; }
    setStatus('Création D-ID…');
    try {
        const imageUrl = await uploadToDID('images', img.file || await (await fetch(img.dataUri)).blob(), 'personnage.jpg');
        const audioUrl = await uploadToDID('audios', audioBlob, 'voix.mp3');
        const id = await createDIDTalk(imageUrl, audioUrl);
        setStatus('Traitement D-ID (peut prendre 1-2 min)…');
        const url = await pollDIDTalk(id);
        const box = document.getElementById('avatar-preview-box');
        const vid = document.getElementById('avatar-preview-video');
        vid.src = url; box.classList.add('visible');
        showToast('Avatar D-ID généré', 'success');
        return url;
    } catch (e) { showToast('D-ID échec : ' + e.message, 'error'); return null; }
    finally { setStatus(null); }
}

// ══════════════════════════════════════════════════════════════════
// HEYGEN — AVATAR VIDÉO
// ══════════════════════════════════════════════════════════════════
const HEYGEN_API = 'https://api.heygen.com';

async function generateHeyGenVideo() {
    const key = getAvatarKey();
    if (!key) { showToast('Clé HeyGen manquante', 'error'); return null; }
    if (!state.script) { showToast('Script manquant', 'error'); return null; }
    setStatus('Création HeyGen…');
    try {
        // Création vidéo à partir d'un avatar standard + texte
        const res = await fetch(HEYGEN_API + '/v2/video/generate', {
            method: 'POST',
            headers: { 'X-Api-Key': key, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                video_inputs: [{
                    character: { type: 'avatar', avatar_id: 'Daisy-inskirt-20220818', avatar_style: 'normal' },
                    voice: { type: 'text', input_text: state.script, voice_id: '1bd001e7e50f421d891986aad5158bc8' }
                }],
                dimension: { width: 720, height: 1280 }
            })
        });
        if (!res.ok) { const err = await res.text(); throw new Error('HeyGen ' + res.status + ' ' + err.slice(0, 150)); }
        const data = await res.json();
        const videoId = data.data?.video_id;
        if (!videoId) throw new Error('Pas de video_id HeyGen');
        setStatus('Traitement HeyGen…');
        for (let i = 0; i < 60; i++) {
            await sleep(5000);
            const check = await fetch(HEYGEN_API + '/v1/video_status.get?video_id=' + videoId, { headers: { 'X-Api-Key': key } });
            const c = await check.json();
            if (c.data?.status === 'completed') {
                const url = c.data.video_url;
                const box = document.getElementById('avatar-preview-box');
                const vid = document.getElementById('avatar-preview-video');
                vid.src = url; box.classList.add('visible');
                showToast('Avatar HeyGen généré', 'success');
                return url;
            }
            if (c.data?.status === 'failed') throw new Error('HeyGen échec');
        }
        throw new Error('HeyGen timeout');
    } catch (e) { showToast('HeyGen échec : ' + e.message, 'error'); return null; }
    finally { setStatus(null); }
}

async function testAvatarProvider() {
    if (state.avatarProvider === 'did') await generateDIDVideo();
    else if (state.avatarProvider === 'heygen') await generateHeyGenVideo();
    else showToast('Aucun avatar sélectionné', 'warn');
}

// ══════════════════════════════════════════════════════════════════
// FIREBASE — AUTH + FIRESTORE
// ══════════════════════════════════════════════════════════════════
async function initFirebase() {
    const cfg = getJSON(STORAGE.FIREBASE_CONFIG);
    if (!cfg) { showToast('Aucune config Firebase', 'warn'); return false; }
    try {
        if (!window.firebase) {
            await loadScript('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
            await loadScript('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js');
            await loadScript('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js');
        }
        if (!state.firebaseApp) {
            state.firebaseApp = window.firebase.initializeApp(cfg, 'cartoon-' + Date.now());
            state.firebaseDb = window.firebase.firestore(state.firebaseApp);
            try {
                state.firebaseUser = (await window.firebase.auth(state.firebaseApp).signInAnonymously()).user;
            } catch (e) { log('Auth anonyme échouée : ' + e.message); }
        }
        const st = document.getElementById('firebase-status-text');
        if (st) st.textContent = '✅ Firebase connecté' + (state.firebaseUser ? ' · ' + state.firebaseUser.uid.slice(0, 8) : '');
        return true;
    } catch (e) { showToast('Firebase init échoué : ' + e.message, 'error'); return false; }
}

async function saveFirebaseKey() {
    const raw = document.getElementById('firebase-config-input').value.trim();
    try {
        const cfg = JSON.parse(raw);
        setJSON(STORAGE.FIREBASE_CONFIG, cfg);
        showToast('Config Firebase enregistrée', 'success');
        await initFirebase();
    } catch (e) { showToast('JSON invalide', 'error'); }
}

async function syncFirebaseProjects() {
    if (!state.firebaseDb) { await initFirebase(); }
    if (!state.firebaseDb) return;
    setStatus('Sync Firebase…');
    try {
        const data = { history: loadHistory(), updated: Date.now() };
        const uid = state.firebaseUser?.uid || 'anonymous';
        await state.firebaseDb.collection('cartoon_users').doc(uid).set(data, { merge: true });
        showToast('Projets synchronisés sur Firebase', 'success');
    } catch (e) { showToast('Sync Firebase échouée : ' + e.message, 'error'); }
    finally { setStatus(null); }
}

// ══════════════════════════════════════════════════════════════════
// YOUTUBE — UPLOAD VIA OAUTH IMPLICITE
// ══════════════════════════════════════════════════════════════════
function saveYouTubeConfig() {
    const cid = document.getElementById('youtube-client-id').value.trim();
    const apiKey = document.getElementById('youtube-api-key').value.trim();
    if (cid) setLS(STORAGE.YOUTUBE_CLIENT, cid);
    if (apiKey) setLS(STORAGE.YOUTUBE_APIKEY, apiKey);
    showToast('Config YouTube enregistrée', 'success');
    updateYouTubeStatus();
}

function updateYouTubeStatus() {
    const el = document.getElementById('youtube-status-text');
    if (!el) return;
    const cid = getYouTubeClientId();
    const token = getYouTubeToken();
    if (!token && getLS(STORAGE.YOUTUBE_TOKEN)) { el.textContent = '⌛ Connexion YouTube expirée · clique sur Se connecter'; return; }
    if (token) { el.textContent = '✅ YouTube connecté'; if (state.finalBlob) document.getElementById('youtube-upload-btn')?.classList.remove('hidden'); }
    else if (cid) el.textContent = '🔑 Client ID enregistré · cliquez sur Se connecter';
    else el.textContent = '📺 Non connecté';
}

function getYouTubeToken() {
    const token = getLS(STORAGE.YOUTUBE_TOKEN);
    const exp = parseInt(getLS(STORAGE.YOUTUBE_TOKEN_EXP, '0'), 10);
    if (!token || (exp && Date.now() > exp)) return '';
    return token;
}
function connectYouTube() {
    const cid = getYouTubeClientId();
    if (!cid) { showToast('Renseignez le Client ID Google', 'error'); return; }
    const redirect = window.location.href.split('#')[0];
    const scope = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/youtube.force-ssl https://www.googleapis.com/auth/yt-analytics.readonly';
    const url = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=' + encodeURIComponent(cid) +
        '&redirect_uri=' + encodeURIComponent(redirect) +
        '&response_type=token&scope=' + encodeURIComponent(scope) +
        '&include_granted_scopes=true&prompt=consent';
    window.location.href = url;
}

function checkYouTubeTokenFromHash() {
    const hash = window.location.hash.substring(1);
    if (!hash) return;
    const params = new URLSearchParams(hash);
    const token = params.get('access_token');
    if (token) {
        setLS(STORAGE.YOUTUBE_TOKEN, token);
        const expiresIn = parseInt(params.get('expires_in') || '3600', 10);
        setLS(STORAGE.YOUTUBE_TOKEN_EXP, String(Date.now() + (expiresIn - 60) * 1000));
        window.history.replaceState({}, '', window.location.pathname);
        updateYouTubeStatus();
        showToast('Connecté à YouTube ✓', 'success');
    }
}

// Publie sur YouTube ; avec publishAt (Date), la vidéo reste privée puis devient publique à l'heure dite (programmation native YouTube).
async function uploadToYouTube(opts) {
    const publishAt = opts && opts.publishAt instanceof Date && opts.publishAt.getTime() > Date.now() + 60000 ? opts.publishAt : null;
    const videoBlob = (opts && opts.blob) || state.finalBlob, isShort = !!(opts && opts.short);
    if (!videoBlob) { showToast('Aucune vidéo à uploader', 'error'); return null; }
    const token = getYouTubeToken();
    if (!token) { updateYouTubeStatus(); showToast('Connexion YouTube expirée : reconnecte-toi (section Publication YouTube)', 'warn', 5000); return null; }
    try {
        if (!state.seo?.title && getClaudeKey()) { setStatus('Claude prépare le titre et la description…'); await generateSEO(); }
        setStatus('Envoi de la vidéo sur YouTube…');
        const tags = (state.seo?.tags || []).slice(0, 15);
        const description = [(state.seo?.description || state.script), 'CHAPITRES', generateChapters().trim(), tags.slice(0, 5).map(t => '#' + t.replace(/\s+/g, '')).join(' ')].filter(Boolean).join('\n\n');
        const metadata = {
            snippet: {
                title: ((state.seo?.title || state.theme || 'Vidéo pédagogique').slice(0, isShort ? 90 : 100) + (isShort ? ' #Shorts' : '')),
                description: ((isShort ? '#Shorts\n' : '') + description).slice(0, 5000),
                tags,
                categoryId: '27',
                defaultLanguage: (state.language || 'fr-FR').split('-')[0]
            },
            status: publishAt
                ? { privacyStatus: 'private', publishAt: publishAt.toISOString(), selfDeclaredMadeForKids: false }
                : { privacyStatus: state.youtubePrivacy || 'unlisted', selfDeclaredMadeForKids: false }
        };
        const boundary = '-------cartoon' + Date.now();
        const metaPart = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata) + '\r\n';
        const videoPart = '--' + boundary + '\r\nContent-Type: ' + (videoBlob.type || 'video/mp4') + '\r\n\r\n';
        const endPart = '\r\n--' + boundary + '--';
        const body = new Blob([metaPart, videoPart, videoBlob, endPart], { type: 'multipart/related; boundary=' + boundary });
        const res = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary=' + boundary },
            body
        });
        if (res.status === 401) { setLS(STORAGE.YOUTUBE_TOKEN_EXP, '1'); updateYouTubeStatus(); throw new Error('connexion expirée, reconnecte-toi'); }
        if (!res.ok) { const err = await res.text(); throw new Error('YouTube ' + res.status + ' ' + err.slice(0, 200)); }
        const data = await res.json();
        const extras = [];
        // sous-titres (référencement + accessibilité)
        try {
            setStatus('Envoi des sous-titres…');
            extras.push(await uploadYouTubeCaption(data.id, generateSRT(), state.language || 'fr-FR', 'Sous-titres', token) ? 'sous-titres ✓' : 'sous-titres ✕');
        } catch (e) { extras.push('sous-titres ✕'); }
        // miniature (la chaîne doit être validée par téléphone chez YouTube)
        if (!isShort) try {
            setStatus('Envoi de la miniature…');
            const thumb = state.exportCache.thumbnail?.blob || await generateThumbnailImage();
            const tr = await fetch('https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=' + encodeURIComponent(data.id), { method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'image/jpeg' }, body: thumb });
            extras.push(tr.ok ? 'miniature ✓' : 'miniature ✕ (chaîne à valider sur YouTube)');
        } catch (e) { extras.push('miniature ✕'); }
        const pub = getJSON(STORAGE.YT_PUBLISHED, []);
        pub.unshift({ id: data.id, title: state.theme || 'Vidéo', date: publishAt ? publishAt.getTime() : Date.now(), script: state.script || '', hook: state.scenes[0] || '' });
        setJSON(STORAGE.YT_PUBLISHED, pub.slice(0, 50));
        state.lastYouTubeId = data.id;
        document.getElementById('lang-yt-btn')?.classList.toggle('hidden', !Object.keys(state.langSrt || {}).length);
        showToast((publishAt ? 'Vidéo programmée le ' + publishAt.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) + ' : ' : 'Vidéo publiée : ') + 'https://youtu.be/' + data.id + ' · ' + extras.join(' · '), 'success', 10000);
        log('YouTube : ' + data.id + ' ' + extras.join(', '));
        return data.id;
    } catch (e) { showToast('Upload échoué : ' + e.message, 'error'); return null; }
    finally { setStatus(null); }
}
async function uploadYouTubeCaption(videoId, srt, lang, name, token) {
    const cb = '-------cartoonsrt' + Date.now();
    const meta = { snippet: { videoId, language: String(lang).split('-')[0], name, isDraft: false } };
    const capBody = new Blob(['--' + cb + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) + '\r\n--' + cb + '\r\nContent-Type: application/octet-stream\r\n\r\n', srt, '\r\n--' + cb + '--'], { type: 'multipart/related; boundary=' + cb });
    const cr = await fetch('https://www.googleapis.com/upload/youtube/v3/captions?uploadType=multipart&part=snippet', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary=' + cb }, body: capBody });
    return cr.ok;
}

// ══════════════════════════════════════════════════════════════════
// PWA
// ══════════════════════════════════════════════════════════════════
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); deferredInstallPrompt = e;
    document.getElementById('install-banner')?.classList.add('visible');
});
window.addEventListener('appinstalled', () => { showToast('Application installée !', 'success'); deferredInstallPrompt = null; });
async function installPWA() {
    if (!deferredInstallPrompt) { showToast('Installation non disponible', 'warn'); return; }
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    if (choice.outcome === 'accepted') showToast('Installation…', 'success');
    deferredInstallPrompt = null;
    document.getElementById('install-banner')?.classList.remove('visible');
}

// ══════════════════════════════════════════════════════════════════
// SAUVEGARDE CLOUD MULTI-BACKEND
// ══════════════════════════════════════════════════════════════════
function getCloudConfig() { return getJSON(STORAGE.CLOUD_CONFIG, {}); }
function saveCloudConfig() {
    const provider = document.getElementById('cloud-provider-select').value;
    const cfg = document.getElementById('cloud-config-input').value.trim();
    try {
        const parsed = JSON.parse(cfg || '{}');
        setJSON(STORAGE.CLOUD_CONFIG, { provider, ...parsed });
        state.cloudProvider = provider;
        updateCloudStatus();
        showToast('Configuration cloud enregistrée', 'success');
    } catch (e) { showToast('JSON invalide', 'error'); }
}
function updateCloudStatus() {
    const el = document.getElementById('cloud-status-text');
    if (!el) return;
    const cfg = getCloudConfig();
    el.textContent = cfg.provider === 'local' ? '💾 Sauvegarde locale' : '☁️ ' + cfg.provider;
}
async function syncToCloud() {
    const cfg = getCloudConfig();
    if (!cfg.provider || cfg.provider === 'local') {
        const history = loadHistory();
        showToast('Sauvegarde locale (' + history.length + ' projets)', 'success');
        return;
    }
    setStatus('Synchronisation cloud…');
    try {
        const data = { history: loadHistory(), updated: Date.now() };
        if (cfg.provider === 'github') {
            const { token, gistId } = cfg;
            const res = await fetch('https://api.github.com/gists' + (gistId ? '/' + gistId : ''), {
                method: gistId ? 'PATCH' : 'POST',
                headers: { 'Authorization': 'token ' + token, 'Content-Type': 'application/json' },
                body: JSON.stringify({ description: 'Cartoon Instructeur Projects', files: { 'cartoon.json': { content: JSON.stringify(data, null, 2) } } })
            });
            if (!res.ok) throw new Error('GitHub ' + res.status);
            showToast('Sauvegardé sur GitHub', 'success');
        } else if (cfg.provider === 'supabase') {
            const { url, key } = cfg;
            const res = await fetch(url + '/rest/v1/projects', {
                method: 'POST',
                headers: { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' },
                body: JSON.stringify({ id: 'default', data, updated_at: new Date().toISOString() })
            });
            if (!res.ok) throw new Error('Supabase ' + res.status);
            showToast('Sauvegardé sur Supabase', 'success');
        } else if (cfg.provider === 'firebase') {
            await syncFirebaseProjects();
        } else if (cfg.provider === 'custom') {
            const { url } = cfg;
            const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            if (!res.ok) throw new Error('Serveur ' + res.status);
            showToast('Sauvegardé sur le serveur', 'success');
        } else {
            showToast('Backend ' + cfg.provider + ' non implémenté', 'warn');
        }
    } catch (e) { showToast('Erreur cloud : ' + e.message, 'error'); }
    finally { setStatus(null); }
}
async function loadFromCloud() {
    const cfg = getCloudConfig();
    if (!cfg.provider || cfg.provider === 'local') { showToast('Mode local uniquement', 'warn'); return; }
    setStatus('Chargement cloud…');
    try {
        let data = null;
        if (cfg.provider === 'github' && cfg.gistId) {
            const res = await fetch('https://api.github.com/gists/' + cfg.gistId, { headers: { 'Authorization': 'token ' + cfg.token } });
            const gist = await res.json();
            data = JSON.parse(gist.files['cartoon.json'].content);
        } else if (cfg.provider === 'supabase') {
            const res = await fetch(cfg.url + '/rest/v1/projects?id=eq.default', { headers: { 'apikey': cfg.key, 'Authorization': 'Bearer ' + cfg.key } });
            const arr = await res.json();
            data = arr[0]?.data;
        } else if (cfg.provider === 'custom') {
            const res = await fetch(cfg.url);
            data = await res.json();
        } else if (cfg.provider === 'firebase') {
            if (!state.firebaseDb) await initFirebase();
            const uid = state.firebaseUser?.uid || 'anonymous';
            const doc = await state.firebaseDb.collection('cartoon_users').doc(uid).get();
            data = doc.data();
        }
        if (data && data.history) { saveHistory(data.history); renderHistory(); showToast('Projets cloud chargés', 'success'); }
        else showToast('Aucun projet trouvé', 'warn');
    } catch (e) { showToast('Erreur chargement : ' + e.message, 'error'); }
    finally { setStatus(null); }
}
