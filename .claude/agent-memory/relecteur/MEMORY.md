# Mémoire du relecteur

## Invariants du montage (`js/montage.js`, `js/render.js`)
- En image par image, `actx.currentTime` suit l'horloge des images (`render.js`, propriété redéfinie sur `clock.t`) : planifier le son avec `actx.currentTime` est correct dans les deux modes.
- `prevCanvas` = dernière image propre du plan précédent (sans sous-titres ni logo) ; les transitions mélangent `prevCanvas` (A) et l'image du nouveau plan (B) avant les sous-titres.
- Un élément `puppet` suppose `stableActive()` (sinon `puppet` est null et la fin de scène appelle `drawSceneLayer` avec une vidéo null).
- Voix : jamais deux voix différentes dans une même vidéo (si ElevenLabs échoue, toute la vidéo repasse en voix Agnes).
- `buildSegments` : en scènes riches (`richMode` + ElevenLabs, actif par défaut), une réplique à 2 phrases ajoute un segment `board` APRÈS sa scène, y compris la dernière → « fin de la vidéo » = dernier segment, pas dernière scène.
- Rythme serré (8.4, `rangeMapper`) : seulement voix TTS / personnage stable (2 modes) ou voix d'Agnes en image par image ; jamais la voix calée `fit` (défaut dès qu'ElevenLabs est réglé, `applyQualityDefaults`). L'aperçu (`preview`) est toujours en temps réel.
- `createQa.tick` capture l'image « (début) » à 0,2 s, donc pendant les transitions (0,4 à 0,8 s).

## Plan de Claude
- `callClaude` envoie `output_config.format = json_schema` : les enums sont imposés par l'API (pas de valeur hors liste).
- Normalisation des champs seulement dans `planScenesWithClaude` (client) ; le chemin serveur (`mergePlan` du relais) garde `...s` tel quel.
- `buildLanguageVersion` (studio.js) traduit une LISTE BLANCHE de champs du plan : tout nouveau champ texte doit y être ajouté. Tout texte fixe dessiné dans la vidéo suit `state.language`, pas le français de l'interface.

## WebGL (transitions.js, compositor.js)
- `txGl` est mis en cache pour toute la session : contexte perdu = coupes sèches silencieuses (vérifier `isContextLost()`).
- Shaders en `precision mediump` : demi-précision possible sur iPhone (bruit `hash()` effondré) ; le Chromium de test (SwiftShader) annonce 10 bits mais calcule en fp32 → les tests ne le voient pas.

## Défauts déjà vus (et corrigés)
- Course au rechargement du casting qui écrasait une validation → `castSigLoaded` mis à jour dans `saveCast` et `loadCast`.
- Ponctuation française isolée en fin de ligne dans l'accroche → espace insécable avant ? ! : ;
- Envoi d'une vidéo > 100 Mo refusé par Cloudflare → envoi par morceaux (`studio.js`, `relais/`).

- (8.5) `loadScript` déclarée deux fois (projects.js écrasait exports.js) → une seule, qui s'appuie sur `loadScriptOnce` (render.js).
- (8.5) Mission n° 1 : carte « Suivre » absente après un plan illustré final, textes fixes en français dans une vidéo
  traduite, emojis sur des débuts de mots, perte de contexte WebGL, `mediump` → tous corrigés, avec tests.

## Noms globaux déjà pris (pièges vus en 8.5)
- `fitFont` (graphics.js, signature `ctx, text, weight, family, maxW, start, min`), `scriptLoads` / `loadScriptOnce` (render.js).
  Toujours lancer le contrôle des doublons après un ajout global.

## Méthode qui marche
- Harnais Playwright jetable : servir le dépôt comme `serveApp()` et, pour valider un correctif sans toucher au dépôt, servir en priorité une copie modifiée depuis `/tmp/.../patched/js/`.
- Doublons const/let/class : concaténer les scripts dans l'ordre d'`index.html` puis `node --check` (attrape aussi les déclarations multiples sur une ligne).
