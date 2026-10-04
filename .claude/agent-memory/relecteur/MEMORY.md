# Mémoire du relecteur

## Invariants du montage (`js/montage.js`, `js/render.js`)
- En image par image, `actx.currentTime` suit l'horloge des images (`render.js`, propriété redéfinie sur `clock.t`) : planifier le son avec `actx.currentTime` est correct dans les deux modes.
- `prevCanvas` = dernière image propre du plan précédent (sans sous-titres ni logo) ; les transitions mélangent `prevCanvas` (A) et l'image du nouveau plan (B) avant les sous-titres.
- Un élément `puppet` suppose `stableActive()` (sinon `puppet` est null et la fin de scène appelle `drawSceneLayer` avec une vidéo null).
- Voix : jamais deux voix différentes dans une même vidéo (si ElevenLabs échoue, toute la vidéo repasse en voix Agnes).

## Défauts déjà vus (et corrigés)
- Course au rechargement du casting qui écrasait une validation → `castSigLoaded` mis à jour dans `saveCast` et `loadCast`.
- Ponctuation française isolée en fin de ligne dans l'accroche → espace insécable avant ? ! : ;
- Envoi d'une vidéo > 100 Mo refusé par Cloudflare → envoi par morceaux (`studio.js`, `relais/`).
