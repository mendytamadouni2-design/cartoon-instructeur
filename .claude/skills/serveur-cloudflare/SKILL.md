---
name: serveur-cloudflare
description: Cartoon Instructeur uniquement. Fonctionnement et limites du serveur Cloudflare de l'appli (relais/cloudflare-worker.js) — relais de téléchargement, génération en arrière-plan (Durable Object VideoJob), stockage des médias par morceaux, notifications, TikTok/Instagram, sécurité des clés et des origines, déploiement. À utiliser pour relire ou modifier le serveur ou ce qui lui parle (generation.js, studio.js).
---

# Serveur Cloudflare (`relais/cloudflare-worker.js`)

Déployé **automatiquement depuis `main`** (`wrangler.jsonc` : Durable Object `JOBS` → classe `VideoJob`). Un envoi sur
`main` met donc aussi le serveur en production : même règle « mets à jour » que l'appli.

## Ce qu'il fait

1. **Relais** `GET /?url=…` : récupère une vidéo Agnes (CORS bloqué pour le navigateur), ne stocke rien.
2. **Génération en arrière-plan** : `POST /jobs` → `{ jobId }` ; `GET /jobs/:id` (avancement, **jamais les clés**) ;
   `POST /jobs/:id/cancel`. Le Durable Object fait la mise en scène Claude (`plan` → `mergePlan`), les dessins, crée
   les scènes Agnes (une toutes les `CREATE_INTERVAL_MS = 62000` ms, travail toutes les `TICK_MS = 8000` ms, scène
   abandonnée après `SCENE_TIMEOUT_MS` = 25 min), puis notifie le téléphone (Web Push, `/push/key`).
3. **Stockage des médias** : `PUT|GET|DELETE /media/:clé`, `GET /media-list?kind=final`. Blocs de `MEDIA_CHUNK` = 1,5 Mo ;
   envoi découpé `?upload=&part=&parts=` en morceaux de `MEDIA_PART` = 6 Mo, jusqu'à `MEDIA_MAX` = 600 Mo
   (Cloudflare refuse une requête de plus de 100 Mo : une vidéo finale de 2 min à 10 Mbit/s en fait ≈ 150).
4. **Publications programmées** `/schedule`, **TikTok** `/tiktok/*`, **Instagram** `/instagram/*`, adresse publique
   signée et temporaire `/pub/:clé?exp=…&sig=…` (6 h, pour Instagram).

## Sécurité (à vérifier à chaque modification)

- **Origines** : seul `https://mendytamadouni2-design.github.io` (`ALLOWED_ORIGINS`) ; les tests ajoutent
  `https://app.test` dans une copie (`loadWorker`), jamais dans le vrai fichier.
- **Clés** (Agnes, Claude, ElevenLabs) gardées dans `storage 'secrets'` **seulement pendant la génération**, effacées
  à la fin (`storage.delete(['secrets', …])`) ; jamais renvoyées par `GET /jobs/:id`, jamais dans un journal.
- Relais : uniquement `https`, uniquement vidéo / image / audio ; pas un proxy ouvert vers n'importe quelle adresse.
- Projets effacés au bout de `JOB_MAX_AGE_MS` = 3 jours (`deleteAll`).
- Envoi découpé : identifiant d'envoi validé (`/^[a-z0-9]{6,32}$/`), numéros de morceau bornés, incohérence → 409.

## Pièges

- **Pas de normalisation du plan** : `mergePlan` garde les champs de Claude tels quels (`...s`) — l'appli doit borner à
  l'usage tout champ lu au montage (voir la skill `prompts-de-l-appli`).
- Erreur 400 d'Agnes avec réglages avancés → renvoyer la demande simple (`agnesVideoBody`, comme `createVideoTask`).
- Le Durable Object peut être réveillé n'importe quand (`alarm`) : tout état utile est dans `storage`, rien en mémoire.
- Tests : groupe `ONLY=background` (Durable Objects simulés en mémoire, délais raccourcis avec `loadWorker(true)`).
- Vérifier la syntaxe : `node --input-type=module --check < relais/cloudflare-worker.js`.
