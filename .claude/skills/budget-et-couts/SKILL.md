---
name: budget-et-couts
description: Cartoon Instructeur uniquement. Ce que coûte chaque service de l'appli (Agnes, ElevenLabs, Claude, recherche web, Cloudflare), où le coût est compté et affiché, et la règle « rien de payant sans l'accord de l'utilisateur ». À utiliser pour relire tout code qui appelle un service externe, et avant de proposer un outil ou une option.
---

# Budget et coûts

**Règle absolue de l'utilisateur : rien de payant sans son accord explicite.** Il est en offre gratuite chez ElevenLabs
et ne veut pas de dépense surprise. Un nouveau coût non annoncé est un défaut 🔴.

## Ce que coûte chaque service (valeurs utilisées par l'appli, au 2026-10)

| Service | Coût suivi par l'appli | Où c'est compté |
|---|---|---|
| Agnes vidéo | `AGNES_SCENE_PRICE = 0.02` € par scène créée | `trackCost('agnes', …)` dans `createVideoTask` (`scenes.js`) et `trackJobCost` (arrière-plan) |
| Agnes image | 0 € (gratuit à la date de la 8.2, **source non retrouvée : à revérifier**) ; sert au casting de poses et (8.8) aux illustrations retracées (réglage « Vraies illustrations », 3 par scène au plus, cache par objet) | appels comptés dans le journal (`traceCalls`) |
| ElevenLabs voix | offre gratuite : 10 000 caractères / mois ; prix indicatif `ELEVENLABS_PRICE_1K = 0.2` € / 1 000 car. | `addElevenUsage`, `trackCost('elevenlabs', …)` (`voices.js`) |
| ElevenLabs transcription | consomme aussi le compte ElevenLabs | `transcribeWords` (`montage.js`), seulement si la synchro au mot est activée |
| Claude | `CLAUDE_PRICES` (€ par million de jetons, entrée / sortie) : opus-5-5 `[4, 20]`, opus-5 `[5, 25]`, sonnet-5 `[2, 10]`, haiku-4-5 `[1, 5]` ; relecture du cache ≈ 5 % | `trackClaudeUsage` (`claude.js`) |
| Recherche web de Claude | ≈ 0,0093 € par recherche (`max_uses` borne le nombre) | `trackClaudeUsage` |
| Cloudflare (serveur) | offre gratuite ; projets effacés après 3 jours | — |

## Registre des prix (sources)

Un prix sans source datée est **non vérifié** : on ne s'en sert pas pour dire « gratuit » à l'utilisateur ni pour
activer par défaut une option qui l'utilise. Le chercheur tient ce tableau à jour (`chercheur-sources` pour lire les
pages) : à chaque nouvelle option qui appelle un service, et au moins une fois par mois. Une ligne = un fait, sa
source (URL, capture de la page de facturation ou facture que l'utilisateur envoie) et la date de lecture.

| Service | Prix retenu | Source | Lu le | État |
|---|---|---|---|---|
| Claude Opus 5.5 | 4 $ / 20 $ par million de jetons (entrée / sortie) ; cache : lecture 0,20 $, écriture 5 $ | https://claude.com/pricing | 2026-10-10 | ✅ vérifié (l'appli compte ces chiffres en €, `CLAUDE_PRICES`) |
| Claude Sonnet 5.5 | 2 $ / 10 $ ; cache : lecture 0,10 $, écriture 2,50 $ | https://claude.com/pricing | 2026-10-10 | ✅ vérifié |
| Claude Haiku 5.5 | ≤ 100 K jetons : 0,10 $ / 0,50 $ ; au-delà : 0,50 $ / 2,50 $ | https://claude.com/pricing | 2026-10-10 | ✅ vérifié (absent de `CLAUDE_PRICES`, qui a encore haiku-4-5) |
| Recherche web de Claude | 10 $ / 1 000 recherches, hors jetons | https://claude.com/pricing | 2026-10-10 | ✅ vérifié (appli : ≈ 0,0093 € / recherche) |
| Agnes image (agnes-image-2.1-flash) | ≈ 0,003 $ / image, gratuit pendant une promotion (août 2026) | guide tiers glbgpt.com (résumé de recherche, page non lue) ; agnes-ai.com bloqué (403) | 2026-10-10 | ⚠️ non vérifié — `AGNES_IMAGE_PRICE = 0.003` compté par prudence ; « Vraies illustrations » coupé par défaut ; à relever sur le compte Agnes le 24/10/2026 |
| Agnes vidéo (agnes-video-v2.0) | ≈ 0,30 $ / minute (≈ 0,03 $ pour une scène de 6 s) | blog tiers wavespeed.ai (titre lu, mai 2026) ; agnes-ai.com bloqué | 2026-10-10 | ⚠️ non vérifié (appli : 0,02 € / scène, `AGNES_SCENE_PRICE` — peut-être sous-estimé) |
| ElevenLabs, offre gratuite | 10 000 caractères / mois ; usage commercial : sources contradictoires | résumés tiers ; elevenlabs.io bloqué (403) | 2026-10-10 | ⚠️ non vérifié |
| ElevenLabs Starter / transcription | 5 à 6 $ / mois ; Scribe ≈ 0,22 à 0,27 $ / heure | résumés tiers contradictoires | 2026-10-10 | ⚠️ non vérifié |
| Cloudflare Durable Objects (gratuit) | SQLite seulement : 100 000 requêtes/jour, 5 Go par compte | extraits de developers.cloudflare.com (pages non lues, 403) | 2026-10-10 | ⚠️ non vérifié ; limites Workers gratuit non trouvées |

Sites bloqués depuis le conteneur (403 du proxy, politique de sortie : ne pas contourner) : elevenlabs.io,
developers.cloudflare.com, agnes-ai.com, docs.anthropic.com (claude.com/pricing est lisible). Pour ces lignes, la
source fiable est l'utilisateur : capture de sa page de facturation, ou rapport de test (étape « Prix Agnes Image »).

L'estimation affichée avant de lancer est `updateEstimate()` (`settings.js`) ; le suivi par mois et par projet est
`trackCost()` (`growth.js`, stockage `STORAGE.COSTS`).

## Grille de relecture d'un code qui appelle un service

1. **Combien ?** Chaque appel payant a un coût estimable ; il est ajouté à `trackCost` au moment où il est dépensé.
2. **Annoncé ?** L'estimation (`updateEstimate`) le compte **avant** que l'utilisateur lance ; une option payante dit son
   prix dans son libellé.
3. **Évitable ?** Mémoire (cache `tts:`, IndexedDB), pas de double appel (double clic, nouvelle tentative qui recrée une
   scène déjà payée), bornes (`max_uses`, nombre de scènes, longueur de texte).
4. **Repli gratuit ?** Quota ElevenLabs épuisé → voix d'Agnes pour toute la vidéo ; Agnes Image refusée → méthode vidéo ;
   pas de clé Claude → plan automatique.
5. **Payant caché ?** Contrôle par l'IA (images envoyées à Claude), recherche web, transcription, nouvelles prises en
   arrière-plan (`refaire_scene` = nouvel appel Agnes) : toujours derrière un réglage explicite.

## Pour le chercheur

Tout outil proposé : prix exact **daté** et source, limites de l'offre gratuite, ce qui se passe au dépassement
(blocage ou facturation automatique), et comparaison avec le coût actuel ci-dessus. « Gratuit » sans source = non vérifié.
