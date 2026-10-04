# Mémoire du contrôleur visuel

## Recettes de rendu
- Chromium : `executablePath: '/opt/pw-browsers/chromium'`, `args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader']` pour que WebGL marche (transitions).
- Une planche de cases 540×960 réduites à 180×320 reste lisible avec Read ; recadrer à pleine taille pour les petits textes.
- Fonctions de dessin utiles (globales) : `drawSticker(ctx,W,H,type,texte,t,reste)`, `drawFollowCard(ctx,W,H,t,avatar)`, `drawStyledCaptions(ctx,W,H,{words},t,style)`, `renderTransition(nom,ctx,A,B,p,W,H)`, `drawHookTitle`, `drawHighlight`, `drawBubble`, `drawBoardShot`, `drawPuppet`.

## Valeurs validées (8.4)
- Zone sûre 9:16 de l'appli (`safeZone`, si H/W > 1,3) : centre x 0,44 W, largeur max 0,76 W, sous-titres à 0,66 H, haut à 0,10 H.
- Sous-titres « mots » : police 0,085 × min(W,H) ; accroche 0,11 ; autocollants en haut de la zone sûre ; la bulle est retirée quand un autocollant est présent ; carte « Suivre » à 0,5 H en vertical.
- Corrigé en 8.4 : sous-titres « néon » illisibles sur fond clair (contour sombre ajouté) ; badge trop petit (rayon 0,15 × min(W,H)).
