# Tests de Cartoon Instructeur

Tests de bout en bout dans un vrai navigateur (Chromium, via Playwright).
Agnes, Claude, ElevenLabs et le serveur Cloudflare sont **simulés** : aucune clé
réelle n'est utilisée et rien n'est facturé.

```bash
cd tests
npm install
npx playwright install chromium   # ou CHROMIUM_PATH=/chemin/vers/chrome
npm test
```

Ce qui est vérifié :

1. **Montage complet sur le téléphone** : storyboard (modification puis validation),
   poses, voix ElevenLabs calée sur les lèvres, blancs coupés, musique continue,
   sous-titres calés au mot, plan « tableau seul », chiffre en grand, intro / titre
   de partie / fin, version carrée, journal sans clé, réglages mémorisés.
2. **Génération en arrière-plan** : envoi au serveur (Durable Object simulé),
   fermeture de l'appli, réouverture, bouton « Terminer la vidéo », effacement des
   clés côté serveur.
