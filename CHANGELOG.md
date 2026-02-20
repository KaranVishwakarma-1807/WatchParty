# Changelog
All notable changes to this project are documented in this file.

## [2.0.0] - 2026-02-21
### Added
- Persistent account system with local JSON-backed storage (`server/src/modules/accountStore.js`).
- Auth APIs:
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `POST /api/auth/logout`
  - `GET /api/auth/me`
  - `POST /api/auth/profile`
- Personal account APIs:
  - `GET /api/account/dashboard`
  - `POST /api/account/rooms/touch`
  - `POST /api/account/history/touch`
  - `POST /api/account/saved-playlists/:roomId`
  - `GET /api/account/saved-playlists/:roomId`
- New v2 frontend account sections:
  - Register/login/logout UI
  - Profile status and update
  - My Rooms list
  - Watch History list
  - Saved Playlists list + save current room playlist action
- Account-aware room join payload now includes auth token.

### Changed
- Project version bumped to `2.0.0` in `package.json` and `package-lock.json`.
- README updated for v2 architecture, APIs, and release workflow.
- Frontend now records room and watch activity into authenticated personal dashboard.

## [1.1.0] - 2026-02-14
### Added
- Host-only manual playlist refresh from Azure Blob (`/api/sync-playlist/:roomId`) and UI button.
- Co-host role system with promote/demote controls (`/api/member-role/:roomId`).
- Role metadata in room member payload (`host`, `cohost`, `viewer`).

### Changed
- Permission model updated so co-host can:
  - approve/reject queue requests
  - manage playlist (select/delete)
  - set YouTube media
  - clear current media
- Member list UI now shows roles and host controls for promotion/demotion.

## [1.0.0] - 2026-02-14
### Added
- Real-time room sync with Socket.IO (play, pause, seek, periodic state sync).
- Host auto-assignment and host handover on disconnect.
- Azure Blob Storage upload flow using multer memory storage.
- Host direct upload to playlist.
- Viewer upload request queue with host approve/reject actions.
- Playlist controls: select active media and delete specific item.
- Clear current media action for host.
- YouTube synced playback mode from pasted URL.
- Upload progress UI with percentage indicator.

### Changed
- Initial README for v1 architecture, API, roadmap, and release workflow.

