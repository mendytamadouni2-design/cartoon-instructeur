// Cartoon Instructeur · Voix : ElevenLabs, Google, Azure, Polly, navigateur
// (scripts classiques chargés dans l'ordre par index.html : ils partagent les mêmes variables globales)

// ══════════════════════════════════════════════════════════════════
// ELEVENLABS
// ══════════════════════════════════════════════════════════════════
let elevenlabsVoices = [], elevenlabsSelectedVoiceId = '', elevenlabsKeyValid = false;
const ELEVENLABS_API = 'https://api.elevenlabs.io/v1';

async function saveElevenLabsKey() {
    const key = document.getElementById('elevenlabs-key').value.trim();
    if (!key) { localStorage.removeItem(STORAGE.ELEVENLABS_KEY); updateElevenLabsStatus(); showToast('Clé supprimée', 'warn'); return; }
    setLS(STORAGE.ELEVENLABS_KEY, key); updateElevenLabsStatus(); showToast('Clé ElevenLabs ✓', 'success'); loadElevenLabsVoices(); refreshElevenQuota();
}
function updateElevenLabsStatus() {
    const el = document.getElementById('elevenlabs-status'), txt = document.getElementById('elevenlabs-status-text');
    if (!el || !txt) return; el.classList.remove('ready', 'error');
    const key = getElevenLabsKey();
    if (!key) { txt.textContent = '🔑 Aucune clé'; return; }
    if (elevenlabsKeyValid) { el.classList.add('ready'); txt.textContent = '✅ ' + elevenlabsVoices.length + ' voix'; }
    else txt.textContent = '🔑 Clé enregistrée';
}
async function loadElevenLabsVoices() {
    const key = getElevenLabsKey(); if (!key) { showToast('Enregistrez la clé', 'warn'); return; }
    setStatus('Chargement voix ElevenLabs…');
    try {
        const res = await fetch(ELEVENLABS_API + '/voices', { headers: { 'xi-api-key': key } });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        elevenlabsVoices = data.voices || []; elevenlabsKeyValid = true;
        renderElevenLabsVoices(); updateElevenLabsStatus();
        document.getElementById('elevenlabs-voices-row')?.classList.remove('hidden');
        document.getElementById('elevenlabs-model-row')?.classList.remove('hidden');
        document.getElementById('elevenlabs-settings-row')?.classList.remove('hidden');
        showToast(elevenlabsVoices.length + ' voix chargées', 'success');
    } catch (e) { showToast('Erreur ElevenLabs : ' + e.message, 'error'); }
    finally { setStatus(null); }
}
async function loadElevenLabsVoicesQuiet() {
    try {
        const res = await fetch(ELEVENLABS_API + '/voices', { headers: { 'xi-api-key': getElevenLabsKey() } });
        if (!res.ok) return;
        const data = await res.json();
        elevenlabsVoices = data.voices || []; elevenlabsKeyValid = true;
        renderElevenLabsVoices(); updateElevenLabsStatus();
        ['elevenlabs-voices-row', 'elevenlabs-model-row', 'elevenlabs-settings-row'].forEach(id => document.getElementById(id)?.classList.remove('hidden'));
    } catch (e) {}
}
function renderElevenLabsVoices() {
    const list = document.getElementById('elevenlabs-voices-list'); if (!list) return;
    const saved = getLS(STORAGE.ELEVENLABS_VOICE);
    if (saved && !elevenlabsSelectedVoiceId) elevenlabsSelectedVoiceId = saved;
    // voix « premade » (et les tiennes) : utilisables sans abonnement ; celles de la bibliothèque demandent un abonnement payant
    const free = v => ['premade', 'cloned', 'generated'].includes(v.category);
    const sorted = elevenlabsVoices.slice().sort((a, b) => free(b) - free(a));
    list.innerHTML = sorted.map(v =>
        '<div class="tts-voice-item ' + (v.voice_id === elevenlabsSelectedVoiceId ? 'selected' : '') + '" data-voice-id="' + esc(v.voice_id) + '">' +
        '<div class="v-name">' + esc(v.name) + '</div><div class="v-info">' + (free(v) ? '✅ gratuite' : '💳 abonnement payant') + '</div></div>'
    ).join('');
    list.querySelectorAll('[data-voice-id]').forEach(el => {
        el.addEventListener('click', () => {
            elevenlabsSelectedVoiceId = el.dataset.voiceId;
            setLS(STORAGE.ELEVENLABS_VOICE, elevenlabsSelectedVoiceId);
            renderElevenLabsVoices(); showToast('Voix sélectionnée', 'success', 1000);
        });
    });
}
async function generateElevenLabsAudio(text, voiceId, modelId, stability, similarity, speed) {
    const key = getElevenLabsKey(); if (!key || !voiceId) throw new Error('Clé/voix manquante');
    const body = { text, model_id: modelId || 'eleven_multilingual_v2', voice_settings: { stability: parseFloat(stability) || 0.5, similarity_boost: parseFloat(similarity) || 0.75, style: 0, use_speaker_boost: true } };
    if (speed && Math.abs(speed - 1) > 0.01) body.voice_settings.speed = Math.round(speed * 100) / 100;
    // Une phrase déjà dite avec la même voix et les mêmes réglages n'est jamais repayée
    const cacheKey = await ttsCacheKey([voiceId, body.model_id, body.voice_settings.stability, body.voice_settings.similarity_boost, body.voice_settings.speed || 1, text]);
    if (state.elevenOffRun) throw new Error('voix Agnes choisie pour cette vidéo');
    const cached = await idbGet(cacheKey).catch(() => null);
    if (cached && cached.blob) return cached.blob;
    if (elevenQuotaShort(text.length)) throw new Error(elevenQuotaMessage());
    const res = await fetch(ELEVENLABS_API + '/text-to-speech/' + voiceId, {
        method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
        body: JSON.stringify(body)
    });
    if (!res.ok) {
        const err = await res.text();
        // voix de la bibliothèque ElevenLabs : réservée aux abonnés payants
        if (res.status === 402 || /paid_plan_required/.test(err)) throw new Error('cette voix ElevenLabs demande un abonnement payant : choisis une voix marquée « gratuite » dans Réglages → Voix et sous-titres');
        if (/quota_exceeded/.test(err)) { markElevenExhausted(); throw new Error(elevenQuotaMessage()); }
        throw new Error('ElevenLabs ' + res.status + ' ' + err.slice(0, 120));
    }
    if (typeof trackCost === 'function') trackCost('elevenlabs', text.length / 1000 * ELEVENLABS_PRICE_1K);
    addElevenUsage(text.length);
    const blob = await res.blob();
    storeTtsCache(cacheKey, blob);
    return blob;
}

