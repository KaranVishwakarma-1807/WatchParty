# Watch Party App (Socket.IO)

A real-time watch-party app where friends join a room, the host uploads a video, and playback stays synchronized for everyone.

## Built With

- Node.js + Express
- Socket.IO (real-time sync)
- Multer (video upload)
- Vanilla HTML/CSS/JS frontend

## Current Flow

1. User joins a room (`roomId`) with a display name.
2. First user in room becomes **Host**.
3. Host uploads one video for the room.
4. All users in the room get the same video.
5. Host actions sync to viewers in real time:
   - Play
   - Pause
   - Seek
6. Host can clear the current uploaded video for everyone.
7. If host disconnects, a new host is assigned automatically.

## Run Locally

1. Install dependencies:

```bash
npm install
```

2. Start server:

```bash
npm start
```

3. Open in browser:

```text
http://localhost:3000
```

## Project Structure

```text
WATCHPARTY/
  server.js                  # Express + Socket.IO server
  package.json               # Dependencies and scripts
  uploads/                   # Uploaded room videos (served statically)
  public/
    watch-party.html         # Watch party UI
    watch-party.css          # Glassmorphism styling
    watch-party.js           # Client socket and playback sync logic

  # Existing single-user player files are still in repo:
  index.html
  styles.css
  app.js
```

## Socket Events

- Client -> Server
  - `join-room`
  - `host-play`
  - `host-pause`
  - `host-seek`
  - `host-state` (periodic drift correction)
  - `request-sync`

- Server -> Client
  - `room-state`
  - `room-video-changed`
  - `sync-state`
  - `room-members`
  - `host-changed`

## Database Recommendation

For your requirement (watch party + uploaded videos + rooms), use:

1. **PostgreSQL (Recommended for production)**
   - Store rooms, users, session history, and video metadata.
   - Strong consistency + reliable relational model.

2. **Redis (Recommended alongside PostgreSQL)**
   - Keep ephemeral live room state (current time, playing flag, host id).
   - Fast pub/sub if you scale to multiple server instances.

3. **Object Storage for video files**
   - Use S3 / Cloudflare R2 / Supabase Storage for uploaded videos.
   - Store only file URL + metadata in PostgreSQL.

### Simple Setup Option

If you want the easiest start before scaling:

- Use **SQLite** for metadata (single server)
- Keep Socket.IO room state in memory
- Save files on local disk (`uploads/`)

Then migrate to PostgreSQL + Redis + object storage when traffic grows.

## Important Notes

- Current server keeps room state in memory.
- Uploaded files are stored on local disk.
- This is good for MVP/local use, but for production multi-instance deployment, move state/files to shared services.
