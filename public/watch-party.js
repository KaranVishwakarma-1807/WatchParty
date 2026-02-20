const socket = io();

const roomInput = document.getElementById("roomInput");
const nameInput = document.getElementById("nameInput");
const joinBtn = document.getElementById("joinBtn");
const joinParticipantsText = document.getElementById("joinParticipantsText");
const statusText = document.getElementById("statusText");
const roleText = document.getElementById("roleText");
const hostText = document.getElementById("hostText");
const memberList = document.getElementById("memberList");
const playlistList = document.getElementById("playlistList");
const requestQueueList = document.getElementById("requestQueueList");
const uploadLabel = document.getElementById("uploadLabel");
const uploadInput = document.getElementById("uploadInput");
const clearUploadBtn = document.getElementById("clearUploadBtn");
const syncBlobBtn = document.getElementById("syncBlobBtn");
const uploadProgressWrap = document.getElementById("uploadProgressWrap");
const uploadProgressFill = document.getElementById("uploadProgressFill");
const uploadProgressText = document.getElementById("uploadProgressText");
const youtubeUrlInput = document.getElementById("youtubeUrlInput");
const setYoutubeBtn = document.getElementById("setYoutubeBtn");
const externalUrlInput = document.getElementById("externalUrlInput");
const setExternalBtn = document.getElementById("setExternalBtn");
const externalProviderBadge = document.getElementById("externalProviderBadge");
const externalValidationText = document.getElementById("externalValidationText");

const video = document.getElementById("videoPlayer");
const youtubeContainer = document.getElementById("youtubeContainer");
const externalContainer = document.getElementById("externalContainer");
const externalFrame = document.getElementById("externalFrame");
const externalFallback = document.getElementById("externalFallback");
const externalOpenLink = document.getElementById("externalOpenLink");
const videoTitle = document.getElementById("videoTitle");
const playPauseBtn = document.getElementById("playPauseBtn");
const muteBtn = document.getElementById("muteBtn");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const volumeRange = document.getElementById("volumeRange");
const seekRange = document.getElementById("seekRange");
const timeText = document.getElementById("timeText");
const speedSelect = document.getElementById("speedSelect");
const subtitleSelect = document.getElementById("subtitleSelect");
const audioTrackSelect = document.getElementById("audioTrackSelect");
const chatList = document.getElementById("chatList");
const chatInput = document.getElementById("chatInput");
const sendChatBtn = document.getElementById("sendChatBtn");
const emojiBtn = document.getElementById("emojiBtn");
const emojiPicker = document.getElementById("emojiPicker");
const joinVoiceBtn = document.getElementById("joinVoiceBtn");
const muteVoiceBtn = document.getElementById("muteVoiceBtn");
const leaveVoiceBtn = document.getElementById("leaveVoiceBtn");
const toggleVideoBtn = document.getElementById("toggleVideoBtn");
const voiceStatus = document.getElementById("voiceStatus");
const camDock = document.getElementById("camDock");

const authUsernameInput = document.getElementById("authUsernameInput");
const authPasswordInput = document.getElementById("authPasswordInput");
const authDisplayNameInput = document.getElementById("authDisplayNameInput");
const registerBtn = document.getElementById("registerBtn");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const updateProfileBtn = document.getElementById("updateProfileBtn");
const refreshAccountBtn = document.getElementById("refreshAccountBtn");
const savePlaylistSnapshotBtn = document.getElementById("savePlaylistSnapshotBtn");
const authStatusText = document.getElementById("authStatusText");
const authProfileText = document.getElementById("authProfileText");
const myRoomsList = document.getElementById("myRoomsList");
const watchHistoryList = document.getElementById("watchHistoryList");
const savedPlaylistsList = document.getElementById("savedPlaylistsList");

let currentRoomId = "";
let currentHostId = "";
let currentVideoId = null;
let currentMedia = null;
let playlist = [];
let pendingRequests = [];
let currentMembers = [];
let chatMessages = [];
let selfId = "";
let isHost = false;
let isCoHost = false;
let applyingRemote = false;
let lastHostStateSentAt = 0;
let youtubePlayer = null;
let youtubeReady = false;
let externalFallbackTimer = null;
let localVoiceStream = null;
let voiceMuted = false;
let voiceJoined = false;
const peerConnections = new Map();
const remoteAudioElements = new Map();
const roomVoiceParticipants = new Set();
const remoteVideoTiles = new Map();
let localVideoTile = null;
let localVideoEnabled = false;
let authToken = localStorage.getItem("watchparty_auth_token") || "";
let authUser = null;
let accountDashboard = {
  rooms: [],
  watchHistory: [],
  savedPlaylists: [],
};
let lastHistoryMediaKey = "";
const emojiPalette = [0x1F600, 0x1F602, 0x1F60D, 0x1F973, 0x1F525, 0x1F44F, 0x1F64C, 0x1F44D, 0x2764, 0x1F4AF, 0x1F3AC, 0x1F37F, 0x1F60E, 0x1F92F, 0x1F62D, 0x1F634, 0x1F91D, 0x2728, 0x1F389, 0x1F440, 0x2705, 0x274C, 0x1F916, 0x1F4AC].map((code) => String.fromCodePoint(code));
const defaultIceServers = [{ urls: ["stun:stun.l.google.com:19302"] }];
let rtcConfig = { iceServers: defaultIceServers };
let rtcConfigLoaded = false;
let rtcConfigPromise = null;
const videoConstraints = {
  width: { ideal: 640, max: 640 },
  height: { ideal: 360, max: 360 },
  frameRate: { ideal: 15, max: 15 },
};

const providerRules = [
  { host: "youtube.com", label: "YouTube", quality: "good", note: "Known provider. Use Set YouTube for best sync." },
  { host: "youtu.be", label: "YouTube", quality: "good", note: "Known provider. Use Set YouTube for best sync." },
  { host: "vimeo.com", label: "Vimeo", quality: "good", note: "Known provider. Embed usually works." },
  { host: "dailymotion.com", label: "Dailymotion", quality: "good", note: "Known provider. Embed usually works." },
  { host: "dai.ly", label: "Dailymotion", quality: "good", note: "Known provider. Embed usually works." },
  { host: "twitch.tv", label: "Twitch", quality: "warn", note: "May require provider-specific embed params." },
  { host: "netflix.com", label: "Netflix", quality: "warn", note: "Likely blocked in iframe due provider restrictions." },
  { host: "primevideo.com", label: "Prime Video", quality: "warn", note: "Likely blocked in iframe due provider restrictions." },
  { host: "disneyplus.com", label: "Disney+", quality: "warn", note: "Likely blocked in iframe due provider restrictions." },
  { host: "hulu.com", label: "Hulu", quality: "warn", note: "Likely blocked in iframe due provider restrictions." },
  { host: "max.com", label: "Max", quality: "warn", note: "Likely blocked in iframe due provider restrictions." },
];

function setExternalValidationState(quality, provider, message) {
  const classes = ["neutral", "good", "warn", "error"];
  externalProviderBadge.classList.remove(...classes);
  externalValidationText.classList.remove(...classes);

  const safeQuality = classes.includes(quality) ? quality : "neutral";
  externalProviderBadge.classList.add(safeQuality);
  externalValidationText.classList.add(safeQuality);
  externalProviderBadge.textContent = `Provider: ${provider}`;
  externalValidationText.textContent = message;
}

function analyzeExternalUrl(rawUrl) {
  const trimmed = String(rawUrl || "").trim();

  if (!trimmed) {
    return {
      isValid: false,
      provider: "-",
      quality: "neutral",
      message: "Paste a URL to check provider support.",
    };
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      isValid: false,
      provider: "Unknown",
      quality: "error",
      message: "Invalid URL. Use full http(s):// URL.",
    };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return {
      isValid: false,
      provider: "Unknown",
      quality: "error",
      message: "Only http(s) URLs are supported.",
    };
  }

  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  const matched = providerRules.find((rule) => host === rule.host || host.endsWith(`.${rule.host}`));

  if (matched) {
    return {
      isValid: true,
      provider: matched.label,
      quality: matched.quality,
      message: matched.note,
    };
  }

  return {
    isValid: true,
    provider: host,
    quality: "warn",
    message: "Unknown provider. Embed may be blocked; fallback link will appear if needed.",
  };
}

function refreshExternalUrlValidation() {
  const insight = analyzeExternalUrl(externalUrlInput.value);
  setExternalValidationState(insight.quality, insight.provider, insight.message);
  return insight;
}
function normalizeIceServer(rawServer) {
  if (!rawServer || typeof rawServer !== "object") return null;

  const rawUrls = rawServer.urls;
  const urls = Array.isArray(rawUrls)
    ? rawUrls.map((url) => String(url || "").trim()).filter(Boolean)
    : [String(rawUrls || "").trim()].filter(Boolean);

  if (!urls.length) return null;

  const server = { urls };
  if (rawServer.username) server.username = String(rawServer.username);
  if (rawServer.credential) server.credential = String(rawServer.credential);
  return server;
}

