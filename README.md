# Watch Party App (Socket.IO + Azure Blob)

A real-time watch-party app where friends join a room, the host controls playback, and uploaded videos are managed in a moderated playlist.

## Current Status

The project is now running with:

- Real-time room sync (play/pause/seek)
- Host-controlled playlist
- Azure Blob Storage uploads
- Viewer request queue with host approve/reject
- Per-item playlist deletion by host
- Upload progress UI

## Features

- Room join with `roomId` and display name
- Automatic host assignment (first user in room)
- Host-only playback control sync:
  - Play
  - Pause
  - Seek
- Host direct upload to playlist (stored in Azure Blob)
- Viewer upload requests:
  - Viewer submits request file
  - Host approves or rejects
  - Approved videos are added to playlist
  - Rejected request blobs are deleted
- Playlist management:
  - Select active video from playlist
  - Delete specific playlist item
  - Clear current video
- Upload progress indicator
- Host handover when current host disconnects

## Tech Stack

- Backend: Node.js, Express, Socket.IO
- Frontend: Vanilla HTML/CSS/JS
- Upload handling: Multer (`memoryStorage`)
- Storage: Azure Blob Storage (`@azure/storage-blob`)
- Config: dotenv

## Environment Variables

Set these in local `.env` and in Azure App Service Application Settings:

```env
SAS_TOKEN=...
ACCOUNT_NAME=...
CONTAINER_NAME=...
PORT=3000
```

Supported aliases in code:

- `AZURE_STORAGE_SAS_TOKEN`
- `AZURE_STORAGE_ACCOUNT_NAME`
- `AZURE_STORAGE_CONTAINER_NAME`

## Run Locally

1. Install dependencies

```bash
npm install
```

2. Set `.env`

3. Start server

```bash
npm start
```

4. Open

```text
http://localhost:3000
```

## Project Structure

```text
WatchParty/
  server.js
  package.json
  public/
    watch-party.html
    watch-party.css
    watch-party.js
```

## API Endpoints

- `POST /api/upload/:roomId` (host direct upload)
- `POST /api/request-upload/:roomId` (viewer request upload)
- `POST /api/request-action/:roomId` (host approve/reject request)
- `POST /api/select-video/:roomId` (host sets active playlist video)
- `POST /api/delete-video/:roomId` (host deletes specific playlist video)
- `POST /api/clear-upload/:roomId` (host clears current video)

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
- `room-video-changed`
- `room-video-cleared`
- `sync-state`
- `room-members`
- `host-changed`

## Current Limitations

- In-memory room state (not persistent across server restart)
- 1 GB per upload request limit in current Multer config
- No authentication/authorization yet
- No database-backed metadata yet

## Future Plans (Roadmap)

### 1. Communication Layer

- Real-time text chat per room
- Message history persistence
- File/image sharing in chat
- Reactions and typing indicators

### 2. Video Call Integration

- In-room video/audio call (WebRTC)
- Host controls for mute/video moderation
- Grid/pinned participant layout
- Call quality adaptation

### 3. Custom Room System

- Public/private rooms
- Room password / invite links
- Room roles (host, co-host, viewer)
- Custom room themes, names, and room settings
- Scheduled rooms and recurring events

### 4. Platform and Scaling

- PostgreSQL for room/playlist/request metadata
- Redis for distributed real-time room state
- Multi-instance Socket.IO scale-out
- Background jobs for blob cleanup and queue expiry

### 5. Security and Productization

- User auth (OAuth/email)
- Permission checks by role
- Audit logs for moderation actions
- Rate limiting and abuse protection

## Recommended Production Architecture

- App: Azure App Service (Node.js)
- Storage: Azure Blob Storage
- Metadata DB: PostgreSQL
- Realtime scale: Redis/Web PubSub strategy

## Notes

- For Azure deployment, use App Service Application Settings instead of relying on `.env` in production.
- Blob URLs and SAS handling should be hardened before public launch.
