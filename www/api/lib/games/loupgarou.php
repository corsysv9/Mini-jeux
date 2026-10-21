<?php
// Loup-garou : l'application fait le meneur de jeu (nuits, votes, annonces).

function lg_defaults($n)
{
    return [
        'wolves' => $n <= 5 ? 1 : ($n <= 11 ? 2 : 3),
        'seer' => 1,
        'witch' => $n >= 6 ? 1 : 0,
        'hunter' => $n >= 7 ? 1 : 0,
    ];
}

function lg_start(array $ids, array $settings)
{
    $n = count($ids);
    $d = lg_defaults($n);
    $nw = setting($settings, 'wolves', $d['wolves'], 1, $n);
    $specials = [];
    foreach (['seer', 'witch', 'hunter'] as $r) {
        if (setting($settings, $r, $d[$r], 0, 1)) {
            $specials[] = $r;
        }
    }
    if ($nw >= $n - $nw) {
        throw new GameError('Trop de loups pour le nombre de joueurs.');
    }
    if ($nw + count($specials) > $n) {
        throw new GameError('Trop de rôles spéciaux pour le nombre de joueurs.');
    }
    $roleList = array_merge(array_fill(0, $nw, 'wolf'), $specials);
    $roleList = array_merge($roleList, array_fill(0, $n - count($roleList), 'villager'));
    $roleList = shuffled($roleList);
    $roles = [];
    foreach ($ids as $i => $id) {
        $roles[$id] = $roleList[$i];
    }
    $g = [
        'roles' => $roles,
        'alive' => $ids,
        'night' => 0,
        'potions' => ['life' => true, 'death' => true],
        'seerLog' => [],
        'events' => [],
        'winner' => null,
    ];
    lg_start_night($g);
    return $g;
}

function lg_alive_with(array $g, $role)
{
    return array_values(array_filter($g['alive'], function ($id) use ($g, $role) {
        return $g['roles'][$id] === $role;
    }));
}

function lg_is_alive(array $g, $id)
{
    return in_array($id, $g['alive'], true);
}

function lg_start_night(array &$g)
{
    $g['night']++;
    $g['phase'] = 'night';
    $g['wolfVotes'] = [];
    $g['seerDone'] = !lg_alive_with($g, 'seer');
    $g['victim'] = null;
}

function lg_log(array &$g, $text)
{
    $g['events'][] = $text;
}

function lg_action(array &$g, $pid, $type, array $in, $isHost)
{
    $target = isset($in['target']) && $in['target'] !== null ? (int) $in['target'] : null;
    $role = $g['roles'][$pid];
    $alive = lg_is_alive($g, $pid);

    switch ($type) {
        case 'wolf_vote':
            if ($g['phase'] !== 'night' || $role !== 'wolf' || !$alive) {
                throw new GameError("Ce n'est pas le moment.");
            }
            if (!lg_is_alive($g, $target) || $g['roles'][$target] === 'wolf') {
                throw new GameError('Cible invalide.');
            }
            $g['wolfVotes'][$pid] = $target;
            lg_check_night($g);
            return;
        case 'seer':
            if ($g['phase'] !== 'night' || $role !== 'seer' || !$alive || $g['seerDone']) {
                throw new GameError("Ce n'est pas le moment.");
            }
            if (!lg_is_alive($g, $target) || $target === $pid) {
                throw new GameError('Cible invalide.');
            }
            $g['seerLog'][] = ['night' => $g['night'], 'target' => $target, 'role' => $g['roles'][$target]];
            $g['seerDone'] = true;
            lg_check_night($g);
            return;
        case 'seer_ok':
            // La voyante a lu sa réponse : la nuit peut continuer.
            if ($role !== 'seer') {
                throw new GameError("Ce n'est pas le moment.");
            }
            $g['seerRead'] = $g['night'];
            lg_check_night($g);
            return;
        case 'witch':
            if ($g['phase'] !== 'witch' || $role !== 'witch' || !$alive) {
                throw new GameError("Ce n'est pas le moment.");
            }
            $save = !empty($in['save']) && $g['potions']['life'] && $g['victim'] !== null;
            $kill = $target !== null && $g['potions']['death'];
            if ($kill && !lg_is_alive($g, $target)) {
                throw new GameError('Cible invalide.');
            }
            if ($save) {
                $g['potions']['life'] = false;
                $g['victim'] = null;
            }
            $g['poisoned'] = null;
            if ($kill) {
                $g['potions']['death'] = false;
                $g['poisoned'] = $target;
            }
            lg_end_night($g);
            return;
        case 'hunter':
            if ($g['phase'] !== 'hunter' || $g['hunter'] !== $pid) {
                throw new GameError("Ce n'est pas le moment.");
            }
            if (!lg_is_alive($g, $target)) {
                throw new GameError('Cible invalide.');
            }
            lg_log($g, ['type' => 'hunter', 'by' => $pid, 'target' => $target, 'role' => $g['roles'][$target]]);
            lg_kill($g, [$target], $g['afterHunter']);
            return;
        case 'vote':
            if ($g['phase'] !== 'day' || !$alive) {
                throw new GameError("Ce n'est pas le moment de voter.");
            }
            if (!lg_is_alive($g, $target) || $target === $pid) {
                throw new GameError('Vote invalide.');
            }
            $g['dayVotes'][$pid] = $target;
            if (count($g['dayVotes']) === count($g['alive'])) {
                lg_resolve_day($g);
            }
            return;
        case 'force':
            // Débloque la partie si quelqu'un ne répond plus.
            if (!$isHost) {
                throw new GameError("Seul l'hôte peut forcer la suite.");
            }
            if ($g['phase'] === 'night') {
                $g['seerDone'] = true;
                $g['seerRead'] = $g['night'];
                lg_finish_wolves($g);
            } elseif ($g['phase'] === 'witch') {
                $g['poisoned'] = null;
                lg_end_night($g);
            } elseif ($g['phase'] === 'day') {
                lg_resolve_day($g);
            } elseif ($g['phase'] === 'hunter') {
                lg_after($g, $g['afterHunter']);
            }
            return;
    }
    throw new GameError('Action inconnue.');
}

