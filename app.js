const uploadInput = document.getElementById("videoUpload");
const video = document.getElementById("videoPlayer");
const playPauseBtn = document.getElementById("playPauseBtn");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const muteBtn = document.getElementById("muteBtn");
const theaterBtn = document.getElementById("theaterBtn");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const volumeRange = document.getElementById("volumeRange");
const speedSelect = document.getElementById("speedSelect");
const seekBar = document.getElementById("seekBar");
const seekTooltip = document.getElementById("seekTooltip");
const timeText = document.getElementById("timeText");
const playlistEl = document.getElementById("playlist");
const nowPlaying = document.getElementById("nowPlaying");
const playerColumn = document.querySelector(".player-column");
const clearUploadsBtn = document.getElementById("clearUploadsBtn");

const DB_NAME = "simpletube_video_player";
const DB_VERSION = 1;
const VIDEO_STORE = "videos";

let playlist = [];
let currentIndex = -1;
let inactivityTimer = null;
let videoDb = null;

function canUseIndexedDb() {
  return typeof window.indexedDB !== "undefined";
}

function openVideoDb() {
  if (!canUseIndexedDb()) return Promise.resolve(null);

  if (videoDb) return Promise.resolve(videoDb);

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(VIDEO_STORE)) {
        db.createObjectStore(VIDEO_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => {
      videoDb = request.result;
      resolve(videoDb);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

function readAllStoredVideos(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VIDEO_STORE, "readonly");
    const store = tx.objectStore(VIDEO_STORE);
    const request = store.getAll();

    request.onsuccess = () => {
      const records = request.result || [];
      records.sort((a, b) => a.createdAt - b.createdAt);
      resolve(records);
    };
    request.onerror = () => reject(request.error);
  });
}

function persistVideoFile(db, file) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VIDEO_STORE, "readwrite");
    const store = tx.objectStore(VIDEO_STORE);

    const record = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      name: file.name,
      type: file.type || "video/mp4",
      lastModified: file.lastModified || Date.now(),
      createdAt: Date.now(),
      blob: file,
    };

    const request = store.put(record);
    request.onsuccess = () => resolve(record);
    request.onerror = () => reject(request.error);
  });
}

function createPlaylistItem(id, file) {
  return {
    id,
    file,
    url: URL.createObjectURL(file),
  };
}

function clearStoredVideos(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VIDEO_STORE, "readwrite");
    const store = tx.objectStore(VIDEO_STORE);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function loadStoredVideos() {
  try {
    const db = await openVideoDb();
    if (!db) return;

    const records = await readAllStoredVideos(db);
    if (!records.length) return;

    playlist = records.map((record) => {
      const file = new File([record.blob], record.name, {
        type: record.type,
        lastModified: record.lastModified,
      });
      return createPlaylistItem(record.id, file);
    });

    updatePlaylistUI();
    loadVideo(0, false);
  } catch {
    // Keep player usable even if persistence fails.
  }
}

