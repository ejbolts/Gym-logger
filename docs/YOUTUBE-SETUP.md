# Connect each user's YouTube channel

Users connect **their own channel** in **Settings > Your YouTube channel**, or in Video logger.
They choose **Connect YouTube**, sign in to Google, select their channel and approve access.
Their Gym Logger username/password still signs them into this app. They do not need a Cloud
project, API key, downloaded credentials or terminal commands.

The administrator completes the following setup **once per installation**. These instructions
describe configuration; they do not deploy or restart an existing installation.

## 1. Configure Google

1. Create or choose one project in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable **YouTube Data API v3** for the project.
3. Configure **Google Auth Platform** branding, audience and data access. Use the application's
   real name, support contact, home page, privacy policy and terms where Google requests them.
   For production verification, use a domain you own and can verify. The callback must be
   reachable by users' browsers; this does not require making a private installation public.
4. Add these permissions:
   - `https://www.googleapis.com/auth/youtube.upload` to upload videos.
   - `https://www.googleapis.com/auth/youtube.readonly` to identify the selected channel and
     check when its videos have finished processing.
5. Create an OAuth client of type **Web application**, not Desktop app. Add the exact callback
   URL, including the scheme, host, port if any, and path:

   ```text
   https://gym.example.com/api/youtube/callback
   ```

   Substitute the actual HTTPS address used to open the app. It must match
   `GYM_YOUTUBE_REDIRECT_URI` exactly. Use the same host for signing in and connecting YouTube;
   the callback requires that browser's original Gym Logger sign-in cookie.
   Follow Google's [redirect URI rules](https://developers.google.com/identity/protocols/oauth2/web-server#uri-validation).
   Loopback HTTP, such as `http://127.0.0.1:8001/api/youtube/callback`, is supported for local
   development. Ordinary remote HTTP callbacks are rejected.
6. Download the Web client JSON and store it in the server's private secrets directory.
   Keep the file out of Git, the frontend build and the public web directory. Limit access to
   the service account and administrator.
