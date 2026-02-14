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
const uploadProgressWrap = document.getElementById("uploadProgressWrap");
const uploadProgressFill = document.getElementById("uploadProgressFill");
const uploadProgressText = document.getElementById("uploadProgressText");

const video = document.getElementById("videoPlayer");
const videoTitle = document.getElementById("videoTitle");
const playPauseBtn = document.getElementById("playPauseBtn");
const muteBtn = document.getElementById("muteBtn");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const volumeRange = document.getElementById("volumeRange");
const seekRange = document.getElementById("seekRange");
const timeText = document.getElementById("timeText");

let currentRoomId = "";
let currentHostId = "";
let currentVideoId = null;
let playlist = [];
let pendingRequests = [];
let selfId = "";
let isHost = false;
let applyingRemote = false;
let lastHostStateSentAt = 0;

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function shorten(name, maxLen = 42) {
  if (!name) return "Untitled";
  if (name.length <= maxLen) return name;
  return `${name.slice(0, maxLen - 3)}...`;
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
    li.className = `playlist-item${item.id === currentVideoId ? " active" : ""}`;

    const title = document.createElement("span");
    title.className = "playlist-title";
    title.textContent = shorten(item.fileName);
    title.title = `${item.fileName}${item.uploadedByName ? ` - by ${item.uploadedByName}` : ""}`;
    li.appendChild(title);

    if (isHost) {
      title.addEventListener("click", async () => {
        if (item.id === currentVideoId) return;
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
          statusText.textContent = `Selected: ${result.video.fileName}`;
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

    if (isHost) {
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

function updateRoleUI() {
  roleText.textContent = `Role: ${isHost ? "Host" : "Viewer"}`;
  uploadLabel.textContent = isHost ? "Upload Video (Host Direct)" : "Request Video Add";
  clearUploadBtn.disabled = !isHost;

  if (isHost) {
    clearUploadBtn.classList.remove("disabled");
  } else {
    clearUploadBtn.classList.add("disabled");
  }

  renderPlaylist();
  renderRequestQueue();
}

function updateMembers(members) {
  memberList.innerHTML = "";
  members.forEach((member) => {
    const li = document.createElement("li");
    li.textContent = member.id === currentHostId ? `${member.name} (Host)` : member.name;
    memberList.appendChild(li);
  });
}

function applyVideo(videoInfo) {
  if (!videoInfo) return;
  currentVideoId = videoInfo.id || currentVideoId;
  video.src = videoInfo.fileUrl;
  videoTitle.textContent = `Now playing: ${videoInfo.fileName}`;
  renderPlaylist();
}

function clearVideoFromUI() {
  currentVideoId = null;
  video.pause();
  video.removeAttribute("src");
  video.load();
  videoTitle.textContent = "No video uploaded yet.";
  timeText.textContent = "00:00 / 00:00";
  seekRange.value = 0;
  playPauseBtn.textContent = "Play";
  renderPlaylist();
}

async function applyRemoteState(payload) {
  if (!video.src) return;
  applyingRemote = true;

  const targetTime = Number(payload.currentTime) || 0;
  if (Math.abs(video.currentTime - targetTime) > 0.8) {
    video.currentTime = targetTime;
  }

  try {
    if (payload.isPlaying) {
      await video.play();
    } else {
      video.pause();
    }
  } catch {
    // Browser may block autoplay until interaction.
  } finally {
    applyingRemote = false;
  }
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

function emitHostState(eventName) {
  if (!isHost || !video.src || applyingRemote) return;
  socket.emit(eventName, { time: video.currentTime, isPlaying: !video.paused });
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
    const result = await new Promise((resolve, reject) => {
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
    statusText.textContent = isHost ? `Uploaded: ${result.video.fileName}` : "Request submitted to host.";
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
  if (!isHost || !currentRoomId) return;

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
      statusText.textContent = result.error || "Failed to clear current video.";
      return;
    }
    statusText.textContent = "Current video cleared.";
  } catch {
    statusText.textContent = "Failed to clear current video.";
  }
});

playPauseBtn.addEventListener("click", async () => {
  if (!video.src || !isHost) return;
  if (video.paused) {
    await video.play();
  } else {
    video.pause();
  }
});

muteBtn.addEventListener("click", () => {
  video.muted = !video.muted;
  muteBtn.textContent = video.muted ? "Unmute" : "Mute";
});

fullscreenBtn.addEventListener("click", async () => {
  if (!video.src) return;
  if (document.fullscreenElement) {
    await document.exitFullscreen();
  } else {
    await video.requestFullscreen();
  }
});

volumeRange.addEventListener("input", () => {
  video.volume = Number(volumeRange.value);
});

seekRange.addEventListener("input", () => {
  if (!video.duration) return;
  const target = (Number(seekRange.value) / 100) * video.duration;
  video.currentTime = target;
});

video.addEventListener("timeupdate", () => {
  if (video.duration) {
    const progress = (video.currentTime / video.duration) * 100;
    seekRange.value = progress;
  }
  timeText.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;

  const now = Date.now();
  if (isHost && !video.paused && now - lastHostStateSentAt > 2000) {
    socket.emit("host-state", { time: video.currentTime, isPlaying: true });
    lastHostStateSentAt = now;
  }
});

video.addEventListener("play", () => {
  playPauseBtn.textContent = "Pause";
  emitHostState("host-play");
});

video.addEventListener("pause", () => {
  playPauseBtn.textContent = "Play";
  emitHostState("host-pause");
});

video.addEventListener("seeked", () => {
  emitHostState("host-seek");
});

socket.on("connect", () => {
  selfId = socket.id;
});

socket.on("room-state", async ({ roomId, isHost: hostRole, hostId, video: roomVideo, playlist: roomPlaylist, pendingRequests: queue, currentVideoId: activeVideoId, state, members }) => {
  currentRoomId = roomId;
  isHost = hostRole;
  currentHostId = hostId;
  playlist = Array.isArray(roomPlaylist) ? roomPlaylist : [];
  pendingRequests = Array.isArray(queue) ? queue : [];
  currentVideoId = activeVideoId || null;

  updateRoleUI();
  updateMembers(members);

  const hostName = members.find((m) => m.id === hostId)?.name || "Unknown";
  hostText.textContent = `Host: ${hostName}`;
  statusText.textContent = `Joined room: ${roomId}`;

  if (roomVideo) {
    applyVideo(roomVideo);
    await applyRemoteState(state);
  } else {
    clearVideoFromUI();
  }
});

socket.on("playlist-updated", ({ playlist: roomPlaylist, currentVideoId: activeVideoId }) => {
  playlist = Array.isArray(roomPlaylist) ? roomPlaylist : [];
  currentVideoId = activeVideoId || null;
  renderPlaylist();
});

socket.on("queue-updated", ({ pendingRequests: queue }) => {
  pendingRequests = Array.isArray(queue) ? queue : [];
  renderRequestQueue();
});

socket.on("room-video-changed", async ({ video: roomVideo, state }) => {
  applyVideo(roomVideo);
  await applyRemoteState(state);
});

socket.on("room-video-cleared", () => {
  clearVideoFromUI();
});

socket.on("room-members", ({ hostId, members }) => {
  currentHostId = hostId;
  const hostName = members.find((m) => m.id === hostId)?.name || "Unknown";
  hostText.textContent = `Host: ${hostName}`;
  updateMembers(members);
});

socket.on("host-changed", ({ hostId }) => {
  currentHostId = hostId;
  isHost = hostId === selfId;
  updateRoleUI();
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
