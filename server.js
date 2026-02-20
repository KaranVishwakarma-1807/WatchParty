const express = require("express");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const { Server } = require("socket.io");
const dotenv = require("dotenv");
const { BlobServiceClient } = require("@azure/storage-blob");
const {
  registerUser,
  loginUser,
  logout,
  getUserByToken,
  updateProfile,
  touchRoom,
  addWatchHistory,
  saveRoomPlaylist,
  getSavedPlaylist,
  getDashboard,
  resolveAuthTokenFromRequest,
} = require("./server/src/modules/accountStore");

dotenv.config({ path: path.join(__dirname, ".env"), override: true });

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseIceServersFromEnv() {
  const fallbackStun = splitCsv(process.env.STUN_URLS || "stun:stun.l.google.com:19302");

  const jsonRaw = cleanEnvValue(process.env.RTC_ICE_SERVERS_JSON);
  if (jsonRaw) {
    try {
      const parsed = JSON.parse(jsonRaw);
      if (Array.isArray(parsed) && parsed.length) {
        return parsed;
      }
    } catch (error) {
      console.warn("Invalid RTC_ICE_SERVERS_JSON. Falling back to TURN/STUN env.", error.message);
    }
  }

  const iceServers = [];

  if (fallbackStun.length) {
    iceServers.push({ urls: fallbackStun });
  }

  const turnUrls = splitCsv(process.env.TURN_URLS);
  const turnUsername = cleanEnvValue(process.env.TURN_USERNAME);
  const turnCredential = cleanEnvValue(process.env.TURN_CREDENTIAL);

  if (turnUrls.length) {
    const turnServer = { urls: turnUrls };
    if (turnUsername) turnServer.username = turnUsername;
    if (turnCredential) turnServer.credential = turnCredential;
    iceServers.push(turnServer);
  }

  return iceServers;
}

const rtcIceServers = parseIceServersFromEnv();

function cleanEnvValue(value) {
  return String(value || "")
    .trim()
    .replace(/^"+|"+$/g, "")
    .replace(/^'+|'+$/g, "");
}

const sasToken = cleanEnvValue(process.env.SAS_TOKEN || process.env.AZURE_STORAGE_SAS_TOKEN).replace(/^\?/, "");
const accountName = cleanEnvValue(process.env.ACCOUNT_NAME || process.env.AZURE_STORAGE_ACCOUNT_NAME);
const containerName = cleanEnvValue(process.env.CONTAINER_NAME || process.env.AZURE_STORAGE_CONTAINER_NAME);

let containerClient = null;
let azureConfigError = "";

if (sasToken && accountName && containerName) {
  const serviceUrl = `https://${accountName}.blob.core.windows.net?${sasToken}`;
  const blobServiceClient = new BlobServiceClient(serviceUrl);
  containerClient = blobServiceClient.getContainerClient(containerName);
} else {
  const missing = [];
  if (!sasToken) missing.push("SAS_TOKEN");
  if (!accountName) missing.push("ACCOUNT_NAME");
  if (!containerName) missing.push("CONTAINER_NAME");
  azureConfigError = `Missing env: ${missing.join(", ")}`;
  console.warn(`Azure Blob config is missing. ${azureConfigError}`);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1024 * 1024 * 1024,
  },
});

const rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      hostId: null,
      members: new Map(),
      coHostIds: new Set(),
      playlist: [],
      pendingRequests: [],
      currentMedia: null,
      chatMessages: [],
      voiceParticipants: new Set(),
      state: {
        currentTime: 0,
        isPlaying: false,
        updatedAt: Date.now(),
      },
    });
  }
  return rooms.get(roomId);
}

function normalizeRoomId(roomId) {
  const trimmed = String(roomId || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "");
  return trimmed || "main-room";
}

function getMembersPayload(room) {
  return [...room.members.entries()].map(([id, name]) => {
    const role = room.hostId === id ? "host" : room.coHostIds.has(id) ? "cohost" : "viewer";
    return { id, name, role };
  });
}

function syncPayload(room) {
  return {
    currentTime: room.state.currentTime,
    isPlaying: room.state.isPlaying,
    sentAt: Date.now(),
  };
}

function resetPlaybackState(room) {
  room.state = {
    currentTime: 0,
    isPlaying: false,
    updatedAt: Date.now(),
  };
}

