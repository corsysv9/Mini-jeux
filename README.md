# Mini-jeux entre amis

Site de jeux de soirée à jouer chacun sur son téléphone : **Undercover**, **Time Bomb** et **Loup-garou**.
Pas de compte : on crée un salon, on partage le code de 5 lettres, et l'appli fait le maître du jeu.

- Interface en HTML/CSS/JS sans framework ni étape de build (`www/`).
- Petite API PHP (`www/api/`) ; les rôles secrets ne quittent jamais le serveur, chaque joueur ne reçoit que ce qu'il a le droit de voir.
- Stockage SQLite créé automatiquement (aucune base à acheter), ou MySQL si on le souhaite.
- Les téléphones interrogent le serveur toutes les 1,5 s : ça marche sur n'importe quel hébergement mutualisé.
- Installable comme une appli (PWA) et disponible en APK Android.
- **Time Bomb en 3D** : on joue assis autour d'une table dans la salle des horloges de Big Ben, avec Londres sous la pluie derrière les cadrans, bruitages et ambiance. Les cartes coupées s'affichent en grand chez tout le monde, et si Big Ben saute, la salle explose. Tout est dessiné et synthétisé dans le navigateur (aucune image ni aucun son à télécharger) ; un bouton « 2D » ramène à l'interface classique.
- **Loup-garou en 3D** : la veillée autour d'un feu de camp, la nuit, dans une clairière entourée de forêt, avec le village et son église au loin. Quand quelqu'un se fait dévorer, deux yeux jaunes s'allument dans les bois, le feu se recroqueville, un loup bondit, attrape la victime au col et l'emporte dans la forêt ; au matin, une stèle porte sa carte. Votes, visions de la voyante, potions de la sorcière et tir du chasseur se jouent en touchant les villageois. Même technique que Time Bomb 3D, avec le même bouton « 2D ».

## Installer

Voir **[docs/INSTALLATION.md](docs/INSTALLATION.md)** : OVH, NAS (Docker) et APK Android.

## Développer en local

```sh
MINIJEUX_DSN=sqlite:/tmp/minijeux.sqlite php -S 127.0.0.1:8099 -t www
```

Puis ouvrir http://127.0.0.1:8099 dans plusieurs onglets (ou navigation privée) pour simuler plusieurs joueurs.

## Tests

```sh
php tests/run.php                              # parties complètes des 3 jeux via l'API
node tests/ui.mjs http://127.0.0.1:8099 out/   # 5 téléphones simulés avec Playwright
node tests/solo.mjs http://127.0.0.1:8099 out/  # mode test : un téléphone, des joueurs test
node tests/timebomb3d.mjs http://127.0.0.1:8099 out/  # partie complète de Time Bomb en 3D
node tests/loupgarou3d.mjs http://127.0.0.1:8099 out/ # partie complète de Loup-garou en 3D
```

## Organisation

| Chemin | Rôle |
| --- | --- |
| `www/index.html`, `www/assets/` | interface (thème « Soirée ») |
| `www/api/index.php` | point d'entrée de l'API |
| `www/api/lib/room.php` | salons, joueurs, lancement des parties |
| `www/api/lib/games/*.php` | règles de chaque jeu |
| `www/assets/timebomb3d/` | Time Bomb en 3D (scène, modèles, textures, sons, effets), chargé seulement pour ce jeu |
| `www/assets/loupgarou3d/` | Loup-garou en 3D (clairière, forêt, feu, villageois, loup, sons de la nuit), chargé seulement pour ce jeu |
| `www/assets/vendor/three.min.js`, `tools/three/` | Three.js réduit au nécessaire, et le script pour le reconstruire |
| `sql/schema.sql` | table MySQL (optionnelle) |
| `docker-compose.yml` | lancement sur un NAS |
| `android-app/`, `.github/workflows/apk.yml` | construction de l'APK |
