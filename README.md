# WatchParty

A real-time watch-party web app where friends join a shared room and watch media in sync.

## Current Features

### Real-time Watch Rooms
- Join with `roomId` and display name.
- First member becomes host automatically.
- Host playback is synchronized for all viewers via Socket.IO.
- Host handover occurs automatically on disconnect.

### Roles and Permissions
- Roles: `host`, `co-host`, `viewer`.
- Host can promote/demote members to co-host.
- Co-host can:
  - Approve/reject viewer upload requests.
  - Manage playlist selection/deletion.
  - Set YouTube media.
  - Clear current media.

### Media and Playlist
- Host direct upload to Azure Blob Storage.
- Viewer request-to-add workflow (host/co-host moderation).
- Host-only `Sync Playlist from Blob` action to refresh playlist without rejoining.
- Playlist supports selecting active item and deleting specific items.
- Host/co-host can clear currently active media.
- YouTube link playback mode with room sync.

### Player Controls
- Play/Pause
- Seek
- Mute/Unmute
- Volume slider
- Fullscreen

### Upload UX
- Upload progress bar with percentage text.
- Progress for both host upload and viewer request upload.

## Tech Stack
- Backend: Node.js, Express, Socket.IO
- Frontend: Vanilla HTML/CSS/JS
- Upload handling: Multer (`memoryStorage`)
- Storage: Azure Blob Storage (`@azure/storage-blob`)
- Config: `dotenv`

## Project Structure

```text
WatchParty/
  server.js
  package.json
  README.md
  CHANGELOG.md
  public/
    watch-party.html
    watch-party.css
    watch-party.js
```

## Environment Variables

Use local `.env` and Azure App Service Application Settings:

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

Open: `http://localhost:3000`

## API Endpoints

- `POST /api/upload/:roomId` - host direct upload
- `POST /api/request-upload/:roomId` - viewer upload request
- `POST /api/request-action/:roomId` - approve/reject request (host/co-host)
- `POST /api/select-video/:roomId` - select playlist media (host/co-host)
- `POST /api/delete-video/:roomId` - delete playlist item (host/co-host)
- `POST /api/set-youtube/:roomId` - set YouTube media (host/co-host)
- `POST /api/clear-upload/:roomId` - clear current media (host/co-host)
- `POST /api/sync-playlist/:roomId` - manual blob refresh (host only)
- `POST /api/member-role/:roomId` - promote/demote co-host (host only)

## Socket Events

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

## Known Limitations
- Room state is in-memory (resets on server restart).
- No auth/user accounts yet.
- No persistent metadata DB yet.

## Future Roadmap

### v1.2
- Real-time room chat and message history.
- Reaction system and typing indicators.
- Better reconnect/resync behavior.

### v2.0
- Authentication + custom room system (private/public, invite links, room settings).
- Persistent metadata store (recommended: PostgreSQL).

### v2.1+
- WebRTC voice/video call integration.
- Horizontal scaling with Redis adapter.
- Optional transcoding/HLS pipeline for larger files.

## Versioning (GitHub)
Use semantic versioning:
- Patch: `v1.1.1` (bug fixes)
- Minor: `v1.2.0` (new backward-compatible features)
- Major: `v2.0.0` (breaking changes)

Release commands:

```bash
git checkout -b release/v1.1.0
git add .
git commit -m "release: v1.1.0 co-host + blob sync"
git push -u origin release/v1.1.0
git tag -a v1.1.0 -m "WatchParty v1.1.0"
git push origin v1.1.0
```

Then create a GitHub Release from `v1.1.0`.
