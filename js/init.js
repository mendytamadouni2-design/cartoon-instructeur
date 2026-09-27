// Cartoon Instructeur · Démarrage de l'appli
// (scripts classiques chargés dans l'ordre par index.html : ils partagent les mêmes variables globales)

// ══════════════════════════════════════════════════════════════════
// INITIALISATION UI COMPLÈTE
// ══════════════════════════════════════════════════════════════════
function showTTSPanel(engine) {
    ['elevenlabs', 'gcloud', 'azure', 'polly', 'browser'].forEach(e => {
        document.getElementById('tts-' + e + '-panel')?.classList.toggle('hidden', e !== engine);
    });
}
function showCloudConfigRow(provider) {
    const row = document.getElementById('cloud-config-row'), label = document.getElementById('cloud-config-label'), input = document.getElementById('cloud-config-input');
    if (!row || !input) return;
    if (provider === 'local') { row.classList.add('hidden'); return; }
    row.classList.remove('hidden');
    const examples = {
        firebase: '{ "projectId": "xxx" }',
        supabase: '{\n  "url": "https://xxx.supabase.co",\n  "key": "..."\n}',
        github: '{\n  "token": "ghp_...",\n  "gistId": "optionnel"\n}',
        custom: '{\n  "url": "https://mon-serveur.com/api/projects"\n}'
    };
    label.textContent = 'Configuration ' + provider;
    input.placeholder = examples[provider] || '';
}

