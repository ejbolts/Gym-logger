# Releasing Gym Logger on the Ubuntu server

Use this runbook for an explicitly authorized update of the existing Oracle Cloud deployment. It records the routine release process used to deploy version 0.5.3 at commit `9368f61`. That commit is a historical example: discover and pin the requested release each time.

Documentation changes, a Git fetch or pull, and merging a PR do not authorize a deployment or restart. This procedure assumes an already configured server; do not rerun `deploy/setup-ubuntu.sh` for an ordinary release because it also changes system packages, the service and Caddy configuration.

## Deployment layout and private configuration

The installed layout is:

| Component                               | Default location or behavior                            |
| --------------------------------------- | ------------------------------------------------------- |
| Checkout and Python virtual environment | `/opt/gym-logger`, `/opt/gym-logger/.venv`              |
| Service and service account             | `gym-logger.service`, `gymlogger:gymlogger`             |
| Configuration                           | `/opt/gym-logger/.env`, readable by the service account |
| Database and media                      | `/opt/gym-logger/data/`                                 |
| YouTube credentials                     | `/opt/gym-logger/secrets/`                              |
| Built frontend                          | `/opt/gym-logger/frontend/dist/`, served by FastAPI     |
| Backend listener                        | `127.0.0.1:8000`, one worker                            |
| HTTPS proxy                             | Caddy, configured in `/etc/caddy/Caddyfile`             |
| Script-generated backups                | `/var/backups/gym-logger/`                              |

Inspect the installed unit, `.env` storage paths and proxy configuration before relying on these defaults. Obtain the SSH destination, key and public app origin from private operator configuration or the user. Keep actual installation addresses, keys, credentials and backup contents out of commits, PR text and published evidence. The hostname below is an example.

This Oracle deployment uses its existing Caddy HTTPS proxy. The separate Windows/Tailscale routes described in `AGENTS.md` are not its deployment configuration; leave them untouched.

## 1. Establish SSH access

On Windows PowerShell, set the privately supplied connection details and test access without printing the key:

```powershell
$sshTarget = 'ubuntu@gym.example.com'
$sshKey = 'C:\path\to\private-key'
ssh -i $sshKey -o IdentitiesOnly=yes -o BatchMode=yes $sshTarget 'hostname; id; sudo -n true'
```

Use the private key, not the `.pub` file. A private key can have a `.txt` extension. Inspect an unexpected SSH host-key change before connecting.

If Windows OpenSSH rejects the private key as too broadly readable, create a restricted temporary copy instead of changing the original or weakening SSH checks:

```powershell
$keyDir = Join-Path $env:TEMP ('gym-release-key-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $keyDir | Out-Null
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$acl = Get-Acl -LiteralPath $keyDir
$acl.SetAccessRuleProtection($true, $false)
$rule = New-Object Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
$acl.SetAccessRule($rule)
Set-Acl -LiteralPath $keyDir -AclObject $acl
$temporaryKey = Join-Path $keyDir 'private-key'
Copy-Item -LiteralPath $sshKey -Destination $temporaryKey
$sshKey = $temporaryKey
ssh-keygen -y -f $sshKey | ssh-keygen -lf -
```

Compare that fingerprint with the supplied public key using `ssh-keygen -lf <public-key-file>`. Remove only the temporary key after the release. Do not include key contents in shell output or reports.

For multiline remote commands, upload an LF-encoded script and execute it over SSH, or use a safely encoded script transport. Nested PowerShell/SSH/Bash quotes can strip quotes and accidentally turn regular-expression alternatives into shell pipelines. Do not build a remote shell command by inserting untrusted text.

## 2. Inspect Git and pin the release

In the local repository, inspect the branch, upstream, changes and attached remote before fetching:

```powershell
git status --short --branch
git branch -vv
git remote -v
git fetch origin
git log -3 --oneline origin/master
$releaseCommit = (git rev-parse origin/master).Trim()
git show "${releaseCommit}:frontend/release.json"
```

Use the attached remote and requested release branch; the examples assume the confirmed `origin/master` deployment branch. Do not deploy open PR heads merely because they exist. Confirm that `frontend/release.json` and `docs/RELEASE-NOTES.md` describe the intended release. The release version comes from `frontend/release.json`, not the package version in `frontend/package.json` or the backend API metadata. Building and deployment do not increment it.

Connect to the VM and inspect its state without changing its running checkout:

