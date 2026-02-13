const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const uploadsDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^\w.-]/g, "_");
      cb(null, `${Date.now()}_${safe}`);
    },
  }),
});

const rooms = new Map();

function removeUploadedFile(fileUrl) {
  if (!fileUrl) return;
  const fileName = path.basename(fileUrl);
  const filePath = path.join(uploadsDir, fileName);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

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

app.use(express.json());
app.use("/uploads", express.static(uploadsDir));
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "watch-party.html"));
});

app.post("/api/upload/:roomId", upload.single("video"), (req, res) => {
  try {
    const roomId = normalizeRoomId(req.params.roomId);
    const socketId = req.body.socketId;
    const room = rooms.get(roomId);

    if (!room || !socketId || room.hostId !== socketId) {
      return res.status(403).json({ error: "Only the room host can upload video." });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Video file is required." });
    }

    if (room.video?.fileUrl) {
      removeUploadedFile(room.video.fileUrl);
    }

    room.video = {
      fileName: req.file.originalname,
      fileUrl: `/uploads/${req.file.filename}`,
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
    return res.status(500).json({ error: "Upload failed." });
  }
});

app.post("/api/clear-upload/:roomId", (req, res) => {
  try {
    const roomId = normalizeRoomId(req.params.roomId);
    const socketId = req.body.socketId;
    const room = rooms.get(roomId);

    if (!room || !socketId || room.hostId !== socketId) {
      return res.status(403).json({ error: "Only the room host can clear uploaded video." });
    }

    if (room.video?.fileUrl) {
      removeUploadedFile(room.video.fileUrl);
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
  } catch (_error) {
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
      if (room.video?.fileUrl) {
        removeUploadedFile(room.video.fileUrl);
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