async function ensureRtcConfigLoaded() {
  if (rtcConfigLoaded) return;

  if (!rtcConfigPromise) {
    rtcConfigPromise = (async () => {
      try {
        const response = await fetch("/api/rtc-config", { cache: "no-store" });
        const payload = await response.json();

        if (response.ok && Array.isArray(payload.iceServers)) {
          const normalized = payload.iceServers.map(normalizeIceServer).filter(Boolean);
          if (normalized.length) {
            rtcConfig = { iceServers: normalized };
          }
        }
      } catch {
        // Keep default STUN fallback.
      } finally {
        rtcConfigLoaded = true;
      }
    })();
  }

  await rtcConfigPromise;
}
function getAuthHeaders() {
  const headers = {
    "Content-Type": "application/json",
  };

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  return headers;
}

function setAuthStatus(message, tone = "neutral") {
  authStatusText.textContent = message || "";
  authStatusText.classList.remove("ok", "error");
  if (tone === "ok" || tone === "error") {
    authStatusText.classList.add(tone);
  }
}

function setAccountUiState() {
  const loggedIn = Boolean(authUser && authToken);

  loginBtn.disabled = loggedIn;
  registerBtn.disabled = loggedIn;
  logoutBtn.disabled = !loggedIn;
  updateProfileBtn.disabled = !loggedIn;
  refreshAccountBtn.disabled = !loggedIn;
  savePlaylistSnapshotBtn.disabled = !loggedIn || !currentRoomId || !playlist.length;

  loginBtn.classList.toggle("disabled", loginBtn.disabled);
  registerBtn.classList.toggle("disabled", registerBtn.disabled);
  logoutBtn.classList.toggle("disabled", logoutBtn.disabled);
  updateProfileBtn.classList.toggle("disabled", updateProfileBtn.disabled);
  refreshAccountBtn.classList.toggle("disabled", refreshAccountBtn.disabled);
  savePlaylistSnapshotBtn.classList.toggle("disabled", savePlaylistSnapshotBtn.disabled);

  if (loggedIn) {
    authProfileText.textContent = `Profile: ${authUser.displayName} (@${authUser.username})`;
    if (!nameInput.value.trim()) {
      nameInput.value = authUser.displayName;
    }
  } else {
    authProfileText.textContent = "Profile: -";
  }
}

function renderCompactList(container, rows, emptyText) {
  container.innerHTML = "";

  if (!rows.length) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = emptyText;
    container.appendChild(li);
    return;
  }

  rows.forEach((row) => {
    const li = document.createElement("li");
    li.innerHTML = row;
    container.appendChild(li);
  });
}

function renderAccountDashboard() {
  const roomsRows = (accountDashboard.rooms || []).map((entry) => {
    const when = new Date(entry.lastJoinedAt || Date.now()).toLocaleString();
    return `<strong>${entry.roomId}</strong><br><span class="muted">Last joined: ${when}</span>`;
  });

  const historyRows = (accountDashboard.watchHistory || []).slice(0, 12).map((entry) => {
    const when = new Date(entry.watchedAt || Date.now()).toLocaleString();
    return `<strong>${entry.title || "Untitled"}</strong><br><span class="muted">${entry.roomId} | ${entry.mediaType} | ${when}</span>`;
  });

  const savedRows = (accountDashboard.savedPlaylists || []).map((entry) => {
    const when = new Date(entry.savedAt || Date.now()).toLocaleString();
    return `<strong>${entry.roomId}</strong><br><span class="muted">${entry.itemCount} items | Saved: ${when}</span>`;
  });

  renderCompactList(myRoomsList, roomsRows, "No rooms yet.");
  renderCompactList(watchHistoryList, historyRows, "No watch history yet.");
  renderCompactList(savedPlaylistsList, savedRows, "No saved playlists yet.");
}

async function fetchAccountDashboard() {
  if (!authToken) return;

  try {
    const response = await fetch("/api/account/dashboard", {
      method: "GET",
      headers: getAuthHeaders(),
    });

    const payload = await response.json();
    if (!response.ok || !payload.dashboard) {
      if (response.status === 401) {
        authToken = "";
        authUser = null;
        localStorage.removeItem("watchparty_auth_token");
      }
      return;
    }

    accountDashboard = payload.dashboard;
    if (payload.dashboard.user) {
      authUser = payload.dashboard.user;
    }
    renderAccountDashboard();
    setAccountUiState();
  } catch {
    // ignore transient dashboard fetch errors
  }
}

async function refreshAuthSession() {
  if (!authToken) {
    authUser = null;
    accountDashboard = { rooms: [], watchHistory: [], savedPlaylists: [] };
    renderAccountDashboard();
    setAccountUiState();
    setAuthStatus("Not logged in.", "neutral");
    return;
  }

  try {
    const response = await fetch("/api/auth/me", {
      method: "GET",
      headers: getAuthHeaders(),
    });

    const payload = await response.json();
    if (!response.ok || !payload.user) {
      authToken = "";
      authUser = null;
      localStorage.removeItem("watchparty_auth_token");
      setAuthStatus(payload.error || "Session expired. Please login again.", "error");
      setAccountUiState();
      return;
    }

    authUser = payload.user;
    authDisplayNameInput.value = authUser.displayName || "";
    setAuthStatus(`Logged in as @${authUser.username}`, "ok");
    await fetchAccountDashboard();
  } catch {
    setAuthStatus("Failed to restore login session.", "error");
  }

  setAccountUiState();
}

async function authRequest(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(body || {}),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }

  return payload;
}

async function touchMyRoom(roomId) {
  if (!authToken || !roomId) return;
  try {
    await authRequest("/api/account/rooms/touch", { roomId });
    void fetchAccountDashboard();
  } catch {
    // no-op
  }
}

function getHistoryMediaPayload(media) {
  if (!media) return null;

  if (media.type === "youtube") {
    return {
      mediaId: media.youtubeId || media.url || "",
      mediaType: "youtube",
      title: media.title || "YouTube",
    };
  }

  if (media.type === "external") {
    return {
      mediaId: media.url || "",
      mediaType: "external",
      title: media.title || "External",
    };
  }

  return {
    mediaId: media.id || media.fileUrl || "",
    mediaType: "blob",
    title: media.fileName || media.title || "Blob video",
  };
}

async function touchWatchHistory(roomId, media) {
  if (!authToken || !roomId || !media) return;

  const parsed = getHistoryMediaPayload(media);
  if (!parsed) return;

  const dedupeKey = `${roomId}|${parsed.mediaType}|${parsed.mediaId}`;
  if (dedupeKey === lastHistoryMediaKey) return;
  lastHistoryMediaKey = dedupeKey;

  try {
    await authRequest("/api/account/history/touch", {
      roomId,
      mediaId: parsed.mediaId,
      mediaType: parsed.mediaType,
      title: parsed.title,
    });
  } catch {
    // no-op
  }
}
function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function shorten(name, maxLen = 42) {
  if (!name) return "Untitled";
  if (name.length <= maxLen) return name;
  return `${name.slice(0, maxLen - 3)}...`;
}

function isYoutubeMode() {
  return currentMedia?.type === "youtube";
}

function isBlobMode() {
  return currentMedia?.type === "blob";
}

function isExternalMode() {
  return currentMedia?.type === "external";
}

function canManageMedia() {
  return isHost || isCoHost;
}

function updateSelfRoleFromMembers() {
  const self = currentMembers.find((m) => m.id === selfId);
  const role = self?.role || "viewer";
  isHost = role === "host";
  isCoHost = role === "cohost";
}

function getHostName() {
  return currentMembers.find((m) => m.id === currentHostId)?.name || "Unknown";
}

