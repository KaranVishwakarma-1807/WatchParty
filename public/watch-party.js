const socket = io();

const roomInput = document.getElementById("roomInput");
const nameInput = document.getElementById("nameInput");
const joinBtn = document.getElementById("joinBtn");
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
    row.className = "chat-item";

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

  renderPlaylist();
  updateSpeedOptionsForMode();
  refreshSubtitleOptions();
  refreshAudioTrackOptions();
  renderRequestQueue();
  renderMembers();
}

function renderMembers() {
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

joinBtn.addEventListener("click", () => {
  const roomId = roomInput.value.trim();
  const name = nameInput.value.trim();
  if (!roomId) {
    statusText.textContent = "Enter a room ID first.";
    return;
  }

  socket.emit("join-room", { roomId, name });
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
  if (event.key === "Enter") {
    event.preventDefault();
    sendChatMessage();
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

socket.on("room-state", async ({ roomId, isHost: hostRole, isCoHost: coHostRole, hostId, media, playlist: roomPlaylist, pendingRequests: queue, currentVideoId: activeVideoId, state, members, chatMessages: roomChatMessages }) => {
  currentRoomId = roomId;
  isHost = Boolean(hostRole);
  isCoHost = Boolean(coHostRole);
  currentHostId = hostId;
  playlist = Array.isArray(roomPlaylist) ? roomPlaylist : [];
  pendingRequests = Array.isArray(queue) ? queue : [];
  currentVideoId = activeVideoId || null;
  currentMembers = Array.isArray(members) ? members : [];
  chatMessages = Array.isArray(roomChatMessages) ? roomChatMessages : [];

  updateSelfRoleFromMembers();
  updateRoleUI();
  renderChatMessages();

  hostText.textContent = `Host: ${getHostName()}`;
  statusText.textContent = `Joined room: ${roomId}`;

  if (media) {
    await applyMedia(media);
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

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !isHost) {
    socket.emit("request-sync");
  }
});










updateSpeedOptionsForMode();
refreshSubtitleOptions();
refreshAudioTrackOptions();

























