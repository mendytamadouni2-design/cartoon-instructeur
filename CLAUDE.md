# Cartoon Instructeur — la bible du projet

À lire en entier avant toute action, par le chef comme par chaque membre de l'équipe.

## Le produit

- Appli web installable (PWA) en **JavaScript pur** : aucune compilation, aucune dépendance côté appli, scripts
  classiques chargés dans l'ordre par `index.html`. Publiée par **GitHub Pages** depuis `main`.
- Utilisée surtout sur **iPhone** (Safari, appli posée sur l'écran d'accueil) : mémoire limitée, l'appli peut être
  mise en pause dès qu'elle passe en arrière-plan, WebCodecs / WebGL / AudioContext ont des limites propres à iOS.
- But : fabriquer des vidéos pédagogiques animées, en priorité des **YouTube Shorts / TikTok** (vertical 9:16, < 60 s).
- `relais/cloudflare-worker.js` : serveur Cloudflare (Durable Objects), déployé automatiquement depuis `main`.
  Il génère les scènes en arrière-plan et reçoit les gros fichiers en morceaux.
- Services : **Agnes** (vidéo `agnes-video-v2.0`, image `agnes-image-2.1-flash`, apihub.agnes-ai.com), **Claude**
  (API Messages, `claude-opus-5-5`, recherche web), **ElevenLabs** (voix ; offre GRATUITE, chaque caractère compte),
  YouTube et TikTok.

## L'utilisateur

- Francophone, **non technicien**, sur iPhone. Toujours lui répondre en français simple, sans jargon.
- Décisions déjà prises (ne pas les rediscuter) : on garde Agnes (BytePlus refusé), ElevenLabs reste gratuit,
  recherche web acceptée, personnage stable « option A » (poses) maintenant, « option B » (vectoriel) plus tard.

## Règles non négociables

