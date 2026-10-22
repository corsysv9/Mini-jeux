#!/bin/sh
# Reconstruit www/assets/vendor/three.min.js à partir de entry.js.
# Si un module de www/assets/timebomb3d ou loupgarou3d utilise une nouvelle classe THREE.Xxx, l'ajouter à entry.js.
set -e
cd "$(dirname "$0")"
npm install --no-audit --no-fund
npx esbuild entry.js --bundle --format=esm --minify --legal-comments=none --outfile=../../www/assets/vendor/three.min.js
# Licence MIT de Three.js en tête du fichier
printf '/* three.js r186 | MIT License | https://github.com/mrdoob/three.js */\n' | cat - ../../www/assets/vendor/three.min.js > ../../www/assets/vendor/three.tmp && mv ../../www/assets/vendor/three.tmp ../../www/assets/vendor/three.min.js
