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
| Agnes image | 0 € (gratuit à la date de la 8.2) | — |
| ElevenLabs voix | offre gratuite : 10 000 caractères / mois ; prix indicatif `ELEVENLABS_PRICE_1K = 0.2` € / 1 000 car. | `addElevenUsage`, `trackCost('elevenlabs', …)` (`voices.js`) |
| ElevenLabs transcription | consomme aussi le compte ElevenLabs | `transcribeWords` (`montage.js`), seulement si la synchro au mot est activée |
| Claude | `CLAUDE_PRICES` (€ par million de jetons, entrée / sortie) : opus-5-5 `[4, 20]`, opus-5 `[5, 25]`, sonnet-5 `[2, 10]`, haiku-4-5 `[1, 5]` ; relecture du cache ≈ 5 % | `trackClaudeUsage` (`claude.js`) |
| Recherche web de Claude | ≈ 0,0093 € par recherche (`max_uses` borne le nombre) | `trackClaudeUsage` |
| Cloudflare (serveur) | offre gratuite ; projets effacés après 3 jours | — |

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
