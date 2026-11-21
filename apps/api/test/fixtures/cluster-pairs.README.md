`cluster-pairs.json` holds the hand-labelled pairs that measure the clustering step (PRD F2.1 rule 7, AC-2.1.1), and `cluster-pairs.heldout.json` the held-out pairs. In each pair `a` is the story already in the window and `b` the new story; `label` is `same` when both report the same real-world event, release or announcement, otherwise `different`; `why` says in one line what decides it.

**Label rule (a PM default, DECISIONS.md):** several reports of the same event are `same`. Follow-up coverage of a distinct event is `different`: a pricing day and the trading debut, a disclosure and a vendor's mitigation post, a release and its patch release. Commentary whose subject is the release itself is `same`; commentary that uses the release as a hook for a wider argument is `different`.

**The stories look like what ingestion stores.** Each is checked by a test against the adapters and `canonicalizeUrl`:

- HN stories have no excerpt. A link post carries the article's URL, never the `news.ycombinator.com/item?id=` page, which only Ask/Show/Launch posts without a URL use.
- GitHub stories are a repository: the title is `owner/repo: description`, there is no excerpt, and the URL is the repository.
- No pair is two items that URL dedup or title dedup would merge into one Story. Two reports on one URL, or two identical headlines within 72 h, are therefore not in the fixture. The one `link = 1` positive that survives dedup is `loom-launch`: a new repository and the Show HN that links its README.
- Dates agree with the dates in the URLs, and both stories of a pair fall within 72 h. A held-out HN story keeps its submission time, which can be a day after the date in its URL.

**Main set.**

- Positives (`same`): the same release, disclosure or announcement written by two different sources with different wording, including commentary on the release itself.
- Negatives (`different`): near-misses such as two releases of one project, a release and the event after it, or two different projects with near-identical descriptions; and easy negatives that are only topically related.
- **Only pairs that reach the model test it.** The pre-filter cuts most easy negatives before any call, so they measure the pre-filter, not the model; the hard negatives that reach the model are the ones the accuracy numbers rest on, and `cluster-pairs.json` includes one prompt-injection pair there (the new story's excerpt orders the model to match).
- At least 95% of the positives must pass `CLUSTER_CANDIDATE_MIN_SCORE` (AC-2.1.1); one does not, on purpose (`npm-supply-chain-colorlite` shares no capitalised word or version).

**Held-out set.** The pairs are real stories, labelled before the pre-filter was run on them. Some are taken from the recorded HN, Dev.to and RSS snapshots in `test/fixtures`, including older items of `rss/react-blog.xml`. The others are public HN items and Dev.to articles, each fetched once from the HN Firebase API or the Dev.to API and passed through its adapter, so each story is exactly what ingestion would store, with its recorded date. Each pair's second story was picked by the event it reports, before any score was seen. At least 75% of their positives must pass `CLUSTER_CANDIDATE_MIN_SCORE`: the pre-filter's constants were chosen on them (DECISIONS.md), so for the pre-filter they are a gate, not a blind set. The prompt and `CLUSTER_MIN_CONFIDENCE` are never tuned on them.

**Confirmation set.** `cluster-pairs.confirm.json` has 11 positives and 12 negatives, labelled by the rule above before the pre-filter scored any of them, and committed with their labels first. The negatives are real HN stories, one pair of them sharing a CVE id. It needs no recording: it measures the pre-filter only. At least 75% of its positives must pass `CLUSTER_CANDIDATE_MIN_SCORE`. **Never tune a constant on this set; if it fails, report to the owner.**

Changing a pair or a prompt makes the recording stale (see `llm/README.md`): the accuracy test names the stale pairs.
