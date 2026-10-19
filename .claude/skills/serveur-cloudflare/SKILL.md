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
   Le serveur ne retrace pas les illustrations (8.8, pas de canvas) : le téléphone le fait pendant le suivi
   (`traceBackgroundDrawings`, cache IndexedDB `trace:`) puis au retour (`loadBackgroundResults`, 90 s au plus).
3. **Stockage des médias** : `PUT|GET|DELETE /media/:clé`, `GET /media-list?kind=final`. Blocs de `MEDIA_CHUNK` = 1,5 Mo ;
   envoi découpé `?upload=&part=&parts=` en morceaux de `MEDIA_PART` = 6 Mo, jusqu'à `MEDIA_MAX` = 600 Mo
   (Cloudflare refuse une requête de plus de 100 Mo : une vidéo finale de 2 min à 10 Mbit/s en fait ≈ 150).
4. **Publications programmées** `/schedule`, **TikTok** `/tiktok/*`, **Instagram** `/instagram/*`, adresse publique
   signée et temporaire `/pub/:clé?exp=…&sig=…` (6 h, pour Instagram).
5. **Boîte à vidéo pour Claude** (9.2) : `POST /boite/cle` (appli : empreinte SHA-256 de la clé, la première gagne,
   la changer demande l'ancienne → sinon 409), `PUT /boite` (appli + clé : `{ key, own, info }`, la vidéo est déjà dans
   le stockage), `GET /boite`, `GET /boite/video`, `DELETE /boite` (clé seule : Claude n'a pas d'en-tête Origin).
   Une seule vidéo : lien vers `final/<projet>` de la bibliothèque (`own: false`, jamais effacée par la boîte) ou
   copie propre `boite/derniere` (`own: true`, effacée quand la boîte change ou est vidée).

## Sécurité (à vérifier à chaque modification)

- **Origines** : seul `https://mendytamadouni2-design.github.io` (`ALLOWED_ORIGINS`) ; les tests ajoutent
  `https://app.test` dans une copie (`loadWorker`), jamais dans le vrai fichier.
- **Clés** (Agnes, Claude, ElevenLabs) gardées dans `storage 'secrets'` **seulement pendant la génération**, effacées
  à la fin (`storage.delete(['secrets', …])`) ; jamais renvoyées par `GET /jobs/:id`, jamais dans un journal.
- Relais : uniquement `https`, uniquement vidéo / image / audio ; pas un proxy ouvert vers n'importe quelle adresse.
- Projets effacés au bout de `JOB_MAX_AGE_MS` = 3 jours (`deleteAll`).
- Boîte : seule l'empreinte de la clé est gardée ; lecture et vidage sans Origin **uniquement** avec la clé ; dépôt et
  liaison réservés à l'origine de l'appli. ⚠️ Le reste (`/media`, `/media-list`…) ne dépend que de l'en-tête Origin,
  qu'un programme peut imiter : protection faible, à renforcer (clé d'appareil) — proposé à l'utilisateur le 19/10/2026.
- Envoi découpé : identifiant d'envoi validé (`/^[a-z0-9]{6,32}$/`), numéros de morceau bornés, incohérence → 409.

## Pièges

- **Pas de normalisation du plan** : `mergePlan` garde les champs de Claude tels quels (`...s`) — l'appli doit borner à
  l'usage tout champ lu au montage (voir la skill `prompts-de-l-appli`).
- Erreur 400 d'Agnes avec réglages avancés → renvoyer la demande simple (`agnesVideoBody`, comme `createVideoTask`).
- Le Durable Object peut être réveillé n'importe quand (`alarm`) : tout état utile est dans `storage`, rien en mémoire.
- Tests : groupe `ONLY=background` (Durable Objects simulés en mémoire, délais raccourcis avec `loadWorker(true)`).
- Vérifier la syntaxe : `node --input-type=module --check < relais/cloudflare-worker.js`.
