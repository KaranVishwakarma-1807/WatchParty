# Changelog
All notable changes to this project are documented in this file.

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
- Project README updated to reflect current architecture, APIs, roadmap, and versioning workflow.
- Legacy root frontend files removed in favor of active `public/watch-party.*` app.

### Removed
- Unused legacy files: `app.js`, `index.html`, `styles.css`, and `uploads/`.
