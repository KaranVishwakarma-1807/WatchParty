const socket = io();

const roomInput = document.getElementById("roomInput");
const nameInput = document.getElementById("nameInput");
const joinBtn = document.getElementById("joinBtn");
const statusText = document.getElementById("statusText");
const roleText = document.getElementById("roleText");
const hostText = document.getElementById("hostText");
const memberList = document.getElementById("memberList");
const uploadInput = document.getElementById("uploadInput");
const clearUploadBtn = document.getElementById("clearUploadBtn");

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

function updateRoleUI() {
  roleText.textContent = `Role: ${isHost ? "Host" : "Viewer"}`;
  uploadInput.disabled = !isHost;
  clearUploadBtn.disabled = !isHost;
  if (isHost) {
    uploadInput.classList.remove("disabled");
    clearUploadBtn.classList.remove("disabled");
  } else {
    uploadInput.classList.add("disabled");
    clearUploadBtn.classList.add("disabled");
  }
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
  video.src = videoInfo.fileUrl;
  videoTitle.textContent = `Now playing: ${videoInfo.fileName}`;
}

function clearVideoFromUI() {
  video.pause();
  video.removeAttribute("src");
  video.load();
  videoTitle.textContent = "No video uploaded yet.";
  timeText.textContent = "00:00 / 00:00";
  seekRange.value = 0;
  playPauseBtn.textContent = "Play";
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
  if (!isHost || !currentRoomId) return;
  const file = event.target.files?.[0];
  if (!file) return;

  const formData = new FormData();
  formData.append("video", file);
  formData.append("socketId", selfId);

  try {
    const response = await fetch(`/api/upload/${currentRoomId}`, {
      method: "POST",
      body: formData,
    });
    const result = await response.json();
    if (!response.ok) {
      statusText.textContent = result.error || "Upload failed.";
      return;
    }
    statusText.textContent = `Uploaded: ${result.video.fileName}`;
  } catch {
    statusText.textContent = "Upload failed due to network/server error.";
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
      statusText.textContent = result.error || "Failed to clear uploaded video.";
      return;
    }
    statusText.textContent = "Uploaded video cleared.";
  } catch {
    statusText.textContent = "Failed to clear uploaded video.";
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

socket.on("room-state", async ({ roomId, isHost: hostRole, hostId, video: roomVideo, state, members }) => {
  currentRoomId = roomId;
  isHost = hostRole;
  currentHostId = hostId;
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
