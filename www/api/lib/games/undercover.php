<?php
// Undercover : les civils ont un mot, les undercovers un mot proche, Mr White n'a rien.

const UC_WORDS = [
    ['Chat', 'Chien'], ['Plage', 'Piscine'], ['Pizza', 'Burger'], ['Café', 'Thé'],
    ['Avion', 'Hélicoptère'], ['Guitare', 'Violon'], ['Pomme', 'Poire'], ['Ski', 'Snowboard'],
    ['Football', 'Rugby'], ['Vampire', 'Zombie'], ['Montagne', 'Colline'], ['Lion', 'Tigre'],
    ['Croissant', 'Pain au chocolat'], ['Mer', 'Océan'], ['Vélo', 'Trottinette'], ['Bière', 'Cidre'],
    ['Netflix', 'YouTube'], ['Harry Potter', 'Le Seigneur des anneaux'], ['Bougie', 'Lampe'],
    ['Fromage', 'Beurre'], ['Docteur', 'Infirmier'], ['Train', 'Métro'], ['Neige', 'Grêle'],
    ['Requin', 'Dauphin'], ['Château', 'Palais'], ['Crêpe', 'Gaufre'], ['Paris', 'Londres'],
    ['Instagram', 'TikTok'], ['Mariage', 'Anniversaire'], ['Fourchette', 'Cuillère'],
    ['Sorcière', 'Fée'], ['Pirate', 'Viking'], ['Soleil', 'Lune'], ['Chocolat', 'Caramel'],
    ['Tennis', 'Badminton'], ['Livre', 'Magazine'], ['Moustache', 'Barbe'], ['Bateau', 'Sous-marin'],
    ['Cinéma', 'Théâtre'], ['Raclette', 'Fondue'], ['Bonbon', 'Chewing-gum'], ['Policier', 'Pompier'],
    ['Lunettes', 'Lentilles'], ['Ordinateur', 'Tablette'], ['Fusée', 'Satellite'], ['Hiver', 'Automne'],
    ['Abeille', 'Guêpe'], ['Canapé', 'Fauteuil'], ['Église', 'Cathédrale'], ['Champagne', 'Vin blanc'],
    ['Mickey', 'Donald'], ['Batman', 'Spider-Man'], ['Escargot', 'Limace'], ['Jungle', 'Forêt'],
    ['Professeur', 'Directeur'], ['Sushi', 'Maki'], ['Piano', 'Synthétiseur'], ['Volcan', 'Geyser'],
    ['Tente', 'Cabane'], ['Coca', 'Pepsi'], ['Fraise', 'Framboise'], ['Pyjama', 'Peignoir'],
    ['Désert', 'Savane'], ['Clown', 'Mime'], ['Taxi', 'Uber'], ['Douche', 'Bain'],
];

function uc_defaults($n)
{
    if ($n <= 4) {
        return ['undercover' => 1, 'mrwhite' => 0];
    }
    if ($n <= 6) {
        return ['undercover' => 1, 'mrwhite' => 1];
    }
    if ($n <= 9) {
        return ['undercover' => 2, 'mrwhite' => 1];
    }
    return ['undercover' => 3, 'mrwhite' => 1];
}

function uc_start(array $ids, array $settings)
{
    $n = count($ids);
    $d = uc_defaults($n);
    $nu = setting($settings, 'undercover', $d['undercover'], 0, $n);
    $nw = setting($settings, 'mrwhite', $d['mrwhite'], 0, $n);
    $nc = $n - $nu - $nw;
    if ($nu + $nw < 1) {
        throw new GameError('Il faut au moins un undercover ou un Mr White.');
    }
    if ($nc < 2 || $nc <= $nu + $nw) {
        throw new GameError('Il faut plus de civils que d\'infiltrés.');
    }
    $pair = shuffled(pick(UC_WORDS));
    $roleList = array_merge(array_fill(0, $nc, 'civil'), array_fill(0, $nu, 'undercover'), array_fill(0, $nw, 'mrwhite'));
    $roleList = shuffled($roleList);
    $roles = [];
    foreach ($ids as $i => $id) {
        $roles[$id] = $roleList[$i];
    }
    $g = [
        'words' => ['civil' => $pair[0], 'undercover' => $pair[1]],
        'roles' => $roles,
        'alive' => $ids,
        'round' => 0,
        'eliminated' => [],
        'winner' => null,
        'guess' => null,
    ];
    uc_new_round($g);
    return $g;
}

function uc_new_round(array &$g)
{
    $g['round']++;
    $g['phase'] = 'play';
    $g['votes'] = [];
    $g['candidates'] = null;
    // Mr White ne commence jamais.
    do {
        $order = shuffled($g['alive']);
    } while ($g['roles'][$order[0]] === 'mrwhite' && uc_count($g, ['civil', 'undercover']) > 0);
    $g['order'] = $order;
}

function uc_count(array $g, array $roles)
{
    $n = 0;
    foreach ($g['alive'] as $id) {
        if (in_array($g['roles'][$id], $roles, true)) {
            $n++;
        }
    }
    return $n;
}