// ══════════════════════════════════════════════════════════════════
// BUDGET ELEVENLABS (offre gratuite : 10 000 caractères par mois)
// Le compteur vient d'ElevenLabs quand la clé y a droit, sinon d'un décompte local.
// ══════════════════════════════════════════════════════════════════
const ELEVEN_FREE_LIMIT = 10000;
let elevenQuota = null;   // { used, limit, resetAt, source: 'api' | 'local' }
const monthTag = () => new Date().toISOString().slice(0, 7);
function elevenLocalUsage() { const u = getJSON(STORAGE.ELEVEN_USAGE); return u && u.month === monthTag() ? u.chars : 0; }
function addElevenUsage(n) {
    setJSON(STORAGE.ELEVEN_USAGE, { month: monthTag(), chars: elevenLocalUsage() + n });
    if (elevenQuota) elevenQuota.used += n;
    renderElevenQuota();
}
function elevenExhaustedFlag() {
    const f = getJSON(STORAGE.ELEVEN_EXHAUSTED);
    if (!f) return false;
    if (f.until ? Date.now() >= f.until : f.month !== monthTag()) { localStorage.removeItem(STORAGE.ELEVEN_EXHAUSTED); return false; }
    return true;
}
function markElevenExhausted() {
    setJSON(STORAGE.ELEVEN_EXHAUSTED, { month: monthTag(), until: elevenQuota?.resetAt || null });
    if (elevenQuota) elevenQuota.used = Math.max(elevenQuota.used, elevenQuota.limit);
    renderElevenQuota();
}
async function refreshElevenQuota() {
    const key = getElevenLabsKey();
    if (!key) { elevenQuota = null; renderElevenQuota(); return null; }
    try {
        const r = await withTimeout(fetch(ELEVENLABS_API + '/user/subscription', { headers: { 'xi-api-key': key } }), 10000, 'pas de réponse');
        if (r.ok) {
            const d = await r.json();
            elevenQuota = { used: d.character_count || 0, limit: d.character_limit || ELEVEN_FREE_LIMIT, resetAt: d.next_character_count_reset_unix ? d.next_character_count_reset_unix * 1000 : null, source: 'api' };
            if (elevenQuota.used < elevenQuota.limit) localStorage.removeItem(STORAGE.ELEVEN_EXHAUSTED);
            else markElevenExhausted();
        }
    } catch (e) {}
    if (!elevenQuota || elevenQuota.source !== 'api') {
        elevenQuota = { used: elevenLocalUsage(), limit: ELEVEN_FREE_LIMIT, resetAt: null, source: 'local' };
        if (elevenExhaustedFlag()) elevenQuota.used = Math.max(elevenQuota.used, elevenQuota.limit);
    }
    renderElevenQuota();
    return elevenQuota;
}
// Caractères restants ce mois-ci (null : inconnu)
function elevenRemaining() { return elevenQuota ? Math.max(0, elevenQuota.limit - elevenQuota.used) : (elevenExhaustedFlag() ? 0 : null); }
// Refus avant l'appel seulement quand on en est sûr : compteur d'ElevenLabs, ou quota déjà signalé épuisé
function elevenQuotaShort(n) {
    if (elevenExhaustedFlag()) return true;
    return !!(elevenQuota && elevenQuota.source === 'api' && elevenQuota.limit - elevenQuota.used < n);
}
function elevenResetText() {
    const t = elevenQuota?.resetAt || getJSON(STORAGE.ELEVEN_EXHAUSTED)?.until;
    if (t) return 'le ' + new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
    const d = new Date(); return 'début ' + new Date(d.getFullYear(), d.getMonth() + 1, 1).toLocaleDateString('fr-FR', { month: 'long' });
}
function elevenQuotaMessage() { return 'quota gratuit ElevenLabs du mois épuisé (il se recharge ' + elevenResetText() + ')'; }
const fmtInt = n => Math.round(n).toLocaleString('fr-FR');
function elevenQuotaLine() {
    if (!getElevenLabsKey()) return '';
    const r = elevenRemaining();
    if (r === null) return '';
    if (r <= 0) return '⚠️ Quota ElevenLabs du mois épuisé : voix Agnes jusqu\'au rechargement (' + elevenResetText() + ')';
    return '🔋 ElevenLabs : ' + fmtInt(r) + ' caractères restants ce mois-ci' + (elevenQuota?.source === 'api' ? '' : ' (décompte de l\'appli)') +
        ' · ≈ ' + Math.max(0, Math.floor(r / 800)) + ' Shorts d\'une minute · recharge ' + elevenResetText();
}
function renderElevenQuota() {
    document.querySelectorAll('[data-eleven-quota]').forEach(el => { el.textContent = elevenQuotaLine(); el.classList.toggle('hidden', !el.textContent); });
    if (typeof updateEstimate === 'function') updateEstimate();
}

