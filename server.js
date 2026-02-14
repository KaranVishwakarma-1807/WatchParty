const express = require("express");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const { Server } = require("socket.io");
const dotenv = require("dotenv");
const { BlobServiceClient } = require("@azure/storage-blob");

dotenv.config({ path: path.join(__dirname, ".env"), override: true });

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

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
      playlist: [],
      pendingRequests: [],
      currentVideoId: null,
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
  return [...room.members.entries()].map(([id, name]) => ({ id, name }));
}

function syncPayload(room) {
  return {
    currentTime: room.state.currentTime,
    isPlaying: room.state.isPlaying,
    sentAt: Date.now(),
  };
}

function getCurrentVideo(room) {
  if (!room.currentVideoId) return null;
  return room.playlist.find((item) => item.id === room.currentVideoId) || null;
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

function buildBlobName(roomId, originalName) {
  return `${roomId}/${Date.now()}_${safeFileName(originalName)}`;
}

async function uploadVideoBufferToAzure({ roomId, originalName, buffer, contentType }) {
  ensureAzureReady();
  await containerClient.createIfNotExists();

  const blobName = buildBlobName(roomId, originalName);
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

function resetPlaybackState(room) {
  room.state = {
    currentTime: 0,
    isPlaying: false,
    updatedAt: Date.now(),
  };
}

function emitPlaylistUpdate(roomId, room) {
  io.to(roomId).emit("playlist-updated", {
    playlist: playlistPayload(room),
    currentVideoId: room.currentVideoId,
  });
}

function emitQueueUpdate(roomId, room) {
  io.to(roomId).emit("queue-updated", {
    pendingRequests: requestQueuePayload(room),
  });
}

async function deleteVideoById(roomId, room, videoId) {
  const found = room.playlist.find((item) => item.id === videoId);
  if (!found) {
    return { ok: false, error: "Video not found in playlist.", status: 404 };
  }

  await removeUploadedBlob(found.blobName);

  const deletedWasCurrent = room.currentVideoId === found.id;
  room.playlist = room.playlist.filter((item) => item.id !== found.id);

  if (!room.playlist.length) {
    room.currentVideoId = null;
    resetPlaybackState(room);
    emitPlaylistUpdate(roomId, room);
    io.to(roomId).emit("room-video-cleared", { state: syncPayload(room) });
    return { ok: true };
  }

  if (deletedWasCurrent) {
    room.currentVideoId = room.playlist[0].id;
    resetPlaybackState(room);
    emitPlaylistUpdate(roomId, room);
    io.to(roomId).emit("room-video-changed", {
      video: getCurrentVideo(room),
      state: syncPayload(room),
    });
    return { ok: true };
  }

  emitPlaylistUpdate(roomId, room);
  return { ok: true };
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "watch-party.html"));
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
    });

    const newItem = {
      id: crypto.randomUUID(),
      fileName: req.file.originalname,
      fileUrl: uploaded.fileUrl,
      blobName: uploaded.blobName,
      uploadedAt: Date.now(),
      uploadedByName: room.members.get(socketId) || "Host",
    };

    room.playlist.push(newItem);
    room.currentVideoId = newItem.id;
    resetPlaybackState(room);

    emitPlaylistUpdate(roomId, room);
    io.to(roomId).emit("room-video-changed", {
      video: getCurrentVideo(room),
      state: syncPayload(room),
    });

    return res.json({ ok: true, video: newItem, playlist: playlistPayload(room) });
  } catch (error) {
    console.error("Upload failed:", error.message);
    return res.status(500).json({ error: `Upload failed: ${error.message}` });
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

    if (!room || !socketId || room.hostId !== socketId) {
      return res.status(403).json({ error: "Only the room host can approve or reject requests." });
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
      const newItem = {
        id: crypto.randomUUID(),
        fileName: requestItem.fileName,
        fileUrl: requestItem.fileUrl,
        blobName: requestItem.blobName,
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

    if (!room || !socketId || room.hostId !== socketId) {
      return res.status(403).json({ error: "Only the room host can select video." });
    }

    const found = room.playlist.find((item) => item.id === videoId);
    if (!found) {
      return res.status(404).json({ error: "Video not found in playlist." });
    }

    room.currentVideoId = found.id;
    resetPlaybackState(room);

    emitPlaylistUpdate(roomId, room);
    io.to(roomId).emit("room-video-changed", {
      video: found,
      state: syncPayload(room),
    });

    return res.json({ ok: true, video: found });
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

    if (!room || !socketId || room.hostId !== socketId) {
      return res.status(403).json({ error: "Only the room host can delete videos." });
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

    if (!room || !socketId || room.hostId !== socketId) {
      return res.status(403).json({ error: "Only the room host can clear uploaded video." });
    }

    const current = getCurrentVideo(room);
    if (!current) {
      return res.json({ ok: true });
    }

    const result = await deleteVideoById(roomId, room, current.id);
    if (!result.ok) {
      return res.status(result.status || 500).json({ error: result.error || "Failed to clear uploaded video." });
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error("Clear upload failed:", error.message);
    return res.status(500).json({ error: "Failed to clear uploaded video." });
  }
});

io.on("connection", (socket) => {
  socket.on("join-room", ({ roomId, name }) => {
    const normalizedRoomId = normalizeRoomId(roomId);
    const safeName = String(name || "Guest").trim().slice(0, 32) || "Guest";
    const room = getRoom(normalizedRoomId);

    socket.join(normalizedRoomId);
    socket.data.roomId = normalizedRoomId;
    socket.data.name = safeName;

    room.members.set(socket.id, safeName);
    if (!room.hostId) {
      room.hostId = socket.id;
    }

    socket.emit("room-state", {
      roomId: normalizedRoomId,
      isHost: room.hostId === socket.id,
      hostId: room.hostId,
      video: getCurrentVideo(room),
      playlist: playlistPayload(room),
      pendingRequests: requestQueuePayload(room),
      currentVideoId: room.currentVideoId,
      state: syncPayload(room),
      members: getMembersPayload(room),
    });

    io.to(normalizedRoomId).emit("room-members", {
      hostId: room.hostId,
      members: getMembersPayload(room),
    });
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

    if (room.hostId === socket.id) {
      const [nextHostId] = room.members.keys();
      room.hostId = nextHostId || null;
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

    io.to(roomId).emit("host-changed", { hostId: room.hostId });
    io.to(roomId).emit("room-members", {
      hostId: room.hostId,
      members: getMembersPayload(room),
    });
    emitQueueUpdate(roomId, room);
  });
});

server.listen(PORT, () => {
  console.log(`Watch party server running on http://localhost:${PORT}`);
});