function formatChatTime(timestamp) {
  const date = new Date(Number(timestamp) || Date.now());
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function setVoiceButtonsState() {
  joinVoiceBtn.disabled = !currentRoomId || voiceJoined;
  muteVoiceBtn.disabled = !voiceJoined;
  leaveVoiceBtn.disabled = !voiceJoined;
  toggleVideoBtn.disabled = !voiceJoined;

  joinVoiceBtn.classList.toggle("disabled", joinVoiceBtn.disabled);
  muteVoiceBtn.classList.toggle("disabled", muteVoiceBtn.disabled);
  leaveVoiceBtn.classList.toggle("disabled", leaveVoiceBtn.disabled);
  toggleVideoBtn.classList.toggle("disabled", toggleVideoBtn.disabled);

  toggleVideoBtn.textContent = localVideoEnabled ? "Disable Cam" : "Enable Cam";
}

function updateVoiceStatus() {
  if (!voiceJoined) {
    voiceStatus.textContent = "Voice: Off";
    return;
  }

  const peerCount = Math.max(0, roomVoiceParticipants.size - 1);
  const muteLabel = voiceMuted ? "Muted" : "Live";
  const camLabel = localVideoEnabled ? "Cam On" : "Cam Off";
  voiceStatus.textContent = `Voice: ${muteLabel} (${peerCount} peer${peerCount === 1 ? "" : "s"}) | ${camLabel}`;
}

function syncCamDockVisibility() {
  const hasLocalVideo = Boolean(localVideoTile && !localVideoTile.video.classList.contains("hidden"));
  const hasRemoteVideo = [...remoteVideoTiles.values()].some((tile) => !tile.video.classList.contains("hidden"));
  camDock.classList.toggle("hidden", !(hasLocalVideo || hasRemoteVideo));
}

function attachTileDrag(tile, handle) {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  handle.addEventListener("pointerdown", (event) => {
    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    startLeft = tile.offsetLeft;
    startTop = tile.offsetTop;
    handle.setPointerCapture(event.pointerId);
  });

  handle.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const nextLeft = startLeft + (event.clientX - startX);
    const nextTop = startTop + (event.clientY - startY);
    tile.style.left = `${Math.max(0, nextLeft)}px`;
    tile.style.top = `${Math.max(0, nextTop)}px`;
  });

  const stopDrag = (event) => {
    if (!dragging) return;
    dragging = false;
    if (handle.hasPointerCapture?.(event.pointerId)) {
      handle.releasePointerCapture(event.pointerId);
    }
  };

  handle.addEventListener("pointerup", stopDrag);
  handle.addEventListener("pointercancel", stopDrag);
}

function createCamTile(labelText, xOffset = 0, yOffset = 0) {
  const tile = document.createElement("div");
  tile.className = "cam-tile";
  const spawnX = Math.max(12, window.innerWidth - 260 - xOffset);
  const spawnY = Math.max(12, window.innerHeight - 180 - yOffset);
  tile.style.left = `${spawnX}px`;
  tile.style.top = `${spawnY}px`;

  const head = document.createElement("div");
  head.className = "cam-tile-head";
  head.textContent = labelText;

  const videoEl = document.createElement("video");
  videoEl.autoplay = true;
  videoEl.playsInline = true;
  videoEl.classList.add("hidden");

  const empty = document.createElement("div");
  empty.className = "cam-empty";
  empty.textContent = "Camera off";

  tile.appendChild(head);
  tile.appendChild(videoEl);
  tile.appendChild(empty);
  camDock.appendChild(tile);
  attachTileDrag(tile, head);

  return {
    tile,
    head,
    video: videoEl,
    empty,
  };
}

function ensureLocalVideoTile() {
  if (localVideoTile) return localVideoTile;
  localVideoTile = createCamTile("You", 0, 0);
  localVideoTile.video.muted = true;
  return localVideoTile;
}

function updateTileVideoVisibility(tileRef, hasVideo) {
  tileRef.video.classList.toggle("hidden", !hasVideo);
  tileRef.empty.classList.toggle("hidden", hasVideo);
}

function ensureRemoteVideoTile(peerId) {
  if (remoteVideoTiles.has(peerId)) return remoteVideoTiles.get(peerId);
  const tile = createCamTile(`Peer ${peerId.slice(0, 4)}`, 0, remoteVideoTiles.size * 30);
  remoteVideoTiles.set(peerId, tile);
  return tile;
}

function syncLocalTracksToPeer(pc) {
  if (!pc || !localVoiceStream) return;

  const localTracks = localVoiceStream.getTracks();
  const senders = pc.getSenders();

  senders.forEach((sender) => {
    const senderTrackId = sender.track?.id;
    if (!senderTrackId) return;
    const stillExists = localTracks.some((track) => track.id === senderTrackId);
    if (!stillExists) {
      try {
        pc.removeTrack(sender);
      } catch {
        // ignore removeTrack races
      }
    }
  });

  localTracks.forEach((track) => {
    const alreadySending = pc.getSenders().some((sender) => sender.track?.id === track.id);
    if (!alreadySending) {
      pc.addTrack(track, localVoiceStream);
    }
  });
}

async function renegotiateAllPeers() {
  const peerIds = [...roomVoiceParticipants].filter((id) => id && id !== selfId);
  for (const peerId of peerIds) {
    const pc = createPeerConnection(peerId);
    syncLocalTracksToPeer(pc);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("voice-offer", {
      targetId: peerId,
      sdp: offer,
    });
  }
}

async function enableLocalVideo() {
  if (!voiceJoined || !localVoiceStream) return;

  try {
    const videoOnlyStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
    const newVideoTrack = videoOnlyStream.getVideoTracks()[0];
    if (!newVideoTrack) return;

    localVoiceStream.getVideoTracks().forEach((track) => {
      track.stop();
      localVoiceStream.removeTrack(track);
    });

    localVoiceStream.addTrack(newVideoTrack);
    localVideoEnabled = true;

    const localTile = ensureLocalVideoTile();
    localTile.video.srcObject = localVoiceStream;
    updateTileVideoVisibility(localTile, true);
    const localPlayPromise = localTile.video.play?.();
    if (localPlayPromise && typeof localPlayPromise.catch === "function") {
      localPlayPromise.catch(() => {});
    }
    syncCamDockVisibility();
    setVoiceButtonsState();
    updateVoiceStatus();

    await renegotiateAllPeers();
  } catch (error) {
    statusText.textContent = `Camera enable failed: ${error?.message || "Check camera permission."}`;
  }
}

async function disableLocalVideo() {
  if (!localVoiceStream) return;

  localVoiceStream.getVideoTracks().forEach((track) => {
    track.stop();
    localVoiceStream.removeTrack(track);
  });

  localVideoEnabled = false;

  if (localVideoTile) {
    updateTileVideoVisibility(localVideoTile, false);
  }

  syncCamDockVisibility();
  setVoiceButtonsState();
  updateVoiceStatus();
  await renegotiateAllPeers();
}

async function toggleLocalVideo() {
  if (!voiceJoined) return;
  if (localVideoEnabled) {
    await disableLocalVideo();
  } else {
    await enableLocalVideo();
  }
}

function renderEmojiPicker() {
  emojiPicker.innerHTML = "";
  emojiPalette.forEach((emoji) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "emoji-option";
    button.textContent = emoji;
    button.addEventListener("click", () => {
      const start = chatInput.selectionStart || chatInput.value.length;
      const end = chatInput.selectionEnd || chatInput.value.length;
      const nextValue = `${chatInput.value.slice(0, start)}${emoji}${chatInput.value.slice(end)}`;
      chatInput.value = nextValue;
      const nextCursor = start + emoji.length;
      chatInput.focus();
      chatInput.setSelectionRange(nextCursor, nextCursor);
    });
    emojiPicker.appendChild(button);
  });
}
function renderChatMessages() {
  chatList.innerHTML = "";

  if (!chatMessages.length) {
    const empty = document.createElement("div");
    empty.className = "chat-item";
    empty.textContent = "No messages yet.";
    chatList.appendChild(empty);
    return;
  }

  chatMessages.forEach((item) => {
    const row = document.createElement("div");
    row.className = `chat-item${item.senderId === selfId ? " self" : ""}`;

    const meta = document.createElement("div");
    meta.className = "chat-meta";
    meta.textContent = `${item.senderName || "Guest"} - ${formatChatTime(item.sentAt)}`;

    const text = document.createElement("div");
    text.className = "chat-text";
    text.textContent = item.message || "";

    row.appendChild(meta);
    row.appendChild(text);
    chatList.appendChild(row);
  });

  chatList.scrollTop = chatList.scrollHeight;
}

function sendChatMessage() {
  if (!currentRoomId || !selfId) return;
  const message = String(chatInput.value || "").trim();
  if (!message) return;

  socket.emit("chat-message", { message });
  chatInput.value = "";
  emojiPicker.classList.add("hidden");
}

function removeRemoteAudio(peerId) {
  const audio = remoteAudioElements.get(peerId);
  if (!audio) return;
  audio.pause();
  audio.srcObject = null;
  audio.remove();
  remoteAudioElements.delete(peerId);
}

function removeRemoteVideoTile(peerId) {
  const tileRef = remoteVideoTiles.get(peerId);
  if (!tileRef) return;
  tileRef.video.pause();
  tileRef.video.srcObject = null;
  tileRef.tile.remove();
  remoteVideoTiles.delete(peerId);
  syncCamDockVisibility();
}

