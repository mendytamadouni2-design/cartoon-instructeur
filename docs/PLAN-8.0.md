# Plan de la version 8.0 (grosse mise à jour)

Document de travail : ce qui a été décidé pour la 8.0, à relire avant de commencer.
Règles qui s'appliquent à tout : valable pour **tous les styles**, rien de payant sans
l'accord explicite de l'utilisateur, aucune clé API dans le dépôt.

---

## Avant la 8.0 : version 7.2 (petite mise à jour) — faite le 29/09

Corrections issues du journal du test du 28–29/09 :

1. **Sauvegarde Cloudflare des grosses vidéos** (« Load failed ») : envoi en plusieurs
   morceaux (la limite d'envoi du Worker gratuit est d'environ 100 Mo).
   Fichiers : `js/projects.js` (`projectFinalReady`), `uploadMedia`, `relais/cloudflare-worker.js`.
2. **Double appui sur Partager** (« share() is already in progress ») : bloquer le bouton
   tant que la feuille de partage est ouverte. Fichier : `js/exports.js` (`saveBlob`).
3. **« Script error. » en rafale** (erreurs extérieures sans fichier ni ligne) : n'en noter
   qu'une seule dans le journal. Fichier : `js/core.js` (écouteur `error`).
4. Vérifier le **son de l'aperçu** en mode silencieux (à confirmer au prochain test).

---

## Socle de la 8.0

### S1. Personnage qui ne peut plus changer
- **Casting une seule fois** : bibliothèque de 8 à 12 poses du personnage sur fond vert
  (debout, montre du doigt, réfléchit, content, surpris, marche…), vérifiées avec la fiche
  du personnage puis validées par l'utilisateur ; réutilisées dans tous les projets.
- L'IA vidéo ne fabrique plus que les **décors sans personnage** ; l'appli pose le
  personnage par-dessus (incrustation WebGL existante, `js/compositor.js`).
- Animation par l'appli (moteur `js/motion.js`) : respiration, rebonds, entrées/sorties,
  clignements.
- **Bouche synchronisée** avec la voix (horodatage des mots ElevenLabs → formes de bouche).
- Option B pour les styles dessinés (tableau blanc, craie, plat) : personnage redessiné en
  vectoriel par Claude, animé membre par membre.
- ⚠️ Génération des poses : vérifier si Agnes le fait ; sinon outil d'images payant →
  **demander à l'utilisateur**.

### S2. Voix sous contrôle
- Compteur ElevenLabs visible (caractères restants du mois).
- Avertissement avant lancement si le quota ne suffit pas (raccourcir / voix Agnes).
- Aucune voix payée deux fois : réutiliser l'audio déjà généré lors d'une nouvelle prise.
- Raccourcissement du script proposé par Claude.

### S3. Plus rapide
- Réutilisation des décors quand deux scènes ont le même lieu (mouvement de caméra différent).
- Scènes « schéma » (graphiques, listes, comparaisons, frises) faites entièrement par l'appli.
- Estimation du temps avant de lancer + notification quand c'est prêt.

---

## Fonctions vitrines de la 8.0

### V1. Animatique : voir la vidéo avant de la fabriquer
Version brouillon complète en moins d'une minute (vraie voix, poses, schémas, textes, rythme ;
décors en images fixes). L'utilisateur corrige, puis lance la vraie fabrication.

### V2. Modifier la vidéo finie sans tout refaire
- Modifier le texte = modifier la vidéo (seule la phrase changée est refaite).
- Remplacer une scène, changer l'ordre, régler les pauses entre les scènes.
- **Retouches en discutant** (idée Motion) : case « Dis-moi ce que tu veux changer » sous la
  vidéo (« plus court », « plus dynamique », « change le style ») ; Claude ne refait que le
  nécessaire puis remonte.

### V3. Une vidéo, plusieurs publications
- Shorts automatiques : les 2–3 meilleurs passages en 9:16 avec sous-titres et accroche.
- Miniature YouTube automatique (personnage en pose expressive + texte + couleur de marque),
  plusieurs versions au choix.
- **Nouveaux formats 1:1 et 4:5** (idée Motion) pour Instagram / Facebook.

---

## Idées reprises de Motion (toutes dans la 8.0)

1. **Charte graphique de la chaîne** : fiche « Ma chaîne » (couleurs, polices, style
   d'animation, ton) relue par Claude à chaque vidéo + chartes toutes faites (sobre,
   énergique, enfant, corporate…). Sert de base aux « séries ».
2. **« Fais comme cette vidéo »** : 3–4 captures d'écran d'une vidéo modèle, analysées par
   Claude (rythme, couleurs, affichage des textes) pour inspirer le style.
