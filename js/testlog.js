// ══════════════════════════════════════════════════════════════════
// ENREGISTREUR DE TEST (9.1) — pendant un essai sur l'iPhone, l'appli note tout ce qui se passe (ce que fait
// l'utilisateur, le journal, les erreurs, les appels aux services, la vitesse des montages, l'appareil) et rend un seul
// rapport à télécharger puis à envoyer dans la conversation. Jamais de clé API ni de texte saisi : les clés sont
// masquées (sanitizeForJournal), les champs de texte ne sont notés que par leur longueur, les adresses sans paramètres.
// L'enregistrement survit à un rechargement de l'appli (un plantage de Safari se voit dans le rapport).
// ══════════════════════════════════════════════════════════════════
const TESTLOG_KEY = 'cartoon_testlog';
const TESTLOG_MAX = 2000;   // évènements gardés (les 500 premiers + les plus récents) : ≈ 0,5 Mo au plus, place gardée pour les projets
const TEST_STEPS = [
    { id: 'version', t: 'Version', how: 'Ouvre l\'appli depuis l\'écran d\'accueil. Ici même (Réglages → Aide et journal), la version écrite au-dessus de cette fiche doit être la ' + APP_VERSION.num + '.' },
    { id: 'police', t: 'Police feutre', how: 'Projet au tableau blanc : dans le brouillon animé ou la vidéo, les titres et mots-clés sont écrits au feutre (lettres de marqueur), pas avec une police d\'ordinateur.' },
    { id: 'voix', t: 'Voix calée sur les lèvres', how: 'Vidéo avec la voix ElevenLabs calée : la voix suit-elle la bouche du personnage ? Une seule prise ElevenLabs par scène.' },
    { id: 'volume', t: 'Volume', how: 'Écoute la vidéo finale : les voix ont le même niveau d\'une scène à l\'autre, rien ne sature.' },
    { id: 'illustration', t: 'Illustrations au feutre', how: 'Active d\'abord Réglages → Style et montage → « Vraies illustrations » (peut coûter ≈ 0,003 $ par image). Une scène avec un objet particulier (ex. une guillotine) : le plan illustré montre un vrai dessin tracé trait par trait.' },
    { id: 'photo', t: 'Depuis une image', how: 'Storyboard → « 📷 Depuis une image » : choisis une photo de ta pellicule. Le dessin au feutre apparaît-il ?' },
    { id: 'fondvert', t: 'Fond vert', how: 'Mode fond vert : bords du personnage propres, pas de liseré vert, cheveux et vêtements verts gardés.' },
    { id: 'vivant', t: 'Personnage vivant', how: 'Personnage stable : la tête penche et hoche quand il parle, le corps se plie doucement, la vidéo reste fluide.' },
    { id: 'arriereplan', t: 'Arrière-plan', how: 'Pendant un montage, quitte l\'appli 10 secondes puis reviens : le montage reprend et le personnage est toujours là.' },
    { id: 'avion', t: 'Mode avion', how: 'Active le mode avion et rouvre l\'appli : elle s\'ouvre, la police feutre est toujours là. (Désactive-le ensuite.)' },
    { id: 'video', t: 'Vidéo finale', how: 'La vidéo s\'enregistre et se lit dans Photos. Note sa durée dans la remarque.' },
    { id: 'prix', t: 'Prix Agnes Image', how: 'Après le test, regarde ton compte Agnes : les images (illustrations, poses) ont-elles été facturées ? Note le montant dans la remarque.' }
];
let testRec = null, testSaveTimer = 0, testFetchOrig = null, testMontage = null, testFetchGen = 0;

