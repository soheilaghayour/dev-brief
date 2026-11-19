Recorded once on 2026-11-19 from the seeded feeds with `curl`: `react-blog.xml` (RSS 2.0, all items older than 7 days), `cloudflare-blog.xml` (RSS 2.0, 7 of 20 items newer than 7 days) and `simon-willison.xml` (Atom, 30 entries).

Hand-made: `edge-cases.xml` (missing guid, relative link, HTML in a title and description, missing and malformed dates, an item older than 7 days, an item without a link, a description over 500 characters), `many-recent.xml` (25 recent items and one old) and `broken.xml` (truncated XML).

Tests measure age from 2026-11-19T21:00:00Z, the day the files were recorded and written.

Hand-made later: `atom-edge-cases.xml` (a valid Atom entry with a category and an `<id>`, one with a malformed `<published>`, one dated 2099) and `rss-attribute-edge-cases.xml` (a category with a `domain` attribute and an empty `<guid isPermaLink>`).
