# Mémoire du contrôleur visuel

## Recettes de rendu
- Chromium : `executablePath: '/opt/pw-browsers/chromium'`, `args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader']` pour que WebGL marche (transitions).
- Une planche de cases 540×960 réduites à 180×320 reste lisible avec Read ; recadrer à pleine taille pour les petits textes.
- Planches lisibles : ≤ 1450 px de large, cases de 300 à 350 px, étiquettes avec les tailles mesurées (px) ; arabe dans une étiquette : isoler avec U+2068 … U+2069.
- Avant / après dans le même navigateur : router `https://app.test/**` vers le dépôt et `https://apres.test/**` vers une copie corrigée dans /tmp (tar sans .git ni tests/node_modules).
- Mesurer un chevauchement : chaque calque (personnage, tête seule, dessin, autocollant, sous-titres) sur son propre canvas transparent, masques alpha > 60 (l'ombre au sol de drawPuppet a alpha 46), puis compter les pixels communs.
- Personnage stable simulé : `drawPuppet(g, W, H, { sprite: { closed: canvas }, t: 3, wb: true })` avec un faux sprite 360×1000 (tête 27 %, 2 % de marge en haut comme loadPuppetSprites).
- Vrai dessin du tableau blanc : `state.selectedStyle='whiteboard'; await loadIcons(); compileDrawing(layoutDrawing({ link:'arrow', elements:[{ label, word:'', icon:'bug', paths:[] }, …] }))` puis `drawSketch(g, area, d, 1, 1)`.
- Polices du conteneur : japonais/chinois (IPAGothic, WenQuanYi), arabe (DejaVu), emojis (Noto Color Emoji) s'affichent ; MARKER_FONT retombe sur une police sans empattement (ne pas juger la police).
- Fonctions de dessin utiles (globales) : `drawSticker(ctx,W,H,type,texte,t,reste)`, `boardNoteLayout(ctx,area,type|'bubble',texte,dessin?)` (→ `{lines, fs, top, draw}`), `drawBoardSticker(ctx,area,type,texte,t,reste,W,H,layout)`, `drawBoardLabel(ctx,area,layout,p)`, `wrapText`, `boardInk`, `drawFollowCard(ctx,W,H,t,avatar)`, `drawWordCaptions(g,W,H,captionGroups(mots),t)`, `drawStyledCaptions(ctx,W,H,{words},t,style)`, `renderTransition(nom,ctx,A,B,p,W,H)`, `drawHookTitle`, `drawHighlight`, `drawBubble`, `drawBoardShot`, `drawPuppet`, `puppetDrawingArea(W,H)`.

## Valeurs validées
- Zone sûre 9:16 de l'appli (`safeZone`, si H/W > 1,3) : centre x 0,44 W, largeur max 0,76 W, sous-titres à 0,66 H, haut à 0,10 H.
- Sous-titres « mots » : police 0,085 × min(W,H) ; tableau blanc hors zone sûre (16:9, 1:1) : centre 0,84 H, haut ≈ 0,80 H.
- Accroche 0,11 ; autocollants en haut de la zone sûre ; la bulle est retirée quand un autocollant est présent.
- puppetDrawingArea 9:16 = { 0,08 W, 0,10 H, 0,78 W, 0,34 H } : son bas (0,44 H) est EXACTEMENT le haut de la tête du personnage stable (hauteur 0,5 H, pieds 0,94 H). 16:9 = { 0,42 W, 0,08 H, 0,54 W, 0,62 H } : bas 0,70 H, 105 px au-dessus des sous-titres. Rien ne peut s'écrire sous cette zone.
- Dessin du tableau blanc : case 400 × 300 centrée dans sa zone, mots-clés à y = 250 (≤ 34) → l'encre finit à 90 % de la case.
- Carte « Suivre » (8.4) : 0,5 H en vertical, hauteur 0,22 × min(W,H), bouton 26 px en 1080.

## Défauts récurrents de l'appli (à chercher à chaque contrôle)
- `wrapLines` (montage.js) ne coupe qu'aux espaces : japonais / chinois jamais coupés → débordent, ou rapetissent via fitFont.
- `wrapLines(...).slice(0, n)` : supprime la fin du texte sans le dire (8.5 : « par jour » perdu).
- `accentColor()` par défaut #ffd23f (et préréglage « enfant » #ffb800) : illisible sur blanc (1,4:1) → tableau blanc, fonds clairs.
- Éléments centrés sur W/2 au lieu de `safeZone().cx` : passent sous la colonne de boutons TikTok (x > 0,83 W).
- Corrigé en 8.4 : sous-titres « néon » illisibles sur fond clair ; badge trop petit (rayon 0,15 × min(W,H)).
- Corrigé en 8.5 (mission n° 1, correctif du contrôleur appliqué par le chef) : notes du tableau blanc dans la zone du
  dessin (`boardNoteLayout`, aussi pour la bulle de mots-clés), `wrapText` pour le japonais/chinois, `boardInk` pour le
  feutre, carte « Suivre » centrée sur la zone sûre et équilibrée verticalement.