function lg_check_night(array &$g)
{
    $wolves = lg_alive_with($g, 'wolf');
    $wolvesDone = count($g['wolfVotes']) === count($wolves)
        && count(array_unique(array_values($g['wolfVotes']))) === 1;
    $seerDone = $g['seerDone'] && (!lg_alive_with($g, 'seer') || (isset($g['seerRead']) && $g['seerRead'] === $g['night']));
    if ($wolvesDone && $seerDone) {
        lg_finish_wolves($g);
    }
}

function lg_finish_wolves(array &$g)
{
    $top = top_voted($g['wolfVotes']);
    $g['victim'] = $top ? pick($top) : null;
    $g['poisoned'] = null;
    $witches = lg_alive_with($g, 'witch');
    if ($witches && ($g['potions']['life'] || $g['potions']['death'])) {
        $g['phase'] = 'witch';
        return;
    }
    lg_end_night($g);
}

function lg_end_night(array &$g)
{
    $dead = [];
    if ($g['victim'] !== null) {
        $dead[] = $g['victim'];
    }
    if ($g['poisoned'] !== null && !in_array($g['poisoned'], $dead, true)) {
        $dead[] = $g['poisoned'];
    }
    $deadInfo = [];
    foreach ($dead as $id) {
        $deadInfo[] = ['id' => $id, 'role' => $g['roles'][$id]];
    }
    lg_log($g, ['type' => 'dawn', 'night' => $g['night'], 'dead' => $deadInfo]);
    lg_kill($g, $dead, 'day');
}

// Tue des joueurs, gère le chasseur, la victoire, puis passe à la phase $next.
function lg_kill(array &$g, array $ids, $next)
{
    $hunter = null;
    foreach ($ids as $id) {
        $g['alive'] = array_values(array_diff($g['alive'], [$id]));
        if ($g['roles'][$id] === 'hunter') {
            $hunter = $id;
        }
    }
    if (lg_check_win($g)) {
        return;
    }
    if ($hunter !== null) {
        $g['phase'] = 'hunter';
        $g['hunter'] = $hunter;
        $g['afterHunter'] = $next;
        return;
    }
    lg_after($g, $next);
}

function lg_after(array &$g, $next)
{
    if ($next === 'day') {
        $g['phase'] = 'day';
        $g['dayVotes'] = [];
    } else {
        lg_start_night($g);
    }
}

function lg_resolve_day(array &$g)
{
    $top = top_voted($g['dayVotes']);
    if (count($top) !== 1) {
        lg_log($g, ['type' => 'vote', 'dead' => null, 'votes' => $g['dayVotes']]);
        lg_start_night($g);
        return;
    }
    $out = $top[0];
    lg_log($g, ['type' => 'vote', 'dead' => ['id' => $out, 'role' => $g['roles'][$out]], 'votes' => $g['dayVotes']]);
    lg_kill($g, [$out], 'night');
}

function lg_check_win(array &$g)
{
    $wolves = count(lg_alive_with($g, 'wolf'));
    $others = count($g['alive']) - $wolves;
    if ($wolves === 0) {
        $g['winner'] = 'village';
    } elseif ($wolves >= $others) {
        $g['winner'] = 'wolves';
    } else {
        return false;
    }
    $g['phase'] = 'end';
    return true;
}

function lg_view(array $g, $pid)
{
    $role = $g['roles'][$pid];
    $alive = lg_is_alive($g, $pid);
    $v = [
        'phase' => $g['phase'],
        'night' => $g['night'],
        'alive' => $g['alive'],
        'myRole' => $role,
        'events' => $g['events'],
        'winner' => $g['winner'],
        // Le vote du jour est public, comme à main levée.
        'dayVotes' => $g['phase'] === 'day' ? $g['dayVotes'] : [],
        'myVote' => $g['phase'] === 'day' && isset($g['dayVotes'][$pid]) ? $g['dayVotes'][$pid] : null,
        'hunter' => $g['phase'] === 'hunter' ? $g['hunter'] : null,
        'roles' => null,
    ];
    if ($role === 'wolf') {
        $v['wolves'] = array_values(array_filter(array_keys($g['roles']), function ($id) use ($g) {
            return $g['roles'][$id] === 'wolf';
        }));
        $v['wolfVotes'] = $g['phase'] === 'night' ? $g['wolfVotes'] : [];
    }
    if ($role === 'seer') {
        $v['seerLog'] = $g['seerLog'];
        $v['seerDone'] = $g['seerDone'];
        $v['seerRead'] = isset($g['seerRead']) && $g['seerRead'] === $g['night'];
    }
    if ($role === 'witch') {
        $v['potions'] = $g['potions'];
        if ($g['phase'] === 'witch') {
            $v['victim'] = $g['victim'];
        }
    }
    // Les morts et la fin de partie voient tous les rôles.
    if (!$alive || $g['phase'] === 'end') {
        $v['roles'] = $g['roles'];
    }
    return $v;
}