function canManageMedia(room, socketId) {
  return room.hostId === socketId || room.coHostIds.has(socketId);
}

function chatPayload(room) {
  return room.chatMessages.slice(-100);
}

function emitMembersUpdate(roomId, room) {
  io.to(roomId).emit("room-members", {
    hostId: room.hostId,
    members: getMembersPayload(room),
  });
}

function ensureAzureReady() {
  if (!containerClient) {
    throw new Error(`Azure Blob Storage is not configured. ${azureConfigError}`.trim());
  }
}

function safeFileName(originalName) {
  return String(originalName || "video")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_");
}

function buildBlobName(roomId, originalName, scope = "playlist") {
  return `${roomId}/${scope}/${Date.now()}_${safeFileName(originalName)}`;
}

function makeVideoIdFromBlobName(blobName) {
  return `blob_${crypto.createHash("sha1").update(blobName).digest("hex")}`;
}

function inferFileNameFromBlobName(roomId, blobName, scope = "playlist") {
  const prefix = `${roomId}/${scope}/`;
  const nameWithStamp = blobName.startsWith(prefix) ? blobName.slice(prefix.length) : blobName;
  const underscoreIndex = nameWithStamp.indexOf("_");
  if (underscoreIndex > -1 && underscoreIndex < nameWithStamp.length - 1) {
    return nameWithStamp.slice(underscoreIndex + 1);
  }
  return nameWithStamp;
}

function getCurrentVideo(room) {
  if (!room.currentMedia || room.currentMedia.type !== "blob") return null;
  return room.playlist.find((item) => item.id === room.currentMedia.videoId) || null;
}

function getCurrentMediaPayload(room) {
  if (!room.currentMedia) return null;

  if (room.currentMedia.type === "youtube") {
    return {
      type: "youtube",
      youtubeId: room.currentMedia.youtubeId,
      url: room.currentMedia.url,
      title: room.currentMedia.title,
    };
  }

  if (room.currentMedia.type === "external") {
    return {
      type: "external",
      url: room.currentMedia.url,
      title: room.currentMedia.title,
    };
  }

  const video = getCurrentVideo(room);
  if (!video) return null;

  return {
    type: "blob",
    id: video.id,
    fileName: video.fileName,
    fileUrl: video.fileUrl,
    uploadedByName: video.uploadedByName,
    uploadedAt: video.uploadedAt,
  };
}

function playlistPayload(room) {
  return room.playlist.map((item) => ({
    id: item.id,
    fileName: item.fileName,
    fileUrl: item.fileUrl,
    uploadedAt: item.uploadedAt,
    uploadedByName: item.uploadedByName,
  }));
}

function requestQueuePayload(room) {
  return room.pendingRequests.map((item) => ({
    id: item.id,
    fileName: item.fileName,
    requestedByName: item.requestedByName,
    requestedAt: item.requestedAt,
  }));
}

function emitPlaylistUpdate(roomId, room) {
  io.to(roomId).emit("playlist-updated", {
    playlist: playlistPayload(room),
    currentVideoId: room.currentMedia?.type === "blob" ? room.currentMedia.videoId : null,
  });
}

function emitQueueUpdate(roomId, room) {
  io.to(roomId).emit("queue-updated", {
    pendingRequests: requestQueuePayload(room),
  });
}

function emitMediaChanged(roomId, room) {
  io.to(roomId).emit("room-media-changed", {
    media: getCurrentMediaPayload(room),
    state: syncPayload(room),
  });
}

function emitMediaCleared(roomId, room) {
  io.to(roomId).emit("room-media-cleared", {
    state: syncPayload(room),
  });
}

async function uploadVideoBufferToAzure({ roomId, originalName, buffer, contentType, scope = "playlist" }) {
  ensureAzureReady();
  await containerClient.createIfNotExists();

  const blobName = buildBlobName(roomId, originalName, scope);
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  await blockBlobClient.uploadData(buffer, {
    blobHTTPHeaders: {
      blobContentType: contentType || "application/octet-stream",
    },
  });

  return {
    blobName,
    fileUrl: blockBlobClient.url,
  };
}

