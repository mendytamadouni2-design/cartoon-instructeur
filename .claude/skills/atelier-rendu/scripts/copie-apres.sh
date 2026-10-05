#!/usr/bin/env bash
# Copie du dépôt (sans .git ni node_modules) où essayer un correctif sans toucher au vrai dépôt.
# Usage : copie-apres.sh /tmp/apres-<sujet>     puis modifier la copie et lancer avec APRES=/tmp/apres-<sujet>
set -e
DEST="${1:?donne le dossier de destination, ex. /tmp/apres-badge}"
m=$(ls /home/user/*/js/montage.js | head -1); REPO="${REPO:-$(cd "$(dirname "$m")/.." && pwd)}"
rm -rf "$DEST"; mkdir -p "$DEST"
tar -C "$REPO" --exclude=.git --exclude=tests/node_modules -cf - . | tar -C "$DEST" -xf -
echo "copie prête : $DEST (depuis $REPO)"
