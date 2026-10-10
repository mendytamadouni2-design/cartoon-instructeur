---
name: api-agnes-elevenlabs
description: Cartoon Instructeur uniquement. Référence des services externes de l'appli telle qu'utilisée dans le code — Agnes (vidéo agnes-video-v2.0, image agnes-image-2.1-flash, guide d'écriture LTX, consigne « à éviter », limites de débit) et ElevenLabs (voix, transcription, quota gratuit, cache). La doc d'Agnes est inaccessible depuis le conteneur : c'est la source de vérité de l'équipe.
---

# Agnes et ElevenLabs (état au 2026-10)

## Agnes (clé `Authorization: Bearer`, `js/core.js`, `js/scenes.js`, serveur `relais/`)

| Usage | Appel | Détails |
|---|---|---|
| Vidéo | `POST https://apihub.agnes-ai.com/v1/videos` | `model: 'agnes-video-v2.0'`, `prompt`, `image` (data URI, image de départ), `num_frames` = 8n+1 ≤ 441 (défaut 153 ≈ 6 s), `frame_rate: 24`, `negative_prompt`, `width`/`height` |
| Suivi | `GET https://apihub.agnes-ai.com/agnesapi?video_id=…&model_name=agnes-video-v2.0` | réponse avec l'id (`video_id`, `id` ou `task_id`) puis l'adresse de la vidéo |
| Enchaînement parfait | même `POST`, sans `image`, avec `extra_body: { image: [début, fin], mode: 'keyframes' }` | option « keyframes » ; refusé (400) → `keyframesUnsupported`, on renvoie la demande simple |
| Image | `POST https://apihub.agnes-ai.com/v1/images/generations` | `model: 'agnes-image-2.1-flash'`, `size: '720x1280'`, `extra_body: { image: [dataURI], response_format: 'b64_json' }` ; 404/403 → `agnesImageUnsupported` ; **gratuit** à la date de la 8.2 |

- Formats (`videoDimsFor`) : vertical 720×1280, horizontal 1280×720, intermédiaires 768×1024 / 1024×768, carré 960×960.
- Débit : une création toutes les 62 s minimum (`CREATE_INTERVAL_MIN`, jusqu'à 90 s après des 429) ; 429 et 503 →
  attentes croissantes (`apiFetch`). Côté serveur : `CREATE_INTERVAL_MS = 62000`.
- Erreur 400 avec réglages avancés (négatif, dimensions, keyframes) → renvoyer la **demande simple**.
- Prix suivi par l'appli : `AGNES_SCENE_PRICE = 0.02` € par scène (`growth.js`).

### Écrire une consigne Agnes (modèle probable : LTX)

Un **seul paragraphe**, au présent, ≤ ≈ 200 mots (test : ≤ 210), dans l'ordre (`buildScenePrompt`) :
1. action principale (« The cartoon character from the input image talks directly to the camera and … ») ;
2. parole : « In a … voice, the character says in French: "…" » + bouche qui articule, hochements, clignements ;
3. raccords : départ et retour sur la même pose neutre ;
4. apparence : personnage IDENTIQUE à l'image, mains vides ;
5. décor (référence exacte / fond vert #00B140 / blanc pur au tableau blanc / décor simple et identique) ;
6. caméra fixe, sans zoom d'entrée ; 7. style et lumière (sauf image de référence) ; « Vertical 9:16 framing. » ;
8. son (voix seule, sans musique) ; 9. « No text anywhere in the image, no watermark. »

Tout ce qui est interdit va dans `negative_prompt` (`agnesNegativePrompt`) : texte, lettres, sous-titres, logo, membres
ou doigts en trop, mains déformées, tenue qui change, autre personnage, objets en main, accessoires, écrans, flèches,
particules, effets lumineux, bulles, tremblement de caméra, zoom d'entrée, flou, visage déformé, bouche figée ;
gants ou moufles dans l'identité → ajouter « separate detailed fingers, bare hands ».

## ElevenLabs (`https://api.elevenlabs.io/v1`, en-tête `xi-api-key`, `js/voices.js`)

| Usage | Appel |
|---|---|
| Voix | `POST /text-to-speech/{voiceId}` · `model_id: 'eleven_multilingual_v2'`, `voice_settings { stability 0.5, similarity_boost 0.75, style 0, use_speaker_boost, speed? }` |
| Transcription au mot | `POST /speech-to-text` (FormData : `model_id: 'scribe_v1'`, `file`, `timestamps_granularity: 'word'`, `language_code`) |
| Quota | `GET /user/subscription` → `character_count`, `character_limit`, `next_character_count_reset_unix` |
| Voix disponibles | `GET /voices` |

- **L'utilisateur reste en offre gratuite** : 10 000 caractères par mois (`ELEVEN_FREE_LIMIT`). Avant de lancer :
  `elevenCharsNeeded()` / `elevenQuotaShort()` ; quota épuisé (`quota_exceeded`) → `markElevenExhausted()`, plus aucun appel.
- Voix de la bibliothèque : 402 / `paid_plan_required` → voix réservée aux abonnés, proposer une voix gratuite.
- **Cache** : une phrase déjà dite (même voix, mêmes réglages, même texte) n'est jamais repayée (IndexedDB `tts:` + sha256).
- **Voix calée sur les lèvres** (`prepareFitVoice`, 8.7) : UNE seule prise ElevenLabs, puis `stretchBuffer` (WSOLA, `render.js`)
  l'étire ou la resserre (×0,75 à ×1,35) à la durée de la parole d'Agnes ; plus jamais de 2e prise payante à une autre vitesse.
- **Jamais deux voix différentes** dans une même vidéo : si ElevenLabs échoue en cours, toute la vidéo repasse en voix d'Agnes.
- Prix indicatif suivi : `ELEVENLABS_PRICE_1K = 0.2` € pour 1 000 caractères (`growth.js`), affiché même en gratuit.