async function removeUploadedBlob(blobName) {
  if (!blobName) return;
  try {
    ensureAzureReady();
    const blobClient = containerClient.getBlockBlobClient(blobName);
    await blobClient.deleteIfExists();
  } catch (error) {
    console.error("Failed to delete blob:", error.message);
  }
}

async function moveRequestBlobToPlaylist(roomId, requestItem) {
  const sourceClient = containerClient.getBlockBlobClient(requestItem.blobName);
  const newBlobName = buildBlobName(roomId, requestItem.fileName, "playlist");
  const targetClient = containerClient.getBlockBlobClient(newBlobName);

  const poller = await targetClient.beginCopyFromURL(sourceClient.url);
  await poller.pollUntilDone();
  await sourceClient.deleteIfExists();

  return {
    blobName: newBlobName,
    fileUrl: targetClient.url,
  };
}

async function syncRoomPlaylistFromBlob(roomId, room) {
  if (!containerClient) return;

  const prefix = `${roomId}/playlist/`;
  const items = [];

  for await (const blob of containerClient.listBlobsFlat({ prefix })) {
    if (!blob.name || blob.name.endsWith("/")) continue;

    const fileUrl = containerClient.getBlockBlobClient(blob.name).url;
    const uploadedAt = blob.properties.lastModified
      ? new Date(blob.properties.lastModified).getTime()
      : Date.now();

    items.push({
      id: makeVideoIdFromBlobName(blob.name),
      fileName: inferFileNameFromBlobName(roomId, blob.name, "playlist"),
      fileUrl,
      blobName: blob.name,
      uploadedAt,
      uploadedByName: "Blob Upload",
    });
  }

  items.sort((a, b) => a.uploadedAt - b.uploadedAt);
  room.playlist = items;

  const currentIsBlob = room.currentMedia?.type === "blob";
  if (!currentIsBlob) return;

  const currentBlobId = room.currentMedia.videoId;
  const hasCurrent = room.playlist.some((item) => item.id === currentBlobId);

  if (hasCurrent) return;

  if (room.playlist.length) {
    room.currentMedia = {
      type: "blob",
      videoId: room.playlist[0].id,
    };
  } else {
    room.currentMedia = null;
  }
  resetPlaybackState(room);
}

function parseExternalUrl(url) {
  try {
    const parsed = new URL(String(url || "").trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}
function parseYouTubeVideoId(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();

    if (host === "youtu.be") {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      return id || null;
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      if (parsed.pathname === "/watch") {
        const id = parsed.searchParams.get("v");
        return id || null;
      }

      const parts = parsed.pathname.split("/").filter(Boolean);
      const type = parts[0];
      if (type === "shorts" || type === "embed") {
        return parts[1] || null;
      }
    }

    return null;
  } catch {
    return null;
  }
}

async function deleteVideoById(roomId, room, videoId) {
  const found = room.playlist.find((item) => item.id === videoId);
  if (!found) {
    return { ok: false, error: "Video not found in playlist.", status: 404 };
  }

  await removeUploadedBlob(found.blobName);

  const deletedWasCurrentBlob = room.currentMedia?.type === "blob" && room.currentMedia.videoId === found.id;
  room.playlist = room.playlist.filter((item) => item.id !== found.id);

  if (!room.playlist.length) {
    if (deletedWasCurrentBlob) {
      room.currentMedia = null;
      resetPlaybackState(room);
      emitPlaylistUpdate(roomId, room);
      emitMediaCleared(roomId, room);
      return { ok: true };
    }

    emitPlaylistUpdate(roomId, room);
    return { ok: true };
  }

  if (deletedWasCurrentBlob) {
    room.currentMedia = {
      type: "blob",
      videoId: room.playlist[0].id,
    };
    resetPlaybackState(room);
    emitPlaylistUpdate(roomId, room);
    emitMediaChanged(roomId, room);
    return { ok: true };
  }

  emitPlaylistUpdate(roomId, room);
  return { ok: true };
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "auth.html"));
});


app.get("/watch", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "watch-party.html"));
});

app.get("/my-room", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "my-room.html"));
});
app.get("/api/rtc-config", (_req, res) => {
  res.json({
    iceServers: rtcIceServers,
  });
});

function getAuthedUserFromRequest(req) {
  const authToken = resolveAuthTokenFromRequest(req);
  const user = getUserByToken(authToken);
  return { authToken, user };
}

