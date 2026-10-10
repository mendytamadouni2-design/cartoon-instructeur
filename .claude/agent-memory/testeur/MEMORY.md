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
