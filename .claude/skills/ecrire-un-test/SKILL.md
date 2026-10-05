---
name: ecrire-un-test
description: Cartoon Instructeur uniquement. Comment écrire un test de bout en bout dans tests/run-e2e.js — groupes, services simulés, espions, remise en état, montage simulé (personnage stable + voix), libellés en français, pièges connus. À utiliser pour proposer ou écrire un test, ou comprendre pourquoi un test échoue.
---

# Écrire un test (tests/run-e2e.js)

## Structure

- Quatre groupes, lancés l'un après l'autre (`ONLY=styles|compositor|phone|background`) : `testStyles`,
  `testCompositor` (le plus gros : rendu, montage, 8.4, 8.5…), `testPhoneMontage` (parcours complet sur téléphone),
  `testBackground` (serveur Cloudflare simulé : `loadWorker`, `fakeDurableObjects`).
- L'appli est servie par `serveApp` sur `https://app.test` (fichiers lus sur le disque à chaque requête).
- Résultat : `check(condition, 'libellé en français (valeurs mesurées)')` → ✅ / ❌, compté dans `failures`.

## Modèle d'un bloc de test

```js
const res = await page.evaluate(async () => {
    const r = {}, keep = { scenes: state.scenes, plan: state.scenePlan, queue: state.queue };   // 1. garder l'état
    const realFetch = window.fetch;
    window.fetch = async (u, o) => { u = String(u); if (u.includes('/text-to-speech/')) return new Response(new Blob([wav], { type: 'audio/wav' })); return realFetch(u, o); };   // 2. simuler
    try {
        /* 3. préparer, agir */
        r.valeur = …;                       // 4. mesurer des faits (nombres, chaînes), pas seulement true/false
    } catch (e) { r.err = e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 4).join(' '); }   // fichier:ligne en cas de plantage
    finally { window.fetch = realFetch; Object.assign(state, { scenes: keep.scenes, scenePlan: keep.plan, queue: keep.queue }); }   // 5. tout remettre
    return r;
});
check(!res.err && res.valeur === attendu, 'ce que l\'utilisateur y gagne, en français (' + (res.err || res.valeur) + ')');
```

## Recettes

- **Espionner une fonction de l'appli** : la remplacer sur `window` (`const vrai = window.drawFollowCard; window.drawFollowCard = (...a) => { n++; return vrai(...a); }`) et la remettre dans `finally`. Impossible si elle est déclarée avec `const` / `let` (pas sur `window`).
- **Variables `let` / `const` de l'appli** (ex. `txGl`, `elevenQuota`) : accessibles par leur nom dans `page.evaluate`, pas via `window`.
- **Montage complet sans Agnes** : personnage stable = `state.cast = { sig: castSig(), poses: [main, une autre] }` (**deux poses validées minimum**, sinon `castReady()` est faux et le montage plante), clé ElevenLabs de test `localStorage.setItem('elevenlabs_api_key', 'sk_test')`, `elevenlabsSelectedVoiceId = 'v1'`, file `state.queue` d'éléments `{ puppet: true, status: 'done', videoUrl: 'puppet:' + i }`, voix simulée par un WAV généré dans la page, puis `await assembleVideo({ label: 'Montage' })`.
- **Claude simulé** : `claudeMock` (route) ou remplacer `window.callClaude` le temps du bloc.
- **Pixels** : dessiner sur un canvas, lire `getImageData`, comparer des couleurs ou compter des pixels ; pour une image
  de référence, l'écrire dans `os.tmpdir()` et la regarder.
- **Texte dessiné** : espionner `ctx.fillText` du canvas pour savoir exactement ce qui a été écrit.

## Pièges

- Tout ce qui n'est pas simulé part sur internet et échoue (réseau du conteneur filtré).
- Un état non restauré fausse les tests suivants du même groupe.
- Les tests mesurant le temps réel (pause du montage) deviennent faux si le processeur est saturé : pas de groupes en parallèle.
- Chromium de test : WebGL en 32 bits (logiciel), WebCodecs présent → le montage temps réel est peu couvert ; le dire.
- **Jamais** affaiblir un test pour le faire passer : corriger l'appli, ou prouver que le test est devenu faux après un
  changement voulu.