app.post("/api/auth/register", (req, res) => {
  try {
    const username = String(req.body?.username || "");
    const password = String(req.body?.password || "");
    const displayName = String(req.body?.displayName || "");

    const result = registerUser({ username, password, displayName });
    return res.json({ ok: true, token: result.token, user: result.user });
  } catch (error) {
    return res.status(400).json({ error: error.message || "Registration failed." });
  }
});

app.post("/api/auth/login", (req, res) => {
  try {
    const username = String(req.body?.username || "");
    const password = String(req.body?.password || "");

    const result = loginUser({ username, password });
    return res.json({ ok: true, token: result.token, user: result.user });
  } catch (error) {
    return res.status(401).json({ error: error.message || "Login failed." });
  }
});

app.post("/api/auth/logout", (req, res) => {
  const { authToken } = getAuthedUserFromRequest(req);
  if (authToken) {
    logout(authToken);
  }
  return res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  const { user } = getAuthedUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  return res.json({
    ok: true,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      createdAt: user.createdAt,
    },
  });
});

app.post("/api/auth/profile", (req, res) => {
  try {
    const { user } = getAuthedUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const updated = updateProfile(user.id, {
      displayName: String(req.body?.displayName || ""),
    });

    return res.json({ ok: true, user: updated });
  } catch (error) {
    return res.status(400).json({ error: error.message || "Failed to update profile." });
  }
});

app.get("/api/account/dashboard", (req, res) => {
  try {
    const { user } = getAuthedUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const dashboard = getDashboard(user.id);
    return res.json({ ok: true, dashboard });
  } catch {
    return res.status(500).json({ error: "Failed to load dashboard." });
  }
});

app.post("/api/account/rooms/touch", (req, res) => {
  const { user } = getAuthedUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const roomId = normalizeRoomId(req.body?.roomId || "");
  touchRoom(user.id, roomId);
  return res.json({ ok: true });
});

app.post("/api/account/history/touch", (req, res) => {
  const { user } = getAuthedUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const roomId = normalizeRoomId(req.body?.roomId || "");
  const mediaType = String(req.body?.mediaType || "blob");
  const title = String(req.body?.title || "Untitled");
  const mediaId = String(req.body?.mediaId || "");

  addWatchHistory(user.id, { roomId, mediaType, title, mediaId });
  return res.json({ ok: true });
});

app.post("/api/account/saved-playlists/:roomId", (req, res) => {
  try {
    const { user } = getAuthedUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const roomId = normalizeRoomId(req.params.roomId);
    const playlist = Array.isArray(req.body?.playlist) ? req.body.playlist : [];

    const saved = saveRoomPlaylist(user.id, roomId, playlist);
    return res.json({ ok: true, savedPlaylist: saved });
  } catch (error) {
    return res.status(400).json({ error: error.message || "Failed to save playlist." });
  }
});

app.get("/api/account/saved-playlists/:roomId", (req, res) => {
  const { user } = getAuthedUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const roomId = normalizeRoomId(req.params.roomId);
  const saved = getSavedPlaylist(user.id, roomId);
  return res.json({ ok: true, savedPlaylist: saved });
});

app.post("/api/upload/:roomId", upload.single("video"), async (req, res) => {
  try {
    ensureAzureReady();

    const roomId = normalizeRoomId(req.params.roomId);
    const socketId = req.body.socketId;
    const room = rooms.get(roomId);

    if (!room || !socketId || room.hostId !== socketId) {
      return res.status(403).json({ error: "Only the room host can upload video." });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Video file is required." });
    }

    const uploaded = await uploadVideoBufferToAzure({
      roomId,
      originalName: req.file.originalname,
      buffer: req.file.buffer,
      contentType: req.file.mimetype,
      scope: "playlist",
    });

    const newItem = {
      id: makeVideoIdFromBlobName(uploaded.blobName),
      fileName: req.file.originalname,
      fileUrl: uploaded.fileUrl,
      blobName: uploaded.blobName,
      uploadedAt: Date.now(),
      uploadedByName: room.members.get(socketId) || "Host",
    };

    room.playlist.push(newItem);
    room.currentMedia = {
      type: "blob",
      videoId: newItem.id,
    };
    resetPlaybackState(room);

    emitPlaylistUpdate(roomId, room);
    emitMediaChanged(roomId, room);

    return res.json({ ok: true, video: newItem, playlist: playlistPayload(room) });
  } catch (error) {
    console.error("Upload failed:", error.message);
    return res.status(500).json({ error: `Upload failed: ${error.message}` });
  }
});

