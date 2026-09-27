# cartoon-instructeur
Application pour faire des vidéos cartoon pédagogiques (iPhone, en ligne sur GitHub Pages).

## En bref
- **`index.html`** : la page de l'appli (écrans) ; **`css/app.css`** : le style ; **`js/`** : le code, un fichier par partie (chargés dans l'ordre).
- **`sw.js`** : service worker (ouverture même avec un réseau faible, notifications).
- **`relais/cloudflare-worker.js`** : le serveur Cloudflare (relais de téléchargement des scènes, génération en arrière-plan, séries, sauvegarde des scènes et vidéos, notifications). Il est déployé automatiquement par Cloudflare à partir de `wrangler.jsonc`.
- **`tests/`** : tests de bout en bout avec services simulés (voir `tests/README.md`).

## Fonctionnement
1. Script → **storyboard** préparé par Claude (mise en scène, dessins, zooms, parties), modifiable avant de payer quoi que ce soit.
2. **Scènes** générées par Agnes, sur le téléphone ou **en arrière-plan** sur Cloudflare (téléphone éteint, notification à la fin).
3. **Montage** sur le téléphone : musique continue avec ducking, blancs coupés, voix égalisées ou voix ElevenLabs calée sur les lèvres, bruitages, sous-titres et dessins calés au mot, plans « tableau seul », chiffres en grand, intro / parties / fin, logo, export 1080p en 16:9, 9:16 ou 1:1. Couleurs harmonisées entre les scènes, option **fond vert** (décor fixe posé par l'appli, personnage recalé d'une scène à l'autre), graphiques animés (compteurs, barres, listes, comparaisons) dans les plans illustrés. Si l'appli passe en arrière-plan, le montage se met en pause et reprend au retour.
4. **Diffusion** : miniature, SEO, publication YouTube complète (sous-titres, chapitres, miniature).

Les clés API restent sur le téléphone : elles ne sont jamais écrites dans ce dépôt.
