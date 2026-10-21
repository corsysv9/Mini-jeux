# Mini-jeux entre amis

Site de jeux de soirée à jouer chacun sur son téléphone : **Undercover**, **Time Bomb** et **Loup-garou**.
Pas de compte : on crée un salon, on partage le code de 5 lettres, et l'appli fait le maître du jeu.

- Interface en HTML/CSS/JS sans framework ni étape de build (`www/`).
- Petite API PHP (`www/api/`) ; les rôles secrets ne quittent jamais le serveur, chaque joueur ne reçoit que ce qu'il a le droit de voir.
- Stockage SQLite créé automatiquement (aucune base à acheter), ou MySQL si on le souhaite.
- Les téléphones interrogent le serveur toutes les 1,5 s : ça marche sur n'importe quel hébergement mutualisé.
- Installable comme une appli (PWA) et disponible en APK Android.

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
```

## Organisation

| Chemin | Rôle |
| --- | --- |
| `www/index.html`, `www/assets/` | interface (thème « Soirée ») |
| `www/api/index.php` | point d'entrée de l'API |
| `www/api/lib/room.php` | salons, joueurs, lancement des parties |
| `www/api/lib/games/*.php` | règles de chaque jeu |
| `sql/schema.sql` | table MySQL (optionnelle) |
| `docker-compose.yml` | lancement sur un NAS |
| `android-app/`, `.github/workflows/apk.yml` | construction de l'APK |