function testlogLoad() {
    try { const v = JSON.parse(localStorage.getItem(TESTLOG_KEY) || 'null'); return v && Array.isArray(v.events) ? v : null; } catch (e) { return null; }
}
function testlogSave(now) {
    if (!testRec) return;
    clearTimeout(testSaveTimer);
    const write = () => { testRec.lastSaved = new Date().toISOString(); try { localStorage.setItem(TESTLOG_KEY, JSON.stringify(testRec)); } catch (e) { if (testRec.events.length > 1000) { testRec.events.splice(500, 500); write(); } } };
    if (now) write(); else testSaveTimer = setTimeout(write, 1500);
}
// Un évènement : instant (depuis le début), type, message nettoyé (clés masquées, 400 caractères au plus)
function testlogNote(kind, msg) {
    if (!testRec || !testRec.active) return;
    const ev = testRec.events;
    ev.push([Math.round(performance.now() - testRec.t0 + testRec.offset), kind, sanitizeForJournal(String(msg)).slice(0, 250)]);
    if (ev.length > TESTLOG_MAX) ev.splice(500, ev.length - TESTLOG_MAX);
    testlogSave();
}

// ── Ce que l'appareil sait faire (noté au début et à chaque réouverture) ──
async function testlogDevice() {
    const d = { appli: APP_VERSION.num + ' (' + APP_VERSION.date + ')', fichiers: (document.querySelector('script[src*="core.js"]')?.getAttribute('src') || '').split('?v=')[1] || '?',
        navigateur: navigator.userAgent, ecran: screen.width + '×' + screen.height + ' ×' + (window.devicePixelRatio || 1), fenetre: innerWidth + '×' + innerHeight,
        ecranAccueil: !!(navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches)), langue: navigator.language,
        coeurs: navigator.hardwareConcurrency || '?', memoire: navigator.deviceMemory || '?', enLigne: navigator.onLine };
    try { const gc = document.createElement('canvas'), gl = gc.getContext('webgl');
        if (gl) {
            const dbg = gl.getExtension('WEBGL_debug_renderer_info'), hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
            d.webgl = (dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) + ', texture max ' + gl.getParameter(gl.MAX_TEXTURE_SIZE) + ', précision haute ' + (hp && hp.precision > 0 ? 'oui' : 'non');
            gl.getExtension('WEBGL_lose_context')?.loseContext();
        } else d.webgl = 'absent';
        gc.width = gc.height = 0;
    } catch (e) { d.webgl = 'erreur : ' + e.message; }
    d.webcodecs = typeof webcodecsAvailable === 'function' ? webcodecsAvailable() : typeof VideoEncoder !== 'undefined';
    try { if (typeof VideoEncoder !== 'undefined') d.h264 = !!(await VideoEncoder.isConfigSupported({ codec: 'avc1.640028', width: 1080, height: 1920, bitrate: 10e6, framerate: 30 })).supported; } catch (e) { d.h264 = 'erreur'; }
    try { if (typeof AudioEncoder !== 'undefined') d.aac = !!(await AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 })).supported; } catch (e) { d.aac = 'erreur'; }
    d.enregistreur = typeof MediaRecorder !== 'undefined' ? ['video/mp4', 'video/webm'].filter(t => MediaRecorder.isTypeSupported(t)).join(', ') || 'aucun format' : 'absent';
    try { d.policeFeutre = document.fonts.check('40px "Permanent Marker"'); } catch (e) {}
    try { const est = await navigator.storage?.estimate?.(); if (est) d.stockage = Math.round(est.usage / 1e6) + ' Mo utilisés sur ' + Math.round(est.quota / 1e6); } catch (e) {}
    try { d.cache = (await caches.keys()).join(', '); d.serviceWorker = !!navigator.serviceWorker?.controller; } catch (e) {}
    d.cles = ['AGNES_KEY', 'CLAUDE_KEY', 'ELEVENLABS_KEY'].filter(k => getLS(STORAGE[k])).map(k => k.replace('_KEY', '').toLowerCase()).join(', ') || 'aucune';
    try { d.reglages = collectSettings(); } catch (e) {}
    d.personnage = typeof castPoses === 'function' ? castPoses().length + ' poses validées, ' + (state.puppetDeform === false ? 'rigide' : 'vivant') : '?';
    d.illustrations = state.traceDrawings === false ? 'coupées' : 'actives';
    return d;
}

