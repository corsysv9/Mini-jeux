<?php
// Tests de bout en bout de l'API avec SQLite : php tests/run.php
$db = sys_get_temp_dir() . '/minijeux-test-' . getmypid() . '.sqlite';
$cfg = sys_get_temp_dir() . '/minijeux-test-config-' . getmypid() . '.php';
file_put_contents($cfg, "<?php return ['dsn' => 'sqlite:$db'];");
putenv("MINIJEUX_CONFIG=$cfg");
require __DIR__ . '/../www/api/lib/api.php';

$failures = 0;
function check($cond, $msg)
{
    global $failures;
    if (!$cond) {
        $failures++;
        echo "ÉCHEC : $msg\n";
    }
}

function call(array $in)
{
    return json_decode(json_encode(handle($in)), true);
}

function expect_error(array $in, $msg)
{
    try {
        handle($in);
        check(false, "erreur attendue : $msg");
    } catch (GameError $e) {
    }
}

// Crée un salon avec $n joueurs ; renvoie [code, tokens par id].
function setup($n)
{
    $r = call(['action' => 'create', 'name' => 'Joueur1']);
    $code = $r['code'];
    $tokens = [$r['playerId'] => $r['token']];
    for ($i = 2; $i <= $n; $i++) {
        $j = call(['action' => 'join', 'code' => strtolower($code), 'name' => "Joueur$i"]);
        $tokens[$j['playerId']] = $j['token'];
    }
    return [$code, $tokens];
}

function act($code, $token, $action, array $extra = [])
{
    return call(['action' => $action, 'code' => $code, 'token' => $token] + $extra)['room'];
}

function view($code, $token)
{
    return call(['action' => 'state', 'code' => $code, 'token' => $token])['room'];
}

// --- Salon ---
list($code, $t) = setup(3);
check(count($t) === 3, 'trois joueurs');
expect_error(['action' => 'join', 'code' => $code, 'name' => 'joueur1'], 'pseudo en double');
expect_error(['action' => 'start', 'code' => $code, 'token' => $t[2]], 'seul l\'hôte lance');
expect_error(['action' => 'state', 'code' => $code, 'token' => 'faux'], 'mauvais jeton');
$v = view($code, $t[1]);
$same = call(['action' => 'state', 'code' => $code, 'token' => $t[1], 'v' => $v['v']]);
check(!empty($same['unchanged']), 'polling sans changement');
act($code, $t[1], 'leave');
$v = view($code, $t[2]);
check($v['hostId'] === 2 && count($v['players']) === 2, "l'hôte part, le suivant devient hôte");

// --- Undercover ---
for ($game = 0; $game < 30; $game++) {
    list($code, $t) = setup(6);
    $v = act($code, $t[1], 'start', ['settings' => ['undercover' => 1, 'mrwhite' => 1]]);
    check($v['status'] === 'playing', 'undercover lancé');
    $guard = 0;
    while (true) {
        $v = view($code, $t[1]);
        $g = $v['g'];
        if ($g['phase'] === 'end' || $guard++ > 50) {
            break;
        }
        if ($g['phase'] === 'play') {
            act($code, $t[1], 'play', ['type' => 'to_vote']);
        } elseif ($g['phase'] === 'vote') {
            foreach ($g['alive'] as $id) {
                if (in_array($id, $g['voted'], true)) {
                    continue;
                }
                $choices = array_values(array_diff($g['candidates'] ?: $g['alive'], [$id]));
                act($code, $t[$id], 'play', ['type' => 'vote', 'target' => $choices[array_rand($choices)]]);
                $g = view($code, $t[1])['g'];
                if ($g['phase'] !== 'vote') {
                    break;
                }
            }
        } elseif ($g['phase'] === 'mrwhite') {
            act($code, $t[$g['lastOut']], 'play', ['type' => 'guess', 'word' => 'nimporte']);
        } elseif ($g['phase'] === 'reveal') {
            act($code, $t[1], 'play', ['type' => 'next']);
        }
    }
    check($g['phase'] === 'end' && in_array($g['winner'], ['civils', 'infiltres', 'mrwhite'], true), 'undercover se termine');
    $words = array_unique(array_filter(array_map(function ($tok) use ($code) {
        return view($code, $tok)['g']['word'];
    }, $t)));
    check(count($words) === 2, 'deux mots distincts');
}
// Mr White qui devine
list($code, $t) = setup(5);
act($code, $t[1], 'start', ['settings' => ['undercover' => 0, 'mrwhite' => 1]]);
$white = null;
$word = null;
foreach ($t as $id => $tok) {
    $g = view($code, $tok)['g'];
    if ($g['isMrWhite']) {
        $white = $id;
    } else {
        $word = $g['word'];
    }
}
act($code, $t[1], 'play', ['type' => 'to_vote']);
foreach ($t as $id => $tok) {
    $target = $id === $white ? ($white === 1 ? 2 : 1) : $white;
    act($code, $tok, 'play', ['type' => 'vote', 'target' => $target]);
}
$g = view($code, $t[1])['g'];
check($g['phase'] === 'mrwhite', 'Mr White doit deviner');
act($code, $t[$white], 'play', ['type' => 'guess', 'word' => strtoupper($word) . ' ']);
$g = view($code, $t[1])['g'];
check($g['winner'] === 'mrwhite', 'Mr White gagne en devinant');