```bash
set -euo pipefail
APP_DIR=/opt/gym-logger
SERVICE=gym-logger
PUBLIC_ORIGIN=https://gym.example.com
# Paste the full commit selected for the build, not a moving branch name.
TARGET=REPLACE_WITH_FULL_RELEASE_COMMIT

sudo systemctl cat "$SERVICE"
sudo systemctl show "$SERVICE" -p ActiveState -p MainPID -p NeedDaemonReload
sudo git -C "$APP_DIR" status --short --branch
sudo git -C "$APP_DIR" branch -vv
sudo git -C "$APP_DIR" remote -v
sudo git -C "$APP_DIR" fetch origin
sudo git -C "$APP_DIR" log -3 --oneline HEAD
sudo git -C "$APP_DIR" log -3 --oneline origin/master
sudo git -C "$APP_DIR" merge-base --is-ancestor HEAD "$TARGET"
sudo git -C "$APP_DIR" diff HEAD "$TARGET" -- pyproject.toml deploy backend/migrations
free -h
df -h "$APP_DIR"
sudo /opt/gym-logger/.venv/bin/python -m pip check
```

Read the installed Caddy configuration locally to determine the real HTTPS origin; do not paste its installation-specific hostname into repository content. Inspect storage settings without dumping the whole `.env`, which contains secrets. Confirm the database path, data directory, `GYM_SEED_SAMPLE_DATA=false`, current video/mock settings, service account and loopback binding. Preserve those settings.

Stop if the checkout has an active Git operation, local commits ahead of the release, divergence or unexplained source edits. Preserve the work; do not automatically stash, reset, rebase, switch branches or force-push to make an update succeed.

Editable installs can modify tracked files under `backend/gym_video_logger.egg-info/`. For the recorded release, these were the only modified files, and the target commit did not change them. Their patch and files were saved, and the fast-forward preserved them. Inspect both the local diff and `git diff HEAD "$TARGET" -- backend/gym_video_logger.egg-info` before making that exception; if they overlap or block Git, stop and resolve deliberately without discarding them.

## 3. Build the frontend away from production

The small VM has limited memory. Build the exact pinned source on another machine, then upload the complete `dist` archive. Do not build into the checkout while the stable service is running.

This PowerShell example uses `npm.cmd` from the actual frontend directory. It avoids PowerShell wrapper/working-directory issues and does not depend on an existing local `dist` or `node_modules`:

```powershell
$buildRoot = Join-Path $env:TEMP ('gym-release-build-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path "$buildRoot\source" -Force | Out-Null
git archive --format=tar --output="$buildRoot\source.tar" $releaseCommit
if ($LASTEXITCODE -ne 0) { throw 'Source archive failed' }
tar -xf "$buildRoot\source.tar" -C "$buildRoot\source"
if ($LASTEXITCODE -ne 0) { throw 'Source extraction failed' }
Push-Location "$buildRoot\source\frontend"
try {
    npm.cmd install --no-package-lock --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed' }
    npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed' }
    tar -czf "$buildRoot\frontend.tar.gz" dist
    if ($LASTEXITCODE -ne 0) { throw 'Frontend archive failed' }
} finally {
    Pop-Location
}
Get-FileHash "$buildRoot\frontend.tar.gz" -Algorithm SHA256
```

This follows the repository's current npm build workflow, which has no npm package lock. Check the selected revision's package scripts and Node requirements, investigate relevant engine warnings, and follow any updated dependency workflow. Keep release checks and feature testing in a separate sample-data environment, not on production records.

In the same VM shell as step 2, create a private maintenance directory and record its path:

```bash
umask 077
MAINT=$(mktemp -d "$HOME/gym-release-XXXXXXXX")
printf '%s\n' "$MAINT"
printf '%s\n' "$TARGET" > "$MAINT/target-commit.txt"
mkdir "$MAINT/frontend-build"
```

Back in PowerShell, use that exact returned directory for the transfer:

```powershell
$remoteMaint = '/home/ubuntu/REPLACE_WITH_RETURNED_MAINTENANCE_DIRECTORY'
scp -i $sshKey -o IdentitiesOnly=yes -o BatchMode=yes "$buildRoot\frontend.tar.gz" "${sshTarget}:${remoteMaint}/"
if ($LASTEXITCODE -ne 0) { throw 'Frontend transfer failed' }
```

On the VM, compare `sha256sum "$MAINT/frontend.tar.gz"` with the local hash, then extract and inspect the staged release:

```bash
tar -tzf "$MAINT/frontend.tar.gz"
tar -xzf "$MAINT/frontend.tar.gz" -C "$MAINT/frontend-build"
python3 -m json.tool "$MAINT/frontend-build/dist/release.json"
test -s "$MAINT/frontend-build/dist/index.html"
test -s "$MAINT/frontend-build/dist/sw.js"
test -s "$MAINT/frontend-build/dist/manifest.webmanifest"
```

The archive must contain the entire `dist/` tree: HTML, fingerprinted JS/CSS, images, fonts, release metadata, manifest, service worker and Workbox files. A partial copy can leave the installed PWA unusable.

## 4. Save rollback material before updating