app.post("/api/set-youtube/:roomId", async (req, res) => {
  try {
    const roomId = normalizeRoomId(req.params.roomId);
    const socketId = req.body.socketId;
    const url = String(req.body.url || "").trim();
    const room = rooms.get(roomId);

    if (!room || !socketId || !canManageMedia(room, socketId)) {
      return res.status(403).json({ error: "Only host or co-host can set YouTube media." });
    }

    const youtubeId = parseYouTubeVideoId(url);
    if (!youtubeId) {
      return res.status(400).json({ error: "Invalid YouTube URL." });
    }

    room.currentMedia = {
      type: "youtube",
      youtubeId,
      url,
      title: `YouTube: ${youtubeId}`,
    };
    resetPlaybackState(room);

    emitPlaylistUpdate(roomId, room);
    emitMediaChanged(roomId, room);

    return res.json({ ok: true, media: getCurrentMediaPayload(room) });
  } catch (error) {
    console.error("Set YouTube failed:", error.message);
    return res.status(500).json({ error: "Failed to set YouTube media." });
  }
});

app.post("/api/set-external/:roomId", async (req, res) => {
  try {
    const roomId = normalizeRoomId(req.params.roomId);
    const socketId = req.body.socketId;
    const rawUrl = String(req.body.url || "").trim();
    const room = rooms.get(roomId);

    if (!room || !socketId || !canManageMedia(room, socketId)) {
      return res.status(403).json({ error: "Only host or co-host can set external media." });
    }

    const externalUrl = parseExternalUrl(rawUrl);
    if (!externalUrl) {
      return res.status(400).json({ error: "Invalid external URL." });
    }

    let hostName = "External URL";
    try {
      hostName = new URL(externalUrl).hostname.replace(/^www\./, "");
    } catch {
      // no-op
    }

    room.currentMedia = {
      type: "external",
      url: externalUrl,
      title: `External: ${hostName}`,
    };
    resetPlaybackState(room);

    emitPlaylistUpdate(roomId, room);
    emitMediaChanged(roomId, room);

    return res.json({ ok: true, media: getCurrentMediaPayload(room) });
  } catch (error) {
    console.error("Set external media failed:", error.message);
    return res.status(500).json({ error: "Failed to set external media." });
  }
});
app.post("/api/request-upload/:roomId", upload.single("video"), async (req, res) => {
  try {
    ensureAzureReady();

    const roomId = normalizeRoomId(req.params.roomId);
    const socketId = req.body.socketId;
    const room = rooms.get(roomId);

    if (!room || !socketId || !room.members.has(socketId)) {
      return res.status(403).json({ error: "Join room first before requesting upload." });
    }

    if (room.hostId === socketId) {
      return res.status(400).json({ error: "Host should use direct upload." });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Video file is required." });
    }

    const uploaded = await uploadVideoBufferToAzure({
      roomId,
      originalName: req.file.originalname,
      buffer: req.file.buffer,
      contentType: req.file.mimetype,
      scope: "requests",
    });

    const requestItem = {
      id: crypto.randomUUID(),
      fileName: req.file.originalname,
      fileUrl: uploaded.fileUrl,
      blobName: uploaded.blobName,
      requestedById: socketId,
      requestedByName: room.members.get(socketId) || "Viewer",
      requestedAt: Date.now(),
    };

    room.pendingRequests.push(requestItem);
    emitQueueUpdate(roomId, room);

    return res.json({ ok: true, requestId: requestItem.id });
  } catch (error) {
    console.error("Request upload failed:", error.message);
    return res.status(500).json({ error: `Request failed: ${error.message}` });
  }
});

