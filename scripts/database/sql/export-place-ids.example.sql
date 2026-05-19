-- Optional: inspect place ids returned by GET /places for linking mobile deep links.

SELECT id, name, region, category
FROM "Place"
ORDER BY "ratingCount" DESC;
