-- Agrega campo título/prefijo a profesionales (libre: "Dr.", "Lic.", "Dra.", etc.)
ALTER TABLE profesionales ADD COLUMN IF NOT EXISTS titulo TEXT;