(function init() {
    // Sections collapsibles
    document.querySelectorAll('[data-toggle]').forEach(h => h.addEventListener('click', () => document.getElementById(h.dataset.toggle).classList.toggle('open')));

    // API Agnes
    document.getElementById('api-save-btn')?.addEventListener('click', saveAgnesKey);
    document.getElementById('api-key-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveAgnesKey(); } });

    // Upload personnage
    const uz = document.getElementById('upload-zone'), fi = document.getElementById('file-input');
    if (uz && fi) { uz.addEventListener('click', () => fi.click()); fi.addEventListener('change', e => { handleFiles(e.target.files); fi.value = ''; }); }

    // Script & thème
    document.getElementById('script-input')?.addEventListener('input', updateScriptStats);
    document.getElementById('theme-input')?.addEventListener('input', e => { state.theme = e.target.value; });
    document.getElementById('edit-scenes-btn')?.addEventListener('click', () => {
        const ed = document.getElementById('scenes-editor'); ed.classList.toggle('hidden');
        if (!ed.classList.contains('hidden')) renderScenesEditor();
    });
    document.getElementById('generate-script-ai-btn')?.addEventListener('click', async () => {
        const theme = document.getElementById('theme-input').value.trim() || prompt('Thème de la vidéo :');
        if (!theme) return;
        state.theme = theme; document.getElementById('theme-input').value = theme;
        const script = await generateScriptAI(theme);
        if (script) { document.getElementById('script-input').value = script; updateScriptStats(); renderScenesEditor(); showToast('Script généré', 'success'); }
    });
    document.getElementById('translate-script-btn')?.addEventListener('click', translateScript);
    document.getElementById('improve-script-btn')?.addEventListener('click', improveScriptForSpeech);

    // Nouveaux modules : poses, storyboard, kit, notifications, journal, formats
    document.getElementById('pose-add-btn')?.addEventListener('click', () => document.getElementById('pose-input').click());
    document.getElementById('pose-input')?.addEventListener('change', async e => { const f = e.target.files[0]; e.target.value = ''; if (f) await addPoseFromFile(f, document.getElementById('pose-type-select').value); });
    document.getElementById('kit-export-btn')?.addEventListener('click', exportKit);
    document.getElementById('kit-import-btn')?.addEventListener('click', () => document.getElementById('kit-input').click());
    document.getElementById('kit-input')?.addEventListener('change', async e => { const f = e.target.files[0]; e.target.value = ''; if (f) await importKit(f); });
    document.getElementById('push-btn')?.addEventListener('click', enablePush);
    document.getElementById('journal-copy-btn')?.addEventListener('click', copyJournal);
    document.getElementById('journal-share-btn')?.addEventListener('click', exportJournal);
    document.getElementById('download-youtube-fmt-btn')?.addEventListener('click', () => downloadVariant('download-youtube-fmt-btn', 'fmt-youtube', { label: 'Version YouTube', format: 'landscape' }, 'youtube'));
    document.getElementById('download-vertical-btn')?.addEventListener('click', () => downloadVariant('download-vertical-btn', 'fmt-vertical', { label: 'Version 9:16', format: 'portrait' }, 'vertical'));
    document.getElementById('download-square-btn')?.addEventListener('click', () => downloadVariant('download-square-btn', 'fmt-square', { label: 'Version carrée', format: 'square' }, 'carre'));

    // Génération en arrière-plan
    state.genMode = getLS(STORAGE.GEN_MODE) || 'background';
    const gm = document.getElementById('gen-mode-select'); if (gm) gm.value = state.genMode;
    gm?.addEventListener('change', e => { state.genMode = e.target.value; setLS(STORAGE.GEN_MODE, e.target.value); updateGenModeHint(); });
    document.getElementById('bg-finish-btn')?.addEventListener('click', finishBackgroundJob);
    document.getElementById('bg-cancel-btn')?.addEventListener('click', () => cancelBackgroundJob(false));
    document.getElementById('bg-dismiss-btn')?.addEventListener('click', hideBgPanel);

    // Relais
    document.getElementById('proxy-save-btn')?.addEventListener('click', saveProxy);
    document.getElementById('proxy-url-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveProxy(); } });

    // Sauvegarde des clés
    document.getElementById('keys-export-btn')?.addEventListener('click', exportKeys);
    document.getElementById('keys-import-btn')?.addEventListener('click', () => document.getElementById('keys-import-input').click());
    document.getElementById('keys-import-input')?.addEventListener('change', e => { const f = e.target.files[0]; if (f) importKeys(f); e.target.value = ''; });

    // Claude
    document.getElementById('claude-save-btn')?.addEventListener('click', saveClaudeKey);
    document.getElementById('claude-key-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveClaudeKey(); } });
    document.getElementById('claude-model-select')?.addEventListener('change', e => { setLS(STORAGE.CLAUDE_MODEL, e.target.value); updateClaudePanel(); });

    // Série
    document.getElementById('series-input')?.addEventListener('input', updateSeriesStats);
    document.getElementById('launch-series-btn')?.addEventListener('click', launchSeries);

    // Sélecteurs généraux
    document.getElementById('language-select')?.addEventListener('change', e => { state.language = e.target.value; });
    document.getElementById('translate-engine-select')?.addEventListener('change', e => { state.translateEngine = e.target.value; });
    document.getElementById('audience-select')?.addEventListener('change', e => state.audience = e.target.value);
    document.getElementById('tone-select')?.addEventListener('change', e => state.tone = e.target.value);
    document.getElementById('motion-select')?.addEventListener('change', e => state.motion = e.target.value);
    document.getElementById('pedago-fx-select')?.addEventListener('change', e => state.pedagoFx = Array.from(e.target.selectedOptions).map(o => o.value));
    document.getElementById('lipsync-select')?.addEventListener('change', e => state.lipsync = e.target.value);
    document.getElementById('quiz-select')?.addEventListener('change', e => state.quizCount = parseInt(e.target.value, 10) || 0);
    document.getElementById('duration-select')?.addEventListener('change', e => state.durationFrames = parseInt(e.target.value, 10));
    document.getElementById('chain-select')?.addEventListener('change', e => state.chainScenes = e.target.value === 'on');
    document.getElementById('camera-select')?.addEventListener('change', e => state.camera = e.target.value);
    document.getElementById('transition-select')?.addEventListener('change', e => state.transition = e.target.value);
    document.getElementById('trim-select')?.addEventListener('change', e => state.trimMode = e.target.value);
    document.getElementById('zoom-select')?.addEventListener('change', e => state.zoomOn = e.target.value === 'on');
    document.getElementById('intro-select')?.addEventListener('change', e => state.introOn = e.target.value === 'on');
    document.getElementById('sections-select')?.addEventListener('change', e => state.sectionCards = e.target.value === 'on');
    document.getElementById('outro-select')?.addEventListener('change', e => state.outroOn = e.target.value === 'on');
    document.getElementById('quality-select')?.addEventListener('change', e => state.exportQuality = e.target.value);
    document.getElementById('sync-select')?.addEventListener('change', e => state.syncWords = e.target.value === 'on');
    document.getElementById('music-source-select')?.addEventListener('change', e => { state.musicSource = e.target.value; updateMusicStatus(); });
    document.getElementById('music-volume-select')?.addEventListener('change', e => state.musicVolume = parseFloat(e.target.value) || 0.35);
    document.getElementById('sfx-select')?.addEventListener('change', e => state.sfxOn = e.target.value === 'on');
    document.getElementById('music-upload-btn')?.addEventListener('click', () => document.getElementById('music-input').click());
    document.getElementById('music-input')?.addEventListener('change', async e => { const f = e.target.files[0]; e.target.value = ''; if (f) await setMusicFile(f, f.name); });
    document.getElementById('music-gen-btn')?.addEventListener('click', generateMusicWithEleven);
    document.getElementById('logo-btn')?.addEventListener('click', () => document.getElementById('logo-input').click());
    document.getElementById('logo-input')?.addEventListener('change', async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { await idbPut('logo', f); setLS(STORAGE.LOGO_SET, '1'); updateLogoStatus(); showToast('Logo ajouté ✓', 'success'); } catch (err) { showToast('Logo impossible à enregistrer', 'error'); } });
    document.getElementById('logo-remove-btn')?.addEventListener('click', async () => { try { await idbDel('logo'); } catch (e) {} localStorage.removeItem(STORAGE.LOGO_SET); updateLogoStatus(); });
    document.getElementById('video-format-select')?.addEventListener('change', e => state.videoFormat = e.target.value);
    document.getElementById('extra-exports-select')?.addEventListener('change', e => state.extraExports = Array.from(e.target.selectedOptions).map(o => o.value));
    document.getElementById('subtitles-style-select')?.addEventListener('change', e => { state.subtitlesStyle = e.target.value; state.subtitlesMode = e.target.value === 'off' ? 'off' : 'on'; });

    // Avatar
    document.getElementById('avatar-provider-select')?.addEventListener('change', e => {
        state.avatarProvider = e.target.value;
        document.getElementById('avatar-key-row')?.classList.toggle('hidden', e.target.value === 'off');
        const txt = document.getElementById('avatar-status-text');
        if (txt) txt.textContent = e.target.value === 'off' ? '🧑‍🎤 Avatar désactivé' : '🧑‍🎤 ' + e.target.value + ' sélectionné';
    });
    document.getElementById('avatar-save-btn')?.addEventListener('click', () => {
        const k = document.getElementById('avatar-key-input').value.trim();
        if (k) { setLS(STORAGE.AVATAR_KEY, k); showToast('Clé avatar enregistrée', 'success'); }
    });
    document.getElementById('avatar-test-btn')?.addEventListener('click', testAvatarProvider);

    // TTS
    document.getElementById('voice-source-select')?.addEventListener('change', e => state.voiceSource = e.target.value);
    document.getElementById('tts-engine-select')?.addEventListener('change', e => { state.ttsEngine = e.target.value; showTTSPanel(e.target.value); });
    document.getElementById('elevenlabs-save-btn')?.addEventListener('click', saveElevenLabsKey);
    document.getElementById('elevenlabs-load-voices-btn')?.addEventListener('click', loadElevenLabsVoices);
    document.getElementById('gcloud-save-btn')?.addEventListener('click', saveGCloudKey);
    document.getElementById('gcloud-load-voices-btn')?.addEventListener('click', loadGCloudVoices);
    document.getElementById('azure-save-btn')?.addEventListener('click', saveAzureKey);
    document.getElementById('azure-load-voices-btn')?.addEventListener('click', loadAzureVoices);
    document.getElementById('polly-save-btn')?.addEventListener('click', savePollyKey);
    document.getElementById('polly-load-voices-btn')?.addEventListener('click', loadPollyVoices);
    document.getElementById('voice-test-btn')?.addEventListener('click', () => speakUnified('Bonjour, je suis votre personnage pédagogique.'));
    document.getElementById('voice-rate-select')?.addEventListener('change', e => state.voiceRate = parseFloat(e.target.value));
    document.getElementById('voice-pitch-select')?.addEventListener('change', e => state.voicePitch = parseFloat(e.target.value));
    document.getElementById('voice-pref-select')?.addEventListener('change', e => state.voicePref = e.target.value);

    // Sous-titres
    document.getElementById('open-subtitle-editor-btn')?.addEventListener('click', openSubtitleEditor);
    document.getElementById('subtitle-apply-btn')?.addEventListener('click', applySubtitleChanges);
    document.getElementById('subtitle-reset-btn')?.addEventListener('click', resetSubtitleFromScript);
    document.getElementById('subtitle-add-btn')?.addEventListener('click', addSubtitleSegment);
    document.getElementById('subtitle-clear-btn')?.addEventListener('click', clearAllSubtitles);

    // Whisper
    document.getElementById('whisper-upload-btn')?.addEventListener('click', () => document.getElementById('whisper-audio-input').click());
    document.getElementById('whisper-audio-input')?.addEventListener('change', async e => {
        const file = e.target.files[0]; if (!file) return;
        const key = document.getElementById('whisper-api-key').value.trim() || getOpenAIKey();
        if (!key) { showToast('Clé OpenAI requise', 'error'); return; }
        setLS(STORAGE.OPENAI_KEY, key);
        setStatus('Transcription Whisper…');
        try {
            const fd = new FormData(); fd.append('file', file); fd.append('model', 'whisper-1');
            const res = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { 'Authorization': 'Bearer ' + key }, body: fd });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error?.message || ('HTTP ' + res.status));
            if (data.text) { document.getElementById('script-input').value = data.text; updateScriptStats(); renderScenesEditor(); showToast('Transcription appliquée', 'success'); }
        } catch (err) { showToast('Transcription impossible : ' + err.message, 'error', 5000); }
        finally { setStatus(null); }
        e.target.value = '';
    });

    // YouTube
    document.getElementById('youtube-save-btn')?.addEventListener('click', saveYouTubeConfig);
    document.getElementById('youtube-connect-btn')?.addEventListener('click', connectYouTube);
    document.getElementById('youtube-upload-btn')?.addEventListener('click', () => uploadToYouTube());
    checkYouTubeTokenFromHash();

    // Firebase
    document.getElementById('firebase-save-btn')?.addEventListener('click', saveFirebaseKey);
    document.getElementById('firebase-sync-btn')?.addEventListener('click', syncFirebaseProjects);

    // Cloud
    document.getElementById('cloud-provider-select')?.addEventListener('change', e => { state.cloudProvider = e.target.value; showCloudConfigRow(e.target.value); });
    document.getElementById('cloud-save-btn')?.addEventListener('click', saveCloudConfig);
    document.getElementById('cloud-sync-btn')?.addEventListener('click', syncToCloud);
    document.getElementById('cloud-load-btn')?.addEventListener('click', loadFromCloud);

    // Analytics
    document.getElementById('analytics-refresh-btn')?.addEventListener('click', renderAnalytics);
    document.getElementById('analytics-reset-btn')?.addEventListener('click', () => { if (confirm('Réinitialiser les stats ?')) { setJSON(STORAGE.ANALYTICS, null); renderAnalytics(); } });

    // Historique
    document.getElementById('clear-history-btn')?.addEventListener('click', () => { if (confirm('Effacer l\'historique ?')) { setJSON(STORAGE.HISTORY, []); renderHistory(); } });

    // Actions principales
    document.getElementById('generate-btn')?.addEventListener('click', startGeneration);
    document.getElementById('stop-btn')?.addEventListener('click', stopGeneration);
    document.getElementById('assemble-btn')?.addEventListener('click', () => { unlockAudio(); runAssembly(); });
    document.getElementById('preview-btn')?.addEventListener('click', runPreview);
    document.getElementById('tiktok-connect-btn')?.addEventListener('click', connectTikTok);
    document.getElementById('tiktok-disconnect-btn')?.addEventListener('click', () => { localStorage.removeItem(STORAGE.TT_TOKEN); updateTikTokStatus(); });
    document.getElementById('ttstats-btn')?.addEventListener('click', loadTikTokStats);
    document.getElementById('tt-shot-btn')?.addEventListener('click', () => document.getElementById('tt-shot-input').click());
    document.getElementById('tt-shot-input')?.addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) readTikTokScreenshot(f); });
    document.getElementById('platform-advice-btn')?.addEventListener('click', platformAdvice);
    document.getElementById('hooks-btn')?.addEventListener('click', proposeHooks);
    document.getElementById('end-question-btn')?.addEventListener('click', addEndQuestion);
    const eqt = document.getElementById('end-question-toggle');
    if (eqt) { eqt.checked = getLS(STORAGE.END_QUESTION) !== '0'; eqt.addEventListener('change', () => setLS(STORAGE.END_QUESTION, eqt.checked ? '1' : '0')); }
    const tmt = document.getElementById('test-mode-toggle');
    state.testMode = getLS(STORAGE.TEST_MODE) === '1';
    if (tmt) { tmt.checked = state.testMode; tmt.addEventListener('change', () => { state.testMode = tmt.checked; setLS(STORAGE.TEST_MODE, tmt.checked ? '1' : '0'); updateScriptStats(); renderScenesEditor(); showToast(tmt.checked ? '🧪 Mode test : 3 scènes seulement' : 'Mode test désactivé : toutes les scènes', 'success'); }); }
    const szt = document.getElementById('safe-zones-toggle');
    state.safeZones = getLS(STORAGE.SAFE_ZONES) !== '0';
    if (szt) { szt.checked = state.safeZones; szt.addEventListener('change', () => { state.safeZones = szt.checked; setLS(STORAGE.SAFE_ZONES, szt.checked ? '1' : '0'); state.exportCache = {}; resetExportButtons(); renderParts(); }); }
    document.getElementById('costs-refresh-btn')?.addEventListener('click', renderCosts);
    document.getElementById('costs-reset-btn')?.addEventListener('click', () => { if (confirm('Remettre le suivi des dépenses à zéro ?')) { localStorage.removeItem(STORAGE.COSTS); renderCosts(); } });
    document.querySelector('[data-toggle="section-costs"]')?.addEventListener('click', renderCosts);
    document.getElementById('lang-yt-btn')?.addEventListener('click', addTranslatedCaptions);
    document.getElementById('tt-caption-btn')?.addEventListener('click', writeTikTokCaption);
    document.getElementById('publish-btn')?.addEventListener('click', publishNowOrLater);
    ['pub-at', 'pub-yt', 'pub-ys'].forEach(id => document.getElementById(id)?.addEventListener('change', updatePublishUI));
    document.getElementById('pub-ig')?.addEventListener('change', () => { updatePublishUI(); if (document.getElementById('pub-ig').checked && !document.getElementById('tt-caption').value.trim() && getClaudeKey()) writeTikTokCaption(); });
    document.getElementById('ig-connect-btn')?.addEventListener('click', connectInstagram);
    document.getElementById('ig-disconnect-btn')?.addEventListener('click', () => { localStorage.removeItem(STORAGE.IG_TOKEN); updateInstagramStatus(); });
    document.getElementById('ap-prepare-btn')?.addEventListener('click', prepareWeek);
    document.getElementById('ap-launch-btn')?.addEventListener('click', launchWeek);
    document.getElementById('ap-finish-btn')?.addEventListener('click', finishWeek);
    ['ap-count', 'ap-hour', 'ap-format', 'ap-yt', 'ap-ys', 'ap-tt', 'ap-ig'].forEach(id => document.getElementById(id)?.addEventListener('change', saveAutopilotSettings));
    document.getElementById('comments-btn')?.addEventListener('click', loadComments);
    document.getElementById('pdf-sheet-btn')?.addEventListener('click', downloadPedagoSheet);
    document.getElementById('pub-tt')?.addEventListener('change', () => { updatePublishUI(); if (document.getElementById('pub-tt').checked) { loadTikTokPrivacy(); if (!document.getElementById('tt-caption').value.trim() && getClaudeKey()) writeTikTokCaption(); } });
    document.getElementById('simple-mode-btn')?.addEventListener('click', () => { setLS(STORAGE.SIMPLE_MODE, getLS(STORAGE.SIMPLE_MODE) === '1' ? '0' : '1'); applySimpleMode(); });
    document.getElementById('factcheck-btn')?.addEventListener('click', checkFacts);
    document.getElementById('backup-final-btn')?.addEventListener('click', backupFinal);
    document.getElementById('library-refresh-btn')?.addEventListener('click', renderLibrary);
    document.getElementById('ytstats-btn')?.addEventListener('click', loadYouTubeStats);
    document.getElementById('lang-version-btn')?.addEventListener('click', downloadLanguageVersion);
    document.getElementById('lang-version-select')?.addEventListener('change', () => { const b = document.getElementById('lang-version-btn'); if (b) b.textContent = state.exportCache['lang:' + document.getElementById('lang-version-select').value] ? '💾 Enregistrer la version traduite' : '🌍 Créer la version traduite'; });
    state.bankUse = getLS(STORAGE.BANK_USE) !== '0';
    state.backupOn = getLS(STORAGE.BACKUP_ON) !== '0';
    const bankToggle = document.getElementById('bank-use-toggle'), backupToggle = document.getElementById('backup-toggle');
    if (bankToggle) { bankToggle.checked = state.bankUse; bankToggle.addEventListener('change', () => { state.bankUse = bankToggle.checked; setLS(STORAGE.BANK_USE, state.bankUse ? '1' : '0'); state.exportCache = {}; }); }
    if (backupToggle) { backupToggle.checked = state.backupOn; backupToggle.addEventListener('change', () => { state.backupOn = backupToggle.checked; setLS(STORAGE.BACKUP_ON, state.backupOn ? '1' : '0'); }); }
    document.getElementById('download-final-btn')?.addEventListener('click', downloadFinal);
    document.getElementById('download-srt-btn')?.addEventListener('click', downloadSRT);
    document.getElementById('download-scenes-btn')?.addEventListener('click', downloadScenes);
    document.getElementById('download-audio-btn')?.addEventListener('click', downloadAudio);
    document.getElementById('download-zip-btn')?.addEventListener('click', downloadAsZip);
    document.getElementById('download-shorts-btn')?.addEventListener('click', downloadShorts);
    document.getElementById('download-thumbnail-btn')?.addEventListener('click', downloadThumbnail);
    document.getElementById('download-seo-btn')?.addEventListener('click', downloadSEO);
    document.getElementById('download-chapters-btn')?.addEventListener('click', downloadChapters);
    document.getElementById('download-quiz-btn')?.addEventListener('click', downloadQuiz);
    document.getElementById('wake-toggle-btn')?.addEventListener('click', toggleWakeLock);

    // PWA
    document.getElementById('install-btn')?.addEventListener('click', installPWA);
    document.getElementById('install-dismiss')?.addEventListener('click', () => document.getElementById('install-banner')?.classList.remove('visible'));

    // Voix navigateur
    if ('speechSynthesis' in window) { loadBrowserVoices(); window.speechSynthesis.onvoiceschanged = loadBrowserVoices; }

    // Wake lock préférence
    try { wakeLockEnabled = getLS(STORAGE.WAKE_LOCK) === '1'; } catch (e) {}
    if (wakeLockEnabled) activateWakeLock().then(updateWakeStatus);

    // Rendus initiaux
    updateApiPanel(); updateClaudePanel(); updateTimingDisplay(); updateWakeStatus(); renderQuota();
    renderScriptPresets(); renderStyles(); renderImages(); renderQueue(); renderHistory();
    updateScriptStats(); updateSeriesStats(); showTTSPanel(state.ttsEngine);
    showCloudConfigRow(state.cloudProvider); updateCloudStatus();
    refreshKeyFields();
    testProxy().then(() => { renderLibrary(); renderSeriesJobs(); renderSchedule(); updateTikTokStatus(); updateInstagramStatus(); checkTikTokCallback(); checkInstagramCallback(); });
    try { localStorage.removeItem(STORAGE.SIMPLE_MODE); } catch (e) {}
    loadBank(); applySimpleMode(); updateInsightsLine(); renderCosts();
    loadMainImages();
    updateMusicStatus(); updateLogoStatus();
    applySettings(getJSON(STORAGE.SETTINGS));
    applyQualityDefaults();
    const bindToggle = (id, key, prop, def, after) => {
        const el = document.getElementById(id); if (!el) return;
        state[prop] = getLS(STORAGE[key]) ? getLS(STORAGE[key]) === '1' : def;
        el.checked = state[prop];
        el.addEventListener('change', () => { state[prop] = el.checked; setLS(STORAGE[key], el.checked ? '1' : '0'); state.storyboardApproved = false; if (after) after(); });
    };
    const richHint = () => { const h = document.getElementById('rich-hint'); if (h) h.textContent = richActive() ? '✅ Voix ElevenLabs prête : les scènes auront un plan illustré commenté.' : 'Demande une voix ElevenLabs (Réglages → Voix et sous-titres).'; updateVoiceIndicator(); };
    bindToggle('rich-toggle', 'RICH', 'richMode', true, richHint);
    bindToggle('qa-toggle', 'QA_ON', 'qaOn', true);
    bindToggle('oneshot-toggle', 'ONE_SHOT', 'oneShot', false, () => { if (state.oneShot) showToast('Plan-séquence : génération sur le téléphone, garde l\'appli ouverte', 'warn', 5000); });
    richHint();
    document.getElementById('voice-source-select')?.addEventListener('change', () => setTimeout(updateVoiceIndicator));
    document.addEventListener('click', e => { if (e.target.closest && e.target.closest('.tts-voice-item')) setTimeout(richHint, 50); });
    loadPoses(); updatePushStatus(); updateEstimate();
    // ouverture instantanée, même avec un réseau faible (et notifications)
    if (navigator.serviceWorker && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
    updateElevenLabsStatus(); updateGCloudStatus(); updateAzureStatus(); updatePollyStatus();
    renderAnalytics();
    initSubtitleSegmentsFromScript();
    updateYouTubeStatus();
    updateGenModeHint();
    const bgJob = getJSON(STORAGE.BG_JOB);
    if (bgJob && !bgJob.finished) { bgUI({ title: '☁️ Génération en arrière-plan', text: 'Vérification de l\'avancement…', pct: 3, running: true }); pollBackgroundJob(); }
    else restoreProject();

    navRender();
    log('🎓 Cartoon Instructeur prêt.');
})();
