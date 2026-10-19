// ══════════════════════════════════════════════════════════════════
// BOÎTE À VIDÉO POUR CLAUDE (9.2)
// Chaque vidéo finie est déposée sur le serveur Cloudflare de l'utilisateur : Claude vient la
// regarder (images, son, saccades), fait son rapport, puis vide la boîte. Une seule vidéo à la fois.
// La boîte est fermée par une clé créée ici : le serveur n'en garde que l'empreinte, Claude la lit
// dans les réglages de son environnement (CARTOON_BOITE_CLE). La clé n'est jamais écrite dans le journal.
// ══════════════════════════════════════════════════════════════════
const BOITE_OWN_KEY = 'boite/derniere';   // copie propre à la boîte quand la vidéo n'est pas gardée dans la bibliothèque
// boiteSlot : le dépôt le plus récent (le plus récent gagne, l'ancien blob est libéré tout de suite)
let boiteChain = Promise.resolve(), boiteGen = 0, boiteSlot = null, boiteEtatCache = null, boiteCleMem = '';

function boiteCle() {
    let k = getLS(STORAGE.BOITE_KEY) || boiteCleMem;
    if (!k || k.length < 40) {
        const b = crypto.getRandomValues(new Uint8Array(32));
        k = btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        setLS(STORAGE.BOITE_KEY, k); setLS(STORAGE.BOITE_LINKED, '');
    }
    boiteCleMem = k;   // stockage indisponible : la même clé pour toute la session
    return k;
}
async function boiteEmpreinte(k) {
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(k)));
    return btoa(String.fromCharCode(...h)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function boiteFetch(path, init = {}) {
    const res = await withTimeout(fetch(getProxyUrl() + path, { ...init, headers: { ...(init.headers || {}), Authorization: 'Bearer ' + boiteCle() } }), 30000, 'serveur trop lent');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        if (data.code === 'non-liee') setLS(STORAGE.BOITE_LINKED, '');   // boîte réinitialisée sur le serveur : à relier
        const err = new Error(data.error || ('HTTP ' + res.status)); err.status = res.status; err.code = data.code; throw err;
    }
    return data;
}
// Lie la boîte du serveur à la clé de ce téléphone (une fois ; la première clé gagne)
async function boiteLier() {
    const k = boiteCle();
    if (getLS(STORAGE.BOITE_LINKED) === '1') return;
    try {
        await boiteFetch('/boite/cle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ empreinte: await boiteEmpreinte(k) }) });
        setLS(STORAGE.BOITE_LINKED, '1');
    } catch (e) {
        if (e.status === 409) throw new Error('ta boîte est liée à une autre clé (autre téléphone ?) : dis à Claude « réinitialise ma boîte », puis recopie la clé');
        throw e;
    }
}
// Infos lues AU MOMENT où la vidéo est finie (avant tout envoi : le pilote automatique enchaîne la suivante)
function boiteSnapshot() {
    const blob = state.finalBlob;
    if (!blob) return null;
    const tl = state.timeline || [];
    return { blob, info: {
        version: APP_VERSION.num, date: new Date().toISOString(), sujet: String(state.theme || '').slice(0, 120),
        style: state.selectedStyle || '', format: outputFormat(), mode: state.finalOffline ? 'image par image' : 'temps réel',
        duree: Math.round(tl.reduce((a, t) => a + t.duration, 0) * 100) / 100, taille: blob.size, type: blob.type,
        fondVert: !!state.greenScreen, personnageVivant: !!state.puppetDeform, voix: state.voiceSource || '',
        plans: tl.slice(0, 80).map(t => ({ debut: Math.round(t.start * 100) / 100, duree: Math.round(t.duration * 100) / 100, scene: t.sceneIndex, plan: t.narration ? 'illustré' : 'scène' }))
    } };
}
// Appelé par projectFinalReady : finalKey = copie de la vidéo dans la bibliothèque, s'il y en a une
function boiteDeposer(finalKey, snap) {
    snap = snap || boiteSnapshot();
    if (!snap || !state.boiteOn || !mediaAvailable() || !state.proxyBoite) return Promise.resolve();
    boiteSlot = { gen: ++boiteGen, key: finalKey || null, blob: finalKey ? null : snap.blob, info: snap.info };
    return boiteRelancer();
}
function boiteRelancer() {
    boiteChain = boiteChain.then(async () => {
        const s = boiteSlot;
        if (!s || s.gen !== boiteGen) return;   // déjà fait, ou une vidéo plus récente attend
        await boiteDeposerRun(s);
        if (boiteSlot === s) boiteSlot = null;
    }).catch(e => { log('Boîte à vidéo pour Claude : ' + e.message); boiteEtatCache = { erreur: e.message }; renderBoite(); });
    return boiteChain;
}
async function boiteDeposerRun(s) {
    await boiteLier();
    let key = s.key, own = false;
    if (!key) { await uploadMedia(BOITE_OWN_KEY, s.blob, 'boite', 'Boîte à vidéo pour Claude'); key = BOITE_OWN_KEY; own = true; }
    if (s.gen !== boiteGen) return;
    const put = () => boiteFetch('/boite', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, own, info: s.info }) });
    try { await put(); }
    catch (e) { if (e.code !== 'non-liee') throw e; await boiteLier(); await put(); }   // boîte réinitialisée entre-temps
    setJSON(STORAGE.BOITE_LAST, { date: Date.now(), duree: s.info.duree, format: s.info.format, taille: s.info.taille });
    boiteEtatCache = { pleine: true };
    log('Boîte à vidéo pour Claude : dernière vidéo déposée (' + Math.round(s.info.taille / 1e5) / 10 + ' Mo)');
    renderBoite();
}
async function boiteVider() {
    try { await boiteFetch('/boite', { method: 'DELETE' }); boiteSlot = null; boiteEtatCache = { pleine: false }; showToast('Boîte vidée', 'success'); }
    catch (e) { showToast('Boîte : ' + e.message, 'error', 5000); }
    renderBoite();
}
function boiteCopierCle() {
    const k = boiteCle();   // avant tout await : le geste de l'utilisateur reste valable pour le presse-papiers (iOS)
    (navigator.clipboard ? navigator.clipboard.writeText(k) : Promise.reject(new Error('presse-papiers absent')))
        .then(() => showToast('Clé copiée : colle-la dans les réglages de ton environnement Claude, jamais dans la conversation', 'success', 7000))
        .catch(() => window.prompt('Copie cette clé (réglages de ton environnement Claude, variable CARTOON_BOITE_CLE) :', k));
    if (mediaAvailable() && state.proxyBoite) boiteLier().then(renderBoite).catch(e => { boiteEtatCache = { erreur: e.message }; renderBoite(); });
}
// La boîte est-elle encore pleine ? (vide = Claude l'a regardée)
async function boiteRafraichir() {
    if (!mediaAvailable() || !state.proxyBoite || getLS(STORAGE.BOITE_LINKED) !== '1') return;
    try { await boiteFetch('/boite'); boiteEtatCache = { pleine: true }; }
    catch (e) { boiteEtatCache = e.status === 404 ? { pleine: false } : { erreur: e.message }; }
    renderBoite();
}
function renderBoite() {
    const st = document.getElementById('boite-status');
    if (!st) return;
    const last = getJSON(STORAGE.BOITE_LAST);
    let t;
    if (!getProxyUrl() || !state.proxyMedia || !state.proxyBoite) t = '⚠️ Ton serveur Cloudflare doit être à jour (version 9.2) pour utiliser la boîte.';
    else if (!state.boiteOn) t = 'Boîte désactivée : Claude ne verra pas tes prochaines vidéos.';
    else if (!last) t = 'Ta prochaine vidéo finie y sera déposée.';
    else {
        const d = new Date(last.date);
        t = 'Dernière vidéo déposée le ' + d.toLocaleDateString('fr-FR') + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
            + ' (' + Math.round(last.duree || 0) + ' s, ' + Math.round((last.taille || 0) / 1e5) / 10 + ' Mo)';
        if (boiteEtatCache && boiteEtatCache.pleine === false) t += ' — ✅ Claude l\'a regardée, boîte vide.';
    }
    if (boiteEtatCache && boiteEtatCache.erreur) t += ' — ⚠️ ' + boiteEtatCache.erreur + (boiteSlot ? ' (nouvel essai au prochain retour dans l\'appli)' : '');
    st.textContent = t;
}
document.addEventListener('click', e => {
    if (e.target.closest('#boite-copy')) boiteCopierCle();
    else if (e.target.closest('#boite-clear') && confirm('Vider la boîte ? Claude ne pourra plus voir ta dernière vidéo.')) boiteVider();
});
// envoi coupé (appli mise en arrière-plan, réseau) : nouvel essai au retour dans l'appli
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && boiteSlot && boiteSlot.gen === boiteGen && boiteEtatCache && boiteEtatCache.erreur) { boiteEtatCache = null; boiteRelancer(); }
});