function cleanupPeerConnection(peerId) {
  const pc = peerConnections.get(peerId);
  if (pc) {
    pc.onicecandidate = null;
    pc.ontrack = null;
    pc.close();
    peerConnections.delete(peerId);
  }
  removeRemoteAudio(peerId);
  removeRemoteVideoTile(peerId);
}

function createPeerConnection(peerId) {
  if (peerConnections.has(peerId)) {
    return peerConnections.get(peerId);
  }

  const pc = new RTCPeerConnection(rtcConfig);

  if (localVoiceStream) {
    localVoiceStream.getTracks().forEach((track) => {
      pc.addTrack(track, localVoiceStream);
    });
  }

  pc.onicecandidate = (event) => {
    if (!event.candidate) return;
    socket.emit("voice-ice-candidate", {
      targetId: peerId,
      candidate: event.candidate,
    });
  };

  pc.ontrack = (event) => {
    const stream = event.streams[0] || null;
    if (!stream) return;

    let audio = remoteAudioElements.get(peerId);
    if (!audio) {
      audio = document.createElement("audio");
      audio.autoplay = true;
      audio.playsInline = true;
      audio.controls = false;
      remoteAudioElements.set(peerId, audio);
      document.body.appendChild(audio);
    }

    audio.srcObject = stream;
    const playPromise = audio.play?.();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        audio.oncanplay = () => {
          audio.play?.().catch(() => {});
        };
      });
    }

    const tileRef = ensureRemoteVideoTile(peerId);
    tileRef.video.srcObject = stream;
    tileRef.video.muted = true;
    const hasVideo = (stream.getVideoTracks?.().length || 0) > 0;
    updateTileVideoVisibility(tileRef, hasVideo);
    if (hasVideo) {
      const videoPlayPromise = tileRef.video.play?.();
      if (videoPlayPromise && typeof videoPlayPromise.catch === "function") {
        videoPlayPromise.catch(() => {});
      }
    }
    syncCamDockVisibility();
  };

  peerConnections.set(peerId, pc);
  return pc;
}

async function startOfferToPeer(peerId) {
  if (!voiceJoined || !localVoiceStream || !peerId || peerId === selfId) return;
  try {
    const pc = createPeerConnection(peerId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("voice-offer", {
      targetId: peerId,
      sdp: offer,
    });
  } catch {
    cleanupPeerConnection(peerId);
  }
}

async function joinVoiceChat() {
  if (voiceJoined || !currentRoomId) return;

  await ensureRtcConfigLoaded();

  try {
    localVoiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    voiceMuted = false;
    voiceJoined = true;

    localVoiceStream.getAudioTracks().forEach((track) => {
      track.enabled = true;
    });

    socket.emit("voice-join");
    muteVoiceBtn.textContent = "Mute Mic";
  } catch {
    statusText.textContent = "Voice join failed. Check microphone permission.";
    voiceJoined = false;
    if (localVoiceStream) {
      localVoiceStream.getTracks().forEach((track) => track.stop());
      localVoiceStream = null;
    }
  }

  setVoiceButtonsState();
  updateVoiceStatus();
}

function leaveVoiceChat(notifyServer = true) {
  if (notifyServer && currentRoomId) {
    socket.emit("voice-leave");
  }

  for (const peerId of peerConnections.keys()) {
    cleanupPeerConnection(peerId);
  }

  if (localVoiceStream) {
    localVoiceStream.getTracks().forEach((track) => track.stop());
    localVoiceStream = null;
  }

  if (localVideoTile) {
    localVideoTile.video.pause();
    localVideoTile.video.srcObject = null;
    localVideoTile.tile.remove();
    localVideoTile = null;
  }

  remoteVideoTiles.forEach((tileRef) => {
    tileRef.video.pause();
    tileRef.video.srcObject = null;
    tileRef.tile.remove();
  });
  remoteVideoTiles.clear();

  roomVoiceParticipants.clear();
  voiceJoined = false;
  voiceMuted = false;
  localVideoEnabled = false;
  muteVoiceBtn.textContent = "Mute Mic";
  setVoiceButtonsState();
  updateVoiceStatus();
  syncCamDockVisibility();
}

function toggleVoiceMute() {
  if (!voiceJoined || !localVoiceStream) return;
  voiceMuted = !voiceMuted;
  localVoiceStream.getAudioTracks().forEach((track) => {
    track.enabled = !voiceMuted;
  });
  muteVoiceBtn.textContent = voiceMuted ? "Unmute Mic" : "Mute Mic";
  updateVoiceStatus();
}

async function handleVoiceOffer({ fromId, sdp }) {
  if (!voiceJoined || !localVoiceStream || !fromId || fromId === selfId || !sdp) return;

  try {
    const pc = createPeerConnection(fromId);
    syncLocalTracksToPeer(pc);
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit("voice-answer", {
      targetId: fromId,
      sdp: answer,
    });
  } catch {
    cleanupPeerConnection(fromId);
  }
}

async function handleVoiceAnswer({ fromId, sdp }) {
  if (!voiceJoined || !fromId || !sdp) return;
  const pc = peerConnections.get(fromId);
  if (!pc) return;

  try {
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  } catch {
    cleanupPeerConnection(fromId);
  }
}

async function handleVoiceIceCandidate({ fromId, candidate }) {
  if (!voiceJoined || !fromId || !candidate) return;
  const pc = peerConnections.get(fromId);
  if (!pc) return;

  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch {
    // Ignore ICE races.
  }
}
function updateActivePlayerUI() {
  if (isYoutubeMode()) {
    video.classList.add("hidden");
    externalContainer.classList.add("hidden");
    youtubeContainer.classList.remove("hidden");
  } else if (isExternalMode()) {
    video.classList.add("hidden");
    youtubeContainer.classList.add("hidden");
    externalContainer.classList.remove("hidden");
  } else {
    youtubeContainer.classList.add("hidden");
    externalContainer.classList.add("hidden");
    video.classList.remove("hidden");
  }
}

function buildExternalEmbedUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();

    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be") {
      return rawUrl;
    }

    if (host === "vimeo.com") {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      if (id) return `https://player.vimeo.com/video/${id}`;
    }

    if (host === "dailymotion.com") {
      const parts = parsed.pathname.split("/").filter(Boolean);
      const idx = parts.indexOf("video");
      if (idx > -1 && parts[idx + 1]) return `https://www.dailymotion.com/embed/video/${parts[idx + 1]}`;
    }

    if (host === "dai.ly") {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      if (id) return `https://www.dailymotion.com/embed/video/${id}`;
    }

    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

function showExternalFallback(url) {
  externalOpenLink.href = url;
  externalFallback.classList.remove("hidden");
}

function hideExternalFallback() {
  externalFallback.classList.add("hidden");
  if (externalFallbackTimer) {
    clearTimeout(externalFallbackTimer);
    externalFallbackTimer = null;
  }
}

function loadExternalEmbed(url) {
  hideExternalFallback();
  const embedUrl = buildExternalEmbedUrl(url);
  externalFrame.src = "about:blank";

  externalFallbackTimer = setTimeout(() => {
    showExternalFallback(url);
  }, 5000);

  externalFrame.onload = () => {
    if (externalFallbackTimer) {
      clearTimeout(externalFallbackTimer);
      externalFallbackTimer = null;
    }
  };

  externalFrame.src = embedUrl;
}

function setSelectOptions(selectEl, options, selectedValue) {
  selectEl.innerHTML = "";
  options.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.label;
    selectEl.appendChild(option);
  });

  if (selectedValue && options.some((item) => item.value === selectedValue)) {
    selectEl.value = selectedValue;
  } else if (options.length) {
    selectEl.value = options[0].value;
  }
}

function getAudioTracksList() {
  if (!video.audioTracks) return [];
  const list = [];
  for (let i = 0; i < video.audioTracks.length; i += 1) {
    list.push(video.audioTracks[i]);
  }
  return list;
}

function refreshSubtitleOptions() {
  if (isYoutubeMode() || isExternalMode()) {
    setSelectOptions(subtitleSelect, [{ value: "off", label: "YouTube managed" }], "off");
    subtitleSelect.disabled = true;
    subtitleSelect.classList.add("disabled");
    return;
  }

  const tracks = Array.from(video.textTracks || []);
  const options = [{ value: "off", label: "Off" }];

  tracks.forEach((track, index) => {
    const lang = track.language ? ` (${track.language})` : "";
    options.push({
      value: String(index),
      label: `${track.label || `Track ${index + 1}`}${lang}`,
    });
  });

  let selectedValue = "off";
  tracks.forEach((track, index) => {
    if (track.mode === "showing") selectedValue = String(index);
  });

  setSelectOptions(subtitleSelect, options, selectedValue);
  subtitleSelect.disabled = tracks.length === 0;
  subtitleSelect.classList.toggle("disabled", tracks.length === 0);
}