1. Publier (`git push origin HEAD:main`) **uniquement** quand l'utilisateur dit « mets à jour ».
   Sinon tout va sur la branche de travail de la session (jusqu'ici `claude/new-github-repository-saz83g`).
2. **Rien de payant** sans son accord explicite.
3. Toute nouveauté marche **dans tous les styles** (13 styles de `CARTOON_STYLES` dans `js/core.js`, dont
   `whiteboard` qui a ses propres chemins de code), avec et sans fond vert, et **dans tous les formats**
   (9:16, 16:9, 1:1, 4:5), en montage image par image (WebCodecs) comme en montage en temps réel.
4. **Jamais de clé API** dans le dépôt. Scan obligatoire avant chaque commit (voir « Contrôles avant envoi »).
5. Chaque version : nouvelle entrée **en tête** de `APP_VERSIONS` (`js/core.js`). Grosse mise à jour = X.0,
   petite = X.1, X.2… (dire à l'utilisateur si c'est majeur ou mineur). Changer le `?v=` de **tous** les scripts
   dans `index.html` et `CACHE` dans `sw.js`. Tout nouveau fichier JS est ajouté à `index.html` **et** à
   `APP_FILES` dans `sw.js`.
6. Commentaires YouTube montrés dans une vidéo : **uniquement de vrais commentaires**, jamais inventés.
7. Ne jamais désactiver, sauter ou affaiblir un test pour obtenir du vert. Un test rouge a une cause : on la trouve.
8. Textes de l'interface en français, tutoiement, ton simple et chaleureux. Textes dessinés **dans la vidéo**
   dans la langue de la vidéo (`state.language`) ; tout nouveau champ texte du plan de Claude est aussi ajouté à la
   version traduite (`buildLanguageVersion`, `js/studio.js`) et borné côté appli (le plan peut venir du serveur).

## Architecture

Tous les scripts partagent **les mêmes variables globales**. Conséquence critique : un `const`, `let` ou `class`
déclaré au premier niveau dans deux fichiers (ou en conflit avec une `function` du même nom) fait planter le
second fichier entier au chargement (« Identifier has already been declared ») et casse l'appli.

Ordre de chargement et rôle :

| Fichier | Rôle |
|---|---|
| `core.js` | état global `state`, clés de stockage `STORAGE`, `APP_VERSIONS`, `CARTOON_STYLES`, `shortsMode()`, `outputFormat()` |
| `motion.js` | moteur d'animation : courbes `EASE`, ressorts `spring()` / `SPRINGS`, entrées et sorties, texte, tracés |
| `voices.js` | ElevenLabs (voix, budget, cache `tts:*` en IndexedDB) et autres voix |
| `scenes.js` | script, prompts Agnes au format LTX, tâches vidéo, Agnes Image, `isWhiteboard()` |
| `claude.js` | `callClaude()`, mise en scène (`planSchema()`, `planRequestFor()`, `planScenesWithClaude()`), storyboard |
| `settings.js` | réglages mémorisés (`SETTINGS`), estimation des coûts, `accentColor()`, `captionFontFamily()` |
| `media.js` | dessins du tableau blanc, outils vidéo |
| `generation.js` | file d'attente Agnes, génération en arrière-plan ou sur le téléphone |
| `render.js` | export image par image (WebCodecs + MP4), horloge exacte |
| `montage.js` | montage final : `buildSegments()`, `assembleVideoCore()`, sous-titres, zooms, bulles |
| `exports.js` | exports, déroulé principal (`startGeneration`) |
| `studio.js` | éditeur de montage, aperçu, sauvegarde Cloudflare par morceaux |
| `growth.js` | assistant de script, accroches, SEO, TikTok |
| `navigation.js` | écrans, onglets, mise en route |
| `projects.js` | projets, publication, pilote automatique, commentaires YouTube |
| `integrations.js` | YouTube, Firebase, sauvegarde cloud, PWA |
| `compositor.js` | WebGL : incrustation fond vert, étalonnage, cadrage |
| `quality.js` | image de référence, contrôle par l'IA (`createQa`), contrôle des coupes |
| `graphics.js` | graphiques animés des plans illustrés |
| `transitions.js` | 30 transitions (14 WebGL issues de HyperFrames + 16 en 2D), choix de Claude |
| `stickers.js` | autocollants, carte « Suivre », styles de sous-titres, rythme serré (silences coupés) |
| `channel.js` | charte de la chaîne, mode objectif, images de l'utilisateur |
| `puppet.js` | personnage stable : casting de poses, marionnette animée, bouche calée sur la voix |
| `director.js` | brouillon animé, retouches en discutant, séries, miniatures |
| `init.js` | démarrage et branchement des boutons |

Autres : `index.html` (tout le HTML), `css/app.css`, `sw.js` (cache hors ligne), `data/` (icônes),
`docs/PLAN-8.0.md` (plan et décisions), `tools/` (scripts de reconstruction des données).

## Tests

```bash
cd tests && npm install --no-audit --no-fund          # une fois par machine (Playwright)
CHROMIUM_PATH=/opt/pw-browsers/chromium node tests/run-e2e.js                 # tout (≈ 15 min)
ONLY=styles|compositor|phone|background CHROMIUM_PATH=/opt/pw-browsers/chromium node tests/run-e2e.js
node tests/unit-motion.js                                                     # moteur d'animation (secondes)
```

- Ne jamais lancer `playwright install` (Chromium est déjà dans `/opt/pw-browsers`).
- Services simulés : aucune clé réelle, rien n'est facturé. Les tests s'exécutent depuis la racine du dépôt.
- Suite complète : la lancer en arrière-plan avec un journal et un marqueur de fin
  (`… > /tmp/e2e.log 2>&1; echo "EXIT $?" >> /tmp/e2e.log`), puis attendre le marqueur par tranches ≤ 9 min.
- La CI GitHub (`.github/workflows/tests.yml`) rejoue tout à chaque envoi.

## Contrôles avant envoi

Avant d'ajouter une fonction ou une constante globale, chercher si le nom existe déjà (`git grep -n "nom"`) et
réutiliser l'existant (`fitFont` dans `graphics.js`, `loadScriptOnce` dans `render.js`…).

```bash
for f in js/*.js sw.js; do node --check "$f" || echo "SYNTAXE $f"; done
cat js/*.js > /tmp/tout.js && node --check /tmp/tout.js     # échoue si un const/let/class existe en double
node --input-type=module --check < relais/cloudflare-worker.js
git grep -nIE 'sk-ant-[A-Za-z0-9_-]{20,}|sk_[a-f0-9]{32,}|sk-[A-Za-z0-9]{32,}|AIza[0-9A-Za-z_-]{30,}|gh[pousr]_[A-Za-z0-9]{30,}|xox[abp]-[A-Za-z0-9-]{10,}' -- . ':!tests/node_modules'
```

Le chef connaît en plus les débuts exacts des vraies clés de l'utilisateur et les cherche lui-même ; ils ne
doivent jamais être écrits dans le dépôt.

## L'équipe

Le chef (la session principale de Claude) dirige quatre sous-agents définis dans `.claude/agents/` :

| Agent | Quand | Ce qu'il rend |
|---|---|---|
| `testeur` | après chaque modification de code, avant tout envoi | verdict des tests, cause racine de chaque échec, correctif proposé |
| `controleur-visuel` | dès qu'un rendu, un texte ou un écran change | planches d'images regardées, défauts visibles classés, correctifs |
| `relecteur` | avant chaque « mets à jour », et sur toute modification délicate | défauts vérifiés et classés (bugs, sécurité, règles du projet) |
| `chercheur` | dès qu'une question porte sur un outil, une API, un prix, un projet externe | dossier sourcé : utile ou pas, licence, coût, effort, recommandation |

### Règles du chef (impitoyable)

1. **Une seule main sur le code** : seul le chef modifie l'appli. Les agents analysent, mesurent, prouvent et
   proposent des correctifs exacts ; ils n'écrivent que dans `/tmp`, dans leur dossier de mémoire
   `.claude/agent-memory/<nom>/`, et, pour le testeur sur demande explicite, dans `tests/`.
2. **Chaque mission a un ordre écrit** : objectif, périmètre (fichiers, commit), définition de « terminé »,
   format du rapport. Pas d'ordre vague, pas de rapport vague.
3. **Preuve ou rien** : chaque affirmation d'un rapport s'appuie sur une preuve (commande + sortie, `fichier:ligne`,
   capture regardée, source datée). « Ça devrait marcher », « probablement », « à vérifier » sans vérification
   = rapport refusé.
4. **Le chef revérifie** chaque constat avant d'agir ou d'en parler à l'utilisateur. Un faux positif ou un
   constat non prouvé coûte sa crédibilité à l'agent : le rapport est rejeté et la mission refaite avec la
   critique. Au deuxième échec, le chef fait le travail lui-même.
5. **Après chaque mission** : `git status` pour vérifier qu'aucun agent n'a touché au code ; toute modification
   non autorisée est annulée et signalée.
6. **Parallélisme** : le chercheur et le relecteur travaillent pendant que le chef code ; le testeur et le
   contrôleur visuel passent quand le code est fini ; le relecteur passe toujours avant « mets à jour ».
7. **Mémoire d'équipe** : les leçons utiles (pièges, durées, verdicts sur des outils) vont dans
   `.claude/agent-memory/<nom>/MEMORY.md`, courtes et à jour ; le chef les relit et les envoie avec le code.
