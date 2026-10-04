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
5. **Motion design** (`js/motion.js`, `js/graphics.js`) : moteur d'animation maison (courbes de Bézier et de Penner, ressorts physiques, décalages, textes révélés par masque, morphing de tracés), 1 648 icônes Lucide (licence ISC, `data/icons.json`, reconstruit par `tools/build-icons.js`), icônes 3D modernes pour les styles colorés (Fluent Emoji de Microsoft, licence MIT, index `data/emoji3d.json` reconstruit par `tools/build-emoji3d.py`, images chargées à la demande), plans illustrés animés : compteur, barres, liste, comparaison, frise chronologique, chaîne cause → conséquence, avant / après.
6. **Habillage façon TikTok** (`js/transitions.js`, `js/stickers.js`) : 30 transitions choisies par Claude à chaque raccord (dont 14 shaders WebGL repris de [HyperFrames](https://github.com/heygen-com/hyperframes), HeyGen, licence Apache 2.0), autocollants animés (flèche, mot entouré, « Le savais-tu ? », validé, faux, badge, confettis), carte « Suivre » TikTok / Instagram, 7 styles de sous-titres en plus, rythme serré et contrôle de chaque coupe (idées de [video-use](https://github.com/browser-use/video-use), Browser Use).
6. **Montage image par image** (`js/render.js`, WebCodecs) : chaque image est calculée puis encodée (H.264, sinon VP9), le son est mixé hors temps réel puis encodé (AAC, sinon Opus), le tout rangé dans un MP4 (mp4-muxer, MIT ; démultiplexage mp4box.js, BSD). Repli automatique sur l'enregistrement en temps réel si l'appareil ne le permet pas.
4. **Diffusion** : miniature, SEO, publication YouTube complète (sous-titres, chapitres, miniature).

Les clés API restent sur le téléphone : elles ne sont jamais écrites dans ce dépôt.
