#!/usr/bin/env bash
# Contrôles statiques de Cartoon Instructeur, en une commande (quelques secondes).
# Usage : verif.sh [--livraison] [dépôt]   (--livraison : compare aussi avec origin/main avant un « mets à jour »)
set -u
LIV=0; [ "${1:-}" = "--livraison" ] && { LIV=1; shift; }
REPO="${1:-}"
if [ -z "$REPO" ]; then m=$(ls /home/user/*/js/montage.js 2>/dev/null | head -1); [ -n "$m" ] && REPO=$(cd "$(dirname "$m")/.." && pwd); fi
[ -d "$REPO/js" ] || { echo "ÉCHEC dépôt introuvable (donne son chemin)"; exit 2; }
cd "$REPO" || exit 2
FAIL=0; WARN=0
ok() { echo "OK         $*"; }
ko() { echo "ÉCHEC      $*"; FAIL=$((FAIL+1)); }
wa() { echo "ATTENTION  $*"; WARN=$((WARN+1)); }

# 1. syntaxe
bad=""; for f in js/*.js sw.js; do node --check "$f" 2>/dev/null || bad="$bad $f"; done
[ -z "$bad" ] && ok "syntaxe des scripts" || ko "syntaxe :$bad"
node --input-type=module --check < relais/cloudflare-worker.js 2>/dev/null && ok "syntaxe du serveur Cloudflare" || ko "syntaxe de relais/cloudflare-worker.js"

# 2. noms globaux en double (const/let/class en double = l'appli ne démarre plus ; function en double = écrasée sans bruit)
tmp=$(mktemp --suffix=.js); cat js/*.js > "$tmp"
node --check "$tmp" 2>/dev/null && ok "aucun const/let/class global en double" || ko "const/let/class global en double : $(node --check "$tmp" 2>&1 | grep -m1 -o "Identifier '[^']*' has already been declared")"
rm -f "$tmp"
dups=$(node -e 'const fs=require("fs"),s={};for(const f of fs.readdirSync("js").filter(f=>f.endsWith(".js")))fs.readFileSync("js/"+f,"utf8").split("\n").forEach((l,i)=>{const m=/^(const|let|var|class|function\*?|async function)\s+([A-Za-z_$][\w$]*)/.exec(l);if(m)(s[m[2]]=s[m[2]]||[]).push(f+":"+(i+1)+" "+m[1])});for(const[k,v]of Object.entries(s))if(v.length>1)console.log(k+" → "+v.join(" | "))')
[ -z "$dups" ] && ok "aucune fonction globale écrasée" || while IFS= read -r l; do wa "nom global déclaré deux fois : $l"; done <<< "$dups"

# 3. clés API (seulement fichier:ligne, jamais la valeur)
keys=$(git grep -nIE 'sk-ant-[A-Za-z0-9_-]{20,}|sk_[a-f0-9]{32,}|sk-[A-Za-z0-9]{32,}|AIza[0-9A-Za-z_-]{30,}|gh[pousr]_[A-Za-z0-9]{30,}|xox[abp]-[A-Za-z0-9-]{10,}' -- . ':!tests/node_modules' | cut -d: -f1,2)
[ -z "$keys" ] && ok "aucune clé API dans les fichiers suivis" || ko "clé API possible : $(echo $keys)"
untracked=$(git ls-files --others --exclude-standard | grep -v node_modules | xargs -r grep -lIE 'sk-ant-[A-Za-z0-9_-]{20,}|sk_[a-f0-9]{32,}' 2>/dev/null)
[ -z "$untracked" ] || ko "clé API possible dans un fichier non suivi : $untracked"

# 4. cohérence de livraison
vs=$(grep -o '?v=[0-9]*' index.html | sort -u)
[ "$(echo "$vs" | wc -l)" = "1" ] && ok "un seul ?v= dans index.html (${vs#?v=})" || ko "plusieurs ?v= dans index.html : $(echo $vs)"
miss=""; for s in $(grep -o 'src="js/[^"?]*' index.html | sed 's/src="//'); do grep -q "'./$s'" sw.js || miss="$miss $s"; done
[ -z "$miss" ] && ok "chaque script de index.html est dans APP_FILES (sw.js)" || ko "absents de APP_FILES :$miss"
orph=""; for f in js/*.js; do grep -q "src=\"$f" index.html || orph="$orph $f"; done
[ -z "$orph" ] || wa "fichiers jamais chargés par index.html :$orph"
if [ $LIV = 1 ]; then
  git fetch -q origin main 2>/dev/null
  if git rev-parse -q --verify origin/main >/dev/null; then
    [ "$(grep -o "CACHE = '[^']*'" sw.js)" != "$(git show origin/main:sw.js | grep -o "CACHE = '[^']*'")" ] && ok "CACHE de sw.js changé" || ko "CACHE de sw.js identique à main"
    [ "$(grep -m1 -o "num: '[^']*'" js/core.js)" != "$(git show origin/main:js/core.js | grep -m1 -o "num: '[^']*'")" ] && ok "nouvelle version en tête d'APP_VERSIONS ($(grep -m1 -o "num: '[^']*'" js/core.js))" || ko "APP_VERSIONS : pas de nouvelle version en tête"
    [ "$vs" != "$(git show origin/main:index.html | grep -o '?v=[0-9]*' | sort -u)" ] && ok "?v= changé par rapport à main" || ko "?v= identique à main"
  else wa "origin/main introuvable : comparaison de livraison sautée"; fi
fi

# 5. moteur d'animation
node tests/unit-motion.js > /tmp/verif-motion.log 2>&1 && ok "tests du moteur d'animation" || ko "tests du moteur d'animation (voir /tmp/verif-motion.log)"

echo "──────────"
[ $FAIL = 0 ] && echo "VERDICT : ✅ $WARN avertissement(s)" || echo "VERDICT : ❌ $FAIL échec(s), $WARN avertissement(s)"
exit $([ $FAIL = 0 ] && echo 0 || echo 1)