// Mémoire des voix déjà générées (IndexedDB, sur le téléphone ; 400 phrases au plus)
async function ttsCacheKey(parts) { return 'tts:' + (await sha256Hex(parts.join('|'))).slice(0, 40); }
function storeTtsCache(key, blob) {
    idbPut(key, { blob, date: Date.now() }).then(() => {
        const idx = (getJSON(STORAGE.TTS_INDEX) || []).filter(k => k !== key);
        idx.push(key);
        const drop = idx.length > 400 ? idx.splice(0, idx.length - 400) : [];
        setJSON(STORAGE.TTS_INDEX, idx);
        drop.forEach(k => idbDel(k).catch(() => {}));
    }).catch(() => {});
}

// Caractères que la prochaine vidéo fera dire à ElevenLabs (phrases déjà en mémoire non comptées)
function elevenCharsNeeded() {
    if (!getElevenLabsKey() || !elevenVoiceId()) return 0;
    const usesVoice = state.voiceSource === 'fit' || (state.voiceSource === 'premium' && state.ttsEngine === 'elevenlabs');
    let n = 0;
    state.scenes.forEach((line, i) => {
        const p = typeof scenePlanFor === 'function' ? scenePlanFor(i) : {};
        if (usesVoice) n += (p.spoken || line).length;
        if (typeof richActive === 'function' && richActive()) n += p.narration ? p.narration.length : Math.round(line.length * 0.6);
    });
    return n;
}
// Avant de lancer : le quota suffit-il ? Sinon, raccourcir le script ou passer à la voix Agnes.
// Renvoie false si l'utilisateur préfère modifier son script avant de lancer.
async function checkVoiceBudget() {
    const need = elevenCharsNeeded();
    if (!need) return true;
    await refreshElevenQuota();
    const left = elevenRemaining();
    if (left === null || left >= need) return true;
    const msg = left <= 0
        ? '🗣️ Ton quota gratuit ElevenLabs du mois est épuisé (il se recharge ' + elevenResetText() + ').'
        : '🗣️ Cette vidéo demande environ ' + fmtInt(need) + ' caractères de voix ElevenLabs, il t\'en reste ' + fmtInt(left) + ' ce mois-ci.';
    if (left > 200 && getClaudeKey() && confirm(msg + '\n\nOK : Claude raccourcit le script pour qu\'il rentre dans ton quota (tu pourras le relire).\nAnnuler : autres choix.')) {
        await shortenScriptForVoice(left);
        return false;
    }
    if (confirm(msg + '\n\nOK : faire cette vidéo avec la voix Agnes (la même voix sur toute la vidéo).\nAnnuler : je modifie mon script.')) { state.elevenOffRun = true; return true; }
    return false;
}
async function shortenScriptForVoice(maxChars) {
    const target = Math.max(150, Math.floor(maxChars * 0.85));
    setStatus('Claude raccourcit le script…');
    try {
        const out = await callClaude({
            prompt: 'Raccourcis ce script de vidéo pour que le texte parlé total fasse au plus ' + target + ' caractères (espaces compris), sans perdre l\'idée principale ni l\'accroche. Garde une phrase par ligne, dans la même langue, au même ton.\n\nScript :\n' + state.script,
            schema: { type: 'object', properties: { lines: { type: 'array', items: { type: 'string' } } }, required: ['lines'], additionalProperties: false },
            maxTokens: 4000, effort: 'low'
        });
        const lines = (out.lines || []).map(l => String(l).trim()).filter(Boolean);
        if (!lines.length) throw new Error('réponse vide');
        const el = document.getElementById('script-input'); if (el) el.value = lines.join('\n');
        updateScriptStats(); if (typeof renderScenesEditor === 'function') renderScenesEditor();
        showToast('Script raccourci ✓ (' + fmtInt(lines.join(' ').length) + ' caractères) : relis-le puis relance', 'success', 6000);
    } catch (e) { showToast('Raccourcissement impossible : ' + e.message, 'error', 5000); }
    finally { setStatus(null); }
}