function uc_action(array &$g, $pid, $type, array $in, $isHost)
{
    switch ($type) {
        case 'to_vote':
            if (!$isHost || $g['phase'] !== 'play') {
                throw new GameError("Seul l'hôte lance le vote.");
            }
            $g['phase'] = 'vote';
            $g['votes'] = [];
            $g['candidates'] = null;
            return;
        case 'vote':
            if ($g['phase'] !== 'vote') {
                throw new GameError("Ce n'est pas le moment de voter.");
            }
            if (!in_array($pid, $g['alive'], true)) {
                throw new GameError('Tu es éliminé, tu ne votes plus.');
            }
            $target = (int) (isset($in['target']) ? $in['target'] : 0);
            $allowed = $g['candidates'] !== null ? $g['candidates'] : $g['alive'];
            if (!in_array($target, $allowed, true) || $target === $pid) {
                throw new GameError('Vote invalide.');
            }
            $g['votes'][$pid] = $target;
            if (count($g['votes']) === count($g['alive'])) {
                uc_resolve_vote($g);
            }
            return;
        case 'close_vote':
            if (!$isHost || $g['phase'] !== 'vote') {
                throw new GameError("Seul l'hôte peut clôturer le vote.");
            }
            uc_resolve_vote($g);
            return;
        case 'guess':
            if ($g['phase'] !== 'mrwhite' || $g['lastOut'] !== $pid) {
                throw new GameError("Ce n'est pas à toi de deviner.");
            }
            $guess = trim((string) (isset($in['word']) ? $in['word'] : ''));
            $g['guess'] = $guess;
            if (uc_normalize($guess) === uc_normalize($g['words']['civil'])) {
                $g['winner'] = 'mrwhite';
                $g['phase'] = 'end';
                return;
            }
            uc_after_elimination($g);
            return;
        case 'next':
            if (!$isHost || $g['phase'] !== 'reveal') {
                throw new GameError("Seul l'hôte passe au tour suivant.");
            }
            uc_new_round($g);
            return;
    }
    throw new GameError('Action inconnue.');
}

function uc_normalize($s)
{
    $s = mb_strtolower(trim($s));
    $s = strtr($s, ['à' => 'a', 'â' => 'a', 'ä' => 'a', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e',
        'î' => 'i', 'ï' => 'i', 'ô' => 'o', 'ö' => 'o', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ç' => 'c']);
    return preg_replace('/[^a-z0-9]/', '', $s);
}

function uc_resolve_vote(array &$g)
{
    $top = top_voted($g['votes']);
    $g['lastVotes'] = $g['votes'];
    if (count($top) !== 1) {
        if ($g['candidates'] === null && count($top) > 1) {
            // Égalité : on revote entre les ex æquo.
            $g['candidates'] = $top;
            $g['votes'] = [];
            return;
        }
        // Seconde égalité (ou aucun vote) : personne n'est éliminé.
        $g['lastOut'] = null;
        $g['phase'] = 'reveal';
        return;
    }
    $out = $top[0];
    $g['alive'] = array_values(array_diff($g['alive'], [$out]));
    $g['eliminated'][] = $out;
    $g['lastOut'] = $out;
    if ($g['roles'][$out] === 'mrwhite') {
        $g['phase'] = 'mrwhite';
        return;
    }
    uc_after_elimination($g);
}

function uc_after_elimination(array &$g)
{
    $infiltres = uc_count($g, ['undercover', 'mrwhite']);
    $civils = uc_count($g, ['civil']);
    if ($infiltres === 0) {
        $g['winner'] = 'civils';
        $g['phase'] = 'end';
    } elseif ($civils <= 1) {
        $g['winner'] = 'infiltres';
        $g['phase'] = 'end';
    } else {
        $g['phase'] = 'reveal';
    }
}

function uc_view(array $g, $pid)
{
    $role = $g['roles'][$pid];
    $end = $g['phase'] === 'end';
    $v = [
        'phase' => $g['phase'],
        'round' => $g['round'],
        'order' => $g['order'],
        'alive' => $g['alive'],
        'eliminated' => [],
        'voted' => array_map('intval', array_keys($g['votes'])),
        'candidates' => $g['candidates'],
        'myVote' => isset($g['votes'][$pid]) ? $g['votes'][$pid] : null,
        'isMrWhite' => $role === 'mrwhite',
        'word' => $role === 'mrwhite' ? null : $g['words'][$role],
        'lastOut' => isset($g['lastOut']) ? $g['lastOut'] : null,
        'lastVotes' => isset($g['lastVotes']) ? $g['lastVotes'] : null,
        'winner' => $g['winner'],
        'guess' => $g['guess'],
    ];
    // Le rôle d'un joueur éliminé est révélé à tous.
    foreach ($g['eliminated'] as $id) {
        $v['eliminated'][] = ['id' => $id, 'role' => $g['roles'][$id]];
    }
    if ($end) {
        $v['roles'] = $g['roles'];
        $v['words'] = $g['words'];
    }
    return $v;
}