// --- Time Bomb ---
$results = [];
for ($game = 0; $game < 50; $game++) {
    $n = 4 + $game % 5;
    list($code, $t) = setup($n);
    act($code, $t[1], 'choose', ['game' => 'timebomb']);
    act($code, $t[1], 'start');
    $g = view($code, $t[1])['g'];
    check(array_sum($g['handSizes']) === 5 * $n, 'paquet de 5n cartes');
    $guard = 0;
    while ($g['phase'] === 'play' && $guard++ < 100) {
        $cutter = $g['pincers'];
        expect_error(['action' => 'play', 'code' => $code, 'token' => $t[$cutter], 'type' => 'cut', 'target' => $cutter], 'pas sa propre carte');
        $targets = array_keys(array_filter($g['handSizes']));
        $targets = array_values(array_diff($targets, [$cutter]));
        $g = act($code, $t[$cutter], 'play', ['type' => 'cut', 'target' => $targets[array_rand($targets)]])['g'];
    }
    check($g['phase'] === 'end', 'time bomb se termine');
    check($g['round'] <= 4, 'quatre manches max');
    $results[$g['reason']] = 1;
}
check(count($results) >= 2, 'plusieurs fins possibles en time bomb');
// La carte coupée est bien celle que le joueur a choisie.
$g = ['players' => [1, 2], 'roles' => [], 'hands' => [1 => ['safe'], 2 => ['safe', 'wire', 'safe']], 'round' => 1,
    'cuts' => 0, 'wires' => 0, 'revealed' => [], 'pincers' => 1, 'phase' => 'play', 'winner' => null];
tb_action($g, 1, 'cut', ['target' => 2, 'slot' => 1], false);
check($g['revealed'][0]['card'] === 'wire' && $g['hands'][2] === ['safe', 'safe'], 'time bomb : la carte choisie est coupée');