app.post("/api/request-action/:roomId", async (req, res) => {
  try {
    const roomId = normalizeRoomId(req.params.roomId);
    const socketId = req.body.socketId;
    const requestId = req.body.requestId;
    const action = String(req.body.action || "").toLowerCase();
    const room = rooms.get(roomId);

    if (!room || !socketId || !canManageMedia(room, socketId)) {
      return res.status(403).json({ error: "Only host or co-host can approve or reject requests." });
    }

    if (action !== "approve" && action !== "reject") {
      return res.status(400).json({ error: "Invalid action." });
    }

    const index = room.pendingRequests.findIndex((item) => item.id === requestId);
    if (index === -1) {
      return res.status(404).json({ error: "Request not found." });
    }

    const requestItem = room.pendingRequests[index];
    room.pendingRequests.splice(index, 1);

    if (action === "approve") {
      const moved = await moveRequestBlobToPlaylist(roomId, requestItem);
      const newItem = {
        id: makeVideoIdFromBlobName(moved.blobName),
        fileName: requestItem.fileName,
        fileUrl: moved.fileUrl,
        blobName: moved.blobName,
        uploadedAt: Date.now(),
        uploadedByName: requestItem.requestedByName,
      };
      room.playlist.push(newItem);
      emitPlaylistUpdate(roomId, room);
    } else {
      await removeUploadedBlob(requestItem.blobName);
    }

    emitQueueUpdate(roomId, room);
    return res.json({ ok: true });
  } catch (error) {
    console.error("Request action failed:", error.message);
    return res.status(500).json({ error: "Failed to process request action." });
  }
});

app.post("/api/select-video/:roomId", async (req, res) => {
  try {
    const roomId = normalizeRoomId(req.params.roomId);
    const socketId = req.body.socketId;
    const videoId = req.body.videoId;
    const room = rooms.get(roomId);

    if (!room || !socketId || !canManageMedia(room, socketId)) {
      return res.status(403).json({ error: "Only host or co-host can select video." });
    }

    const found = room.playlist.find((item) => item.id === videoId);
    if (!found) {
      return res.status(404).json({ error: "Video not found in playlist." });
    }

    room.currentMedia = {
      type: "blob",
      videoId: found.id,
    };
    resetPlaybackState(room);

    emitPlaylistUpdate(roomId, room);
    emitMediaChanged(roomId, room);

    return res.json({ ok: true, media: getCurrentMediaPayload(room) });
  } catch (error) {
    console.error("Select video failed:", error.message);
    return res.status(500).json({ error: "Failed to select video." });
  }
});

