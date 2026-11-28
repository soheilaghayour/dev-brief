# Changelog

User-visible changes per release. There is no release yet.

## Unreleased

- Keyboard shortcuts are removed.
- Following or muting a tag or a source is one heart button, in the sidebar's tag and source lists (and the mobile filter sheet) and on the Settings page, which lists the same rows: click to follow, again to mute, again to clear. A source row stands for its kind, so its heart sets every source of that kind. Tag and source badges no longer open a menu.
- The header's theme control is one button that shows the theme in use (a sun in light, a moon in dark) and switches to the other on click. System is chosen in Settings, in its own Appearance section.
- The landing hero is two columns from tablet width up: the text on the left, the live feed window on the right. The window lists all of the day's top 30 stories in a frame that scrolls, with a Rust chip, and a card opens its DevBrief story page. The headline reads "Your morning tech scan in 5 minutes", and the copy under it says what deduplication does today.

- Tech Radar and Follow / Mute are live: they no longer sit behind a flag, so the next deploy shows the radar page, its sidebar item, its landing tile, and the follow and mute hearts in the filter lists.
- Feature flags are one variable each, `FEATURE_<NAME>`, for both the API and the web build; the `NEXT_PUBLIC_FEATURE_*` variables are gone.
- Cluster cards: with `FEATURE_CLUSTERS` on, stories covering the same news show as one feed card with a combined source line and a "+N related" control. A story page of a cluster lists the whole cluster as "Related coverage".
- The blog feeds are off: the feed shows Hacker News, Dev.to and GitHub. Stories already fetched from blogs stay until they age out after 90 days unless saved.
- Summaries cover every new story that has something to summarise: a Dev.to article, or at least 3 comments on Hacker News. A story with less shows no Summarize button.
- Feed cards show the first point of the story's summary under the title, on the feed, saved list, collections and the landing preview. A story without a summary shows nothing there.
