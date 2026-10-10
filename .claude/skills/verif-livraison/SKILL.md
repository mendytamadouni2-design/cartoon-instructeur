---
name: verif-livraison
description: Cartoon Instructeur uniquement. Contrôles statiques en une commande (syntaxe, noms globaux en double, clés API, cohérence ?v= / APP_FILES / version / cache, moteur d'animation). À lancer après chaque modification du code et avant tout envoi ; avec --livraison avant un « mets à jour ».
---

# Vérification avant envoi

```bash
${CLAUDE_SKILL_DIR}/scripts/verif.sh                 # après chaque modification (quelques secondes)
${CLAUDE_SKILL_DIR}/scripts/verif.sh --livraison     # avant « mets à jour » : compare aussi avec origin/main
```

Le dépôt est trouvé tout seul (`/home/user/*/js/montage.js`) ; sinon le passer en dernier argument.
Code de sortie 0 = vert, 1 = au moins un ÉCHEC. Chaque ligne commence par `OK`, `ÉCHEC` ou `ATTENTION`.

## Ce que vérifie chaque ligne, et quoi faire en cas d'échec

| Ligne | Pourquoi c'est grave | Réparer |
|---|---|---|
| syntaxe | un fichier qui ne se lit pas = un écran de l'appli mort | `node --check js/<fichier>.js` donne la ligne |
| const/let/class en double | les scripts partagent les mêmes variables : le 2e fichier ne se charge plus, l'appli entière casse | renommer, ou mieux **réutiliser l'existant** (`git grep -n "nom"`) |
| nom global déclaré deux fois (ATTENTION) | une `function` en double écrase la première sans bruit (ex. ancien `loadScript`) | garder une seule définition |
| clé API | une clé publiée = facture pour l'utilisateur | retirer la clé, ne jamais la recopier dans un rapport |
| un seul ?v= / APP_FILES | sinon l'iPhone garde de vieux fichiers en cache ou un nouveau fichier manque hors ligne | même `?v=` partout ; tout `js/*.js` chargé dans `index.html` ET listé dans `APP_FILES` |
| `--livraison` : CACHE, APP_VERSIONS, ?v= | sans eux, l'utilisateur ne reçoit pas la mise à jour | `CACHE` +1 dans `sw.js`, nouvelle entrée **en tête** d'`APP_VERSIONS`, nouveau `?v=` |
| moteur d'animation | courbes et ressorts faux = toutes les animations faussées | `node tests/unit-motion.js` |

Il vérifie aussi que les copies de l'équipe dans le dépôt ECC (`/home/user/ECC/.claude/agents` et `skills`, ou
`ECC_DIR`) sont identiques : échec tant qu'elles ne sont pas recopiées.

Ce script ne remplace pas les tests de bout en bout (`tests/run-e2e.js`, ≈ 15 min) : il passe avant eux.