app.post("/api/delete-video/:roomId", async (req, res) => {
  try {
    const roomId = normalizeRoomId(req.params.roomId);
    const socketId = req.body.socketId;
    const videoId = req.body.videoId;
    const room = rooms.get(roomId);

    if (!room || !socketId || !canManageMedia(room, socketId)) {
      return res.status(403).json({ error: "Only host or co-host can delete videos." });
    }

    const result = await deleteVideoById(roomId, room, videoId);
    if (!result.ok) {
      return res.status(result.status || 500).json({ error: result.error || "Failed to delete video." });
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error("Delete video failed:", error.message);
    return res.status(500).json({ error: "Failed to delete video." });
  }
});

app.post("/api/clear-upload/:roomId", async (req, res) => {
  try {
    const roomId = normalizeRoomId(req.params.roomId);
    const socketId = req.body.socketId;
    const room = rooms.get(roomId);

    if (!room || !socketId || !canManageMedia(room, socketId)) {
      return res.status(403).json({ error: "Only host or co-host can clear current media." });
    }

    if (!room.currentMedia) {
      return res.json({ ok: true });
    }

    if (room.currentMedia.type === "youtube" || room.currentMedia.type === "external") {
      room.currentMedia = null;
      resetPlaybackState(room);
      emitPlaylistUpdate(roomId, room);
      emitMediaCleared(roomId, room);
      return res.json({ ok: true });
    }

    const result = await deleteVideoById(roomId, room, room.currentMedia.videoId);
    if (!result.ok) {
      return res.status(result.status || 500).json({ error: result.error || "Failed to clear uploaded video." });
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error("Clear upload failed:", error.message);
    return res.status(500).json({ error: "Failed to clear uploaded video." });
  }
});

app.post("/api/sync-playlist/:roomId", async (req, res) => {
  try {
    ensureAzureReady();

    const roomId = normalizeRoomId(req.params.roomId);
    const socketId = req.body.socketId;
    const room = rooms.get(roomId);

    if (!room || !socketId || room.hostId !== socketId) {
      return res.status(403).json({ error: "Only the room host can sync from blob." });
    }

    const previousMediaType = room.currentMedia?.type || null;
    const previousBlobId = room.currentMedia?.type === "blob" ? room.currentMedia.videoId : null;

    await syncRoomPlaylistFromBlob(roomId, room);

    emitPlaylistUpdate(roomId, room);

    if (!room.currentMedia && previousMediaType === "blob") {
      emitMediaCleared(roomId, room);
    } else if (
      room.currentMedia?.type === "blob" &&
      (previousMediaType !== "blob" || previousBlobId !== room.currentMedia.videoId)
    ) {
      emitMediaChanged(roomId, room);
    }

    return res.json({ ok: true, playlist: playlistPayload(room) });
  } catch (error) {
    console.error("Sync playlist failed:", error.message);
    return res.status(500).json({ error: "Failed to sync playlist from blob." });
  }
});

app.post("/api/member-role/:roomId", async (req, res) => {
  try {
    const roomId = normalizeRoomId(req.params.roomId);
    const socketId = req.body.socketId;
    const targetSocketId = req.body.targetSocketId;
    const action = String(req.body.action || "").toLowerCase();
    const room = rooms.get(roomId);

    if (!room || !socketId || room.hostId !== socketId) {
      return res.status(403).json({ error: "Only the room host can change member roles." });
    }

    if (!room.members.has(targetSocketId)) {
      return res.status(404).json({ error: "Member not found in room." });
    }

    if (targetSocketId === room.hostId) {
      return res.status(400).json({ error: "Host role cannot be modified." });
    }

    if (action === "promote") {
      room.coHostIds.add(targetSocketId);
    } else if (action === "demote") {
      room.coHostIds.delete(targetSocketId);
    } else {
      return res.status(400).json({ error: "Invalid role action." });
    }

    emitMembersUpdate(roomId, room);
    return res.json({ ok: true, members: getMembersPayload(room) });
  } catch (error) {
    console.error("Role update failed:", error.message);
    return res.status(500).json({ error: "Failed to update member role." });
  }
});

io.on("connection", (socket) => {
  socket.on("join-room", async ({ roomId, name }) => {
    const normalizedRoomId = normalizeRoomId(roomId);
    const safeName = String(name || "Guest").trim().slice(0, 32) || "Guest";
    const room = getRoom(normalizedRoomId);

    try {
      await syncRoomPlaylistFromBlob(normalizedRoomId, room);
    } catch (error) {
      console.error("Blob sync on join failed:", error.message);
    }

    socket.join(normalizedRoomId);
    socket.data.roomId = normalizedRoomId;
    socket.data.name = safeName;

    room.members.set(socket.id, safeName);
    if (!room.hostId) {
      room.hostId = socket.id;
      room.coHostIds.delete(room.hostId);
    }

    socket.emit("room-state", {
      roomId: normalizedRoomId,
      isHost: room.hostId === socket.id,
      isCoHost: room.coHostIds.has(socket.id),
      hostId: room.hostId,
      media: getCurrentMediaPayload(room),
      playlist: playlistPayload(room),
      pendingRequests: requestQueuePayload(room),
      currentVideoId: room.currentMedia?.type === "blob" ? room.currentMedia.videoId : null,
      state: syncPayload(room),
      members: getMembersPayload(room),
      chatMessages: chatPayload(room),
      voiceParticipants: [...room.voiceParticipants],
    });

    emitMembersUpdate(normalizedRoomId, room);
  });

  socket.on("host-play", ({ time = 0 }) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room || room.hostId !== socket.id) return;

    room.state.currentTime = Number(time) || 0;
    room.state.isPlaying = true;
    room.state.updatedAt = Date.now();

    socket.to(roomId).emit("sync-state", syncPayload(room));
  });

  socket.on("host-pause", ({ time = 0 }) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room || room.hostId !== socket.id) return;

    room.state.currentTime = Number(time) || 0;
    room.state.isPlaying = false;
    room.state.updatedAt = Date.now();

    socket.to(roomId).emit("sync-state", syncPayload(room));
  });

  socket.on("host-seek", ({ time = 0 }) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room || room.hostId !== socket.id) return;

    room.state.currentTime = Number(time) || 0;
    room.state.updatedAt = Date.now();

    socket.to(roomId).emit("sync-state", syncPayload(room));
  });

  socket.on("host-state", ({ time = 0, isPlaying = false }) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room || room.hostId !== socket.id) return;

    room.state.currentTime = Number(time) || 0;
    room.state.isPlaying = Boolean(isPlaying);
    room.state.updatedAt = Date.now();

    socket.to(roomId).emit("sync-state", syncPayload(room));
  });

  socket.on("chat-message", ({ message }) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) return;
    if (!room.members.has(socket.id)) return;

    const text = String(message || "").trim();
    if (!text) return;

    const chatItem = {
      id: crypto.randomUUID(),
      senderId: socket.id,
      senderName: room.members.get(socket.id) || socket.data.name || "Guest",
      message: text.slice(0, 500),
      sentAt: Date.now(),
    };

    room.chatMessages.push(chatItem);
    if (room.chatMessages.length > 100) {
      room.chatMessages = room.chatMessages.slice(-100);
    }

    io.to(roomId).emit("room-chat-message", chatItem);
  });

  socket.on("voice-join", () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    if (!room.members.has(socket.id)) return;

    room.voiceParticipants.add(socket.id);

    socket.emit("voice-participants", {
      participants: [...room.voiceParticipants].filter((id) => id !== socket.id),
    });

    socket.to(roomId).emit("voice-user-joined", {
      socketId: socket.id,
      name: room.members.get(socket.id) || socket.data.name || "Guest",
    });
  });

  socket.on("voice-leave", () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    if (room.voiceParticipants.delete(socket.id)) {
      socket.to(roomId).emit("voice-user-left", { socketId: socket.id });
    }
  });

  socket.on("voice-offer", ({ targetId, sdp }) => {
    const roomId = socket.data.roomId;
    if (!roomId || !targetId || !sdp) return;
    const room = rooms.get(roomId);
    if (!room) return;
    if (!room.voiceParticipants.has(socket.id) || !room.voiceParticipants.has(targetId)) return;

    io.to(targetId).emit("voice-offer", {
      fromId: socket.id,
      sdp,
    });
  });

  socket.on("voice-answer", ({ targetId, sdp }) => {
    const roomId = socket.data.roomId;
    if (!roomId || !targetId || !sdp) return;
    const room = rooms.get(roomId);
    if (!room) return;
    if (!room.voiceParticipants.has(socket.id) || !room.voiceParticipants.has(targetId)) return;

    io.to(targetId).emit("voice-answer", {
      fromId: socket.id,
      sdp,
    });
  });

  socket.on("voice-ice-candidate", ({ targetId, candidate }) => {
    const roomId = socket.data.roomId;
    if (!roomId || !targetId || !candidate) return;
    const room = rooms.get(roomId);
    if (!room) return;
    if (!room.voiceParticipants.has(socket.id) || !room.voiceParticipants.has(targetId)) return;

    io.to(targetId).emit("voice-ice-candidate", {
      fromId: socket.id,
      candidate,
    });
  });

  socket.on("request-sync", () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    socket.emit("sync-state", syncPayload(room));
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    room.members.delete(socket.id);
    room.coHostIds.delete(socket.id);
    const leftVoice = room.voiceParticipants.delete(socket.id);

    if (room.hostId === socket.id) {
      const [nextHostId] = room.members.keys();
      room.hostId = nextHostId || null;
      if (room.hostId) {
        room.coHostIds.delete(room.hostId);
      }
    }

    if (room.members.size === 0) {
      for (const item of room.playlist) {
        if (item.blobName) {
          void removeUploadedBlob(item.blobName);
        }
      }
      for (const requestItem of room.pendingRequests) {
        if (requestItem.blobName) {
          void removeUploadedBlob(requestItem.blobName);
        }
      }
      rooms.delete(roomId);
      return;
    }

    if (leftVoice) {
      socket.to(roomId).emit("voice-user-left", { socketId: socket.id });
    }

    io.to(roomId).emit("host-changed", { hostId: room.hostId });
    emitMembersUpdate(roomId, room);
    emitQueueUpdate(roomId, room);
  });
});

server.listen(PORT, () => {
  console.log(`Watch party server running on http://localhost:${PORT}`);
});