While the service is still running, save the current revision, generated metadata changes, Python package versions and source/configuration/frontend snapshot. The maintenance directory contains secrets and must stay private.

```bash
sudo git -C "$APP_DIR" rev-parse HEAD > "$MAINT/previous-commit.txt"
sudo git -C "$APP_DIR" diff --binary > "$MAINT/pre-update.patch"
sudo "$APP_DIR/.venv/bin/python" -m pip freeze > "$MAINT/python-packages-before.txt"
sudo tar -czf "$MAINT/code-config-before.tar.gz" \
  --exclude='./.git' --exclude='./.venv' --exclude='./data' \
  --exclude='./secrets' --exclude='./node_modules' \
  --exclude='./frontend/node_modules' -C "$APP_DIR" .
sudo bash "$APP_DIR/deploy/backup.sh"
```

`deploy/backup.sh` uses SQLite's backup API and checks snapshot integrity. Its archive includes the database, machine photos, VAPID key, `secrets/` and `.env` when present. It does **not** include all of `data/`: profile photos, account-backup archives, uploads, normalized files and video outputs need the full stopped-service backup below. The script assumes `data/gym-video-logger.db`; adapt deliberately if the inspected production database path differs.

Before maintenance, inspect branch/upstream/status again and fetch once more. Confirm that `TARGET` still identifies the approved release and that the staged frontend belongs to it. If choosing a newer commit, rebuild and recheck it first. Do not pull a moving branch into code being verified.

Now stop the app before changing its checkout, environment, frontend or database schema, and take the authoritative full data backup:

```bash
sudo git -C "$APP_DIR" status --short --branch
sudo git -C "$APP_DIR" branch -vv
sudo git -C "$APP_DIR" remote -v
sudo git -C "$APP_DIR" fetch origin
test "$(sudo git -C "$APP_DIR" rev-parse origin/master)" = "$TARGET"
sudo systemctl stop "$SERVICE"
test "$(sudo systemctl is-active "$SERVICE" || true)" = inactive
sudo bash "$APP_DIR/deploy/backup.sh"
sudo tar -czf "$MAINT/data-secrets-before.tar.gz" -C "$APP_DIR" data secrets
sudo cp -a /etc/systemd/system/gym-logger.service "$MAINT/service-before.conf"
sudo cp -a /etc/caddy/Caddyfile "$MAINT/caddy-before.conf"
sudo chmod 600 "$MAINT/code-config-before.tar.gz" "$MAINT/data-secrets-before.tar.gz"
sudo gzip -t "$MAINT/code-config-before.tar.gz" "$MAINT/data-secrets-before.tar.gz"
```

Check that the archives exist and contain the expected files before proceeding. The full backup is consistent because writers are stopped. Keep pre-release backups identified separately from later backups; do not select a rollback archive merely by whichever filename is newest. Copy backups off the VM through an approved private destination as part of backup maintenance.

## 5. Fast-forward, install and replace the frontend

Fast-forward to the pinned commit without resetting preserved changes:

```bash
sudo git -C "$APP_DIR" merge --ff-only "$TARGET"
test "$(sudo git -C "$APP_DIR" rev-parse HEAD)" = "$TARGET"
sudo "$APP_DIR/.venv/bin/python" -m pip install -e "$APP_DIR" 'alembic>=1.14,<2'
sudo "$APP_DIR/.venv/bin/python" -m pip check
```

The recorded release used `pip install --no-deps -e "$APP_DIR"` because the dependency declarations were unchanged and installed requirements had been checked. Use that shortcut only after establishing the same conditions. New or changed requirements must be installed; do not suppress dependency installation solely to reduce downtime. Keep the previous package inventory for rollback.

Retain the old frontend and install the complete verified build:

```bash
sudo mv "$APP_DIR/frontend/dist" "$MAINT/previous-frontend-dist"
sudo cp -a "$MAINT/frontend-build/dist" "$APP_DIR/frontend/dist"
sudo chmod -R a+rX "$APP_DIR/frontend/dist"
sudo install -d -o gymlogger -g gymlogger -m 750 "$APP_DIR/data" "$APP_DIR/secrets"
sudo stat -c '%U:%G %a %n' "$APP_DIR/.env" "$APP_DIR/data" "$APP_DIR/secrets"
```

Both writable directories must exist: the unit's `ReadWritePaths` can prevent startup when either is missing. Keep `.env` as `root:gymlogger` mode `640`, and keep application code read-only to `gymlogger`. Preserve production `.env`, credentials, push keys and data; do not replace them with local development files or published configuration examples.

Do not overwrite the installed unit or Caddyfile automatically. Review target changes to those files against local configuration. If a service-unit change is required, install the reviewed change and retain its previous copy; validate Caddy changes before reloading it. The recorded deployment did not change the public route or proxy configuration.

## 6. Start the service and apply migrations