// ── Démarrer / reprendre / arrêter ──
async function testlogStart() {
    testRec = { v: 1, active: true, started: new Date().toISOString(), ended: null, t0: performance.now(), offset: 0, steps: {}, events: [], devices: [], montages: [] };
    testlogHook();
    testlogNote('début', 'enregistrement du test démarré');
    testRec.devices.push({ at: 0, info: await testlogDevice() });
    testlogSave(true); renderTestlog();
    showToast('🧪 Enregistrement du test démarré : fais ta vidéo, l\'appli note tout', 'success', 4000);
}
// À l'ouverture de l'appli : un test en cours reprend (rechargement, plantage de Safari, appli rouverte)
async function testlogResume() {
    const saved = testlogLoad();
    if (!saved || !saved.active) { testRec = saved; renderTestlog(); return; }
    testRec = saved;
    const last = saved.events.length ? saved.events[saved.events.length - 1][0] : 0;
    testRec.t0 = performance.now(); testRec.offset = last + 1;
    testlogHook();
    testlogNote('réouverture', 'appli rouverte pendant le test (rechargement ou plantage de Safari) — dernière note il y a ' + Math.round((Date.now() - new Date(saved.lastSaved || saved.started).getTime()) / 1000) + ' s');
    testRec.devices.push({ at: testRec.offset, info: await testlogDevice() });
    if (testRec.devices.length > 6) testRec.devices.splice(1, testRec.devices.length - 6);   // le 1er et les 5 derniers
    testlogSave(true); renderTestlog();
}
function testlogStop() {
    if (!testRec || !testRec.active) return;
    testlogNote('fin', 'enregistrement terminé');
    testRec.active = false; testRec.ended = new Date().toISOString();
    testlogUnhook(); testlogSave(true); renderTestlog();
}
function testlogClear() {
    if (testRec?.active && !confirm('Effacer l\'enregistrement du test en cours ?')) return;
    testlogUnhook(); testRec = null;
    try { localStorage.removeItem(TESTLOG_KEY); } catch (e) {}
    renderTestlog();
}

