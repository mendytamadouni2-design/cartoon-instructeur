# Mémoire du chercheur

## Sites bloqués depuis le conteneur (oct. 2026)
- tiktok.com (et vm.tiktok.com), fal.ai, docs.byteplus.com, agnes-ai.com (site et docs), *.github.io, fakeyou.com et api.fakeyou.com.
- API GitHub de l'org storytold bloquée, mais `git clone --depth 1 https://github.com/storytold/<nom>` marche.
- Accessibles : github.com (clone), raw.githubusercontent.com, code.claude.com, la plupart des docs officielles.

## Verdicts déjà rendus
- HyperFrames (github.com/heygen-com/hyperframes, Apache 2.0, consulté 2026-10) : 14 shaders de transition repris dans `js/transitions.js` (crédit dans le README) ; les blocs `tiktok-follow` / `instagram-follow` ont inspiré la carte « Suivre ». Registre d'environ 394 éléments, autres idées possibles.
- video-use (github.com/browser-use/video-use, consulté 2026-10) : Python + ffmpeg, code non réutilisable dans le navigateur ; idées reprises en 8.4 (coupes serrées, sous-titres 2 mots en majuscules, contrôle de chaque coupe).
- BytePlus : refusé par l'utilisateur (« à long terme ça ne m'arrange pas »). Ne pas reproposer.
- Agnes : on la garde. Elle semble reposer sur LTX → prompts écrits selon le guide LTX (8.3). API : apihub.agnes-ai.com, `POST /v1/videos` (agnes-video-v2.0), `POST /v1/images/generations` (agnes-image-2.1-flash, gratuit à la date de la 8.2).
- ElevenLabs : reste en offre gratuite (décision de l'utilisateur).

## Organisation storytold / ArtCraft (inventaire du 2026-10-10)
- Licences lues : les *craft (effectcraft, soundcraft, vectorcraft, photocraft, lightcraft, deckcraft, designcraft, craft-fonts, craft-libs) = MIT OU Apache 2.0 (fichiers LICENSE-*, champ license du Cargo.toml). artcraft et artcraft-services = « ArtCraft License » fair source (usage perso, pas de produit concurrent d'outils IA image/vidéo) : NE PAS reprendre. artcraftx, cloud-worker, realtime-voice-conversion : aucun fichier de licence.
- Tout est en Rust (apps egui, build web WASM lourd) : on PORTE des fonctions en JS, on n'embarque rien.
- Reprises jugées utiles : soundcraft `crates/dsp/src/offline.rs` time_stretch (WSOLA) / pitch_shift → éviter la 2e prise ElevenLabs de `prepareFitVoice` ; vectorcraft `crates/trace/src/centerline.rs` (squelette → traits) → tableau blanc ; effectcraft `crates/effects/src/puppet/{mesh,arap}.rs` (ARAP) → puppet.js ; photocraft `crates/algo/src/color_to_alpha.rs` + `matting.rs` (filtre guidé) → bords du fond vert.
- Plus tard / non : deckcraft anim (≈45 transitions PowerPoint, l'appli en a 30), lightcraft finish.wgsl (vibrance OkLCh, grain, vignette), effectcraft text/selectors.rs (Range/Wiggly), soundcraft de-esser. Non : designcraft (mise en page), spark (fork Gaussian splats, 415 Ko min + three.js), craft-libs (vide), craft-fonts (seulement CJK/arabe, aucune police manuscrite).
- Voix gratuite sans GPU : AUCUNE dans storytold (storyteller-ml, vits-finetuning, realtime-voice-conversion = PyTorch/GPU ; artcraft-services = client du service FakeYou, site bloqué).
- Police feutre hors storytold : Permanent Marker (google/fonts, Apache 2.0, 74,6 Ko, accents français présents dans la table cmap), vérifié 2026-10-10.