The installed service must have `ExecStartPre=/opt/gym-logger/.venv/bin/alembic upgrade head`. It applies pending migrations before starting Uvicorn, using the production working directory and configuration. Inspect the actual unit; do not assume an old installed unit matches the repository.

```bash
sudo systemctl daemon-reload
sudo systemctl start "$SERVICE"
sudo systemctl show "$SERVICE" \
  -p ActiveState -p SubState -p MainPID -p NRestarts -p NeedDaemonReload
sudo journalctl -u "$SERVICE" -n 60 --no-pager
curl -fsS --max-time 5 http://127.0.0.1:8000/api/health
```

Allow for migration and startup time; `systemctl start` can return before the API is ready. Wait for health with a bounded retry window and inspect service logs on failure rather than repeatedly restarting it. Some migrations cannot be downgraded, which is why both the previous code and pre-upgrade database must be recoverable.

`deploy/update.sh` describes the same broad operations, but its current implementation discards tracked egg-info changes and pulls/builds before stopping the service. The controlled steps here preserve edits, pin one revision and avoid updating a running checkout. Do not invoke that helper blindly. Its `SKIP_FRONTEND_BUILD=1` option only works when a complete matching build has already been installed; it does not build or transfer assets.

## 7. Verify the release before handing it back

Verify both loopback and the real HTTPS origin. A healthy API alone does not prove that the new frontend is installed:

```bash
curl -fsS --max-time 10 http://127.0.0.1:8000/api/health
curl -fsS --max-time 20 "$PUBLIC_ORIGIN/api/health"
curl -fsS --max-time 20 "$PUBLIC_ORIGIN/release.json"
curl -fsS --max-time 20 "$PUBLIC_ORIGIN/" > "$MAINT/served-index.html"
curl -fsS --max-time 20 "$PUBLIC_ORIGIN/sw.js" > /dev/null
curl -fsS --max-time 20 "$PUBLIC_ORIGIN/manifest.webmanifest" > /dev/null
sudo systemctl is-active "$SERVICE" caddy
```

Check that the served release version matches the staged build and that the JS/CSS URLs referenced by the served HTML return successfully. Check the manifest and service worker rather than copying an old `index.html` onto newer assets. HTTPS checks must validate the certificate; do not hide TLS failures with `curl -k`.

Check the production database read-only, using the actual configured path:

```bash
sudo sqlite3 -readonly "$APP_DIR/data/gym-video-logger.db" \
  'PRAGMA integrity_check; PRAGMA foreign_key_check; SELECT version_num FROM alembic_version;'
```

Integrity must report `ok`; the foreign-key query must return no violations. Compare the recorded revision with the target's Alembic head. Where migrations affect data, compare the relevant before/after counts or values in private notes. Derived personal records may be recalculated by startup under the new app's rules; evaluate changes against the release instead of treating every derived count change as lost data. Never publish private account records or backup contents as evidence.

Unauthenticated requests to `/api/auth/me`, `/api/workouts` and `/api/body-measurements` must return `401`. Use an approved account for read-only authenticated smoke checks of the dashboard, history, body measurements and cardio. Do not reset a real user's password to obtain test access. Any temporary verification session must be short-lived, kept out of logs and revoked in cleanup.

When browser access is available, inspect the sign-in page and approved smoke-test screens. The PWA checks for service-worker updates; an open workout or upload screen can defer automatic reload to protect current work. Do not clear users' browser storage to force an update. If browser inspection is unavailable, record that limitation and state exactly which API, asset and database checks passed.

Finish by checking the deployed branch, upstream and remote once more, and confirm `HEAD` still equals `TARGET`. Fetching is read-only; do not integrate a later commit during verification. Record any remaining generated metadata edits. Save a post-release backup with `deploy/backup.sh`, retain the pre-release rollback material, and remove temporary local SSH key copies. Report the version, deployed commit, verification outcome and rollback backup location privately. An ordinary release does not require a new commit on the server or a push from it.

## If the release fails

Keep the service stopped while diagnosing a migration or consistency failure. Inspect `systemctl status gym-logger` and `journalctl -u gym-logger`; check directory existence, permissions, configuration paths, dependencies and the frontend archive before changing anything else.

For a rollback, preserve the failed/current state first, especially if people have used the new release. Prepare the saved previous code and frontend, compatible Python dependencies, pre-upgrade database, full media tree and configuration together in a private recovery location. Review archive contents and paths, then restore that coherent set with writers stopped and the correct ownership. Preserve local service/proxy configuration unless its rollback is also required. Do not run old code against a newer incompatible schema, assume `alembic downgrade` is available, restore over a live SQLite connection, or reset Git to hide deployment edits. Re-run the health, HTTPS, asset and integrity checks after recovery, and report any downtime or data reconciliation still needed.