// ── Ce qui est écouté pendant le test ──
function testlogClick(e) {
    const el = e.target.closest && e.target.closest('button, a, [role="button"], .list-item, summary');
    if (!el || el.closest('#section-testlog')) return;
    // éléments de liste (titres de vidéos et de projets = texte de l'utilisateur) : on note leur destination, jamais leur texte
    const dyn = el.matches('.list-item, [data-project]');
    const label = dyn ? (el.dataset.open || el.dataset.push || (el.dataset.project ? 'projet' : '') || 'élément de liste') : (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 70);
    testlogNote('appui', (el.id ? '#' + el.id + ' ' : '') + '« ' + label + ' »');
}
function testlogChange(e) {
    const el = e.target;
    if (!el || !el.tagName || el.closest('#section-testlog')) return;
    const id = el.id || el.name || el.dataset?.sbField || el.tagName.toLowerCase();
    let what;
    if (el.tagName === 'SELECT') what = '= ' + el.value;
    else if (el.type === 'checkbox' || el.type === 'radio') what = el.checked ? 'coché' : 'décoché';
    else if (el.type === 'file') what = (el.files?.length || 0) + ' fichier(s)' + (el.files?.[0] ? ' : ' + (el.files[0].type || '?') + ', ' + Math.round(el.files[0].size / 1024) + ' Ko' : '');
    else what = 'texte modifié (' + String(el.value || '').length + ' caractères)';   // jamais le contenu (clés, scripts)
    testlogNote('réglage', id + ' ' + what);
}
function testlogVisibility() { testlogNote('écran', document.hidden ? 'appli passée en arrière-plan' : 'appli revenue au premier plan'); if (document.hidden) testlogSave(true); }
function testlogOnline() { testlogNote('réseau', navigator.onLine ? 'connexion revenue' : 'plus de connexion (mode avion ?)'); }
function testlogPageHide() { testlogNote('écran', 'page fermée ou rechargée'); testlogSave(true); }
function testlogHook() {
    testlogUnhook();
    document.addEventListener('click', testlogClick, true);
    document.addEventListener('change', testlogChange, true);
    document.addEventListener('visibilitychange', testlogVisibility);
    window.addEventListener('online', testlogOnline); window.addEventListener('offline', testlogOnline);
    window.addEventListener('pagehide', testlogPageHide);
    // appels aux services : adresse sans paramètres, statut, durée, taille (jamais les en-têtes ni le contenu)
    testFetchOrig = window.fetch;
    const orig = testFetchOrig, gen = ++testFetchGen;
    window.fetch = async function (input, init) {
        if (gen !== testFetchGen || !testRec || !testRec.active) return orig.apply(this, arguments);   // enveloppe périmée : transparente
        const url = String(input && input.url ? input.url : input), t0 = performance.now(), method = (init && init.method) || (input && input.method) || 'GET';
        let where = url;
        // adresse sans paramètres ; identifiants longs (suivi d'un projet, médias) masqués : ils donnent accès au projet
        try { const u = new URL(url, location.href); where = u.protocol === 'data:' || u.protocol === 'blob:' ? u.protocol : u.host + u.pathname.replace(/\/[\w-]{24,}/g, '/[id]'); } catch (e) {}
        try {
            const res = await orig.apply(this, arguments);
            if (!/^(data:|blob:)/.test(where) && !where.startsWith(location.host)) testlogNote('service', method + ' ' + where + ' → ' + res.status + ' en ' + Math.round(performance.now() - t0) + ' ms' + (res.headers?.get?.('content-length') ? ', ' + Math.round(+res.headers.get('content-length') / 1024) + ' Ko' : ''));
            return res;
        } catch (err) { testlogNote('service', method + ' ' + where + ' → ÉCHEC (' + err.message + ') après ' + Math.round(performance.now() - t0) + ' ms'); throw err; }
    };
    window.fetch.isTestlog = true;
}
function testlogUnhook() {
    document.removeEventListener('click', testlogClick, true);
    document.removeEventListener('change', testlogChange, true);
    document.removeEventListener('visibilitychange', testlogVisibility);
    window.removeEventListener('online', testlogOnline); window.removeEventListener('offline', testlogOnline);
    window.removeEventListener('pagehide', testlogPageHide);
    if (testFetchOrig && window.fetch && window.fetch.isTestlog) window.fetch = testFetchOrig;
    testFetchOrig = null; testFetchGen++;
}

// ── Montages : mode, taille, vitesse image par image (appelé par montage.js) ──
function testlogMontageStart(info) {
    if (!testRec || !testRec.active) return null;
    testMontage = { debut: Math.round(performance.now() - testRec.t0 + testRec.offset), libelle: info.label || 'Montage', n: 0, sum: 0, max: 0, lentes: 0, t0: performance.now() };
    testlogNote('montage', 'début : ' + testMontage.libelle);
    return testMontage;
}
function testlogMontageInfo(text) { if (testMontage) testMontage.details = text; testlogNote('montage', text); }
function testlogFrame(ms) {
    const m = testMontage;
    if (!m) return;
    m.n++; m.sum += ms; if (ms > m.max) m.max = ms; if (ms > 50) m.lentes++;
}
function testlogMontageEnd(m, result, err) {
    if (!m || !testRec) return;
    const r = { libelle: m.libelle, details: m.details || '', duree: Math.round((performance.now() - m.t0) / 100) / 10 + ' s de calcul', images: m.n,
        moyenne: m.n ? Math.round(m.sum / m.n * 10) / 10 : 0, pire: Math.round(m.max), lentes: m.lentes,
        resultat: err ? 'ÉCHEC : ' + err.message : result ? (result.offline ? 'image par image' : 'temps réel') + ', ' + Math.round((result.blob?.size || 0) / 1e5) / 10 + ' Mo, ' + (result.ext || '') : '?' };
    testRec.montages.push(r);
    testlogNote('montage', 'fin : ' + r.resultat + ' — ' + r.images + ' images, ' + r.moyenne + ' ms en moyenne, pire ' + r.pire + ' ms, ' + r.lentes + ' images lentes (> 50 ms)');
    if (testMontage === m) testMontage = null;
}