function refreshAudioTrackOptions() {
  if (isYoutubeMode() || isExternalMode()) {
    setSelectOptions(audioTrackSelect, [{ value: "default", label: "YouTube managed" }], "default");
    audioTrackSelect.disabled = true;
    audioTrackSelect.classList.add("disabled");
    return;
  }

  const tracks = getAudioTracksList();
  if (!tracks.length) {
    setSelectOptions(audioTrackSelect, [{ value: "default", label: "Default" }], "default");
    audioTrackSelect.disabled = true;
    audioTrackSelect.classList.add("disabled");
    return;
  }

  const options = tracks.map((track, index) => {
    const lang = track.language ? ` (${track.language})` : "";
    return {
      value: String(index),
      label: `${track.label || `Audio ${index + 1}`}${lang}`,
    };
  });

  let selectedValue = "0";
  tracks.forEach((track, index) => {
    if (track.enabled) selectedValue = String(index);
  });

  setSelectOptions(audioTrackSelect, options, selectedValue);
  audioTrackSelect.disabled = false;
  audioTrackSelect.classList.remove("disabled");
}

function updateSpeedOptionsForMode() {
  if (isExternalMode()) {
    setSelectOptions(speedSelect, [{ value: "1", label: "1x" }], "1");
    speedSelect.disabled = true;
    speedSelect.classList.add("disabled");
    return;
  }

  if (isYoutubeMode()) {
    const rates = youtubePlayer?.getAvailablePlaybackRates?.();
    if (Array.isArray(rates) && rates.length) {
      const options = rates.map((rate) => ({ value: String(rate), label: `${rate}x` }));
      const currentRate = String(youtubePlayer?.getPlaybackRate?.() || 1);
      setSelectOptions(speedSelect, options, currentRate);
      speedSelect.disabled = false;
      speedSelect.classList.remove("disabled");
      return;
    }

    setSelectOptions(speedSelect, [{ value: "1", label: "1x" }], "1");
    speedSelect.disabled = true;
    speedSelect.classList.add("disabled");
    return;
  }

  speedSelect.disabled = false;
  speedSelect.classList.remove("disabled");
  speedSelect.value = String(video.playbackRate || 1);
}

function applyPlaybackRate(value) {
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate <= 0) return;

  if (isExternalMode()) return;

  if (isYoutubeMode()) {
    if (!youtubePlayer || !youtubeReady) return;
    youtubePlayer.setPlaybackRate?.(rate);
    const activeRate = youtubePlayer.getPlaybackRate?.() || rate;
    speedSelect.value = String(activeRate);
    return;
  }

  video.playbackRate = rate;
  speedSelect.value = String(video.playbackRate);
}

function syncPlaybackRateUI() {
  if (isExternalMode()) {
    speedSelect.value = "1";
    return;
  }
  if (isYoutubeMode()) {
    const rate = youtubePlayer?.getPlaybackRate?.();
    if (rate) speedSelect.value = String(rate);
    return;
  }
  speedSelect.value = String(video.playbackRate || 1);
}

function getCurrentTimeSec() {
  if (isYoutubeMode() || isExternalMode()) {
    if (youtubePlayer && youtubeReady && typeof youtubePlayer.getCurrentTime === "function") {
      return Number(youtubePlayer.getCurrentTime()) || 0;
    }
    return 0;
  }
  return Number(video.currentTime) || 0;
}

function getDurationSec() {
  if (isYoutubeMode() || isExternalMode()) {
    if (youtubePlayer && youtubeReady && typeof youtubePlayer.getDuration === "function") {
      return Number(youtubePlayer.getDuration()) || 0;
    }
    return 0;
  }
  return Number(video.duration) || 0;
}

function isPlayingNow() {
  if (isYoutubeMode() || isExternalMode()) {
    if (!youtubePlayer || !youtubeReady || typeof youtubePlayer.getPlayerState !== "function") return false;
    return youtubePlayer.getPlayerState() === 1;
  }
  return !video.paused;
}

function renderTimeline() {
  const duration = getDurationSec();
  const current = getCurrentTimeSec();
  if (duration > 0) {
    seekRange.value = (current / duration) * 100;
  } else {
    seekRange.value = 0;
  }
  timeText.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
}

function emitHostState(eventName) {
  if (!isHost || !currentMedia || applyingRemote) return;
  socket.emit(eventName, {
    time: getCurrentTimeSec(),
    isPlaying: isPlayingNow(),
  });
}

function renderPlaylist() {
  playlistList.innerHTML = "";

  if (!playlist.length) {
    const li = document.createElement("li");
    li.className = "playlist-item";
    li.textContent = "No videos yet.";
    playlistList.appendChild(li);
    return;
  }

  playlist.forEach((item) => {
    const li = document.createElement("li");
    const isActiveBlob = isBlobMode() && item.id === currentVideoId;
    li.className = `playlist-item${isActiveBlob ? " active" : ""}`;

    const title = document.createElement("span");
    title.className = "playlist-title";
    title.textContent = shorten(item.fileName);
    title.title = `${item.fileName}${item.uploadedByName ? ` - by ${item.uploadedByName}` : ""}`;
    li.appendChild(title);

    if (canManageMedia()) {
      title.addEventListener("click", async () => {
        if (item.id === currentVideoId && isBlobMode()) return;
        try {
          const response = await fetch(`/api/select-video/${currentRoomId}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ socketId: selfId, videoId: item.id }),
          });

          const result = await response.json();
          if (!response.ok) {
            statusText.textContent = result.error || "Failed to select video.";
            return;
          }
          statusText.textContent = `Selected: ${item.fileName}`;
        } catch {
          statusText.textContent = "Failed to select video.";
        }
      });

      const delBtn = document.createElement("button");
      delBtn.className = "playlist-delete";
      delBtn.type = "button";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", async () => {
        try {
          const response = await fetch(`/api/delete-video/${currentRoomId}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ socketId: selfId, videoId: item.id }),
          });
          const result = await response.json();
          if (!response.ok) {
            statusText.textContent = result.error || "Failed to delete video.";
            return;
          }
          statusText.textContent = `Deleted: ${item.fileName}`;
        } catch {
          statusText.textContent = "Failed to delete video.";
        }
      });
      li.appendChild(delBtn);
    }

    playlistList.appendChild(li);
  });
}

function renderRequestQueue() {
  requestQueueList.innerHTML = "";

  if (!pendingRequests.length) {
    const li = document.createElement("li");
    li.className = "request-item";
    li.textContent = "No pending requests.";
    requestQueueList.appendChild(li);
    return;
  }

  pendingRequests.forEach((request) => {
    const li = document.createElement("li");
    li.className = "request-item";

    const name = document.createElement("div");
    name.textContent = shorten(request.fileName, 36);
    name.title = request.fileName;
    li.appendChild(name);

    const meta = document.createElement("div");
    meta.className = "request-meta";
    meta.textContent = `Requested by ${request.requestedByName}`;
    li.appendChild(meta);

    if (canManageMedia()) {
      const actions = document.createElement("div");
      actions.className = "request-actions";

      const approve = document.createElement("button");
      approve.type = "button";
      approve.className = "request-action approve";
      approve.textContent = "Approve";
      approve.addEventListener("click", () => actOnRequest(request.id, "approve", request.fileName));

      const reject = document.createElement("button");
      reject.type = "button";
      reject.className = "request-action reject";
      reject.textContent = "Reject";
      reject.addEventListener("click", () => actOnRequest(request.id, "reject", request.fileName));

      actions.appendChild(approve);
      actions.appendChild(reject);
      li.appendChild(actions);
    }

    requestQueueList.appendChild(li);
  });
}

async function actOnRequest(requestId, action, fileName) {
  try {
    const response = await fetch(`/api/request-action/${currentRoomId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ socketId: selfId, requestId, action }),
    });
    const result = await response.json();
    if (!response.ok) {
      statusText.textContent = result.error || "Failed to process request.";
      return;
    }
    statusText.textContent = `${action === "approve" ? "Approved" : "Rejected"}: ${fileName}`;
  } catch {
    statusText.textContent = "Failed to process request.";
  }
}

async function updateMemberRole(targetSocketId, action, memberName) {
  try {
    const response = await fetch(`/api/member-role/${currentRoomId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ socketId: selfId, targetSocketId, action }),
    });

    const result = await response.json();
    if (!response.ok) {
      statusText.textContent = result.error || "Failed to update member role.";
      return;
    }

    statusText.textContent = `${action === "promote" ? "Promoted" : "Demoted"}: ${memberName}`;
  } catch {
    statusText.textContent = "Failed to update member role.";
  }
}

