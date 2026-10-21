<?php
// Salons : création, arrivée des joueurs, choix du jeu, lancement.

class GameError extends Exception
{
}

const GAMES = [
    'undercover' => ['prefix' => 'uc', 'min' => 3, 'max' => 20],
    'timebomb'   => ['prefix' => 'tb', 'min' => 4, 'max' => 8],
    'loupgarou'  => ['prefix' => 'lg', 'min' => 5, 'max' => 20],
];

const MAX_PLAYERS = 20;

function shuffled(array $a)
{
    for ($i = count($a) - 1; $i > 0; $i--) {
        $j = random_int(0, $i);
        $tmp = $a[$i];
        $a[$i] = $a[$j];
        $a[$j] = $tmp;
    }
    return $a;
}

function pick(array $a)
{
    return $a[random_int(0, count($a) - 1)];
}

function new_code()
{
    // Pas de lettres ambiguës (I, O) pour un code facile à dicter.
    $letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    $code = '';
    for ($i = 0; $i < 5; $i++) {
        $code .= $letters[random_int(0, strlen($letters) - 1)];
    }
    return $code;
}

function clean_name($name)
{
    $name = trim(preg_replace('/\s+/u', ' ', (string) $name));
    if ($name === '') {
        throw new GameError('Choisis un pseudo.');
    }
    if (mb_strlen($name) > 20) {
        $name = mb_substr($name, 0, 20);
    }
    return $name;
}

function clean_code($code)
{
    $code = strtoupper(preg_replace('/[^A-Za-z]/', '', (string) $code));
    if (strlen($code) !== 5) {
        throw new GameError('Le code du salon fait 5 lettres.');
    }
    return $code;
}

function player_ids(array $room)
{
    return array_map(function ($p) {
        return $p['id'];
    }, $room['players']);
}

function player_by_token(array $room, $token)
{
    foreach ($room['players'] as $p) {
        if (is_string($token) && hash_equals($p['token'], $token)) {
            return $p['id'];
        }
    }
    throw new GameError("Tu ne fais pas partie de ce salon.");
}

function add_player(array &$room, $name)
{
    if ($room['status'] !== 'lobby') {
        throw new GameError('La partie a déjà commencé, attends la prochaine.');
    }
    if (count($room['players']) >= MAX_PLAYERS) {
        throw new GameError('Le salon est plein.');
    }
    foreach ($room['players'] as $p) {
        if (mb_strtolower($p['name']) === mb_strtolower($name)) {
            throw new GameError('Ce pseudo est déjà pris dans ce salon.');
        }
    }
    $id = $room['nextId']++;
    $token = bin2hex(random_bytes(16));
    $room['players'][] = ['id' => $id, 'name' => $name, 'token' => $token];
    return ['id' => $id, 'token' => $token];
}

// Mode test : l'hôte peut jouer à la place d'un joueur test (paramètre « as »).
function actor(array $room, $pid, array $in)
{
    $as = isset($in['as']) ? (int) $in['as'] : 0;
    if (!$as || $as === $pid || $room['hostId'] !== $pid) {
        return $pid;
    }
    foreach ($room['players'] as $p) {
        if ($p['id'] === $as && !empty($p['bot'])) {
            return $as;
        }
    }
    // Joueur test retiré entre-temps : on revient à soi.
    return $pid;
}

function add_bot(array &$room)
{
    $names = array_map(function ($p) {
        return mb_strtolower($p['name']);
    }, $room['players']);
    for ($i = 1; in_array('test ' . $i, $names, true); $i++) {
    }
    $me = add_player($room, 'Test ' . $i);
    foreach ($room['players'] as &$p) {
        if ($p['id'] === $me['id']) {
            $p['bot'] = true;
        }
    }
}

function require_host(array $room, $pid)
{
    if ($room['hostId'] !== $pid) {
        throw new GameError("Seul l'hôte peut faire ça.");
    }
}

function game_fn($game, $name)
{
    return GAMES[$game]['prefix'] . '_' . $name;
}

function action_create(array $in)
{
    $name = clean_name(isset($in['name']) ? $in['name'] : '');
    if (random_int(0, 9) === 0) {
        room_cleanup();
    }
    for ($try = 0; $try < 10; $try++) {
        $code = new_code();
        if (room_version($code) === null) {
            break;
        }
    }
    $room = [
        'code' => $code,
        'hostId' => 1,
        'nextId' => 1,
        'players' => [],
        'game' => 'undercover',
        'settings' => [],
        'status' => 'lobby',
        'g' => null,
    ];
    $me = add_player($room, $name);
    room_insert($code, $room);
    return ['code' => $code, 'token' => $me['token'], 'playerId' => $me['id']];
}

function action_join(array $in)
{
    $code = clean_code(isset($in['code']) ? $in['code'] : '');
    $name = clean_name(isset($in['name']) ? $in['name'] : '');
    $me = room_update($code, function (&$room) use ($name) {
        return add_player($room, $name);
    });
    return ['code' => $code, 'token' => $me['token'], 'playerId' => $me['id']];
}

function action_state(array $in)
{
    $code = clean_code(isset($in['code']) ? $in['code'] : '');
    $since = isset($in['v']) ? (int) $in['v'] : 0;
    $v = room_version($code);
    if ($v === null) {
        throw new GameError("Ce salon n'existe plus.");
    }
    if ($since === $v) {
        return ['unchanged' => true, 'v' => $v];
    }
    $room = room_read($code);
    $pid = player_by_token($room, isset($in['token']) ? $in['token'] : '');
    return ['room' => build_view($room, actor($room, $pid, $in), $pid)];
}

