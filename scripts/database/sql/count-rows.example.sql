-- Copy to counts.sql (do not commit real secrets inside SQL files).
-- Run from Supabase SQL Editor or psql against your project DB.

SELECT 'Place' AS table_name, COUNT(*)::bigint FROM "Place"
UNION ALL
SELECT 'User', COUNT(*)::bigint FROM "User"
UNION ALL
SELECT 'Review', COUNT(*)::bigint FROM "Review";
