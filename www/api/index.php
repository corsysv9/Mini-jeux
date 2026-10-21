<?php
// Point d'entrée unique de l'API : POST JSON { action, ... }.
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require __DIR__ . '/lib/api.php';

try {
    $in = json_decode(file_get_contents('php://input'), true);
    if (!is_array($in)) {
        throw new GameError('Requête invalide.');
    }
    echo json_encode(['ok' => true] + handle($in));
} catch (GameError $e) {
    echo json_encode(['ok' => false, 'error' => $e->getMessage()]);
} catch (Throwable $e) {
    http_response_code(500);
    error_log('mini-jeux: ' . $e);
    echo json_encode(['ok' => false, 'error' => 'Erreur du serveur, réessaie.']);
}
