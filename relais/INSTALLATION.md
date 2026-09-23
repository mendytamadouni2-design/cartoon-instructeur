# Installer le relais de téléchargement (Cloudflare, gratuit, ~10 min)

## Pourquoi ?

Le serveur où Agnes stocke tes vidéos interdit aux navigateurs de les télécharger (« Load failed »).
L'appli a pourtant besoin de récupérer chaque scène pour faire le montage final, ajouter les dessins,
les sous-titres et enchaîner les scènes.

Le relais est un tout petit programme hébergé gratuitement chez Cloudflare : il récupère la vidéo
chez Agnes et la renvoie à ton appli. Il ne stocke rien et n'accepte que ton appli.

Le plan gratuit de Cloudflare autorise 100 000 utilisations par jour : largement assez.

---

## Étape 1 — Créer un compte Cloudflare

1. Ouvre **https://dash.cloudflare.com/sign-up** dans Safari.
2. Inscris-toi avec ton e-mail et un mot de passe, puis confirme ton e-mail.
3. Pas besoin de nom de domaine ni de carte bancaire.

## Étape 2 — Créer le relais

1. Dans le menu de Cloudflare, ouvre **Workers & Pages** (parfois rangé dans « Compute »).
2. Appuie sur **Créer** (« Create »), puis choisis **« Commencer avec Hello World »** (« Start with Hello World »).
3. Donne-lui un nom, par exemple **`cartoon-relais`**, puis appuie sur **Déployer** (« Deploy »).

## Étape 3 — Coller le code du relais

1. Ouvre ce lien et copie **tout** le texte (appui long → Tout sélectionner → Copier) :
   **https://raw.githubusercontent.com/mendytamadouni2-design/cartoon-instructeur/main/relais/cloudflare-worker.js**
2. Retourne sur Cloudflare, ouvre ton worker `cartoon-relais` et appuie sur **Modifier le code** (« Edit code »).
3. Efface tout le code « Hello World » et **colle** celui que tu as copié.
4. Appuie sur **Déployer** (« Deploy »).

## Étape 4 — Brancher le relais dans l'appli

1. Sur la page de ton worker, copie son adresse. Elle ressemble à :
   `https://cartoon-relais.ton-nom.workers.dev`
2. Dans Cartoon Instructeur, colle-la dans le bloc **« 🔁 Relais de téléchargement »**, en haut.
3. Appuie sur **« Enregistrer et tester le relais »**.
4. Tu dois voir **« ✅ Relais opérationnel »**.

Pense ensuite à appuyer sur **« 💾 Sauvegarder mes clés »** : l'adresse du relais est sauvegardée avec tes clés.

---

## Si le test échoue

| Message | Solution |
|---|---|
| ❌ Relais injoignable | Vérifie l'adresse copiée (elle finit par `.workers.dev`) et que tu as bien appuyé sur « Déployer ». |
| ❌ Réponse inattendue | Le code « Hello World » est encore là : recommence l'étape 3. |
| ❌ Relais refusé : l'adresse de l'appli n'est pas autorisée | Ton appli n'est pas ouverte depuis `https://mendytamadouni2-design.github.io`. Dans le code du relais, ajoute l'adresse de ton appli dans la liste `ALLOWED_ORIGINS` (juste le début, par exemple `'https://mon-site.com'`), puis redéploie. |

## Et ensuite ?

Si des scènes ont déjà été générées, il suffit d'appuyer sur **« 🎞️ Assembler la vidéo finale »** :
pas besoin de tout régénérer.
