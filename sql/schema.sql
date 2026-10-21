-- À exécuter une fois dans phpMyAdmin (OVH) sur la base créée pour le site.
CREATE TABLE IF NOT EXISTS rooms (
  code CHAR(5) NOT NULL PRIMARY KEY,
  data MEDIUMTEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  updated_at INT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_rooms_updated ON rooms (updated_at);
