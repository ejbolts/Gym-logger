# Gym logger agent instructions

Follow this repository's README and checks, together with the user's shared verification and Git synchronization instructions.

Keep server release runbooks and private operator notes local. Do not commit them or include their contents in pull requests. Consult the operator's local instructions before an explicitly authorized deployment.

## Private URLs in repository content and pull requests

- Keep personal Tailscale hostnames, tailnet identifiers, private IP addresses and other installation-specific URLs out of new or updated committed content, including documentation, source examples, tests and release notes. Use generic examples such as `https://gym.example.com` or loopback URLs such as `http://127.0.0.1:8000`; obtain actual deployment addresses from local configuration or `tailscale serve status`.
- Apply the same rule to PR titles, descriptions, comments and shared screenshots or recordings. Before committing or publishing a PR update, inspect the staged additions, PR text and selected evidence for private URLs; omit or redact them, including browser address bars. Do not repeat a removed private URL in commit messages or PR explanations.
- Private replies to the user may include the actual clickable local or Tailscale URL. Keep actual host/address details in private replies or local verification notes; describe the environment generically in PRs while retaining the relevant port, branch/commit and sample-data isolation details.

## Release versions and announcements

For every application feature, fix, or other user-visible change, keep `frontend/release.json` and the release notes accurate in the same change or pull request before considering the task complete. Its `version` controls whether users see the release announcement again. Versions identify application releases, not the number of pull requests.

- Advance the semantic version for each new release; never reuse a version that has already been deployed. Do not increment for each PR, merge, review fix or deployment retry. Compare the latest deployed version with the existing pending release before choosing a release number.
- **A coordinated batch of multiple PRs for an application release gets one minor version bump** (for example, `0.3.0` to `0.4.0`, resetting the patch number to zero), even when its individual changes are mostly patches. Evaluate the open GitHub PRs first, then select the batch and its shared version. All PRs included in that batch contribute to the same release notes and retain that version; do not stack their individually proposed patch or minor bumps. This batch rule takes precedence over the standalone-PR rules below.
- **For an independently released single PR, default to a patch version bump** (for example, `0.3.0` to `0.3.1`) for fixes, UI changes, maintenance and small improvements to existing features. Use a minor bump for a clear, substantial new capability or workflow, such as an account system or new end-to-end import workflow, and explain why in the PR. Prefer a patch when unclear; code size, a feature label or a new UI control alone do not justify a minor bump.
- Once the batch version is assigned, follow-up corrections and additional PRs included in that same pending release retain it until deployment. An already pending minor release can become the batch release without another bump; consolidate any unpublished patch notes into it and preserve notes for deployed releases. Choose the version manually in `frontend/release.json`; the build validates and publishes this metadata but does not increment versions automatically.
- When a new version replaces an already deployed release in `frontend/release.json`, first move that deployed entry to the top of `frontend/release-history.json` so the app's **Earlier versions** list keeps it. History must stay newest first and older than the current version; do not add unpublished pending versions.
- Update the title, summary and changes to describe the release accurately. Keep the GitHub URL pointing to the matching release notes, and update `docs/RELEASE-NOTES.md` with those notes.
- For a visible feature or UI improvement, include a screenshot when practical. Capture the verified revision using the isolated sample-data environment, inspect it for secrets or personal data, and commit it under `docs/screenshots/releases/` with a versioned filename. Embed it in that release's notes with descriptive alt text and a caption; use before/after images when they help explain the change. For changes with no visible result, or when capture is unavailable, explain the omission in the notes or pull request.
- To show the screenshot in the app's announcement, set the optional `image` object in `frontend/release.json` with `url` and `alt`. Use the direct HTTPS `raw.githubusercontent.com` image URL pinned to the screenshot's committed revision, rather than a GitHub page URL or temporary local browser artifact. Verify the image loads for app users without signing into GitHub; the announcement must remain usable if it cannot load.
- Documentation, tests and internal tooling changes that do not affect application behavior do not require a version bump.
- A bare `git pull` does not rebuild the frontend. Follow `deploy/update.sh` and the deployment guide when an application deployment is authorized; updating release metadata does not authorize restarting or updating the stable app.

## GitHub releases and tags

Each deployed application version gets a Git tag and a published GitHub Release, so the repository's **Releases** page records exactly which commit each version shipped from.