function updateRoleUI() {
  const role = isHost ? "Host" : isCoHost ? "Co-host" : "Viewer";
  roleText.textContent = `Role: ${role}`;

  uploadLabel.textContent = isHost ? "Upload Video (Host Direct)" : "Request Video Add";

  clearUploadBtn.disabled = !canManageMedia();
  setYoutubeBtn.disabled = !canManageMedia();
  youtubeUrlInput.disabled = !canManageMedia();
  setExternalBtn.disabled = !canManageMedia();
  externalUrlInput.disabled = !canManageMedia();
  syncBlobBtn.disabled = !isHost;

  clearUploadBtn.classList.toggle("disabled", !canManageMedia());
  setYoutubeBtn.classList.toggle("disabled", !canManageMedia());
  setExternalBtn.classList.toggle("disabled", !canManageMedia());
  syncBlobBtn.classList.toggle("disabled", !isHost);

  setVoiceButtonsState();
  updateVoiceStatus();
  renderPlaylist();
  updateSpeedOptionsForMode();
  refreshSubtitleOptions();
  refreshAudioTrackOptions();
  renderRequestQueue();
  renderMembers();
}

function updateJoinParticipantsCount() {
  const total = Array.isArray(currentMembers) ? currentMembers.length : 0;
  joinParticipantsText.textContent = `Participants: ${total}`;
}

function renderMembers() {
  updateJoinParticipantsCount();
  memberList.innerHTML = "";

  currentMembers.forEach((member) => {
    const li = document.createElement("li");
    li.className = "member-item";

    const name = document.createElement("span");
    const roleTag = member.role === "host" ? "Host" : member.role === "cohost" ? "Co-host" : "Viewer";
    name.textContent = `${member.name} (${roleTag})`;
    li.appendChild(name);

    if (isHost && member.id !== selfId && member.role !== "host") {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "member-role-btn";

      if (member.role === "cohost") {
        button.textContent = "Demote";
        button.addEventListener("click", () => updateMemberRole(member.id, "demote", member.name));
      } else {
        button.textContent = "Promote";
        button.addEventListener("click", () => updateMemberRole(member.id, "promote", member.name));
      }

      li.appendChild(button);
    }

    memberList.appendChild(li);
  });
}

function setUploadProgress(percent, text) {
  const bounded = Math.min(100, Math.max(0, Number(percent) || 0));
  uploadProgressWrap.classList.remove("hidden");
  uploadProgressFill.style.width = `${bounded}%`;
  uploadProgressText.textContent = text || `${Math.round(bounded)}%`;
}

function resetUploadProgress(delayMs = 1200) {
  setTimeout(() => {
    uploadProgressFill.style.width = "0%";
    uploadProgressText.textContent = "0%";
    uploadProgressWrap.classList.add("hidden");
  }, delayMs);
}

function clearMediaFromUI() {
  currentMedia = null;
  currentVideoId = null;

  video.pause();
  video.removeAttribute("src");
  video.load();

  if (youtubePlayer && youtubeReady && typeof youtubePlayer.stopVideo === "function") {
    youtubePlayer.stopVideo();
  }

  updateActivePlayerUI();
  videoTitle.textContent = "No media selected yet.";
  playPauseBtn.textContent = "Play";
  seekRange.value = 0;
  timeText.textContent = "00:00 / 00:00";
  renderPlaylist();
  updateSpeedOptionsForMode();
  refreshSubtitleOptions();
  refreshAudioTrackOptions();
}

function ensureYouTubePlayer(videoId) {
  return new Promise((resolve, reject) => {
    const finalize = () => {
      if (!youtubePlayer || !youtubeReady) {
        reject(new Error("YouTube player is not ready."));
        return;
      }

      if (typeof youtubePlayer.loadVideoById === "function") {
        youtubePlayer.loadVideoById(videoId);
      }
      resolve();
    };

    const wait = () => {
      if (window.YT && typeof window.YT.Player === "function") {
        if (!youtubePlayer) {
          youtubePlayer = new window.YT.Player("youtubePlayer", {
            videoId,
            playerVars: {
              rel: 0,
              modestbranding: 1,
              playsinline: 1,
            },
            events: {
              onReady: () => {
                youtubeReady = true;
                if (typeof youtubePlayer.setVolume === "function") {
                  youtubePlayer.setVolume(Math.round(Number(volumeRange.value) * 100));
                }
                resolve();
              },
              onStateChange: (event) => {
                if (applyingRemote) return;

                if (event.data === 1) {
                  playPauseBtn.textContent = "Pause";
                  emitHostState("host-play");
                }

                if (event.data === 2) {
                  playPauseBtn.textContent = "Play";
                  emitHostState("host-pause");
                }
              },
            },
          });
        } else if (!youtubeReady) {
          setTimeout(wait, 120);
        } else {
          finalize();
        }
      } else {
        setTimeout(wait, 120);
      }
    };

    wait();
  });
}

async function applyMedia(media) {
  currentMedia = media || null;

  if (!currentMedia) {
    clearMediaFromUI();
    return;
  }

  if (currentMedia.type === "blob") {
    currentVideoId = currentMedia.id || null;
    video.src = currentMedia.fileUrl;
    videoTitle.textContent = `Now playing: ${currentMedia.fileName}`;
    playPauseBtn.textContent = "Play";
    updateActivePlayerUI();
    renderPlaylist();
  updateSpeedOptionsForMode();
  refreshSubtitleOptions();
  refreshAudioTrackOptions();
    return;
  }

  if (currentMedia.type === "youtube") {
    currentVideoId = null;
    video.pause();
    video.removeAttribute("src");
    video.load();
    hideExternalFallback();
    externalFrame.src = "about:blank";

    updateActivePlayerUI();
    videoTitle.textContent = `Now playing: ${currentMedia.title || "YouTube Video"}`;
    renderPlaylist();
    updateSpeedOptionsForMode();
    refreshSubtitleOptions();
    refreshAudioTrackOptions();

    try {
      await ensureYouTubePlayer(currentMedia.youtubeId);
    } catch {
      statusText.textContent = "YouTube player failed to initialize.";
    }
    return;
  }

  if (currentMedia.type === "external") {
    currentVideoId = null;
    video.pause();
    video.removeAttribute("src");
    video.load();

    if (youtubePlayer && youtubeReady) {
      youtubePlayer.stopVideo?.();
    }

    updateActivePlayerUI();
    videoTitle.textContent = `Now playing: ${currentMedia.title || "External URL"}`;
    renderPlaylist();
    updateSpeedOptionsForMode();
    refreshSubtitleOptions();
    refreshAudioTrackOptions();
    loadExternalEmbed(currentMedia.url);
    return;
  }
}

async function applyRemoteState(payload) {
  if (!currentMedia) return;
  if (isExternalMode()) return;
  applyingRemote = true;

  const targetTime = Number(payload.currentTime) || 0;

  try {
    if (isYoutubeMode()) {
      if (youtubePlayer && youtubeReady) {
        if (typeof youtubePlayer.seekTo === "function") {
          const delta = Math.abs((youtubePlayer.getCurrentTime?.() || 0) - targetTime);
          if (delta > 1) youtubePlayer.seekTo(targetTime, true);
        }

        if (payload.isPlaying) {
          youtubePlayer.playVideo?.();
          playPauseBtn.textContent = "Pause";
        } else {
          youtubePlayer.pauseVideo?.();
          playPauseBtn.textContent = "Play";
        }
      }
    } else {
      if (Math.abs(video.currentTime - targetTime) > 0.8) {
        video.currentTime = targetTime;
      }

      if (payload.isPlaying) {
        await video.play();
        playPauseBtn.textContent = "Pause";
      } else {
        video.pause();
        playPauseBtn.textContent = "Play";
      }
    }
  } catch {
    // Browser policy or transient player issue.
  } finally {
    applyingRemote = false;
  }
}

registerBtn.addEventListener("click", async () => {
  const username = authUsernameInput.value.trim();
  const password = authPasswordInput.value;
  const displayName = authDisplayNameInput.value.trim();

  if (!username || !password) {
    setAuthStatus("Username and password are required.", "error");
    return;
  }

  try {
    const payload = await authRequest("/api/auth/register", { username, password, displayName });
    authToken = payload.token || "";
    authUser = payload.user || null;
    if (authToken) {
      localStorage.setItem("watchparty_auth_token", authToken);
    }
    setAuthStatus("Registration successful.", "ok");
    await fetchAccountDashboard();
    setAccountUiState();
  } catch (error) {
    setAuthStatus(error.message || "Registration failed.", "error");
  }
});

