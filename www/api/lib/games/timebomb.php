<?php
// Time Bomb : Sherlock désamorce (trouve tous les fils), Moriarty fait exploser Big Ben.

function tb_roles($n)
{
    // Rôles tirés dans un paquet un peu plus grand : le nombre exact de Moriarty reste incertain.
    $deck = [4 => [3, 2], 5 => [3, 2], 6 => [4, 2], 7 => [5, 3], 8 => [5, 3]];
    list($s, $m) = $deck[$n];
    $roles = shuffled(array_merge(array_fill(0, $s, 'sherlock'), array_fill(0, $m, 'moriarty')));
    return array_slice($roles, 0, $n);
}

function tb_start(array $ids, array $settings)
{
    $n = count($ids);
    $roleList = tb_roles($n);
    $roles = [];
    foreach ($ids as $i => $id) {
        $roles[$id] = $roleList[$i];
    }
    $cards = array_merge(['bomb'], array_fill(0, $n, 'wire'), array_fill(0, 4 * $n - 1, 'safe'));
    $g = [
        'players' => $ids,
        'roles' => $roles,
        'hands' => [],
        'round' => 1,
        'cuts' => 0,
        'wires' => 0,
        'revealed' => [],
        'pincers' => pick($ids),
        'phase' => 'play',
        'winner' => null,
    ];
    tb_deal($g, $cards);
    return $g;
}

function tb_deal(array &$g, array $cards)
{
    $cards = shuffled($cards);
    $per = intdiv(count($cards), count($g['players']));
    $g['hands'] = [];
    foreach ($g['players'] as $i => $id) {
        $g['hands'][$id] = array_slice($cards, $i * $per, $per);
    }
}

function tb_action(array &$g, $pid, $type, array $in, $isHost)
{
    if ($type !== 'cut') {
        throw new GameError('Action inconnue.');
    }
    if ($g['phase'] !== 'play') {
        throw new GameError('La partie est terminée.');
    }
    if ($g['pincers'] !== $pid) {
        throw new GameError("Ce n'est pas toi qui as la pince.");
    }
    $target = (int) (isset($in['target']) ? $in['target'] : 0);
    if ($target === $pid || !isset($g['hands'][$target]) || !$g['hands'][$target]) {
        throw new GameError('Choisis la carte d\'un autre joueur.');
    }
    // Les cartes sont face cachée et mélangées : on en tire une au hasard.
    $hand = $g['hands'][$target];
    $i = random_int(0, count($hand) - 1);
    $card = $hand[$i];
    array_splice($hand, $i, 1);
    $g['hands'][$target] = $hand;
    $entry = ['card' => $card, 'from' => $target, 'by' => $pid, 'round' => $g['round']];
    // Place de la carte visée dans la vue 3D : purement visuel, le tirage reste au hasard.
    if (isset($in['slot']) && is_numeric($in['slot'])) {
        $entry['slot'] = max(0, min(7, (int) $in['slot']));
    }
    $g['revealed'][] = $entry;
    $g['pincers'] = $target;
    $g['cuts']++;

    if ($card === 'bomb') {
        $g['phase'] = 'end';
        $g['winner'] = 'moriarty';
        $g['reason'] = 'bomb';
        return;
    }
    if ($card === 'wire') {
        $g['wires']++;
        if ($g['wires'] === count($g['players'])) {
            $g['phase'] = 'end';
            $g['winner'] = 'sherlock';
            $g['reason'] = 'wires';
            return;
        }
    }
    if ($g['cuts'] === count($g['players'])) {
        if ($g['round'] === 4) {
            $g['phase'] = 'end';
            $g['winner'] = 'moriarty';
            $g['reason'] = 'time';
            return;
        }
        $g['round']++;
        $g['cuts'] = 0;
        $rest = [];
        foreach ($g['hands'] as $h) {
            $rest = array_merge($rest, $h);
        }
        tb_deal($g, $rest);
    }
}

function tb_view(array $g, $pid)
{
    $mine = $g['hands'][$pid];
    $counts = ['bomb' => 0, 'wire' => 0, 'safe' => 0];
    foreach ($mine as $c) {
        $counts[$c]++;
    }
    $handSizes = [];
    foreach ($g['hands'] as $id => $h) {
        $handSizes[$id] = count($h);
    }
    $v = [
        'phase' => $g['phase'],
        'round' => $g['round'],
        'cuts' => $g['cuts'],
        'wires' => $g['wires'],
        'pincers' => $g['pincers'],
        'revealed' => $g['revealed'],
        'handSizes' => $handSizes,
        'myRole' => $g['roles'][$pid],
        'myCards' => $counts,
        'winner' => $g['winner'],
        'reason' => isset($g['reason']) ? $g['reason'] : null,
    ];
    if ($g['phase'] === 'end') {
        $v['roles'] = $g['roles'];
    }
    return $v;
}
