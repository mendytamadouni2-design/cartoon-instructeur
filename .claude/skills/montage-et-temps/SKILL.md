---
name: montage-et-temps
description: Cartoon Instructeur uniquement. Carte du moteur de montage (js/montage.js, js/render.js) et de ses invariants de temps — segments, deux modes (image par image WebCodecs / temps réel), horloge audio, transitions, rythme serré (temps remappé), personnage stable, sous-titres, autocollants, carte « Suivre », contrôle des coupes. À utiliser pour modifier, relire ou tester le montage.
---

# Moteur de montage

## Déroulé (`assembleVideo` → `assembleVideoCore`, `js/montage.js`)

1. `montageItems()` (`studio.js`) : scènes prêtes, avec retouches. `buildSegments(items, maxDuration, format)` :
   `intro` · (`card` de partie) · `scene` · (`board` = plan illustré si la réplique a une narration) · `outro`.
   **En Short vertical : aucun carton** (ni intro, ni partie, ni fin).
2. `prepareAssets` : son des scènes, voix ElevenLabs (`ttsBuffer`), voix off (`prepareNarration` → `narrBuffer`),
   transcription au mot (`sttWords`). Personnage stable : sprites (`loadPuppetSprites`) si `stableActive()`.
3. Boucle sur les segments : chaque segment est joué par `playSegment(dur, render, shouldEnd, before)`.

## Deux modes — tout changement doit marcher dans les deux

| | Image par image (si `webcodecsAvailable()`) | Temps réel (repli, et toujours pour l'aperçu) |
|---|---|---|
| Images | boucle exacte à 30 i/s, `session.frame(canvas, t)` | `runFrames` + `MediaRecorder` sur le canvas |
| Horloge | `clock.t` ; `actx` = `OfflineAudioContext` dont `currentTime` **est redéfini sur `clock.t`** (`render.js`) | horloge réelle |
| Vidéo des scènes | `openFrameSource` : image positionnée à l'instant exact | `<video>` qui joue |
| Son | mixé à la fin (`startRendering`, `trimAudio`) | joué en direct vers l'enregistreur |

→ Planifier le son avec `actx.currentTime + décalage` est correct dans les deux modes.

## Invariants

- `prevCanvas` (`pg`) = **dernière image propre** du segment précédent (sans sous-titres ni logo) : c'est le plan A des
  transitions et des fondus.
- Ordre de dessin d'une scène : calque scène (zoom / punch-in) → dessin du tableau → bulle → surlignage → **transition**
  (A = `prevCanvas`, B = copie de l'image en cours `txFrame`) → autocollant → **sous-titres** → carte « Suivre » →
  image perso → accroche → logo → contrôle (`qa.tick`).
- Transitions : `sceneTransitionFor(plan, index, précédente)` ; aucune après un carton ; durée `TRANSITIONS[n].dur`
  (0,4 à 0,8 s) ; bulles et chiffres attendent `overlayDelay = 0,8 × durée` ; clé `'tx' + si` = plan A envoyé une fois.
- **Rythme serré** (`tightActive()`, `silenceKeepRanges`, `rangeMapper` → `src(t)` / `out(s)`) : seulement voix TTS ou
  voix d'Agnes en image par image, **jamais la voix calée (`fit`)** ; mots, bouche (`pz.bt`) et images remappés ; son
  découpé en morceaux avec fondus de 15 ms ; la vidéo n'est remappée que sans voix TTS.
- Personnage stable : un élément `puppet` suppose `stableActive()` (≥ 2 poses validées) ; bouche = enveloppe de la voix
  réellement jouée (`voiceEnvelope`, temps `bt`).
- Tableau blanc : la note (autocollant ou bulle) se met en page une fois par scène (`boardNoteLayout`) ; le dessin
  prend la case réduite (`sketchArea`), aussi pour `prevSketch`.
- Fin : carte « Suivre » sur le **dernier segment joué** (`isFinalSeg` : un plan illustré peut suivre la dernière scène ;
  un plan sans voix off est sauté).
- Contrôle : `createQa(n, { frames })` — vérification des coupes toujours faite (gratuit) ; images pour Claude seulement
  si le contrôle par l'IA est coché ; image « début » prise après la transition (`settle`).
- Durée totale bornée par `maxDuration` (Short 30 s / 60 s) : un segment peut être coupé.

## Pièges

- Créer des canvas, des tableaux ou des chaînes à chaque image (iPhone : mémoire) — tout ce qui est fixe se crée avant
  `playSegment`.
- Oublier de mettre à jour `prevCanvas` / `prevSketch` / `presenter` en fin de segment (transitions fausses ensuite).
- Arrêter une source audio deux fois ou oublier les morceaux (`srcs`) du rythme serré.
- Changer une durée sans remapper les mots (sous-titres décalés) ou l'inverse.
