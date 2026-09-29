# Plan de la version 8.0 (grosse mise à jour)

Document de travail : ce qui a été décidé pour la 8.0, à relire avant de commencer.
Règles qui s'appliquent à tout : valable pour **tous les styles**, rien de payant sans
l'accord explicite de l'utilisateur, aucune clé API dans le dépôt.

---

## Avant la 8.0 : version 7.2 (petite mise à jour)

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

## Décisions en attente (utilisateur)
1. Personnage : option A (poses), B (vectoriel) ou les deux selon le style (recommandé : les deux).
2. ElevenLabs : rester en gratuit avec compteur, ou abonnement.
3. Outil d'images payant si Agnes ne suffit pas pour les poses.
4. Recherche internet pour le mode « objectif » (quelques centimes par vidéo).
5. Cible principale : YouTube long, Shorts/TikTok, ou les deux.
