# Changelog

User-visible changes per release. There is no release yet.

## Unreleased

- Tech Radar and Follow / Mute are live: they no longer sit behind a flag, so the next deploy shows the radar page, its sidebar item and `g r`, its landing tile, and the follow and mute menus on every tag and source badge.
- Feature flags are one variable each, `FEATURE_<NAME>`, for both the API and the web build; the `NEXT_PUBLIC_FEATURE_*` variables are gone.
- Cluster cards: with `FEATURE_CLUSTERS` on, stories covering the same news show as one feed card with a combined source line and a "+N related" control. A story page of a cluster lists the whole cluster as "Related coverage".
- The blog feeds are off: the feed shows Hacker News, Dev.to and GitHub. Stories already fetched from blogs stay until they age out after 90 days unless saved.
- Summaries cover every new story that has something to summarise: a Dev.to article, or at least 3 comments on Hacker News. A story with less shows no Summarize button.
- Feed cards show the first point of the story's summary under the title, on the feed, saved list, collections and the landing preview. A story without a summary shows nothing there. The `u` shortcut does nothing on a story that can't be summarised.