// --- Loup-garou ---
$winners = [];
for ($game = 0; $game < 40; $game++) {
    $n = 5 + $game % 8;
    list($code, $t) = setup($n);
    act($code, $t[1], 'choose', ['game' => 'loupgarou', 'settings' => ['witch' => 1, 'hunter' => 1]]);
    act($code, $t[1], 'start');
    $roles = [];
    foreach ($t as $id => $tok) {
        $roles[$id] = view($code, $tok)['g']['myRole'];
    }
    check(count(array_keys($roles, 'wolf')) >= 1, 'au moins un loup');
    $wolfView = view($code, $t[array_search('wolf', $roles)])['g'];
    check(count($wolfView['wolves']) === count(array_keys($roles, 'wolf')), 'les loups se connaissent');
    $villagerView = view($code, $t[array_search('villager', $roles) ?: array_search('seer', $roles)])['g'];
    check(!isset($villagerView['wolves']) && $villagerView['roles'] === null, 'un villageois ne voit rien');

    $guard = 0;
    while ($guard++ < 200) {
        $g = view($code, $t[1])['g'];
        if ($g['phase'] === 'end') {
            break;
        }
        $alive = $g['alive'];
        $pickOther = function ($me, $filter = null) use ($alive, $roles) {
            $c = array_values(array_filter($alive, function ($id) use ($me, $filter, $roles) {
                return $id !== $me && (!$filter || $filter($roles[$id]));
            }));
            return $c[array_rand($c)];
        };
        if ($g['phase'] === 'night') {
            $wolves = array_values(array_filter($alive, function ($id) use ($roles) {
                return $roles[$id] === 'wolf';
            }));
            $prey = $pickOther(-1, function ($r) {
                return $r !== 'wolf';
            });
            foreach ($alive as $id) {
                if ($roles[$id] === 'seer') {
                    $sv = view($code, $t[$id])['g'];
                    if (!$sv['seerDone']) {
                        act($code, $t[$id], 'play', ['type' => 'seer', 'target' => $pickOther($id)]);
                    }
                    act($code, $t[$id], 'play', ['type' => 'seer_ok']);
                }
            }
            foreach ($wolves as $w) {
                act($code, $t[$w], 'play', ['type' => 'wolf_vote', 'target' => $prey]);
            }
        } elseif ($g['phase'] === 'witch') {
            $w = array_search('witch', $roles);
            $wv = view($code, $t[$w])['g'];
            $extra = ['type' => 'witch', 'save' => random_int(0, 1) === 1];
            if ($wv['potions']['death'] && random_int(0, 2) === 0) {
                $extra['target'] = $pickOther($w);
            }
            act($code, $t[$w], 'play', $extra);
        } elseif ($g['phase'] === 'hunter') {
            act($code, $t[$g['hunter']], 'play', ['type' => 'hunter', 'target' => $pickOther($g['hunter'])]);
        } elseif ($g['phase'] === 'day') {
            $target = $pickOther(-1);
            foreach ($alive as $id) {
                $phase = view($code, $t[1])['g']['phase'];
                if ($phase !== 'day') {
                    break;
                }
                act($code, $t[$id], 'play', ['type' => 'vote', 'target' => $id === $target ? $pickOther($id) : $target]);
            }
        }
    }
    check($g['phase'] === 'end', "loup-garou se termine ($n joueurs)");
    $winners[$g['winner']] = 1;
    act($code, $t[1], 'lobby');
}
check(count($winners) === 2, 'les deux camps peuvent gagner');

// --- Mode test (joueurs test incarnés par l'hôte) ---
list($code, $t) = setup(2);
$host = $t[1];
expect_error(['action' => 'add_bot', 'code' => $code, 'token' => $t[2]], 'seul l\'hôte ajoute un joueur test');
act($code, $host, 'add_bot');
$r = act($code, $host, 'add_bot');
check(count($r['players']) === 4, 'deux joueurs test ajoutés');
$bot = $r['players'][2];
check($bot['bot'] === true && $bot['name'] === 'Test 1', 'joueur test nommé Test 1');
check($r['players'][3]['name'] === 'Test 2', 'deuxième joueur test');
act($code, $host, 'choose', ['game' => 'undercover', 'settings' => []]);
act($code, $host, 'start');
$v = call(['action' => 'state', 'code' => $code, 'token' => $host, 'as' => $bot['id']])['room'];
check($v['me'] === $bot['id'] && $v['realMe'] === 1, 'l\'hôte voit le point de vue du joueur test');
$v2 = call(['action' => 'state', 'code' => $code, 'token' => $t[2], 'as' => $bot['id']])['room'];
check($v2['me'] === 2, 'un joueur normal ne peut pas incarner un joueur test');
$v3 = call(['action' => 'state', 'code' => $code, 'token' => $host, 'as' => 2])['room'];
check($v3['me'] === 1, 'l\'hôte ne peut pas incarner un vrai joueur');
act($code, $host, 'play', ['type' => 'to_vote']);
$r = act($code, $host, 'play', ['type' => 'vote', 'target' => 2, 'as' => $bot['id']]);
check($r['me'] === $bot['id'], 'action jouée au nom du joueur test');
$g = room_read($code)['g'];
check(isset($g['votes'][$bot['id']]) && !isset($g['votes'][1]), 'le vote compte pour le joueur test, pas pour l\'hôte');

@unlink($db);
@unlink($cfg);
echo $failures ? "$failures échec(s)\n" : "Tous les tests passent.\n";
exit($failures ? 1 : 0);
