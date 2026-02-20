const usernameInput = document.getElementById("usernameInput");
const passwordInput = document.getElementById("passwordInput");
const displayNameInput = document.getElementById("displayNameInput");
const loginBtn = document.getElementById("loginBtn");
const registerBtn = document.getElementById("registerBtn");
const statusText = document.getElementById("statusText");
const authInfo = document.getElementById("authInfo");

const params = new URLSearchParams(window.location.search);
const nextUrl = params.get("next") || "/watch-party.html";

function setStatus(message, tone = "neutral") {
  statusText.textContent = message || "";
  statusText.classList.remove("ok", "error");
  if (tone === "ok" || tone === "error") {
    statusText.classList.add(tone);
  }
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body || {}),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }

  return payload;
}

async function tryAutoLogin() {
  const token = localStorage.getItem("watchparty_auth_token") || "";
  if (!token) return;

  try {
    const response = await fetch("/api/auth/me", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const payload = await response.json();
    if (response.ok && payload.user) {
      window.location.href = nextUrl;
      return;
    }

    localStorage.removeItem("watchparty_auth_token");
  } catch {
    // keep auth page open
  }
}

loginBtn.addEventListener("click", async () => {
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!username || !password) {
    setStatus("Username and password are required.", "error");
    return;
  }

  try {
    const payload = await postJson("/api/auth/login", { username, password });
    localStorage.setItem("watchparty_auth_token", payload.token || "");
    setStatus("Login successful. Redirecting...", "ok");
    window.location.href = nextUrl;
  } catch (error) {
    setStatus(error.message || "Login failed.", "error");
  }
});

registerBtn.addEventListener("click", async () => {
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  const displayName = displayNameInput.value.trim();

  if (!username || !password) {
    setStatus("Username and password are required.", "error");
    return;
  }

  try {
    const payload = await postJson("/api/auth/register", { username, password, displayName });
    localStorage.setItem("watchparty_auth_token", payload.token || "");
    setStatus("Account created. Redirecting...", "ok");
    window.location.href = nextUrl;
  } catch (error) {
    setStatus(error.message || "Registration failed.", "error");
  }
});

authInfo.textContent = `After login, you'll be redirected to ${nextUrl}`;
void tryAutoLogin();

