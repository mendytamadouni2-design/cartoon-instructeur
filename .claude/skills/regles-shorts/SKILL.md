---
name: regles-shorts
description: Cartoon Instructeur uniquement. Grille de jugement chiffrée des vidéos courtes (YouTube Shorts, TikTok, Reels) — zones cachées par l'interface, tailles de texte, durées de lecture, rythme des animations, un seul point d'attention, typographie française, contraste. À utiliser pour juger ou concevoir tout ce qui s'affiche dans la vidéo.
---

# Règles des vidéos courtes (format principal : 1080 × 1920, 9:16, moins de 60 s)

## Zones cachées par l'interface (en fraction de la largeur W et de la hauteur H)

| Zone | Où | Ce qui s'y trouve |
|---|---|---|
| Colonne de droite | x > 0,83 W, y de 0,35 H à 0,87 H | boutons j'aime, commentaires, partage, profil |
| Bande du bas | y > 0,80 H | description, musique, pseudo |
| Bande du haut | y < 0,08 H | onglets « Abonnements / Pour toi », recherche |

Rien d'important dans ces zones : texte, visage, chiffre clé, bouton « Suivre ».

## Zone sûre de l'appli (`safeZone()`, `js/montage.js`, active si H/W > 1,3)

Centre horizontal **0,44 W** (pas 0,5 W : on s'éloigne de la colonne de droite), largeur utile **0,76 W**, sous-titres
à **0,66 H**, haut utile **0,10 H**. Tout élément centré doit l'être sur `safeZone().cx`, jamais sur `W / 2`.

## Tailles (sur 1080 de large)

- Texte principal ≥ **4 % de la largeur** (≈ 45 px) ; mentions secondaires ≥ 3 % (≈ 32 px).
- Sous-titres « mots » : 0,085 × min(W,H) (≈ 92 px) ; accroche : 0,11 ; chiffre en grand : 0,16.
- Boutons de l'interface de l'appli : au moins 44 px de haut (doigt).

## Temps

- Entrée d'un élément : 0,15 à 0,4 s (ressort `SPRINGS.bouncy` ou `natural`), sortie ≈ 0,25 s, jamais de clignotement.
- Lecture : ≈ 0,3 s par mot + 0,5 s ; un groupe de sous-titres de 3 mots reste au moins ≈ 1 s.
- Accroche lisible dans les **2 premières secondes** ; recadrage (punch-in) toutes les 2 à 3 s pour garder l'attention.
- Transitions : 0,4 à 0,8 s ; rien d'important (bulle, chiffre, autocollant) pendant une transition.

## Composition

- **Un seul point d'attention à la fois** : accroche, bulle, chiffre en grand, autocollant et image perso ne se
  superposent pas et ne se disputent pas l'œil (l'autocollant remplace la bulle).
- Tableau blanc : sous la zone du dessin il y a la tête du personnage (9:16) ou les sous-titres (16:9) → toute note
  s'écrit **dans** la zone du dessin (`boardNoteLayout`).
- Fin de Short : la dernière image doit pouvoir boucler ; la carte « Suivre » arrive sur le **dernier segment joué**.

## Lisibilité

- Contraste du texte ≥ 4,5:1 (ou contour / ombre / plaque) sur fond clair ET sur fond chargé.
- Couleur de chaîne claire (jaune `#ffd23f`, `#ffb800`) illisible sur blanc (1,4:1) → `boardInk()` ou contour sombre.
- Typographie française : espace insécable avant ? ! : ; et à l'intérieur des « » ; jamais un mot ou une ponctuation
  seul sur une ligne ; ne jamais couper un texte (pas de `slice` sur des lignes) : réduire la police à la place.
- Japonais / chinois : pas d'espaces → couper entre deux caractères (`wrapText`), arabe : sens de lecture droite-gauche.