- Name the tag `v` plus the `frontend/release.json` version (for example, `v0.6.0`), and use that release's `title` as the GitHub Release title. Publish it as a normal release marked latest, not a pre-release or draft.
- Create the release as part of an authorized deployment, after the server is updated, on the exact `main` commit that was deployed. That commit must contain the matching `frontend/release.json` version. Merging a PR or batch alone does not authorize tagging or publishing a release, and do not tag pending versions or feature branches.
- For example: `gh release create v0.6.0 --target <deployed main SHA> --title "<release.json title>" --notes-file <notes> --latest`. Write the notes file outside the repository from that version's section of `docs/RELEASE-NOTES.md`. Change relative screenshot paths to `raw.githubusercontent.com` URLs pinned to the tagged commit, and apply the private URL rules to the notes.
- Treat published tags as permanent. Never move, delete, force-push or reuse a version tag; a fix after release ships as a new version with its own tag. Correcting a published release's notes text is fine.
- Keep the `url` in `frontend/release.json` pointing at the version's `docs/RELEASE-NOTES.md` section, since that link must work before the GitHub Release exists.

## Reviewing and merging a PR batch

Before merging a batch into `master`:

1. Fetch and inspect the repository state under the Git synchronization instructions. Query the attached GitHub repository for its currently open PRs, including drafts and stacked PRs, rather than relying on an earlier list or only the PR mentioned in chat. Paginate if necessary so the evaluation includes all open PRs.
2. Review each candidate's purpose, diff, base branch, dependencies, verification evidence, check/review status, mergeability and proposed release metadata. Identify overlapping changes, conflicts and PRs that would overwrite another PR's version, notes or screenshots. Exclude or defer drafts and unready PRs; an open PR is not automatically part of the batch or authorized for merging.
3. Within the user's authorized merge scope, record the selected PR numbers, merge order, exclusions and shared release version in a batch plan or coordinating PR. Use one minor bump for an application-release batch. A batch consisting entirely of documentation, tests or internal tooling with no application behavior change needs no app version bump.
4. Reconcile `frontend/release.json`, its GitHub link and `docs/RELEASE-NOTES.md` into one coherent announcement covering the whole batch. Preserve deployed release history and screenshot references. Resolve competing version edits to the selected batch version, rather than accepting successive increments from each PR.
5. Verify the combined code at a fixed revision before declaring the batch ready. Perform integration at a task boundary and rerun affected checks after any code changes. During merging, re-check the next PR's current head, checks and conflicts as earlier merges can affect it; keep the batch version unchanged. Finish by confirming `master` contains the selected changes and matching release metadata. Merging a batch alone does not authorize deployment or a stable-app restart.

## Deleting branches after merging

After merging a PR or branch into `master`, delete its head branch on GitHub (and the local branch, when no worktree or other agent is using it), then run `git fetch --prune`.

- For stacked PRs, retarget each child PR to `master` (or merge them bottom-up) before merging and deleting its parent. A child merged into a parent branch after the parent has already reached `master` never reaches `master` itself, even though GitHub shows it as merged.
- Delete a branch only after confirming that its current head reached `master`: it is an ancestor of `master`, or it matches the head of a PR merged into `master` (squash merges). Keep a branch that has commits newer than its merged PR, and report it instead.
- Keep `pr-media` and `media/*` branches. They host screenshots and recordings referenced by PR descriptions and are never merged.

## Private Tailscale endpoints

- **443 -> 3773: T3 Code.** Leave this route untouched; it does not belong to the gym app.
- **8446 -> 8000: stable gym logger.** Preserve the stable running build and real data. Use the repository's existing startup instructions.
- **8447 -> 8001: feature verification.** This is the reserved verification route. Inspect the actual backend and isolate sample data, credentials, push keys and build output before using it. The profile launchers were reverted.

The separate PowerShell profile launchers were reverted; do not assume they exist or that `start-app.ps1` isolates test data. Verification must never use or copy real workout records, uploads or credentials. Do not build into or automatically pull a running stable checkout. Keep the tested revision fixed during verification and rerun affected checks after changes.

Use **private Tailscale Serve**, with local app servers bound to loopback. Do not enable public Funnel. Inspect `tailscale serve status` before changing a route; never reset the full configuration or replace another project's endpoint. The three-port Funnel restriction does not apply to private Serve.

Retired MainPC routes (removed 10 October 2026): **8444 -> 8088** (Calorie Tracker), **8445 -> 5174** (old gym Vite preview), **8886 -> 8000** (gym alias), and **8443 -> 3000** (owner unconfirmed). Do not recreate them unless explicitly requested. MainPC now has only 443, 8446 and 8447 configured. Inspect other hosts independently.

Git synchronization does not authorize starting, rebuilding, restarting or promoting the stable app. For private verification evidence, report the actual host, HTTPS port, branch/commit (and any uncommitted edits) and data environment. For PRs and committed documentation, use a generic host as described above. Follow the shared verification skill for checks and required screenshots or recordings.
