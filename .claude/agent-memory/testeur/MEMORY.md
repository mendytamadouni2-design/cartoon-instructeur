# Mémoire du testeur

## Durées (conteneur cloud, oct. 2026)
- Suite complète ≈ 15 min. Le groupe `compositor` tient sous 10 min. `node tests/unit-motion.js` : quelques secondes.

## Tests sensibles et pourquoi
- « montage en pause quand l'appli passe en arrière-plan » : mesure des temps réels (1,2 s joués en ~2,2 s) → faux si le processeur sature : ne jamais lancer deux groupes en même temps.
- Groupe `phone` : l'endpoint Agnes Image (`/v1/images/generations`) est simulé en 404 ; la section « référence » est repliée et doit être ouverte avant de cliquer `#ref-create-btn`. Les replis (« fold ») doivent être ouverts avant `#factcheck-btn` et `#hooks-btn` (depuis la refonte 8.1).
- Groupe `styles` : les prompts Agnes au format LTX doivent faire ≤ 210 mots et commencer par « The cartoon character from the input image talks directly to the camera ».
- Personnage stable : `castReady()` exige 2 poses validées dont `main` (une seule pose → les éléments « puppet » plantent faute de sprites).

## Recettes de diagnostic
- Erreur dans un `page.evaluate` : renvoyer `e.message + e.stack` (en retirant `https://app.test/`) pour avoir fichier:ligne.
- `agnesImage` ne doit pas passer par les nouvelles tentatives longues d'`apiFetch` (dépassement du délai du test `phone` en 8.2).

## Leçons 8.6
- Groupe `background` lancé seul : échouait car `mockStats.refChecks` (scène 2 jugée ratée au 1er appel) était consommé par `phone` en exécution complète → corrigé (`mockStats.flagScene2 = false`). Toujours valider un groupe seul ET la suite complète.
- Durées mesurées (oct. 2026) : styles 15 s, compositor 45 s, phone ≈ 7 min, background ≈ 6 min.

## À tester sur un vrai iPhone (reprise des tests vers le 24 oct. 2026)
- 8.7 police feutre : écrire « Le savais-tu » en `400` puis en `900` sur un canvas (police `MARKER_FONT`) et comparer
  l'épaisseur des traits — vérifier que Safari ne fabrique pas un faux gras (plage déclarée `font-weight: 100 900`).
- 8.7 voix étirée (`stretchBuffer`, WSOLA) : temps bloquant par scène (Node : 0,3 à 0,7 s pour 10–20 s de voix) ; si
  l'écran gèle plus d'1 s par scène sur Safari, envisager de découper le calcul.
- WebCodecs présent ou non (sinon : encodeur WASM de la feuille de route) ; la police feutre servie hors ligne (mode avion).
- 8.8 Agnes Image en texte seul (`tracePromptFor`, `size: '960x960'`) : vraie réponse, dessin propre sans texte, et
  surtout le PRIX / quota d'agnes-image-2.1-flash (noté gratuit sans source) ; photo HEIC choisie dans « Depuis une image ».
- 8.9 fond vert : bords en `mediump` 16 bits (shader `unmixA`, division par l'opacité) — regarder une scène fond vert
  et le personnage stable sur fond blanc, zoom sur les cheveux.
- 9.0 personnage vivant : fluidité du montage (≈ 0,5 ms par image dans Chromium), 1re image (maillage + Cholesky),
  retour d'arrière-plan en plein montage (contexte WebGL perdu → l'image suivante doit être juste).
- Lancer les tests avec `CHROMIUM_PATH=/opt/pw-browsers/chromium` (sinon Playwright cherche un navigateur absent).
