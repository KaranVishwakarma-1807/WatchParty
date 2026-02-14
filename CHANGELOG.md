# Changelog
All notable changes to this project are documented in this file.

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
