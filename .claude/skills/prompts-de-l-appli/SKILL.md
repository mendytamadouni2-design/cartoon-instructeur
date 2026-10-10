---
name: prompts-de-l-appli
description: Cartoon Instructeur uniquement. Règles des consignes que l'appli envoie à Claude (callClaude, schémas JSON, mise en scène, normalisation, traduction, recherche web) et à Agnes (consigne LTX, consigne négative). À utiliser pour écrire, modifier ou relire toute consigne ou tout champ du plan de Claude.
---

# Consignes de l'appli (Claude et Agnes)

## Appeler Claude : `callClaude({ system, prompt, schema, maxTokens, images, effort, webSearch })` (`js/claude.js`)

- Modèle par défaut `claude-opus-5-5` (`getClaudeModel()`), appel direct depuis le navigateur
  (`anthropic-dangerous-direct-browser-access`), `system` mis en cache (`cache_control: ephemeral`).
- `schema` → `output_config.format = { type: 'json_schema', schema }` : la réponse respecte **exactement** le schéma
  (enums compris). Chaque objet : `required` complet et `additionalProperties: false`.
- `effort` : `low` petits textes, `medium` courant, `high` ce qui compte le plus (mise en scène).
- `webSearch: n` → outil `web_search_20260209` avec `max_uses: n` (≈ 0,0093 € par recherche) ; boucle `pause_turn`
  (4 tours max) déjà gérée.
- Erreurs traduites en français (clé invalide, trop de requêtes, surcharge, refus, réponse coupée).

## Mise en scène (`planSchema()`, `planRequestFor()`, `planScenesWithClaude()`)

- Le schéma est **dynamique** : `image` (si images perso), `pose` (personnage stable ou poses), `transition`
  (si transitions intelligentes), `sticker` + `stickerText` (si autocollants). Ajouter un champ = l'ajouter au schéma,
  à la consigne (une ligne `- "champ" : …` avec les règles d'usage) **et** à la normalisation.
- **Normalisation obligatoire** dans `planScenesWithClaude` : bornes de longueur (`slice`), valeurs autorisées,
  règles de position (rien sur la 1re réplique pour section / transition / autocollant, accroche seulement sur la 1re).
- **Le serveur ne normalise pas** (`mergePlan`, `relais/cloudflare-worker.js`) : tout ce qui est lu au montage doit aussi
  être borné à l'usage (ex. `stickerText.slice(0, 70)`, `sceneIndex > 0`).
- `fallbackScenePlan` (sans Claude) n'a pas les champs optionnels : le montage doit marcher sans eux (choix automatique).
- Tout nouveau champ **texte** affiché dans la vidéo : ajouté à `buildLanguageVersion` (`js/studio.js`, liste blanche
  des champs traduits) et dessiné dans la langue de la vidéo (`state.language`).
- Contexte commun : `claudeContext()` + charte (`charterContext()`), règles de diction `SPEECH_RULES` (phrases < 20 mots,
  nombres en lettres, pas de symboles).

## Consigne Agnes (`buildScenePrompt`, `agnesNegativePrompt` — `js/scenes.js`)

- Format LTX : un paragraphe, au présent, ordre chronologique (action → parole entre guillemets avec la langue →
  raccords pose neutre → personnage identique, mains vides → décor → caméra fixe → style → cadrage 9:16 → son → « No
  text anywhere »). ≤ 210 mots (vérifié par le groupe `styles` pour **tous** les styles).
- Les interdits vont dans la consigne négative, pas en « don't » dans la consigne.
- Tableau blanc : fond blanc pur, personnage dans le tiers gauche ; fond vert : #00B140 uni.

## Illustrations des plans (`drawingRequestFor`, `DRAWING_SCHEMA` — `js/media.js` ; `tracePromptFor` — `js/trace.js`)

- Claude rend 1 à 3 éléments : `label` (mot-clé dans la langue de la vidéo), `word`, `icon` (mots-clés anglais d'une icône
  Lucide), `draw` (8.8 : si pas d'icône, l'objet décrit en anglais pour un illustrateur), `paths` (son propre dessin, repli).
- Priorité au montage (`layoutDrawing`) : emoji 3D (styles colorés) → icône → **illustration retracée** (`traced`) → dessin de Claude.
- Illustration retracée : `tracePromptFor(draw)` envoyé à Agnes Image (« Simple black marker line drawing of … », fond blanc
  pur, sans texte), une image à la fois (`traceQueue`), puis `traceImageToPaths` ; les traits sont gardés dans le projet
  (`raw.elements[k].traced`), jamais redemandés au rechargement.
- Tester chaque changement sur au moins `whiteboard` + un style coloré + fond vert (`ONLY=styles`).

## Pièges vus

- Champ ajouté au schéma mais oublié dans la normalisation ou la traduction (8.4 → 8.5).
- Valeur affichée au storyboard différente de celle appliquée au montage (« Raccord simple » vs choix automatique).
- Consigne qui demande à Claude d'inventer : chiffres et dates **exacts** seulement ; commentaires YouTube **réels** seulement.
