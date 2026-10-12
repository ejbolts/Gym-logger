# Gym Logger 0.5.3 consolidation

Selected all four open, non-draft PRs after fetching on 13 October 2026. Each targets `master`; none has a required GitHub check, review objection or unresolved review comment. No PRs are excluded.

| Integration order | PR | Reviewed head | Purpose |
| --- | --- | --- | --- |
| 1 | [#23](https://github.com/ejbolts/Gym-video-logger/pull/23) | `28d442137c0f136aae9579f2a08c8cd74f5164a6` | Custom exercise labels and account isolation |
| 2 | [#24](https://github.com/ejbolts/Gym-video-logger/pull/24) | `cf41a70cb48c54ed4c43abcae7391522fcfa9025` | Strict weight/volume records and popup countdown |
| 3 | [#25](https://github.com/ejbolts/Gym-video-logger/pull/25) | `cc5d648ead94e01385b5120b652b5f91d1ef8f20` | Profile visibility, sharing and follow requests |
| 4 | [#26](https://github.com/ejbolts/Gym-video-logger/pull/26) | `fc07c67492656ff3ec935cd4e953b150cc6855d6` | Editing the actual Home cards |

Integrate from `master` at `00d52f4`. Start with the smallest change, then the shared record calculations, profile navigation and finally the larger Today layout refactor. No source dependency requires a different order. The trial integration finds conflicts only in `frontend/release.json` and `docs/RELEASE-NOTES.md`; overlapping application code merges automatically and needs combined regression checks.

The user explicitly capped and approved this batch at **0.5.3**, overriding the default release-number rule. The public deployed `https://gym-logger.duckdns.org/release.json` reports **0.3.0** at review time. Consolidate the unpublished 0.4.0, 0.4.1 and 0.5.0 proposals into one 0.5.3 announcement; preserve deployed history and existing screenshot references. Do not increment again for review fixes or the merge.

Use one consolidation PR containing merge commits from these exact heads. Merge it with a **merge commit**, not squash or rebase: all four original PR heads remain ancestors of `master`, allowing GitHub to recognise the original PRs as merged. Recheck original heads, mergeability, reviews/checks and current `master` before merging. Any new source change invalidates the affected combined verification.

Required combined verification: repository formatting/lint checks, production frontend build, full frontend/backend suites, fresh schema and upgrade from a synthetic pre-sharing schema, and isolated phone-width UI checks of Home editing, custom labels, record popups and profile-sharing/follow transitions. Review final screenshots and short real interaction recordings for card motion and transient record popups. Keep all records, credentials, uploads and build output separate from stable installations.

Merging this batch does not deploy, rebuild or restart the stable application. Deployment later requires migration `0033_profile_sharing` in addition to the already pending `0031_app_feedback` and `0032_profile_photos` migrations.
