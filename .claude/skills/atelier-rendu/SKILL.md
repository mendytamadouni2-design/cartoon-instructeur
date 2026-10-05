---
name: atelier-rendu
description: Cartoon Instructeur uniquement. Outils prêts à l'emploi pour rendre et mesurer les images de la vidéo dans le vrai navigateur de l'appli — harnais avant/après (dépôt et copie corrigée côte à côte), personnage simulé, vrai dessin du tableau blanc, mesures de chevauchement au pixel, calques des zones TikTok, planches étiquetées. À utiliser pour tout contrôle visuel.
---

# Atelier de rendu

Tout est dans `${CLAUDE_SKILL_DIR}/scripts/` :

| Fichier | Rôle |
|---|---|
| `harness.js` | `open({ avant, apres })` ouvre l'appli dans Chromium (WebGL actif, réseau coupé) : `pages.avant` sert le dépôt sur `https://app.test`, `pages.apres` une copie corrigée sur `https://apres.test` (variable `APRES`). `save(fichier, dataURL)` écrit un PNG. |
| `page-lib.js` | injecté dans chaque page : objet global `CK` (voir ci-dessous) |
| `copie-apres.sh /tmp/apres-x` | copie du dépôt (sans .git) pour essayer un correctif **sans toucher au vrai dépôt** |
| `exemple-planche.js` | exemple complet à copier : 3 autocollants au tableau blanc, mesures dans les étiquettes |

```bash
node ${CLAUDE_SKILL_DIR}/scripts/exemple-planche.js                     # dépôt seul
${CLAUDE_SKILL_DIR}/scripts/copie-apres.sh /tmp/apres-x                 # puis modifier /tmp/apres-x/js/…
APRES=/tmp/apres-x node ${CLAUDE_SKILL_DIR}/scripts/exemple-planche.js  # avant / après côte à côte
```

Écrire ses propres scripts dans `/tmp` en faisant `require('${CLAUDE_SKILL_DIR}/scripts/harness')` (chemin absolu).

## L'objet `CK` (dans la page)

- `await CK.prepDrawing()` : style tableau blanc, icônes chargées, vrai dessin (`CK.drawing`), personnage simulé (`CK.spr`, `CK.head`).
- `CK.board(W, H, type, texte, t)` : image complète du tableau blanc (personnage + dessin + note + sous-titres) et mesures
  `meas` : pixels de la note sur le dessin (`onDraw`), la tête (`onHead`), le corps, les sous-titres (`onCap`), l'interface
  TikTok (`onTikTok`), écarts en px, tailles de police réellement dessinées (`fonts`).
- `CK.overlay(canvas, zone)` : copie avec zones TikTok en rouge, zone sûre de l'appli en vert, zone donnée en bleu.
- `CK.cell(canvas, recadrage, largeur)` → PNG réduit ; `CK.compose(titre, sections)` → planche étiquetée (cases en rouge si `bad`).
- `CK.mk(W, H)` : canvas vide. `CK.puppet(g, W, H, sprite)` : personnage posé par le vrai `drawPuppet`.

## Méthode de mesure (la seule qui vaut preuve)

Chaque élément sur **son propre calque transparent**, masque `alpha > 60` (l'ombre au sol du personnage a alpha 46),
puis compter les pixels communs. Une impression visuelle ne suffit pas : un défaut se chiffre (« 11 675 px sur la tête »).

## Règles

- Une planche non ouverte avec Read n'a pas été contrôlée. Petits textes : recadrer à pleine résolution.
- Polices externes et emojis 3D ne sont pas chargés (réseau coupé) : ne pas juger leur absence ; le japonais, le chinois
  (IPAGothic, WenQuanYi), l'arabe (DejaVu) et les emojis couleur (Noto) s'affichent.
- Ne jamais modifier le vrai dépôt : les correctifs s'essaient dans la copie `apres`.
