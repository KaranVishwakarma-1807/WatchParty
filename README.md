# WatchParty

WatchParty is a real-time web app to watch videos together with synchronized playback, room chat, voice/video call, and Azure Blob-backed media playlists.

## v2.0 Highlights

- Persistent accounts (register/login/logout)
- Profile management (display name update)
- My Rooms tracking (recent joined rooms)
- Watch History tracking (media viewed per account)
- Saved Playlists per room/user
- Existing watch-party stack kept intact: room sync, playlist moderation, YouTube/external media, voice/video, chat

## Core Features

### Rooms and Sync
- Join by `roomId` + name
- Host auto-assignment and host handover
- Real-time sync via Socket.IO: play, pause, seek, periodic state sync

### Roles
- `host`, `co-host`, `viewer`
- Host can promote/demote co-host
- Co-host can approve/reject queue, manage playlist, set YouTube/external, clear media

### Media
- Host direct upload to Azure Blob
- Viewer upload requests with moderation queue
- Manual blob sync button (`Sync Playlist from Blob`)
- Playlist select/delete + clear current media
- YouTube + external URL mode

### Communication
- Room text chat with emoji picker
- Voice chat (WebRTC)
- Camera toggle with draggable/resizable cam tiles

### Accounts and Personal Library (v2)
- Register/login/logout using token auth
- Profile display name updates
- Personal dashboard:
  - My Rooms
  - Watch History
  - Saved Playlists snapshot by room

## Tech Stack
- Node.js + Express
- Socket.IO
- Vanilla HTML/CSS/JS
- Azure Blob Storage (`@azure/storage-blob`)
- Multer memory upload
- Local JSON account store for persistent auth metadata (`data/app-data.json`)

## Project Structure

```text
WatchParty/
  server.js
  package.json
  package-lock.json
  README.md
  CHANGELOG.md
  data/
    app-data.json                # created at runtime
  server/
    src/
      modules/
        accountStore.js          # v2 account + personal library store
  public/
    watch-party.html
    watch-party.css
    watch-party.js
    assets/
```

## Environment Variables

```env
PORT=3000
SAS_TOKEN=...
ACCOUNT_NAME=...
CONTAINER_NAME=...

# Optional
APP_DATA_FILE=./data/app-data.json
RTC_ICE_SERVERS_JSON=[...]
STUN_URLS=stun:stun.l.google.com:19302
TURN_URLS=...
TURN_USERNAME=...
TURN_CREDENTIAL=...
```

Aliases supported for Azure:
- `AZURE_STORAGE_SAS_TOKEN`
- `AZURE_STORAGE_ACCOUNT_NAME`
- `AZURE_STORAGE_CONTAINER_NAME`

## Run

```bash
npm install
npm start
```

Open: `http://localhost:3000`

## API Summary

### Auth / Account (v2)
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/profile`
- `GET /api/account/dashboard`
- `POST /api/account/rooms/touch`
- `POST /api/account/history/touch`
- `POST /api/account/saved-playlists/:roomId`
- `GET /api/account/saved-playlists/:roomId`

### Media / Room APIs
- `POST /api/upload/:roomId`
- `POST /api/request-upload/:roomId`
- `POST /api/request-action/:roomId`
- `POST /api/select-video/:roomId`
- `POST /api/delete-video/:roomId`
- `POST /api/set-youtube/:roomId`
- `POST /api/set-external/:roomId`
- `POST /api/clear-upload/:roomId`
- `POST /api/sync-playlist/:roomId`
- `POST /api/member-role/:roomId`

## Socket Events

Client -> Server:
- `join-room`
- `host-play`, `host-pause`, `host-seek`, `host-state`
- `chat-message`
- `voice-join`, `voice-leave`
- `voice-offer`, `voice-answer`, `voice-ice-candidate`
- `request-sync`

Server -> Client:
- `room-state`, `playlist-updated`, `queue-updated`
- `room-media-changed`, `room-media-cleared`
- `sync-state`
- `room-members`, `host-changed`
- `room-chat-message`
- `voice-participants`, `voice-user-joined`, `voice-user-left`
- `voice-offer`, `voice-answer`, `voice-ice-candidate`

## GitHub v2 Release Workflow

```bash
git checkout -b release/v2.0.0
git add .
git commit -m "release: v2.0.0 persistent accounts + personal library"
git push -u origin release/v2.0.0
git tag -a v2.0.0 -m "WatchParty v2.0.0"
git push origin v2.0.0
```

Then publish a GitHub Release using tag `v2.0.0` and include notes from `CHANGELOG.md`.

