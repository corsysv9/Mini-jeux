# Installation

Trois façons de jouer, cumulables : sur l'hébergement OVH, sur le NAS, et via l'appli Android.

> Ne mets jamais de mot de passe dans GitHub ou dans une conversation.

---

## 1. Hébergement OVH (jellyker.fr)

Le plus simple pour jouer avec des amis où qu'ils soient : HTTPS et nom de domaine sont déjà là.
**Aucune base de données à acheter** : le site range les parties dans un petit fichier (SQLite) qu'il crée tout seul.

### Méthode rapide (Windows) : script PowerShell

Depuis le dossier du projet décompressé, clic droit > « Ouvrir dans le terminal », puis :

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\envoyer-sur-ovh.ps1
```

Le script demande l'identifiant et le mot de passe FTP (onglet **FTP - SSH** de l'hébergement) et envoie tout le dossier `www/` dans le dossier `www` du serveur. Passe ensuite directement à l'étape b.

### a. Envoyer les fichiers par FTP

1. Télécharge le projet : sur GitHub, **Code** → **Download ZIP**, puis décompresse-le.
2. Espace client OVH → **Web Cloud** → **Hébergements** → `jellykb.cluster129.hosting.ovh.net` → onglet **FTP - SSH** : note le serveur FTP (`ftp.cluster129.hosting.ovh.net`) et l'identifiant. Si besoin, change le mot de passe FTP depuis cet onglet.
3. Avec **FileZilla** (gratuit), connecte-toi et ouvre le dossier **`www`** du serveur.
4. Envoie **le contenu** du dossier `www/` du projet (pas le dossier lui-même) : `index.html`, `assets/`, `api/`, `sw.js`, `manifest.webmanifest`, `.htaccess`.
   *Pour une adresse dédiée comme `jeux.jellyker.fr` : onglet **Multisite** → **Ajouter un domaine** → sous-domaine `jeux`, dossier racine `jeux`, puis envoie les fichiers dans ce dossier `jeux`.*

À la première partie, le site crée un dossier `minijeux-data` à côté de `www` pour y ranger les salons. Ne le supprime pas pendant une partie (sinon rien de grave : les salons en cours sont juste perdus).

### b. Vérifier PHP et HTTPS

- Onglet **Informations générales** : la version PHP doit être **8.0 ou plus** (sinon « Modifier la configuration »).
- Onglet **Multisite** : le domaine doit avoir **SSL activé** (certificat Let's Encrypt gratuit). Le HTTPS est nécessaire pour installer l'appli.

Ouvre ensuite https://jellyker.fr (ou https://jeux.jellyker.fr) : la page « Mini-jeux » doit s'afficher. Crée un salon pour tester.

### Option : MySQL

Inutile en temps normal. Si tu as déjà une base MySQL (ou si SQLite était indisponible), crée la table avec [`sql/schema.sql`](../sql/schema.sql) dans phpMyAdmin, puis copie `www/api/config.example.php` en **`config.php`** et remplis-le. Dès que `config.php` existe, le site utilise MySQL.

---

## 2. NAS UGREEN (Docker)

Le NAS n'a besoin ni de MySQL ni de configuration : le site utilise un simple fichier SQLite rangé dans le dossier `data/`.

1. Télécharge le ZIP du projet depuis GitHub et décompresse-le.
2. Dans le **gestionnaire de fichiers UGOS**, crée un dossier, par exemple `docker/mini-jeux`, et copies-y **`docker-compose.yml`** et le dossier **`www`**.
3. Ouvre l'appli **Docker** d'UGOS → **Projet** → **Créer**. Donne le nom `mini-jeux`, choisis le dossier `docker/mini-jeux` : le fichier `docker-compose.yml` est détecté. Lance le déploiement.
4. Sur le Wi-Fi de la maison, ouvre `http://IP-DU-NAS:8090` (l'IP est visible dans les paramètres réseau d'UGOS).

Pour mettre à jour : remplace le dossier `www` par la nouvelle version (les parties et la base dans `data/` sont conservées).

**Accès depuis l'extérieur.** Pour que des amis jouent hors de chez toi (et pour l'appli Android, qui exige du HTTPS), il faut exposer le NAS en HTTPS : par exemple un sous-domaine `jeux.jellyker.fr` pointé sur ta box avec un reverse proxy (comme Nginx Proxy Manager en Docker), ou un tunnel Cloudflare. C'est plus de réglages qu'OVH ; si tu veux, je te guide pour l'option choisie.

---

## 3. Appli Android (APK)

L'APK est une petite appli qui ouvre ton site en plein écran, avec sa propre icône. Il faut donc que le site soit en ligne en HTTPS (OVH ou NAS exposé).

1. Sur GitHub, onglet **Actions** → **APK Android** → **Run workflow**.
2. Dans « Adresse du site », mets l'adresse finale, par exemple `https://jeux.jellyker.fr`, puis **Run workflow**.
3. Au bout de quelques minutes, ouvre l'exécution terminée : en bas, **Artifacts** → `mini-jeux-apk` (un ZIP contenant `mini-jeux.apk`).
4. Pour que tes amis la téléchargent facilement, dépose `mini-jeux.apk` à la racine du site (à côté de `index.html`) : un lien « Télécharger l'appli Android » apparaît alors sur la page d'accueil, sur les téléphones Android.

Android demandera d'autoriser l'installation depuis le navigateur (sources inconnues) : c'est normal pour une appli hors Play Store.

Astuce : sans APK, tout le monde peut aussi faire **« Ajouter à l'écran d'accueil »** depuis Chrome ou Safari, le site s'ouvre alors comme une appli.