// ══════════════════════════════════════════════════════════════════
// GOOGLE CLOUD TTS
// ══════════════════════════════════════════════════════════════════
let gcloudVoices = [], gcloudSelectedVoiceName = '', gcloudKeyValid = false;
const GCLOUD_API = 'https://texttospeech.googleapis.com/v1';

async function saveGCloudKey() {
    const key = document.getElementById('gcloud-key').value.trim();
    if (!key) { localStorage.removeItem(STORAGE.GCLOUD_KEY); updateGCloudStatus(); showToast('Clé supprimée', 'warn'); return; }
    setLS(STORAGE.GCLOUD_KEY, key); updateGCloudStatus(); showToast('Clé Google Cloud ✓', 'success'); loadGCloudVoices();
}
function updateGCloudStatus() {
    const el = document.getElementById('gcloud-status'), txt = document.getElementById('gcloud-status-text');
    if (!el || !txt) return; el.classList.remove('ready', 'error');
    const key = getGCloudKey();
    if (!key) { txt.textContent = '🔑 Aucune clé'; return; }
    if (gcloudKeyValid) { el.classList.add('ready'); txt.textContent = '✅ ' + gcloudVoices.length + ' voix'; }
    else txt.textContent = '🔑 Clé enregistrée';
}
async function loadGCloudVoices() {
    const key = getGCloudKey(); if (!key) { showToast('Enregistrez la clé', 'warn'); return; }
    setStatus('Chargement voix Google Cloud…');
    try {
        const res = await fetch(GCLOUD_API + '/voices?key=' + encodeURIComponent(key));
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        gcloudVoices = data.voices || [];
        gcloudKeyValid = true; renderGCloudVoices(); updateGCloudStatus();
        document.getElementById('gcloud-voices-row')?.classList.remove('hidden');
        showToast(gcloudVoices.length + ' voix Google Cloud chargées', 'success');
    } catch (e) { showToast('Erreur Google Cloud : ' + e.message, 'error'); }
    finally { setStatus(null); }
}
function renderGCloudVoices() {
    const list = document.getElementById('gcloud-voices-list'); if (!list) return;
    const saved = getLS(STORAGE.GCLOUD_VOICE);
    if (saved && !gcloudSelectedVoiceName) gcloudSelectedVoiceName = saved;
    list.innerHTML = gcloudVoices.map(v =>
        '<div class="tts-voice-item ' + (v.name === gcloudSelectedVoiceName ? 'selected' : '') + '" data-voice-name="' + esc(v.name) + '">' +
        '<div class="v-name">' + esc(v.name) + '</div><div class="v-info">' + esc(v.ssmlGender || '') + ' · ' + esc((v.languageCodes || []).join(',')) + '</div></div>'
    ).join('');
    list.querySelectorAll('[data-voice-name]').forEach(el => {
        el.addEventListener('click', () => {
            gcloudSelectedVoiceName = el.dataset.voiceName;
            setLS(STORAGE.GCLOUD_VOICE, gcloudSelectedVoiceName);
            renderGCloudVoices(); showToast('Voix sélectionnée', 'success', 1000);
        });
    });
}
async function generateGCloudAudio(text, voiceName) {
    const key = getGCloudKey(); if (!key || !voiceName) throw new Error('Clé/voix manquante');
    const langCode = (gcloudVoices.find(v => v.name === voiceName)?.languageCodes || ['fr-FR'])[0];
    const body = { input: { text }, voice: { languageCode: langCode, name: voiceName }, audioConfig: { audioEncoding: 'MP3', speakingRate: state.voiceRate, pitch: (state.voicePitch - 1) * 10 } };
    const res = await fetch(GCLOUD_API + '/text:synthesize?key=' + encodeURIComponent(key), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    if (!res.ok) { const err = await res.text(); throw new Error('Google Cloud ' + res.status + ' ' + err.slice(0, 120)); }
    const data = await res.json();
    const audioBytes = atob(data.audioContent);
    const arr = new Uint8Array(audioBytes.length);
    for (let i = 0; i < audioBytes.length; i++) arr[i] = audioBytes.charCodeAt(i);
    return new Blob([arr], { type: 'audio/mpeg' });
}

// ══════════════════════════════════════════════════════════════════
// AZURE TTS
// ══════════════════════════════════════════════════════════════════
let azureVoices = [], azureSelectedVoiceName = '', azureKeyValid = false;

async function saveAzureKey() {
    const key = document.getElementById('azure-key').value.trim();
    const region = document.getElementById('azure-region').value.trim();
    if (!key || !region) { showToast('Clé et région obligatoires', 'warn'); return; }
    setLS(STORAGE.AZURE_KEY, key); setLS(STORAGE.AZURE_REGION, region);
    updateAzureStatus(); showToast('Clé Azure ✓', 'success'); loadAzureVoices();
}
function updateAzureStatus() {
    const el = document.getElementById('azure-status'), txt = document.getElementById('azure-status-text');
    if (!el || !txt) return; el.classList.remove('ready', 'error');
    const key = getAzureKey();
    if (!key) { txt.textContent = '🔑 Aucune clé'; return; }
    if (azureKeyValid) { el.classList.add('ready'); txt.textContent = '✅ ' + azureVoices.length + ' voix'; }
    else txt.textContent = '🔑 Clé enregistrée';
}
async function loadAzureVoices() {
    const key = getAzureKey(), region = getAzureRegion();
    if (!key || !region) { showToast('Renseignez clé + région', 'warn'); return; }
    setStatus('Chargement voix Azure…');
    try {
        const res = await fetch('https://' + region + '.tts.speech.microsoft.com/cognitiveservices/voices/list', { headers: { 'Ocp-Apim-Subscription-Key': key } });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        azureVoices = await res.json();
        azureKeyValid = true; renderAzureVoices(); updateAzureStatus();
        document.getElementById('azure-voices-row')?.classList.remove('hidden');
        showToast(azureVoices.length + ' voix Azure chargées', 'success');
    } catch (e) { showToast('Erreur Azure : ' + e.message, 'error'); }
    finally { setStatus(null); }
}
function renderAzureVoices() {
    const list = document.getElementById('azure-voices-list'); if (!list) return;
    const saved = getLS(STORAGE.AZURE_VOICE);
    if (saved && !azureSelectedVoiceName) azureSelectedVoiceName = saved;
    list.innerHTML = azureVoices.map(v =>
        '<div class="tts-voice-item ' + (v.ShortName === azureSelectedVoiceName ? 'selected' : '') + '" data-voice-name="' + esc(v.ShortName) + '">' +
        '<div class="v-name">' + esc(v.ShortName) + '</div><div class="v-info">' + esc(v.Gender) + ' · ' + esc(v.Locale) + '</div></div>'
    ).join('');
    list.querySelectorAll('[data-voice-name]').forEach(el => {
        el.addEventListener('click', () => { azureSelectedVoiceName = el.dataset.voiceName; setLS(STORAGE.AZURE_VOICE, azureSelectedVoiceName); renderAzureVoices(); });
    });
}
async function generateAzureAudio(text, voiceName) {
    const key = getAzureKey(), region = getAzureRegion();
    if (!key || !region || !voiceName) throw new Error('Clé/région/voix manquante');
    const lang = voiceName.split('-').slice(0, 2).join('-');
    const ssml = '<speak version="1.0" xml:lang="' + lang + '"><voice name="' + voiceName + '"><prosody rate="' + state.voiceRate + '">' + esc(text) + '</prosody></voice></speak>';
    const res = await fetch('https://' + region + '.tts.speech.microsoft.com/cognitiveservices/v1', {
        method: 'POST',
        headers: { 'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'audio-24khz-96kbitrate-mono-mp3' },
        body: ssml
    });
    if (!res.ok) throw new Error('Azure ' + res.status);
    return await res.blob();
}

// ══════════════════════════════════════════════════════════════════
// AMAZON POLLY
// ══════════════════════════════════════════════════════════════════
let pollyVoices = [], pollySelectedVoiceId = '', pollyKeyValid = false;

async function savePollyKey() {
    const key = document.getElementById('polly-key').value.trim();
    const secret = document.getElementById('polly-secret').value.trim();
    const region = document.getElementById('polly-region').value.trim();
    if (!key || !secret || !region) { showToast('Tous les champs sont obligatoires', 'warn'); return; }
    setLS(STORAGE.POLLY_KEY, key); setLS(STORAGE.POLLY_SECRET, secret); setLS(STORAGE.POLLY_REGION, region);
    updatePollyStatus(); showToast('Clés AWS ✓', 'success'); loadPollyVoices();
}
function updatePollyStatus() {
    const el = document.getElementById('polly-status'), txt = document.getElementById('polly-status-text');
    if (!el || !txt) return; el.classList.remove('ready', 'error');
    const key = getPollyKey();
    if (!key) { txt.textContent = '🔑 Aucune clé'; return; }
    if (pollyKeyValid) { el.classList.add('ready'); txt.textContent = '✅ ' + pollyVoices.length + ' voix'; }
    else txt.textContent = '🔑 Clé enregistrée';
}
async function sha256Hex(s) { const buf = new TextEncoder().encode(s); const hash = await crypto.subtle.digest('SHA-256', buf); return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join(''); }
async function hmac(key, data) {
    const k = typeof key === 'string' ? new TextEncoder().encode(key) : key;
    const cryptoKey = await crypto.subtle.importKey('raw', k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
    return new Uint8Array(sig);
}
async function hmacHex(key, data) { return Array.from(await hmac(key, data)).map(b => b.toString(16).padStart(2, '0')).join(''); }
async function getSignatureKey(secret, dateStamp, region, service) {
    let k = await hmac('AWS4' + secret, dateStamp);
    k = await hmac(k, region); k = await hmac(k, service); k = await hmac(k, 'aws4_request');
    return k;
}
async function loadPollyVoices() {
    const key = getPollyKey(), secret = getPollySecret(), region = getPollyRegion();
    if (!key || !secret || !region) { showToast('Renseignez toutes les clés AWS', 'warn'); return; }
    setStatus('Chargement voix Polly…');
    try {
        const endpoint = 'https://polly.' + region + '.amazonaws.com/v1/voices';
        const now = new Date();
        const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
        const dateStamp = amzDate.slice(0, 8);
        const credentialScope = dateStamp + '/' + region + '/polly/aws4_request';
        const canonicalRequest = 'GET\n/v1/voices\n\nhost:polly.' + region + '.amazonaws.com\nx-amz-date:' + amzDate + '\n\nhost;x-amz-date\n' + await sha256Hex('');
        const stringToSign = 'AWS4-HMAC-SHA256\n' + amzDate + '\n' + credentialScope + '\n' + await sha256Hex(canonicalRequest);
        const signingKey = await getSignatureKey(secret, dateStamp, region, 'polly');
        const signature = await hmacHex(signingKey, stringToSign);
        const auth = 'AWS4-HMAC-SHA256 Credential=' + key + '/' + credentialScope + ', SignedHeaders=host;x-amz-date, Signature=' + signature;
        const res = await fetch(endpoint, { headers: { 'Authorization': auth, 'X-Amz-Date': amzDate } });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        pollyVoices = data.Voices || [];
        pollyKeyValid = true; renderPollyVoices(); updatePollyStatus();
        document.getElementById('polly-voices-row')?.classList.remove('hidden');
        showToast(pollyVoices.length + ' voix Polly chargées', 'success');
    } catch (e) { showToast('Erreur Polly : ' + e.message, 'error'); }
    finally { setStatus(null); }
}
function renderPollyVoices() {
    const list = document.getElementById('polly-voices-list'); if (!list) return;
    const saved = getLS(STORAGE.POLLY_VOICE);
    if (saved && !pollySelectedVoiceId) pollySelectedVoiceId = saved;
    list.innerHTML = pollyVoices.map(v =>
        '<div class="tts-voice-item ' + (v.Id === pollySelectedVoiceId ? 'selected' : '') + '" data-voice-id="' + esc(v.Id) + '">' +
        '<div class="v-name">' + esc(v.Name || v.Id) + '</div><div class="v-info">' + esc(v.Gender || '') + ' · ' + esc(v.LanguageCode || '') + '</div></div>'
    ).join('');
    list.querySelectorAll('[data-voice-id]').forEach(el => {
        el.addEventListener('click', () => { pollySelectedVoiceId = el.dataset.voiceId; setLS(STORAGE.POLLY_VOICE, pollySelectedVoiceId); renderPollyVoices(); });
    });
}
async function generatePollyAudio(text, voiceId) {
    const key = getPollyKey(), secret = getPollySecret(), region = getPollyRegion();
    if (!key || !secret || !region || !voiceId) throw new Error('Clé Polly manquante');
    const endpoint = 'https://polly.' + region + '.amazonaws.com/v1/speech';
    const body = JSON.stringify({ Text: text, OutputFormat: 'mp3', VoiceId: voiceId });
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
    const dateStamp = amzDate.slice(0, 8);
    const credentialScope = dateStamp + '/' + region + '/polly/aws4_request';
    const payloadHash = await sha256Hex(body);
    const canonicalRequest = 'POST\n/v1/speech\n\nhost:polly.' + region + '.amazonaws.com\nx-amz-date:' + amzDate + '\n\nhost;x-amz-date\n' + payloadHash;
    const stringToSign = 'AWS4-HMAC-SHA256\n' + amzDate + '\n' + credentialScope + '\n' + await sha256Hex(canonicalRequest);
    const signingKey = await getSignatureKey(secret, dateStamp, region, 'polly');
    const signature = await hmacHex(signingKey, stringToSign);
    const auth = 'AWS4-HMAC-SHA256 Credential=' + key + '/' + credentialScope + ', SignedHeaders=host;x-amz-date, Signature=' + signature;
    const res = await fetch(endpoint, { method: 'POST', headers: { 'Authorization': auth, 'X-Amz-Date': amzDate, 'Content-Type': 'application/json' }, body });
    if (!res.ok) throw new Error('Polly ' + res.status);
    return await res.blob();
}

// ══════════════════════════════════════════════════════════════════
// TTS NAVIGATEUR
// ══════════════════════════════════════════════════════════════════
let availableVoices = [];
function loadBrowserVoices() {
    if (!('speechSynthesis' in window)) return;
    availableVoices = window.speechSynthesis.getVoices();
    const sel = document.getElementById('voice-pref-select'); if (!sel) return;
    const current = sel.value; sel.innerHTML = '<option value="">Voix par défaut</option>';
    availableVoices.forEach(v => { const opt = document.createElement('option'); opt.value = v.name; opt.textContent = v.name + ' (' + v.lang + ')'; sel.appendChild(opt); });
    sel.value = current;
}
function speakBrowser(text, rate, pitch, voiceName, lang) {
    return new Promise(resolve => {
        if (!('speechSynthesis' in window)) { resolve(); return; }
        const u = new SpeechSynthesisUtterance(text);
        u.rate = rate || 1; u.pitch = pitch || 1; u.volume = 1; u.lang = lang || 'fr-FR';
        if (voiceName) { const v = availableVoices.find(vo => vo.name === voiceName); if (v) u.voice = v; }
        u.onend = () => resolve(); u.onerror = () => resolve();
        window.speechSynthesis.speak(u);
    });
}
function stopSpeech() { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); }

// ══════════════════════════════════════════════════════════════════
// TTS UNIFIÉ (dispatch selon moteur)
// ══════════════════════════════════════════════════════════════════
async function generateAudioUnified(text) {
    switch (state.ttsEngine) {
        case 'elevenlabs':
            return await generateElevenLabsAudio(text, elevenlabsSelectedVoiceId || getLS(STORAGE.ELEVENLABS_VOICE), document.getElementById('elevenlabs-model-select')?.value || 'eleven_multilingual_v2', '0.5', '0.75');
        case 'gcloud':
            return await generateGCloudAudio(text, gcloudSelectedVoiceName);
        case 'azure':
            return await generateAzureAudio(text, azureSelectedVoiceName);
        case 'polly':
            return await generatePollyAudio(text, pollySelectedVoiceId);
        default:
            return null;
    }
}
async function speakUnified(text) {
    if (state.ttsEngine === 'browser') { await speakBrowser(text, state.voiceRate, state.voicePitch, state.voicePref, state.language); return; }
    try {
        const blob = await generateAudioUnified(text);
        if (!blob) { await speakBrowser(text, state.voiceRate, state.voicePitch, state.voicePref, state.language); return; }
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        await audio.play();
        await new Promise(resolve => { audio.onended = resolve; audio.onerror = resolve; });
        URL.revokeObjectURL(url);
    } catch (e) {
        log('TTS échec : ' + e.message);
        await speakBrowser(text, state.voiceRate, state.voicePitch, state.voicePref, state.language);
    }
}