3. **Mode « objectif »** : l'utilisateur donne objectif, public, ton, durée ; Claude écrit le
   script. Option recherche internet (outil de recherche web de l'API Claude : quelques
   centimes par vidéo → **demander avant d'activer**).
4. **Retouches en discutant** → voir V2.
5. **Questions quand c'est flou** : 2–3 questions de Claude avant le script si le sujet est vague.
6. **Tes images dans la vidéo** : logo, captures d'écran, photos placées au bon moment avec
   animations (zoom, apparition, surlignage).
7. **Formats 1:1 et 4:5** → voir V3.

Motion lui-même (service payant, ~2,50 à 5 $ par vidéo) n'est **pas** intégré à l'appli ;
un test de comparaison à 5 $ reste possible si l'utilisateur le demande.

---

## Après la 8.0 (8.1, 8.2, 8.3…)
- Traduction en un clic (voix, sous-titres, bouche qui suit la nouvelle langue).
- Plusieurs personnages qui dialoguent.
- Séries (personnage, générique, musique, couleurs repris à chaque épisode).
- Moments interactifs (question au spectateur, récap animé, quiz pour la description).
- Partir d'un document (PDF, cours, page web).
- Statistiques YouTube : repérer où les spectateurs décrochent et en tirer des leçons.

---

## Décisions prises (29/09)
1. **Personnage** : recommandation retenue → option A (poses fabriquées **avec Agnes**) pour
   tous les styles dès la 8.0 ; option B (vectoriel) plus tard en 8.x pour les styles dessinés.
   Méthode : comme `createReference()` (`js/quality.js`) — une courte vidéo Agnes par pose sur
   fond vert, meilleure image extraite, vérifiée par Claude avec la fiche du personnage, nouvel
   essai si ratée, validation par l'utilisateur. Les clips eux-mêmes (3–5 s) peuvent servir de
   « gestes » animés incrustés. S'appuie sur le kit de poses existant (`state.poses`).
2. **ElevenLabs** : on reste en **gratuit** (10 000 caractères/mois) → compteur + économies (S2).
3. **Outil d'images** : on garde **Agnes**. Se renseigner seulement sur les alternatives
   (ordre de grandeur : quelques centimes par image) sans rien intégrer.
4. **Recherche internet** pour le mode « objectif » : **acceptée**.
5. **Cible principale : YouTube Shorts et TikTok** (vertical).

## Conséquences de la cible Shorts/TikTok (prioritaires dans la 8.0)
- **Vertical 9:16 par défaut**, durée 30–60 s ; 16:9 reste disponible.
- **Accroche dans les 2 premières secondes** (question, chiffre choc, promesse), écrite par Claude
  et vérifiée à part.
- **Rythme rapide** : changement de plan toutes les 2–3 s (zoom, coupe, schéma, pose).
- **Gros sous-titres mot par mot** placés dans la zone sûre (hors boutons TikTok/Shorts).
- **Fin en boucle** : la dernière phrase relance la première pour faire revoir la vidéo.
- **Un sujet → une série de 3 à 5 Shorts** (au lieu d'extraire des Shorts d'une vidéo longue).
- Quota voix : un Short ≈ 700–900 caractères → **environ 10 à 14 Shorts par mois** en gratuit.
- Moins de scènes par vidéo → moins d'attente Agnes et moins de nouvelles prises.
- Formats 1:1 et 4:5 : gardés mais secondaires.

---

## État au 29/09 (soir) : 8.0 codée sur la branche de travail

| Partie | Fichiers | Fait |
|---|---|---|
| Voix sous contrôle | `js/voices.js` (budget, cache `tts:*`), `js/montage.js`, `js/exports.js` | compteur, mémoire des phrases, quota épuisé, estimation + raccourcir / voix Agnes, jamais 2 voix |
| Shorts / TikTok | `js/core.js` (`shortsMode`, `outputFormat`), `js/montage.js` (accroche, punch-in, cartons), `js/growth.js` (SHORT_RULES) | vertical par défaut, accroche 2 s, recadrage 2-3 s, fin en boucle, 4:5 et 1:1 |
| Charte, style modèle, objectif, images | `js/channel.js`, `js/claude.js` (web_search + pause_turn) | toutes les idées Motion 1, 2, 3, 5, 6 |
| Personnage stable | `js/puppet.js`, `js/montage.js` | casting 7 poses (fermée / mi / ouverte), vérif Claude, validation, marionnette animée, bouche sur la voix, montage sans Agnes avec ElevenLabs |
| Réalisation | `js/director.js` | brouillon animé, retouches en discutant (idée Motion 4), sujet → série de Shorts, 3 miniatures |

Reste pour 8.x : option B (personnage vectoriel), réutilisation des décors Agnes entre scènes,
estimation du temps + notification, puis la liste « Après la 8.0 ».