7. During development, add your testers under Audience. **External + Testing** refresh tokens
   expire after seven days for these permissions. For ongoing use, configure **In production**
   and complete Google's applicable OAuth verification. Publishing status and verification
   are separate steps; production status alone does not remove unverified-app warnings or
   applicable user limits. See [token expiry](https://developers.google.com/identity/protocols/oauth2#expiration)
   and [verification guidance](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification).

The old documentation's blanket claim that unverified YouTube API projects force uploaded videos
to private is outdated. Google's current [videos.insert reference](https://developers.google.com/youtube/data/reference/rest/v3/videos/insert)
explicitly says they are not restricted to private viewing. OAuth verification, API quota and
individual channel restrictions still apply.

## 2. Set the server configuration

For example, in the private server environment file:

```dotenv
GYM_YOUTUBE_MOCK_MODE=false
GYM_YOUTUBE_WEB_CLIENT_SECRET_PATH=/opt/gym-logger/secrets/youtube-web-client-secret.json
GYM_YOUTUBE_REDIRECT_URI=https://gym.example.com/api/youtube/callback
GYM_YOUTUBE_CREDENTIALS_KEY_PATH=/opt/gym-logger/secrets/youtube-credentials.key
GYM_YOUTUBE_PRIVACY_STATUS=unlisted
GYM_COOKIE_SECURE=true
```

Use the actual paths and registered URL for the installation. Do not prefix these settings with
`VITE_`: the client secret and encryption key must remain server-side. ffmpeg and ffprobe still
need to be installed on the server, with working storage and outbound access to Google/YouTube.

The app generates the encryption key at the configured path on the **first real connection**.
The service must be able to create that file and update its database. Each account's access and
refresh tokens are encrypted in `youtube_connections`; one user's encrypted credentials cannot
be used for another account. OAuth state uses PKCE, expires after ten minutes, is single-use and
belongs to the sign-in that started it. The app's Uvicorn access log strips callback query
strings; configure any reverse proxy/access logger to omit callback query strings too.

Back up the key securely **separately from the database** and retain it across releases and
service restarts. Losing or replacing it makes existing connections unreadable. The app refuses
to silently create a replacement while encrypted connections exist. Restore the original key,
or deliberately clear the affected connections and have users reconnect. Per-account workout
snapshots exclude YouTube credentials and pending authorization state.

## 3. Enable and verify after an authorized release

1. Apply the repository's normal deployment process, including `alembic upgrade head`
   (migration `0034_youtube_connections`), a frontend rebuild and service restart. Follow the
   installation's private operator instructions. Updating source or this file alone does not
   update the running application.
2. In **Settings > Admin console**, set **Video uploads > Everyone** if all accounts should
   have access. The admin console overrides the starting `GYM_VIDEO_UPLOADS` environment value.
3. In the app, connect a designated test user's channel. Confirm the displayed channel name.
4. Upload a short synthetic clip, keep the app open until the transfer completes, and confirm
   the combined video appears on that channel. Check playback and timestamp links after
   YouTube processing. If using unlisted, check the link while signed out of Google.
5. Confirm a second Gym Logger account starts disconnected and must connect independently.
   Test **Disconnect**, and confirm the video remains on YouTube.
6. Monitor the project's YouTube API quota and server storage/processing queue. Each user's
   channel is separate, but the application still shares its Cloud project's API quota and
   the server's processing capacity.

**Unlisted is not private:** anyone with the link can watch. Choose the server-wide privacy
default intentionally and explain it to users. Phone alerts are optional. On iPhone, install
the app using Safari's Add to Home Screen before enabling alerts.

## Existing uploads, reconnects and removal

- The old shared server token is **not** imported or used as a fallback. Every user, including
  the administrator, explicitly connects their own channel. The legacy `app.oauth_setup`
  Desktop app command does not configure this new flow.
- Existing video records and YouTube links remain. Older unfinished batches have no personal
  channel binding and must be started again; they cannot be uploaded to a guessed channel.
- Every new real batch is tied to its selected channel. If the user changes channels later,
  an unfinished older batch requires its original channel to retry. Existing YouTube videos
  are not moved between channels.
- Reconnecting the same channel restores revoked/expired authorization. While a video is
  queued, processing, uploading to YouTube or waiting for YouTube processing, users cannot
  disconnect or replace its channel with a different one.
- Disconnect deletes locally saved credentials and pending connection links, and attempts to
  revoke Google's grant. If Google cannot be reached, the app directs the user to remove access
  in their [Google account connections](https://myaccount.google.com/connections).
  Disconnecting or deleting a local batch does not delete videos from YouTube.
- Phone-to-server uploads still require the app to stay open. A failed file restarts that file;
  this release does not add resumable phone uploads or background uploads.

## Troubleshooting

- **Setup needed:** check the Web client JSON (it must have a `web` object), callback URL, file
  permissions and encryption key. Desktop client credentials do not work here.
- **redirect_uri_mismatch:** compare Google's registered URI with the server environment,
  including HTTPS, port and `/api/youtube/callback`.
- **Expired connection link:** start Connect YouTube again in the same browser, while signed
  into the same Gym Logger account. A second Connect attempt replaces the previous link.
- **No channel:** create a channel on YouTube or select the correct existing channel, then
  reconnect. A Google account alone may not yet have a YouTube channel.
- **Reconnect needed:** reconnect the batch's original channel and retry. For a user who has
  lost access to that channel, start a new batch after connecting the desired channel.
- **Repeated weekly reconnects:** check whether the Google OAuth app is still in Testing.
- **Previously uploaded video still processing:** use Check YouTube again after reconnecting;
  it checks the saved video ID rather than uploading another copy.

For provider details, see Google's [web OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server)
and [YouTube authorization guide](https://developers.google.com/youtube/data/guides/auth/server-side-web-apps).