loginBtn.addEventListener("click", async () => {
  const username = authUsernameInput.value.trim();
  const password = authPasswordInput.value;

  if (!username || !password) {
    setAuthStatus("Username and password are required.", "error");
    return;
  }

  try {
    const payload = await authRequest("/api/auth/login", { username, password });
    authToken = payload.token || "";
    authUser = payload.user || null;
    if (authToken) {
      localStorage.setItem("watchparty_auth_token", authToken);
    }
    setAuthStatus("Login successful.", "ok");
    await fetchAccountDashboard();
    setAccountUiState();
  } catch (error) {
    setAuthStatus(error.message || "Login failed.", "error");
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    if (authToken) {
      await authRequest("/api/auth/logout", {});
    }
  } catch {
    // no-op
  }

  authToken = "";
  authUser = null;
  accountDashboard = { rooms: [], watchHistory: [], savedPlaylists: [] };
  lastHistoryMediaKey = "";
  localStorage.removeItem("watchparty_auth_token");
  renderAccountDashboard();
  setAuthStatus("Logged out.", "neutral");
  setAccountUiState();
});

updateProfileBtn.addEventListener("click", async () => {
  if (!authToken) return;
  const displayName = authDisplayNameInput.value.trim();
  if (!displayName) {
    setAuthStatus("Display name cannot be empty.", "error");
    return;
  }

  try {
    const payload = await authRequest("/api/auth/profile", { displayName });
    authUser = payload.user || authUser;
    setAuthStatus("Profile updated.", "ok");
    setAccountUiState();
  } catch (error) {
    setAuthStatus(error.message || "Failed to update profile.", "error");
  }
});

refreshAccountBtn.addEventListener("click", async () => {
  await fetchAccountDashboard();
  setAuthStatus("Account data refreshed.", "ok");
});

savePlaylistSnapshotBtn.addEventListener("click", async () => {
  if (!authToken || !currentRoomId || !playlist.length) return;

  try {
    await authRequest(`/api/account/saved-playlists/${currentRoomId}`, {
      playlist,
    });
    await fetchAccountDashboard();
    setAuthStatus("Playlist saved to your account.", "ok");
  } catch (error) {
    setAuthStatus(error.message || "Failed to save playlist.", "error");
  }
});
joinBtn.addEventListener("click", () => {
  if (voiceJoined) {
    leaveVoiceChat(true);
  }
  const roomId = roomInput.value.trim();
  const typedName = nameInput.value.trim();
  const name = typedName || authUser?.displayName || "Guest";
  if (!roomId) {
    statusText.textContent = "Enter a room ID first.";
    return;
  }

  socket.emit("join-room", { roomId, name, authToken });
  statusText.textContent = "Connecting to room...";
});

setYoutubeBtn.addEventListener("click", async () => {
  if (!canManageMedia() || !currentRoomId) return;
  const url = youtubeUrlInput.value.trim();
  if (!url) {
    statusText.textContent = "Paste a YouTube URL.";
    return;
  }

  try {
    const response = await fetch(`/api/set-youtube/${currentRoomId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ socketId: selfId, url }),
    });
    const result = await response.json();
    if (!response.ok) {
      statusText.textContent = result.error || "Failed to set YouTube.";
      return;
    }
    statusText.textContent = "YouTube media set for room.";
  } catch {
    statusText.textContent = "Failed to set YouTube media.";
  }
});

externalUrlInput.addEventListener("input", () => {
  refreshExternalUrlValidation();
});

externalUrlInput.addEventListener("blur", () => {
  refreshExternalUrlValidation();
});
setExternalBtn.addEventListener("click", async () => {
  if (!canManageMedia() || !currentRoomId) return;
  const url = externalUrlInput.value.trim();
  if (!url) {
    statusText.textContent = "Paste an external URL.";
    return;
  }

  const insight = refreshExternalUrlValidation();

  try {
    const response = await fetch(`/api/set-external/${currentRoomId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ socketId: selfId, url }),
    });

    const result = await response.json();
    if (!response.ok) {
      statusText.textContent = result.error || "Failed to set external URL.";
      return;
    }

    statusText.textContent = insight.quality === "warn" ? "External media set (provider may block embed)." : "External media set for room.";
  } catch {
    statusText.textContent = "Failed to set external media.";
  }
});
syncBlobBtn.addEventListener("click", async () => {
  if (!isHost || !currentRoomId) return;

  try {
    const response = await fetch(`/api/sync-playlist/${currentRoomId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ socketId: selfId }),
    });

    const result = await response.json();
    if (!response.ok) {
      statusText.textContent = result.error || "Failed to sync playlist from blob.";
      return;
    }

    statusText.textContent = "Playlist synced from blob.";
  } catch {
    statusText.textContent = "Failed to sync playlist from blob.";
  }
});

uploadInput.addEventListener("change", async (event) => {
  if (!currentRoomId) return;
  const file = event.target.files?.[0];
  if (!file) return;

  const formData = new FormData();
  formData.append("video", file);
  formData.append("socketId", selfId);

  const endpoint = isHost ? `/api/upload/${currentRoomId}` : `/api/request-upload/${currentRoomId}`;
  const progressText = isHost ? "uploaded" : "requested";

  setUploadProgress(0, "0%");
  statusText.textContent = isHost ? `Uploading ${file.name}...` : `Submitting request for ${file.name}...`;

  try {
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", endpoint);

      xhr.upload.onprogress = (progressEvent) => {
        if (!progressEvent.lengthComputable) return;
        const percent = (progressEvent.loaded / progressEvent.total) * 100;
        setUploadProgress(percent, `${Math.round(percent)}% ${progressText}`);
      };

      xhr.onload = () => {
        let payload = {};
        try {
          payload = JSON.parse(xhr.responseText || "{}");
        } catch {
          payload = {};
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(payload);
        } else {
          reject(new Error(payload.error || "Upload failed."));
        }
      };

      xhr.onerror = () => reject(new Error("Upload failed due to network/server error."));
      xhr.send(formData);
    });

    setUploadProgress(100, isHost ? "Upload complete" : "Request submitted");
    statusText.textContent = isHost ? `Uploaded: ${file.name}` : "Request submitted to host.";
    resetUploadProgress();
  } catch (error) {
    statusText.textContent = error.message || "Upload failed.";
    setUploadProgress(0, "Upload failed");
    resetUploadProgress(2000);
  } finally {
    uploadInput.value = "";
  }
});

clearUploadBtn.addEventListener("click", async () => {
  if (!canManageMedia() || !currentRoomId) return;

  try {
    const response = await fetch(`/api/clear-upload/${currentRoomId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ socketId: selfId }),
    });
    const result = await response.json();
    if (!response.ok) {
      statusText.textContent = result.error || "Failed to clear current media.";
      return;
    }
    statusText.textContent = "Current media cleared.";
  } catch {
    statusText.textContent = "Failed to clear current media.";
  }
});

playPauseBtn.addEventListener("click", async () => {
  if (!currentMedia || !isHost) return;

  if (isYoutubeMode() || isExternalMode()) {
    if (!youtubePlayer || !youtubeReady) return;
    if (isPlayingNow()) {
      youtubePlayer.pauseVideo?.();
    } else {
      youtubePlayer.playVideo?.();
    }
    return;
  }

  if (video.paused) {
    await video.play();
  } else {
    video.pause();
  }
});

muteBtn.addEventListener("click", () => {
  if (isYoutubeMode() || isExternalMode()) {
    if (!youtubePlayer || !youtubeReady) return;
    const muted = youtubePlayer.isMuted?.();
    if (muted) {
      youtubePlayer.unMute?.();
      muteBtn.textContent = "Mute";
    } else {
      youtubePlayer.mute?.();
      muteBtn.textContent = "Unmute";
    }
    return;
  }

  video.muted = !video.muted;
  muteBtn.textContent = video.muted ? "Unmute" : "Mute";
});

fullscreenBtn.addEventListener("click", async () => {
  if (!currentMedia) return;
  if (document.fullscreenElement) {
    await document.exitFullscreen();
  } else {
    const target = isYoutubeMode() ? youtubeContainer : isExternalMode() ? externalContainer : video;
    await target.requestFullscreen();
  }
});

sendChatBtn.addEventListener("click", sendChatMessage);
chatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendChatMessage();
  }
});

emojiBtn.addEventListener("click", () => {
  emojiPicker.classList.toggle("hidden");
  chatInput.focus();
});

joinVoiceBtn.addEventListener("click", joinVoiceChat);
muteVoiceBtn.addEventListener("click", toggleVoiceMute);
leaveVoiceBtn.addEventListener("click", () => leaveVoiceChat(true));
toggleVideoBtn.addEventListener("click", () => {
  void toggleLocalVideo();
});

