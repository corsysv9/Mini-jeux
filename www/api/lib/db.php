<?php
// Accès base de données : une ligne par salon, l'état complet est stocké en JSON.

function db_config()
{
    static $config = null;
    if ($config === null) {
        // Docker (NAS) : la base est donnée par variable d'environnement.
        if (getenv('MINIJEUX_DSN')) {
            return $config = ['dsn' => getenv('MINIJEUX_DSN'), 'user' => getenv('MINIJEUX_USER') ?: null, 'pass' => getenv('MINIJEUX_PASS') ?: null];
        }
        $path = getenv('MINIJEUX_CONFIG') ?: __DIR__ . '/../config.php';
        if (is_file($path)) {
            $config = require $path;
        } else {
            // Sans configuration : fichier SQLite à côté du dossier du site, rien à créer chez l'hébergeur.
            $config = ['dsn' => 'sqlite:' . sqlite_default_path()];
        }
    }
    return $config;
}

function sqlite_default_path()
{
    $site = dirname(__DIR__, 2);
    $dir = dirname($site) . '/minijeux-data';
    if (!is_dir($dir)) {
        if (!@mkdir($dir, 0755, true)) {
            throw new GameError("Impossible de créer le dossier minijeux-data à côté du site.");
        }
        // Au cas où ce dossier serait accessible depuis le web.
        file_put_contents($dir . '/.htaccess', "Require all denied\n");
    }
    return $dir . '/minijeux.sqlite';
}

function db()
{
    static $pdo = null;
    if ($pdo === null) {
        $c = db_config();
        if (db_is_sqlite() && !in_array('sqlite', PDO::getAvailableDrivers(), true)) {
            throw new GameError("SQLite n'est pas disponible sur ce serveur : configure MySQL dans config.php.");
        }
        $pdo = new PDO($c['dsn'], isset($c['user']) ? $c['user'] : null, isset($c['pass']) ? $c['pass'] : null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        if (db_is_sqlite()) {
            // Avec SQLite la table est créée automatiquement.
            $pdo->exec('PRAGMA busy_timeout = 5000');
            $pdo->exec('CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL)');
        }
    }
    return $pdo;
}

function db_is_sqlite()
{
    return strpos(db_config()['dsn'], 'sqlite:') === 0;
}

// Lit un salon sans verrou (pour le polling).
function room_read($code)
{
    $st = db()->prepare('SELECT data, version FROM rooms WHERE code = ?');
    $st->execute([$code]);
    $row = $st->fetch();
    if (!$row) {
        return null;
    }
    $room = json_decode($row['data'], true);
    $room['v'] = (int) $row['version'];
    return $room;
}

function room_version($code)
{
    $st = db()->prepare('SELECT version FROM rooms WHERE code = ?');
    $st->execute([$code]);
    $v = $st->fetchColumn();
    return $v === false ? null : (int) $v;
}

// Exécute $fn sur le salon verrouillé puis enregistre l'état modifié.
function room_update($code, callable $fn)
{
    $pdo = db();
    if (db_is_sqlite()) {
        $pdo->exec('BEGIN IMMEDIATE');
        $sql = 'SELECT data, version FROM rooms WHERE code = ?';
    } else {
        $pdo->beginTransaction();
        $sql = 'SELECT data, version FROM rooms WHERE code = ? FOR UPDATE';
    }
    try {
        $st = $pdo->prepare($sql);
        $st->execute([$code]);
        $row = $st->fetch();
        if (!$row) {
            throw new GameError("Ce salon n'existe pas (ou a expiré).");
        }
        $room = json_decode($row['data'], true);
        $result = $fn($room);
        $st = $pdo->prepare('UPDATE rooms SET data = ?, version = version + 1, updated_at = ? WHERE code = ?');
        $st->execute([json_encode($room), time(), $code]);
        $pdo->exec('COMMIT');
        return $result;
    } catch (Exception $e) {
        $pdo->exec('ROLLBACK');
        throw $e;
    }
}

function room_insert($code, array $room)
{
    $st = db()->prepare('INSERT INTO rooms (code, data, version, updated_at) VALUES (?, ?, 1, ?)');
    $st->execute([$code, json_encode($room), time()]);
}

function room_cleanup()
{
    // Supprime les salons inactifs depuis plus de 24 h.
    $st = db()->prepare('DELETE FROM rooms WHERE updated_at < ?');
    $st->execute([time() - 86400]);
}
