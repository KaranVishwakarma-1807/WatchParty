const express = require("express");
const http = require("http");
const path = require("path");
const multer = require("multer");
const { Server } = require("socket.io");
const dotenv = require("dotenv");
const { BlobServiceClient } = require("@azure/storage-blob");

dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

const sasToken = String(process.env.SAS_TOKEN || "").trim().replace(/^\?/, "");
const accountName = String(process.env.ACCOUNT_NAME || "").trim();
const containerName = String(process.env.CONTAINER_NAME || "").trim();

let containerClient = null;
if (sasToken && accountName && containerName) {
  const serviceUrl = `https://${accountName}.blob.core.windows.net?${sasToken}`;
  const blobServiceClient = new BlobServiceClient(serviceUrl);
  containerClient = blobServiceClient.getContainerClient(containerName);
} else {
  console.warn("Azure Blob config is missing. Upload endpoints will fail until env values are set.");
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
      video: null,
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

function ensureAzureReady() {
  if (!containerClient) {
    throw new Error("Azure Blob Storage is not configured.");
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

    if (room.video?.blobName) {
      await removeUploadedBlob(room.video.blobName);
    }

    const uploaded = await uploadVideoBufferToAzure({
      roomId,
      originalName: req.file.originalname,
      buffer: req.file.buffer,
      contentType: req.file.mimetype,
    });

    room.video = {
      fileName: req.file.originalname,
      fileUrl: uploaded.fileUrl,
      blobName: uploaded.blobName,
      uploadedAt: Date.now(),
    };

    room.state = {
      currentTime: 0,
      isPlaying: false,
      updatedAt: Date.now(),
    };

    io.to(roomId).emit("room-video-changed", {
      video: room.video,
      state: syncPayload(room),
    });

    return res.json({ ok: true, video: room.video });
  } catch (error) {
    console.error("Upload failed:", error.message);
    return res.status(500).json({ error: `Upload failed: ${error.message}` });
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

    if (room.video?.blobName) {
      await removeUploadedBlob(room.video.blobName);
    }

    room.video = null;
    room.state = {
      currentTime: 0,
      isPlaying: false,
      updatedAt: Date.now(),
    };

    io.to(roomId).emit("room-video-cleared", {
      state: syncPayload(room),
    });

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
      video: room.video,
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
      if (room.video?.blobName) {
        void removeUploadedBlob(room.video.blobName);
      }
      rooms.delete(roomId);
      return;
    }

    io.to(roomId).emit("host-changed", { hostId: room.hostId });
    io.to(roomId).emit("room-members", {
      hostId: room.hostId,
      members: getMembersPayload(room),
    });
  });
});

server.listen(PORT, () => {
  console.log(`Watch party server running on http://localhost:${PORT}`);
});


