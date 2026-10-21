<?php
require __DIR__ . '/room.php';
require __DIR__ . '/db.php';
require __DIR__ . '/games/undercover.php';
require __DIR__ . '/games/timebomb.php';
require __DIR__ . '/games/loupgarou.php';

function handle(array $in)
{
    $action = isset($in['action']) ? (string) $in['action'] : '';
    if ($action === 'create') {
        return action_create($in);
    }
    if ($action === 'join') {
        return action_join($in);
    }
    if ($action === 'state') {
        return action_state($in);
    }
    return action_room($in, $action);
}
