---
name: pieges-iphone
description: Cartoon Instructeur uniquement. Pièges de Safari sur iPhone (appli posée sur l'écran d'accueil) qui ne se voient jamais dans les tests Chromium — précision WebGL, mémoire des canvas, son, arrière-plan, WebCodecs, stockage, vidéo. À utiliser pour relire ou concevoir tout code de rendu, de son, d'export ou de stockage.
---

# Pièges de Safari sur iPhone

Les tests tournent dans Chromium sur un serveur : **rien de ce qui suit n'y est visible**. Un défaut iPhone se prouve
par le chemin de code et la règle ci-dessous, et chaque fonctionnalité récente a un **repli**.

## Rendu

- **WebGL `mediump` = 16 bits sur iPhone** (Chromium de test : 32 bits). Le bruit `fract(sin(…) * 43758.5)` s'effondre.
  Toujours `#ifdef GL_FRAGMENT_PRECISION_HIGH precision highp float; #else precision mediump float; #endif` (`TX_H`).
- **Copie d'un canvas WebGL vers un canvas 2D** (`drawImage(glCanvas)`) : rapide sur GPU, mais 30 à 40 ms par image
  dans Chromium logiciel (relecture des pixels). Tout rendu WebGL recopié à chaque image doit avoir un repli et, en temps
  réel, un garde-fou de vitesse (exemple : `puppetCost` dans deform.js).
- **Contexte WebGL perdu** (mémoire, retour d'arrière-plan) : un contexte gardé en cache dessine du vide sans erreur.
  Tester `gl.isContextLost()` avant usage et en recréer un (`renderGlTransition`). Nombre de contextes limité : un seul
  contexte réutilisé par usage (`txGl`, `compositor.js`).
- **Canvas** : surface maximale ≈ 16,7 millions de pixels par canvas et mémoire totale des canvas limitée → réutiliser
  les canvas (créer hors de la boucle d'images), réduire à la taille du calcul avant `texImage2D`, éviter
  `getImageData` à chaque image (sinon `willReadFrequently`).
- **Effets coûteux** : `shadowBlur` sur une image entière, `ctx.filter` (peut manquer selon la version : n'être qu'un bonus),
  textures 1080 × 1920 envoyées deux fois par image → saccades en temps réel.

## Son

- `AudioContext` démarre **suspendu** : `resume()` après un geste de l'utilisateur, et à nouveau au retour d'arrière-plan
  (`montagePause`, `resumeMontage` dans `montage.js`).
- Toujours des fondus (≈ 15 à 30 ms) à chaque coupure de son, sinon « clic ».

## Arrière-plan et veille

- Dès que l'appli passe en arrière-plan : minuteries ralenties, `requestAnimationFrame` arrêté, enregistrement coupé.
  Le montage en temps réel se met en pause et reprend (`montagePause`) ; l'écran reste allumé avec Wake Lock
  (`activateWakeLock`, à redemander sur `visibilitychange`).
- La génération longue passe par le serveur Cloudflare (mode arrière-plan) pour ne pas dépendre du téléphone allumé.

## Export vidéo

- **WebCodecs** : utilisé seulement si tout existe (`webcodecsAvailable()` dans `render.js` : `VideoEncoder`, `AudioEncoder`,
  `AudioData`, `VideoFrame`, `OfflineAudioContext`…), sinon repli sur le montage en temps réel (`MediaRecorder`).
  Tout changement doit marcher **dans les deux modes**.
- `MediaRecorder` sur iPhone : MP4 seulement (vérifier `MediaRecorder.isTypeSupported`).
- H.264 d'abord (`pickVideoConfig`) : c'est ce que lisent l'iPhone, YouTube et TikTok.
- Vidéos lues dans la page : `playsinline` obligatoire, sinon plein écran forcé.

## Stockage et mémoire

- `localStorage` ≈ 5 Mo : jamais d'images ni d'audio dedans (→ IndexedDB). Toute lecture / écriture dans un `try`.
- IndexedDB peut être vidé par le système si l'espace manque : le projet doit survivre (sauvegarde Cloudflare).
- URL `blob:` : `URL.revokeObjectURL` quand on n'en a plus besoin, sinon la mémoire monte à chaque montage.
- Gros fichiers (vidéo 10 Mbit/s × 2 min ≈ 150 Mo) : jamais en un seul envoi (Cloudflare refuse au-delà de 100 Mo) →
  envoi par morceaux (`uploadMedia`, `studio.js`).

## Fonctionnalités récentes

`structuredClone`, `Array.prototype.at`, `toSorted`, `CanvasRenderingContext2D.filter`, `OffscreenCanvas` en WebGL… :
vérifier la version de Safari visée ou prévoir un repli. En cas de doute, l'écrire sans.
