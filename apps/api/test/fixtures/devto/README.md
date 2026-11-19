`top.json` and `latest.json` were recorded once from the live Dev.to API on 2026-11-19: `GET /api/articles?top=1&per_page=50` and `GET /api/articles/latest?per_page=50` with `Accept: application/vnd.forem.api-v1+json` (50 articles each, no shared ids).

`latest-overlapping.json` is hand-made from them: two articles repeated from `top.json`, a cross-post whose `canonical_url` is the newest item of `../rss/cloudflare-blog.xml`, one new article and one invalid entry.

`top.json` and `latest.json` are stored as the API's compact JSON; `.prettierignore` keeps them that way.