// ── Fiche du test ──
function testlogStep(id, res) {
    if (!testRec) return;
    const st = testRec.steps[id] = testRec.steps[id] || {};
    st.res = res; st.at = new Date().toISOString();
    const step = TEST_STEPS.find(s => s.id === id);
    testlogNote('fiche', (step ? step.t : id) + ' : ' + { ok: '✅ ça marche', ko: '❌ problème', skip: '⏭️ pas testé' }[res]);
    testlogSave(true); renderTestlog();
}
function testlogStepNote(id, text) {
    if (!testRec) return;
    (testRec.steps[id] = testRec.steps[id] || {}).note = sanitizeForJournal(String(text)).slice(0, 600);
    testlogSave();
}

// ── Le rapport (texte simple, lisible et analysable) ──
function testReportText() {
    const R = testRec;
    if (!R) return '';
    const hms = ms => { const s = Math.max(0, ms) / 1000; return String(Math.floor(s / 3600)).padStart(2, '0') + ':' + String(Math.floor(s / 60) % 60).padStart(2, '0') + ':' + (s % 60).toFixed(1).padStart(4, '0'); };
    const out = ['# Rapport de test — Cartoon Instructeur ' + APP_VERSION.num, '',
        'Début : ' + new Date(R.started).toLocaleString('fr-FR') + (R.ended ? ' · fin : ' + new Date(R.ended).toLocaleString('fr-FR') : ' · (encore en cours)'), ''];
    out.push('## Fiche du test', '');
    TEST_STEPS.forEach(s => { const r = R.steps[s.id] || {}; out.push('- ' + ({ ok: '✅', ko: '❌', skip: '⏭️' }[r.res] || '⬜') + ' **' + s.t + '**' + (r.note ? ' — ' + r.note : '')); });
    const errs = R.events.filter(e => e[1] === 'ERREUR' || /ÉCHEC|impossible|indisponible|trop lent|perdu|plantage/i.test(e[2]));
    out.push('', '## Résumé automatique', '',
        '- Montages : ' + R.montages.length + ' · réouvertures de l\'appli pendant le test : ' + R.events.filter(e => e[1] === 'réouverture').length + ' · passages en arrière-plan : ' + R.events.filter(e => /arrière-plan$/.test(e[2])).length,
        '- Appels aux services : ' + R.events.filter(e => e[1] === 'service').length + ' (dont échecs : ' + R.events.filter(e => e[1] === 'service' && /ÉCHEC| → [45]\d\d/.test(e[2])).length + ')',
        '- Erreurs et alertes : ' + errs.length);
    R.montages.forEach((m, k) => out.push('- Montage ' + (k + 1) + ' « ' + m.libelle + ' » : ' + m.resultat + ' · ' + m.details + ' · ' + m.images + ' images, ' + m.moyenne + ' ms en moyenne, pire ' + m.pire + ' ms, ' + m.lentes + ' lentes · ' + m.duree));
    if (errs.length) { out.push('', '### Erreurs et alertes', ''); errs.slice(0, 80).forEach(e => out.push('- ' + hms(e[0]) + ' ' + e[2])); }
    out.push('', '## Appareil', '');
    R.devices.forEach(d => { out.push('À ' + hms(d.at) + ' :'); Object.entries(d.info).forEach(([k, v]) => out.push('- ' + k + ' : ' + (typeof v === 'object' ? JSON.stringify(v) : v))); out.push(''); });
    out.push('## Chronologie complète', '');
    R.events.forEach(e => out.push(hms(e[0]) + '  ' + e[1].padEnd(10) + ' ' + e[2]));
    out.push('', '## Journal de l\'appli (200 dernières lignes)', '');
    getJournal().slice(-200).forEach(l => out.push(l));
    // derniers filets : formats de clés connus, puis les vraies valeurs stockées (quel que soit leur format)
    let text = sanitizeForJournal(out.join('\n'));
    for (const v of testlogSecretValues()) text = text.split(v).join('[clé masquée]');
    return text;
}
function testlogSecretValues() {
    const vals = new Set(), add = v => { if (typeof v === 'string' && v.length >= 8) vals.add(v); };
    const walk = x => { if (typeof x === 'string') add(x); else if (x && typeof x === 'object') Object.values(x).forEach(walk); };
    Object.keys(STORAGE).filter(k => /KEY|TOKEN|SECRET|CONFIG/.test(k)).forEach(k => {
        const raw = String(getLS(STORAGE[k]) || '').trim();
        if (!raw) return;
        if (raw[0] === '{' || raw[0] === '[') { try { walk(JSON.parse(raw)); } catch (e) { add(raw); } } else add(raw);
    });
    return [...vals].sort((a, b) => b.length - a.length);
}
async function testlogDownload() {
    if (!testRec) { showToast('Aucun test enregistré', 'warn'); return; }
    if (testRec.active) testlogStop();
    const name = 'rapport-test-' + new Date(testRec.started).toISOString().slice(0, 10) + '.txt';
    await saveBlob(new Blob([testReportText()], { type: 'text/plain' }), name);
}

