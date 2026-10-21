<?php
// Copie ce fichier en config.php et remplis-le avec les infos de ta base OVH
// (Espace client OVH > Hébergements > ton hébergement > Bases de données).
// Ne mets jamais config.php sur GitHub : il est ignoré par .gitignore.
return [
    'dsn'  => 'mysql:host=NOM_DU_SERVEUR.mysql.db;dbname=NOM_DE_LA_BASE;charset=utf8mb4',
    'user' => 'NOM_UTILISATEUR',
    'pass' => 'MOT_DE_PASSE',
];