function updateSeekProgress(value) {
  seekBar.style.setProperty("--progress", `${value}%`);
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function shrinkVideoName(name, maxLength = 34) {
  if (name.length <= maxLength) return name;
  const dotIndex = name.lastIndexOf(".");
  const hasExt = dotIndex > 0 && dotIndex < name.length - 1;

  if (!hasExt) {
    return `${name.slice(0, maxLength - 3)}...`;
  }

  const ext = name.slice(dotIndex);
  const base = name.slice(0, dotIndex);
  const keepBase = Math.max(5, maxLength - ext.length - 3);
  return `${base.slice(0, keepBase)}...${ext}`;
}

function updatePlaylistUI() {
  playlistEl.innerHTML = "";

  playlist.forEach((item, index) => {
    const li = document.createElement("li");
    li.textContent = shrinkVideoName(item.file.name);
    li.title = item.file.name;
    if (index === currentIndex) li.classList.add("active");

    li.addEventListener("click", () => {
      loadVideo(index, true);
    });

    playlistEl.appendChild(li);
  });
}

function loadVideo(index, autoplay = false) {
  if (index < 0 || index >= playlist.length) return;

  currentIndex = index;
  video.src = playlist[index].url;
  nowPlaying.textContent = `Now playing: ${shrinkVideoName(playlist[index].file.name, 48)}`;
  nowPlaying.title = playlist[index].file.name;
  seekBar.value = 0;
  updateSeekProgress(0);
  updatePlaylistUI();

  if (autoplay) {
    video.play().catch(() => {
      playPauseBtn.textContent = "Play";
    });
  }
}

function playNext() {
  if (!playlist.length) return;
  const nextIndex = (currentIndex + 1) % playlist.length;
  loadVideo(nextIndex, true);
}

function playPrevious() {
  if (!playlist.length) return;
  const prevIndex = (currentIndex - 1 + playlist.length) % playlist.length;
  loadVideo(prevIndex, true);
}

function isFullscreen() {
  return Boolean(document.fullscreenElement);
}

function updateFullscreenButton() {
  fullscreenBtn.textContent = isFullscreen() ? "Exit Fullscreen" : "Fullscreen";
}

function isTheaterMode() {
  return document.body.classList.contains("theater-view");
}

function updateTheaterButton() {
  theaterBtn.textContent = isTheaterMode() ? "Default View" : "Theater View";
}

function toggleTheaterMode() {
  document.body.classList.toggle("theater-view");
  updateTheaterButton();
}

async function toggleFullscreen() {
  if (!video.src) return;

  try {
    if (!isFullscreen()) {
      await video.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch {
    // Ignore fullscreen rejections from browser policy.
  } finally {
    updateFullscreenButton();
  }
}

function setVolume(value) {
  const nextValue = Math.min(1, Math.max(0, value));
  video.volume = nextValue;
  volumeRange.value = String(nextValue);
  if (nextValue > 0 && video.muted) {
    video.muted = false;
    muteBtn.textContent = "Mute";
  }
}

function showControlsTemporarily() {
  playerColumn.classList.remove("controls-hidden");
  clearTimeout(inactivityTimer);

  if (!video.paused && video.src) {
    inactivityTimer = setTimeout(() => {
      playerColumn.classList.add("controls-hidden");
    }, 2200);
  }
}

function hideSeekTooltip() {
  seekTooltip.classList.remove("visible");
}

function updateSeekTooltip(percent) {
  const bounded = Math.min(100, Math.max(0, percent));
  seekTooltip.style.left = `${bounded}%`;
  const seconds = video.duration ? (bounded / 100) * video.duration : 0;
  seekTooltip.textContent = formatTime(seconds);
  seekTooltip.classList.add("visible");
}

function seekBy(seconds) {
  if (!video.duration) return;
  const nextTime = Math.min(video.duration, Math.max(0, video.currentTime + seconds));
  video.currentTime = nextTime;
}

async function clearAllUploads() {
  playlist.forEach((item) => URL.revokeObjectURL(item.url));

  try {
    const db = await openVideoDb();
    if (db) await clearStoredVideos(db);
  } catch {
    // Keep local reset even if DB clear fails.
  }

  playlist = [];
  currentIndex = -1;

  video.pause();
  video.removeAttribute("src");
  video.load();

  nowPlaying.textContent = "No video loaded.";
  nowPlaying.removeAttribute("title");
  timeText.textContent = "00:00 / 00:00";
  seekBar.value = 0;
  updateSeekProgress(0);
  hideSeekTooltip();
  document.body.classList.remove("playing");
  playPauseBtn.textContent = "Play";
  playerColumn.classList.remove("controls-hidden");
  clearTimeout(inactivityTimer);
  updatePlaylistUI();
}

uploadInput.addEventListener("change", (event) => {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  void (async () => {
    let db = null;
    try {
      db = await openVideoDb();
    } catch {
      db = null;
    }
    const addedItems = [];

    for (const file of files) {
      try {
        if (db) {
          const saved = await persistVideoFile(db, file);
          addedItems.push(createPlaylistItem(saved.id, file));
        } else {
          const tempId = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          addedItems.push(createPlaylistItem(tempId, file));
        }
      } catch {
        // Skip failed files and continue processing others.
      }
    }

    if (!addedItems.length) return;

    playlist.push(...addedItems);
    updatePlaylistUI();

    if (currentIndex === -1) {
      loadVideo(0, false);
    }

    uploadInput.value = "";
  })();
});

playPauseBtn.addEventListener("click", () => {
  if (!video.src) return;

  if (video.paused) {
    video.play();
  } else {
    video.pause();
  }
});

video.addEventListener("play", () => {
  document.body.classList.add("playing");
  playPauseBtn.textContent = "Pause";
  showControlsTemporarily();
});

video.addEventListener("pause", () => {
  document.body.classList.remove("playing");
  playPauseBtn.textContent = "Play";
  playerColumn.classList.remove("controls-hidden");
  clearTimeout(inactivityTimer);
});

prevBtn.addEventListener("click", playPrevious);
nextBtn.addEventListener("click", playNext);

muteBtn.addEventListener("click", () => {
  video.muted = !video.muted;
  muteBtn.textContent = video.muted ? "Unmute" : "Mute";
});

volumeRange.addEventListener("input", () => {
  setVolume(Number(volumeRange.value));
});

speedSelect.addEventListener("change", () => {
  video.playbackRate = Number(speedSelect.value);
});

fullscreenBtn.addEventListener("click", async () => {
  await toggleFullscreen();
});

theaterBtn.addEventListener("click", () => {
  toggleTheaterMode();
  showControlsTemporarily();
});

video.addEventListener("timeupdate", () => {
  if (!video.duration) return;
  const progress = (video.currentTime / video.duration) * 100;
  seekBar.value = progress;
  updateSeekProgress(progress);
  timeText.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
});

seekBar.addEventListener("input", () => {
  if (!video.duration) return;
  const percent = Number(seekBar.value);
  const time = (percent / 100) * video.duration;
  updateSeekProgress(percent);
  updateSeekTooltip(percent);
  video.currentTime = time;
});

video.addEventListener("ended", playNext);
video.addEventListener("dblclick", async () => {
  await toggleFullscreen();
  showControlsTemporarily();
});
document.addEventListener("fullscreenchange", updateFullscreenButton);
seekBar.addEventListener("mouseenter", () => {
  updateSeekTooltip(Number(seekBar.value));
});
seekBar.addEventListener("mouseleave", hideSeekTooltip);
seekBar.addEventListener("blur", hideSeekTooltip);
seekBar.addEventListener("mousemove", (event) => {
  const rect = seekBar.getBoundingClientRect();
  const ratio = (event.clientX - rect.left) / rect.width;
  updateSeekTooltip(ratio * 100);
});
seekBar.addEventListener("touchstart", () => updateSeekTooltip(Number(seekBar.value)));
seekBar.addEventListener("touchend", hideSeekTooltip);

playerColumn.addEventListener("mousemove", showControlsTemporarily);
playerColumn.addEventListener("mouseenter", showControlsTemporarily);
playerColumn.addEventListener("mouseleave", () => {
  if (!video.paused && video.src) playerColumn.classList.add("controls-hidden");
});
playerColumn.addEventListener("click", showControlsTemporarily);
clearUploadsBtn.addEventListener("click", () => {
  void clearAllUploads();
});

document.addEventListener("keydown", async (event) => {
  const target = event.target;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement
  ) {
    return;
  }

  const key = event.key.toLowerCase();

  if (key === "t") {
    event.preventDefault();
    toggleTheaterMode();
    showControlsTemporarily();
    return;
  }

  if (!video.src) return;

  if (key === " " || key === "k") {
    event.preventDefault();
    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
    showControlsTemporarily();
    return;
  }

  if (key === "arrowleft") {
    event.preventDefault();
    seekBy(-5);
    showControlsTemporarily();
    return;
  }

  if (key === "arrowright") {
    event.preventDefault();
    seekBy(5);
    showControlsTemporarily();
    return;
  }

  if (key === "j") {
    seekBy(-10);
    showControlsTemporarily();
    return;
  }

  if (key === "l") {
    seekBy(10);
    showControlsTemporarily();
    return;
  }

  if (key === "m") {
    video.muted = !video.muted;
    muteBtn.textContent = video.muted ? "Unmute" : "Mute";
    showControlsTemporarily();
    return;
  }

  if (event.shiftKey && key === "n") {
    event.preventDefault();
    playNext();
    showControlsTemporarily();
    return;
  }

  if (event.shiftKey && key === "p") {
    event.preventDefault();
    playPrevious();
    showControlsTemporarily();
    return;
  }

  if (key === "f") {
    event.preventDefault();
    await toggleFullscreen();
    showControlsTemporarily();
    return;
  }

  if (key === "arrowup") {
    event.preventDefault();
    setVolume(Number(volumeRange.value) + 0.05);
    showControlsTemporarily();
    return;
  }

  if (key === "arrowdown") {
    event.preventDefault();
    setVolume(Number(volumeRange.value) - 0.05);
    showControlsTemporarily();
  }
});

video.playbackRate = Number(speedSelect.value);
updateSeekProgress(0);
updateFullscreenButton();
updateTheaterButton();
void loadStoredVideos();