// ── Écran (Réglages → Aide et journal) ──
function renderTestlog() {
    const box = document.getElementById('testlog-steps'), status = document.getElementById('testlog-status');
    const pill = document.getElementById('testlog-pill'), active = !!testRec?.active;
    pill?.classList.toggle('hidden', !active);
    if (!box || !status) return;
    document.getElementById('testlog-start')?.classList.toggle('hidden', active);
    document.getElementById('testlog-download')?.classList.toggle('hidden', !testRec);
    document.getElementById('testlog-clear')?.classList.toggle('hidden', !testRec);
    status.textContent = active ? '● Version ' + APP_VERSION.num + ' — enregistrement en cours depuis ' + new Date(testRec.started).toLocaleTimeString('fr-FR') + ' — ' + testRec.events.length + ' notes, ' + testRec.montages.length + ' montage(s)'
        : testRec ? 'Test terminé : télécharge le rapport et envoie-le dans notre conversation.' : 'Version ' + APP_VERSION.num + '. Appuie sur « Démarrer » avant ta vidéo test.';
    box.innerHTML = testRec ? TEST_STEPS.map((s, k) => {
        const r = testRec.steps[s.id] || {};
        return '<div class="hcard testlog-step" style="margin-top:0.5rem;"><div class="t">' + (k + 1) + '. ' + esc(s.t) + ' ' + ({ ok: '✅', ko: '❌', skip: '⏭️' }[r.res] || '') + '</div>' +
            '<div class="hmuted">' + esc(s.how) + '</div>' +
            '<div class="row"><button type="button" class="sb-mini" data-tstep="' + s.id + ':ok">✅ Ça marche</button><button type="button" class="sb-mini" data-tstep="' + s.id + ':ko">❌ Problème</button><button type="button" class="sb-mini" data-tstep="' + s.id + ':skip">⏭️ Pas testé</button></div>' +
            '<textarea class="sb-text" data-tnote="' + s.id + '" placeholder="Remarque (ce que tu as vu, durée…)">' + esc(r.note || '') + '</textarea></div>';
    }).join('') : '';
}
document.addEventListener('click', e => {
    const t = e.target.closest ? e.target.closest('[data-tstep], #testlog-start, #testlog-download, #testlog-clear') : null;
    if (!t) return;
    if (t.id === 'testlog-start') testlogStart();
    else if (t.id === 'testlog-download') testlogDownload();
    else if (t.id === 'testlog-clear') testlogClear();
    else { const [id, res] = t.dataset.tstep.split(':'); testlogStep(id, res); }
});
document.addEventListener('input', e => { const id = e.target?.dataset?.tnote; if (id) testlogStepNote(id, e.target.value); });
