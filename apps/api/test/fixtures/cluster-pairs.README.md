`cluster-pairs.json` holds the hand-labelled pairs that measure the clustering step (PRD F2.1 rule 7, AC-2.1.1). In each pair `a` is the story already in the window and `b` the new story; `label` is `same` when both report the same real-world event, release or announcement, otherwise `different`; `why` says in one line what decides it.

How the pairs were chosen:

- **Positives (same event):** the same release, disclosure, outage or announcement, written by two different sources (a project blog and HN, HN and Dev.to, a repo and a post), with different wording, as ingestion would see them.
- **Hard negatives (different):** the stories a title-based pre-filter cannot tell apart, which are the reason the model decides. Two releases of one project (React 19.1 and 19.2, Rust 1.92 and 1.93, Node.js 26.5.0 and its security release), two events of one project (a release and a pricing change, a release candidate and the final release), a disclosure and a vendor's mitigation post, and two different projects with near-identical descriptions.
- **Easy negatives:** unrelated or only topically related stories, which the pre-filter should cut. They keep the fixture honest about cost: a pair cut by the pre-filter needs no recorded reply.
- Some titles come from the recorded HN, Dev.to and RSS fixtures (the Anthropic IPO pair, `Java4Shell`, GitLab 19.6.0, the Cloudflare posts, `GPT-6.2 Astra and GPT-6.2 Sol`, `Muse Ember`, `datasette 1.0a43`, `A Primer on Fourier Series`). The rest are written in their style, since the recorded fixtures hold few cross-source duplicates; all dates fall within 72 hours per pair.

The positive pairs are sized to the pre-filter: at least 95% must pass `CLUSTER_CANDIDATE_MIN_SCORE`, and one does not (`npm-supply-chain-colorlite` shares no capitalised word or version). Changing a pair means re-recording `llm/clusterMatch.v1.pairs.json` (see `llm/README.md`).