document.addEventListener("click", (event) => {
  if (emojiPicker.classList.contains("hidden")) return;
  const clickedInsidePicker = emojiPicker.contains(event.target) || event.target === emojiBtn;
  if (!clickedInsidePicker) {
    emojiPicker.classList.add("hidden");
  }
});
speedSelect.addEventListener("change", () => {
  applyPlaybackRate(speedSelect.value);
});

subtitleSelect.addEventListener("change", () => {
  if (isYoutubeMode() || isExternalMode()) return;

  const tracks = Array.from(video.textTracks || []);
  const selected = subtitleSelect.value;

  tracks.forEach((track, index) => {
    track.mode = selected === String(index) ? "showing" : "disabled";
  });
});

audioTrackSelect.addEventListener("change", () => {
  if (isYoutubeMode() || isExternalMode()) return;

  const tracks = getAudioTracksList();
  const selectedIndex = Number(audioTrackSelect.value);
  if (!tracks.length || !Number.isInteger(selectedIndex)) return;

  tracks.forEach((track, index) => {
    track.enabled = index === selectedIndex;
  });
});
volumeRange.addEventListener("input", () => {
  const value = Number(volumeRange.value);

  if (isYoutubeMode() || isExternalMode()) {
    if (!youtubePlayer || !youtubeReady) return;
    youtubePlayer.setVolume?.(Math.round(value * 100));
    return;
  }

  video.volume = value;
});

seekRange.addEventListener("input", () => {
  if (!currentMedia) return;
  const duration = getDurationSec();
  if (!duration) return;
  const target = (Number(seekRange.value) / 100) * duration;

  if (isYoutubeMode() || isExternalMode()) {
    youtubePlayer.seekTo?.(target, true);
  } else {
    video.currentTime = target;
  }

  if (isHost) {
    emitHostState("host-seek");
  }
});

video.addEventListener("loadedmetadata", () => {
  if (!isBlobMode()) return;
  updateSpeedOptionsForMode();
  refreshSubtitleOptions();
  refreshAudioTrackOptions();
});

video.addEventListener("ratechange", () => {
  if (!isBlobMode()) return;
  syncPlaybackRateUI();
});

if (video.textTracks) {
  for (let i = 0; i < video.textTracks.length; i += 1) {
    video.textTracks[i].addEventListener("change", refreshSubtitleOptions);
  }
}

if (video.audioTracks) {
  video.audioTracks.addEventListener?.("change", refreshAudioTrackOptions);
  video.audioTracks.addEventListener?.("addtrack", refreshAudioTrackOptions);
  video.audioTracks.addEventListener?.("removetrack", refreshAudioTrackOptions);
}
video.addEventListener("timeupdate", () => {
  if (!isBlobMode()) return;
  renderTimeline();

  const now = Date.now();
  if (isHost && !video.paused && now - lastHostStateSentAt > 2000) {
    socket.emit("host-state", { time: getCurrentTimeSec(), isPlaying: true });
    lastHostStateSentAt = now;
  }
});

video.addEventListener("play", () => {
  if (!isBlobMode()) return;
  playPauseBtn.textContent = "Pause";
  emitHostState("host-play");
});

video.addEventListener("pause", () => {
  if (!isBlobMode()) return;
  playPauseBtn.textContent = "Play";
  emitHostState("host-pause");
});

video.addEventListener("seeked", () => {
  if (!isBlobMode()) return;
  emitHostState("host-seek");
});

setInterval(() => {
  if (!currentMedia) return;
  renderTimeline();

  if (isHost && isPlayingNow()) {
    const now = Date.now();
    if (now - lastHostStateSentAt > 2000) {
      socket.emit("host-state", { time: getCurrentTimeSec(), isPlaying: true });
      lastHostStateSentAt = now;
    }
  }
}, 500);

socket.on("connect", () => {
  selfId = socket.id;
});

socket.on("room-state", async ({ roomId, isHost: hostRole, isCoHost: coHostRole, hostId, media, playlist: roomPlaylist, pendingRequests: queue, currentVideoId: activeVideoId, state, members, chatMessages: roomChatMessages, voiceParticipants }) => {
  currentRoomId = roomId;
  isHost = Boolean(hostRole);
  isCoHost = Boolean(coHostRole);
  currentHostId = hostId;
  playlist = Array.isArray(roomPlaylist) ? roomPlaylist : [];
  pendingRequests = Array.isArray(queue) ? queue : [];
  currentVideoId = activeVideoId || null;
  currentMembers = Array.isArray(members) ? members : [];
  chatMessages = Array.isArray(roomChatMessages) ? roomChatMessages : [];
  roomVoiceParticipants.clear();
  if (Array.isArray(voiceParticipants)) {
    voiceParticipants.forEach((participantId) => roomVoiceParticipants.add(participantId));
  }

  updateSelfRoleFromMembers();
  updateRoleUI();
  renderChatMessages();

  hostText.textContent = `Host: ${getHostName()}`;
  statusText.textContent = `Joined room: ${roomId}`;
  void touchMyRoom(roomId);

  if (media) {
    await applyMedia(media);
    await touchWatchHistory(roomId, media);
    await applyRemoteState(state);
  } else {
    clearMediaFromUI();
  }
});

socket.on("playlist-updated", ({ playlist: roomPlaylist, currentVideoId: activeVideoId }) => {
  playlist = Array.isArray(roomPlaylist) ? roomPlaylist : [];
  currentVideoId = activeVideoId || null;
  renderPlaylist();
  updateSpeedOptionsForMode();
  refreshSubtitleOptions();
  refreshAudioTrackOptions();
});

socket.on("room-chat-message", (chatItem) => {
  if (!chatItem || !chatItem.message) return;
  chatMessages.push(chatItem);
  if (chatMessages.length > 100) {
    chatMessages = chatMessages.slice(-100);
  }
  renderChatMessages();
});

socket.on("voice-participants", ({ participants }) => {
  roomVoiceParticipants.clear();
  if (Array.isArray(participants)) {
    participants.forEach((participantId) => roomVoiceParticipants.add(participantId));
  }

  if (voiceJoined) {
    roomVoiceParticipants.add(selfId);
  }

  updateVoiceStatus();
});

socket.on("voice-user-joined", ({ socketId: joinedId }) => {
  if (!joinedId) return;
  roomVoiceParticipants.add(joinedId);
  if (voiceJoined && joinedId !== selfId) {
    void startOfferToPeer(joinedId);
  }
  updateVoiceStatus();
});

socket.on("voice-user-left", ({ socketId: leftId }) => {
  if (!leftId) return;
  roomVoiceParticipants.delete(leftId);
  cleanupPeerConnection(leftId);
  updateVoiceStatus();
});

socket.on("voice-offer", (payload) => {
  void handleVoiceOffer(payload || {});
});

socket.on("voice-answer", (payload) => {
  void handleVoiceAnswer(payload || {});
});

socket.on("voice-ice-candidate", (payload) => {
  void handleVoiceIceCandidate(payload || {});
});

socket.on("queue-updated", ({ pendingRequests: queue }) => {
  pendingRequests = Array.isArray(queue) ? queue : [];
  renderRequestQueue();
});

socket.on("room-media-changed", async ({ media, state }) => {
  if (!media) {
    clearMediaFromUI();
    return;
  }
  await applyMedia(media);
  await touchWatchHistory(currentRoomId, media);
  await applyRemoteState(state);
});

socket.on("room-media-cleared", () => {
  clearMediaFromUI();
});

socket.on("room-members", ({ hostId, members }) => {
  currentHostId = hostId;
  currentMembers = Array.isArray(members) ? members : [];
  updateSelfRoleFromMembers();
  hostText.textContent = `Host: ${getHostName()}`;
  updateRoleUI();
  renderChatMessages();
});

socket.on("host-changed", ({ hostId }) => {
  currentHostId = hostId;
  hostText.textContent = `Host: ${getHostName()}`;
});

socket.on("sync-state", async (payload) => {
  if (!isHost) {
    await applyRemoteState(payload);
  }
});
socket.on("disconnect", () => {
  leaveVoiceChat(false);
  currentMembers = [];
  updateJoinParticipantsCount();
});

document.addEventListener("beforeunload", () => {
  leaveVoiceChat(true);
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !isHost) {
    socket.emit("request-sync");
  }
});

renderEmojiPicker();
renderAccountDashboard();
void refreshAuthSession();
updateJoinParticipantsCount();
setVoiceButtonsState();
updateVoiceStatus();
refreshExternalUrlValidation();
updateSpeedOptionsForMode();
refreshSubtitleOptions();
refreshAudioTrackOptions();



