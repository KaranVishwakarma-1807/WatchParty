const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_FILE = process.env.APP_DATA_FILE
  ? path.resolve(process.env.APP_DATA_FILE)
  : path.join(process.cwd(), "data", "app-data.json");

const DEFAULT_STATE = {
  users: {},
  usernames: {},
  sessions: {},
};

let state = null;

function ensureDataReady() {
  if (state) return;

  const dataDir = path.dirname(DATA_FILE);
  fs.mkdirSync(dataDir, { recursive: true });

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_STATE, null, 2), "utf8");
    state = JSON.parse(JSON.stringify(DEFAULT_STATE));
    return;
  }

  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    state = {
      users: parsed.users && typeof parsed.users === "object" ? parsed.users : {},
      usernames: parsed.usernames && typeof parsed.usernames === "object" ? parsed.usernames : {},
      sessions: parsed.sessions && typeof parsed.sessions === "object" ? parsed.sessions : {},
    };
  } catch {
    state = JSON.parse(JSON.stringify(DEFAULT_STATE));
    persist();
  }
}

function persist() {
  const payload = JSON.stringify(state, null, 2);
  const tmpFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmpFile, payload, "utf8");
  fs.renameSync(tmpFile, DATA_FILE);
}

function normalizeUsername(username) {
  return String(username || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");
}

function sanitizeDisplayName(displayName) {
  return String(displayName || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 40);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const digest = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${digest}`;
}

function verifyPassword(password, passwordHash) {
  const [salt, digest] = String(passwordHash || "").split(":");
  if (!salt || !digest) return false;
  const check = crypto.scryptSync(String(password), salt, 64).toString("hex");
  const left = Buffer.from(digest, "hex");
  const right = Buffer.from(check, "hex");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function makePublicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    createdAt: user.createdAt,
  };
}

function makeSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

function cleanSessions() {
  const now = Date.now();
  for (const [token, session] of Object.entries(state.sessions)) {
    if (!session || !session.userId || Number(session.expiresAt) <= now) {
      delete state.sessions[token];
    }
  }
}

function validatePassword(password) {
  return typeof password === "string" && password.length >= 6 && password.length <= 128;
}

function ensureUserCollections(user) {
  if (!Array.isArray(user.rooms)) user.rooms = [];
  if (!Array.isArray(user.watchHistory)) user.watchHistory = [];
  if (!user.savedPlaylists || typeof user.savedPlaylists !== "object") user.savedPlaylists = {};
}

function registerUser({ username, password, displayName }) {
  ensureDataReady();
  cleanSessions();

  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername || normalizedUsername.length < 3) {
    throw new Error("Username must be at least 3 characters and use letters/numbers.");
  }

  if (!validatePassword(password)) {
    throw new Error("Password must be between 6 and 128 characters.");
  }

  if (state.usernames[normalizedUsername]) {
    throw new Error("Username already exists.");
  }

  const userId = `usr_${crypto.randomUUID()}`;
  const profileName = sanitizeDisplayName(displayName) || normalizedUsername;

  state.usernames[normalizedUsername] = userId;
  state.users[userId] = {
    id: userId,
    username: normalizedUsername,
    displayName: profileName,
    passwordHash: hashPassword(password),
    createdAt: Date.now(),
    rooms: [],
    watchHistory: [],
    savedPlaylists: {},
  };

  const token = makeSessionToken();
  state.sessions[token] = {
    userId,
    createdAt: Date.now(),
    expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 30,
  };

  persist();

  return {
    token,
    user: makePublicUser(state.users[userId]),
  };
}

function loginUser({ username, password }) {
  ensureDataReady();
  cleanSessions();

  const normalizedUsername = normalizeUsername(username);
  const userId = state.usernames[normalizedUsername];
  const user = userId ? state.users[userId] : null;
  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw new Error("Invalid username or password.");
  }

  const token = makeSessionToken();
  state.sessions[token] = {
    userId,
    createdAt: Date.now(),
    expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 30,
  };

  persist();

  return {
    token,
    user: makePublicUser(user),
  };
}

function logout(token) {
  ensureDataReady();
  if (!token) return;
  if (state.sessions[token]) {
    delete state.sessions[token];
    persist();
  }
}

function getUserByToken(token) {
  ensureDataReady();
  cleanSessions();

  if (!token) return null;
  const session = state.sessions[token];
  if (!session) return null;
  if (Number(session.expiresAt) <= Date.now()) {
    delete state.sessions[token];
    persist();
    return null;
  }

  const user = state.users[session.userId];
  if (!user) {
    delete state.sessions[token];
    persist();
    return null;
  }

  ensureUserCollections(user);
  return user;
}

function updateProfile(userId, { displayName }) {
  ensureDataReady();
  const user = state.users[userId];
  if (!user) throw new Error("User not found.");

  const nextName = sanitizeDisplayName(displayName);
  if (!nextName) {
    throw new Error("Display name cannot be empty.");
  }

  user.displayName = nextName;
  persist();
  return makePublicUser(user);
}

function touchRoom(userId, roomId) {
  ensureDataReady();
  const user = state.users[userId];
  if (!user) return;
  ensureUserCollections(user);

  const safeRoomId = String(roomId || "").trim().toLowerCase().replace(/[^a-z0-9-_]/g, "");
  if (!safeRoomId) return;

  const now = Date.now();
  user.rooms = user.rooms.filter((item) => item.roomId !== safeRoomId);
  user.rooms.unshift({ roomId: safeRoomId, lastJoinedAt: now });
  user.rooms = user.rooms.slice(0, 50);
  persist();
}

function addWatchHistory(userId, { roomId, mediaType, title, mediaId }) {
  ensureDataReady();
  const user = state.users[userId];
  if (!user) return;
  ensureUserCollections(user);

  const safeRoomId = String(roomId || "").trim().toLowerCase().replace(/[^a-z0-9-_]/g, "");
  if (!safeRoomId) return;

  const item = {
    id: crypto.randomUUID(),
    roomId: safeRoomId,
    mediaType: String(mediaType || "blob").slice(0, 20),
    title: String(title || "Untitled").slice(0, 140),
    mediaId: String(mediaId || "").slice(0, 120),
    watchedAt: Date.now(),
  };

  user.watchHistory.unshift(item);
  user.watchHistory = user.watchHistory.slice(0, 200);
  persist();
}

function saveRoomPlaylist(userId, roomId, playlist) {
  ensureDataReady();
  const user = state.users[userId];
  if (!user) throw new Error("User not found.");
  ensureUserCollections(user);

  const safeRoomId = String(roomId || "").trim().toLowerCase().replace(/[^a-z0-9-_]/g, "");
  if (!safeRoomId) throw new Error("Invalid room id.");

  const safePlaylist = Array.isArray(playlist)
    ? playlist.slice(0, 200).map((item) => ({
      id: String(item.id || ""),
      fileName: String(item.fileName || item.title || "Untitled").slice(0, 160),
      fileUrl: String(item.fileUrl || item.url || "").slice(0, 1000),
      uploadedByName: String(item.uploadedByName || "").slice(0, 60),
      uploadedAt: Number(item.uploadedAt) || Date.now(),
    }))
    : [];

  user.savedPlaylists[safeRoomId] = {
    roomId: safeRoomId,
    savedAt: Date.now(),
    items: safePlaylist,
  };

  persist();
  return user.savedPlaylists[safeRoomId];
}

function getSavedPlaylist(userId, roomId) {
  ensureDataReady();
  const user = state.users[userId];
  if (!user) return null;
  ensureUserCollections(user);

  const safeRoomId = String(roomId || "").trim().toLowerCase().replace(/[^a-z0-9-_]/g, "");
  return user.savedPlaylists[safeRoomId] || null;
}

function getDashboard(userId) {
  ensureDataReady();
  const user = state.users[userId];
  if (!user) throw new Error("User not found.");
  ensureUserCollections(user);

  const savedPlaylists = Object.values(user.savedPlaylists)
    .sort((a, b) => Number(b.savedAt) - Number(a.savedAt))
    .map((entry) => ({
      roomId: entry.roomId,
      savedAt: entry.savedAt,
      itemCount: Array.isArray(entry.items) ? entry.items.length : 0,
    }));

  return {
    user: makePublicUser(user),
    rooms: user.rooms.slice(0, 50),
    watchHistory: user.watchHistory.slice(0, 100),
    savedPlaylists,
  };
}

function resolveAuthTokenFromRequest(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }

  const xAuthToken = req.headers["x-auth-token"];
  if (typeof xAuthToken === "string" && xAuthToken.trim()) {
    return xAuthToken.trim();
  }

  if (req.body && typeof req.body.authToken === "string" && req.body.authToken.trim()) {
    return req.body.authToken.trim();
  }

  if (req.query && typeof req.query.authToken === "string" && req.query.authToken.trim()) {
    return req.query.authToken.trim();
  }

  return "";
}

module.exports = {
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
};
