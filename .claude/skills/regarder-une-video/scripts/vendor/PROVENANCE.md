# Provenance

`frames.py` et `runtime.py` viennent tels quels de la skill « watch » du dépôt
https://github.com/bradautomates/claude-video (version 0.3.2, commit 03ceb42, 25 sept. 2026),
licence MIT, © 2026 Bradley Bonanno — voir `LICENSE` (à garder avec les fichiers).

Seule l'extraction d'images est reprise (sans réseau, sans clé). Le reste du dépôt n'est pas copié :
téléchargement yt-dlp, moteur Gemini (envoie la vidéo chez Google, clé), transcription Groq / OpenAI
(clés) ou whisperx (plusieurs Go).

Ne pas modifier ces deux fichiers : les adaptations vont dans `../regarder.py`. Pour mettre à jour,
recopier les deux fichiers d'une nouvelle version du dépôt et noter ici la version et le commit.