// Toutes les autres actions modifient le salon.
function action_room(array $in, $action)
{
    $code = clean_code(isset($in['code']) ? $in['code'] : '');
    room_update($code, function (&$room) use ($in, $action) {
        $pid = player_by_token($room, isset($in['token']) ? $in['token'] : '');
        room_apply($room, $pid, $action, $in);
    });
    if ($action === 'leave') {
        return ['room' => null];
    }
    $room = room_read($code);
    $pid = player_by_token($room, $in['token']);
    return ['room' => build_view($room, actor($room, $pid, $in), $pid)];
}

function room_apply(array &$room, $pid, $action, array $in)
{
    switch ($action) {
        case 'leave':
            if ($room['status'] !== 'lobby') {
                throw new GameError("On ne peut pas quitter pendant une partie : demande à l'hôte de revenir au salon.");
            }
            remove_player($room, $pid);
            return;
        case 'add_bot':
            require_host($room, $pid);
            add_bot($room);
            return;
        case 'kick':
            require_host($room, $pid);
            if ($room['status'] !== 'lobby') {
                throw new GameError('Reviens au salon avant de retirer un joueur.');
            }
            $target = (int) (isset($in['target']) ? $in['target'] : 0);
            if ($target === $pid) {
                throw new GameError('Tu ne peux pas te retirer toi-même.');
            }
            remove_player($room, $target);
            return;
        case 'choose':
            require_host($room, $pid);
            if ($room['status'] !== 'lobby') {
                throw new GameError('Une partie est en cours.');
            }
            $game = isset($in['game']) ? $in['game'] : '';
            if (!isset(GAMES[$game])) {
                throw new GameError('Jeu inconnu.');
            }
            $room['game'] = $game;
            $room['settings'] = isset($in['settings']) && is_array($in['settings']) ? $in['settings'] : [];
            return;
        case 'start':
            require_host($room, $pid);
            // On peut relancer directement une partie terminée.
            if ($room['status'] !== 'lobby' && $room['g']['phase'] !== 'end') {
                throw new GameError('Une partie est déjà en cours.');
            }
            $meta = GAMES[$room['game']];
            $n = count($room['players']);
            if ($n < $meta['min'] || $n > $meta['max']) {
                throw new GameError('Ce jeu se joue de ' . $meta['min'] . ' à ' . $meta['max'] . ' joueurs.');
            }
            if (isset($in['settings']) && is_array($in['settings'])) {
                $room['settings'] = $in['settings'];
            }
            $fn = game_fn($room['game'], 'start');
            $room['g'] = $fn(player_ids($room), $room['settings']);
            $room['status'] = 'playing';
            return;
        case 'lobby':
            require_host($room, $pid);
            $room['status'] = 'lobby';
            $room['g'] = null;
            return;
        case 'play':
            if ($room['status'] !== 'playing') {
                throw new GameError("Aucune partie en cours.");
            }
            $fn = game_fn($room['game'], 'action');
            $type = isset($in['type']) ? (string) $in['type'] : '';
            $fn($room['g'], actor($room, $pid, $in), $type, $in, $room['hostId'] === $pid);
            return;
    }
    throw new GameError('Action inconnue.');
}

function remove_player(array &$room, $id)
{
    $room['players'] = array_values(array_filter($room['players'], function ($p) use ($id) {
        return $p['id'] !== $id;
    }));
    if ($room['hostId'] === $id && count($room['players']) > 0) {
        $room['hostId'] = $room['players'][0]['id'];
    }
}

// $pid : le joueur dont on montre le point de vue ; $real : celui qui tient le téléphone.
function build_view(array $room, $pid, $real = null)
{
    $players = array_map(function ($p) {
        return ['id' => $p['id'], 'name' => $p['name'], 'bot' => !empty($p['bot'])];
    }, $room['players']);
    $view = [
        'code' => $room['code'],
        'v' => $room['v'],
        'me' => $pid,
        'realMe' => $real === null ? $pid : $real,
        'hostId' => $room['hostId'],
        'players' => $players,
        'game' => $room['game'],
        'settings' => $room['settings'],
        'status' => $room['status'],
        'g' => null,
    ];
    if ($room['status'] === 'playing') {
        $fn = game_fn($room['game'], 'view');
        $view['g'] = $fn($room['g'], $pid);
    }
    return $view;
}

// Compte les votes ; renvoie la liste des plus votés (plusieurs en cas d'égalité).
function top_voted(array $votes)
{
    $count = [];
    foreach ($votes as $target) {
        if ($target === null) {
            continue;
        }
        $count[$target] = (isset($count[$target]) ? $count[$target] : 0) + 1;
    }
    if (!$count) {
        return [];
    }
    $max = max($count);
    $top = [];
    foreach ($count as $target => $c) {
        if ($c === $max) {
            $top[] = (int) $target;
        }
    }
    return $top;
}

function setting(array $settings, $key, $default, $min, $max)
{
    if (!isset($settings[$key]) || !is_numeric($settings[$key])) {
        return $default;
    }
    return max($min, min($max, (int) $settings[$key]));
}
