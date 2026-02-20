const authToken = localStorage.getItem("watchparty_auth_token") || "";

const topInfo = document.getElementById("topInfo");
const statusText = document.getElementById("statusText");
const usernameInput = document.getElementById("usernameInput");
const displayNameInput = document.getElementById("displayNameInput");
const createdAtInput = document.getElementById("createdAtInput");
const saveProfileBtn = document.getElementById("saveProfileBtn");
const logoutBtn = document.getElementById("logoutBtn");
const backWatchBtn = document.getElementById("backWatchBtn");
const roomsList = document.getElementById("roomsList");
const historyList = document.getElementById("historyList");
const savedPlaylistsList = document.getElementById("savedPlaylistsList");

function redirectToLogin() {
  window.location.href = "/auth.html?next=/my-room";
}

function getHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${authToken}`,
  };
}

function setStatus(message, tone = "neutral") {
  statusText.textContent = message || "";
  statusText.classList.remove("ok", "error");
  if (tone === "ok" || tone === "error") {
    statusText.classList.add(tone);
  }
}

function formatDate(value) {
  const time = Number(value) || Date.now();
  return new Date(time).toLocaleString();
}

function renderList(listEl, items, renderItem) {
  listEl.innerHTML = "";

  if (!Array.isArray(items) || !items.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "No data yet.";
    listEl.appendChild(li);
    return;
  }

  items.forEach((item) => {
    const li = renderItem(item);
    listEl.appendChild(li);
  });
}

function renderRooms(rooms) {
  renderList(roomsList, rooms, (room) => {
    const li = document.createElement("li");
    li.textContent = room.roomId || "unknown-room";

    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = `Last joined: ${formatDate(room.lastJoinedAt)}`;
    li.appendChild(meta);

    return li;
  });
}

function renderHistory(history) {
  renderList(historyList, history, (item) => {
    const li = document.createElement("li");
    li.textContent = `${item.title || "Untitled"} (${item.mediaType || "media"})`;

    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = `${item.roomId || "room"} - ${formatDate(item.watchedAt)}`;
    li.appendChild(meta);

    return li;
  });
}

function renderSavedPlaylists(savedPlaylists) {
  renderList(savedPlaylistsList, savedPlaylists, (item) => {
    const li = document.createElement("li");
    li.textContent = `${item.roomId || "room"} (${Number(item.itemCount) || 0} items)`;

    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = `Saved: ${formatDate(item.savedAt)}`;
    li.appendChild(meta);

    return li;
  });
}

async function fetchMe() {
  const response = await fetch("/api/auth/me", {
    method: "GET",
    headers: getHeaders(),
  });

  const payload = await response.json();
  if (!response.ok || !payload.user) {
    throw new Error(payload.error || "Unauthorized");
  }

  return payload.user;
}

async function fetchDashboard() {
  const response = await fetch("/api/account/dashboard", {
    method: "GET",
    headers: getHeaders(),
  });

  const payload = await response.json();
  if (!response.ok || !payload.dashboard) {
    throw new Error(payload.error || "Failed to load dashboard.");
  }

  return payload.dashboard;
}

async function loadPage() {
  if (!authToken) {
    redirectToLogin();
    return;
  }

  try {
    const user = await fetchMe();
    usernameInput.value = user.username || "";
    displayNameInput.value = user.displayName || "";
    createdAtInput.value = formatDate(user.createdAt);
    topInfo.textContent = `Signed in as ${user.displayName || user.username}`;

    const dashboard = await fetchDashboard();
    renderRooms(dashboard.rooms || []);
    renderHistory(dashboard.watchHistory || []);
    renderSavedPlaylists(dashboard.savedPlaylists || []);
  } catch (error) {
    localStorage.removeItem("watchparty_auth_token");
    redirectToLogin();
  }
}

saveProfileBtn.addEventListener("click", async () => {
  const displayName = String(displayNameInput.value || "").trim();
  if (!displayName) {
    setStatus("Display name cannot be empty.", "error");
    return;
  }

  try {
    const response = await fetch("/api/auth/profile", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ displayName }),
    });

    const payload = await response.json();
    if (!response.ok || !payload.user) {
      setStatus(payload.error || "Failed to update profile.", "error");
      return;
    }

    displayNameInput.value = payload.user.displayName || displayName;
    topInfo.textContent = `Signed in as ${payload.user.displayName || payload.user.username}`;
    setStatus("Profile updated.", "ok");
  } catch {
    setStatus("Failed to update profile.", "error");
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({}),
    });
  } catch {
    // no-op
  }

  localStorage.removeItem("watchparty_auth_token");
  window.location.href = "/auth.html";
});

backWatchBtn.addEventListener("click", () => {
  window.location.href = "/watch";
});

void loadPage();
