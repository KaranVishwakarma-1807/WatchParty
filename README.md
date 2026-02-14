# WatchParty v1

A real-time watch-party web app where a host and friends watch synchronized media together in a room.

## What This App Does

WatchParty lets users join a shared room and watch content in sync. The host controls playback for everyone. Media can come from Azure Blob uploads or a YouTube link, and all viewers stay aligned through Socket.IO events.

## Core Features

### Real-Time Room Sync

- Join by `roomId` and display name.
- First user becomes host automatically.
- Host controls are synced to all viewers:
  - Play
  - Pause
  - Seek
  - Periodic playback state updates
- Host role handover happens automatically if host disconnects.

### Media Sources

- Host direct video upload to Azure Blob Storage.
- Viewer upload request queue (host approval workflow).
- Host can paste a YouTube URL and switch room playback to synced YouTube mode.
- Host can clear current media (Blob or YouTube).

### Playlist and Queue Management

- Playlist is visible to room members.
- Host can select any playlist item to play.
- Host can delete a specific playlist item.
- Viewer requests can be approved or rejected by host.
- Playlist can sync from existing blobs under room prefix.

### Upload UX

- Upload progress bar and percent text for user actions.
- Host upload and viewer request both use progress-aware XHR flow.

### Player Controls (Current)

- Play/Pause
- Mute/Unmute
- Fullscreen
- Volume slider
- Seek slider + live time display

## Tech Stack

- Node.js + Express
- Socket.IO (real-time room communication)
- Multer (`memoryStorage`) for in-memory upload handling
- Azure Blob Storage (`@azure/storage-blob`)
- Vanilla HTML/CSS/JS frontend

## Project Structure

```text
WatchParty/
  server.js
  package.json
  README.md
  public/
    watch-party.html
    watch-party.css
    watch-party.js
```

## Environment Variables

Create `.env` (local) and set same values in Azure App Service Application Settings:

```env
PORT=3000
SAS_TOKEN=...
ACCOUNT_NAME=...
CONTAINER_NAME=...
```

Supported aliases:

- `AZURE_STORAGE_SAS_TOKEN`
- `AZURE_STORAGE_ACCOUNT_NAME`
- `AZURE_STORAGE_CONTAINER_NAME`

## Run Locally

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Main API Endpoints

- `POST /api/upload/:roomId` - host uploads directly to playlist
- `POST /api/request-upload/:roomId` - viewer submits upload request
- `POST /api/request-action/:roomId` - host approves/rejects a request
- `POST /api/select-video/:roomId` - host switches active playlist video
- `POST /api/delete-video/:roomId` - host deletes one playlist item
- `POST /api/set-youtube/:roomId` - host sets YouTube media for room
- `POST /api/clear-upload/:roomId` - host clears current media

## Main Socket Events

Client -> Server:

- `join-room`
- `host-play`
- `host-pause`
- `host-seek`
- `host-state`
- `request-sync`

Server -> Client:

- `room-state`
- `playlist-updated`
- `queue-updated`
- `room-media-changed`
- `room-media-cleared`
- `sync-state`
- `room-members`
- `host-changed`

## Known Limitations in v1

- Room state is in memory (resets on server restart).
- No authentication/authorization yet.
- No persistent database for room metadata yet.
- Large upload reliability depends on plan limits/network conditions.

## Future Potential Updates

### v1.1

- Role-based permissions (host, co-host, viewer).
- Stronger moderation controls for queue and playlist.
- Better reconnect/resync logic for unstable networks.

### v1.2

- Real-time in-room text chat.
- Reactions, typing indicators, and message history.
- Room-level activity logs.

### v2.0

- User accounts and authentication (OAuth/email).
- Custom room system:
  - private/public rooms
  - invite codes
  - password-protected rooms
  - room presets
- Persistent metadata database (recommended: PostgreSQL).

### v2.1

- Video/audio call integration (WebRTC).
- Participant grid and host moderation controls.
- Optional voice-only mode.

### v2.2+

- Multi-instance scaling with Redis + Socket.IO adapter.
- Background jobs for cleanup and queue expiry.
- HLS/transcoding pipeline for smoother large-file playback.

## Database Recommendation

For production metadata (rooms, playlist entries, queue state, users), use PostgreSQL. Keep large media files in Azure Blob Storage. Optionally add Redis for realtime scaling/session state.

## Versioning and Release Plan (GitHub)

Use semantic versioning.

### Suggested baseline

- `v1.0.0`: current stable watch-party app.

### Commands to publish v1

```bash
git checkout -b release/v1.0.0
git add .
git commit -m "release: v1.0.0 watchparty core"
git push -u origin release/v1.0.0
git tag -a v1.0.0 -m "WatchParty v1.0.0"
git push origin v1.0.0
```

Then on GitHub:

1. Open Releases.
2. Create a new release from tag `v1.0.0`.
3. Add release notes (features, known limitations, next roadmap).

### Ongoing version strategy

- Patch: `v1.0.1` for bug fixes only.
- Minor: `v1.1.0` for backward-compatible new features.
- Major: `v2.0.0` for breaking architecture/product changes.
