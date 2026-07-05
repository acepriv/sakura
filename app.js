const WEBHOOK_URL_RE =
  /^https?:\/\/(?:discord(?:app)?\.com|discord\.com)\/api\/webhooks\/(\d+)\/([\w-]+)\/?$/i;

const $ = (sel) => document.querySelector(sel);

const webhookInput = $("#webhook-input");
const webhookId = $("#webhook-id");
const webhookToken = $("#webhook-token");
const phraserInput = $("#phraser-input");
const phraserResult = $("#phraser-result");
const phraserOutput = $("#phraser-output");
const btnPhrase = $("#btn-phrase");
const btnCopy = $("#btn-copy");
const panelEl = document.querySelector(".panel");
const statusEl = $("#status");
const infoPfp = $("#info-pfp");
const infoPfpPlaceholder = $("#info-pfp-placeholder");

const infoFields = {
  name: $("#info-name"),
  id: $("#info-id"),
  token: $("#info-token"),
  url: $("#info-url"),
  channel: $("#info-channel"),
  guild: $("#info-guild"),
  type: $("#info-type"),
  app: $("#info-app"),
};

function setStatus(message, type = "info") {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
}

function setField(el, value) {
  const empty = value === null || value === undefined || value === "";
  el.textContent = empty ? "—" : String(value);
  el.classList.toggle("muted", empty);
}

function applyWebhookFields({ id, token, url }) {
  webhookId.value = id;
  webhookToken.value = token;
  webhookInput.value =
    url || `https://discord.com/api/webhooks/${id}/${token}`;
}

function parseWebhookJson(raw) {
  raw = raw.trim();
  if (!raw) throw new Error("Paste webhook JSON first.");

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Could not parse JSON.");
    data = JSON.parse(match[0]);
  }

  const id = data.id != null ? String(data.id) : "";
  const token = data.token || "";
  let url = data.url || "";

  if (!id || !token) {
    throw new Error("JSON must include both id and token.");
  }

  if (!url) {
    url = `https://discord.com/api/webhooks/${id}/${token}`;
  }

  return { id, token, url, data };
}

function parseWebhook() {
  const phraserRaw = phraserInput.value.trim();
  if (phraserRaw) {
    const parsed = parseWebhookJson(phraserRaw);
    applyWebhookFields(parsed);
    return { id: parsed.id, token: parsed.token };
  }

  const raw = webhookInput.value.trim();
  if (raw) {
    const match = raw.match(WEBHOOK_URL_RE);
    if (match) return { id: match[1], token: match[2] };
    if (raw.includes("/")) {
      const [id, token] = raw.split("/", 2);
      if (id && token && /^\d+$/.test(id)) return { id, token };
    }
  }

  const id = webhookId.value.trim();
  const token = webhookToken.value.trim();
  if (id && token) return { id, token };

  throw new Error("Paste JSON, a webhook URL, or both ID and token.");
}

function syncFieldsFromInput() {
  try {
    const { id, token } = parseWebhook();
    webhookId.value = id;
    webhookToken.value = token;
    if (!webhookInput.value.trim()) {
      webhookInput.value = `https://discord.com/api/webhooks/${id}/${token}`;
    }
  } catch {
    /* partial input while typing */
  }
}

[webhookInput, webhookId, webhookToken].forEach((el) => {
  el.addEventListener("input", syncFieldsFromInput);
});

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });

  let body = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    if (body && typeof body === "object") {
      if (body.error) msg = body.error;
      else if (body.message) msg = body.message;
    } else if (typeof body === "string" && body) {
      msg = body;
    }
    if (res.status === 404) msg = "Webhook not found — it may already be deleted.";
    if (res.status === 401) msg = "Unauthorized — check the webhook ID and token.";
    throw new Error(msg);
  }

  return body;
}

function webhookAvatarUrl(webhookId, hash) {
  if (!hash) return null;
  const ext = hash.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${webhookId}/${hash}.${ext}?size=128`;
}

function showAvatar(webhookId, hash) {
  const url = webhookId && hash ? webhookAvatarUrl(webhookId, hash) : null;
  if (url) {
    infoPfp.src = url;
    infoPfp.classList.remove("hidden");
    infoPfpPlaceholder.classList.add("hidden");
  } else {
    infoPfp.classList.add("hidden");
    infoPfp.removeAttribute("src");
    infoPfpPlaceholder.classList.remove("hidden");
  }
}

function snowflake(value) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function buildWebhookJson(data, token) {
  const id = snowflake(data.id) ?? "";
  return {
    application_id: data.application_id ?? null,
    avatar: data.avatar ?? null,
    channel_id: snowflake(data.channel_id),
    guild_id: snowflake(data.guild_id),
    id,
    name: data.name ?? null,
    type: typeof data.type === "number" ? data.type : 1,
    token,
    url: data.url || `https://discord.com/api/webhooks/${id}/${token}`,
  };
}

let lastWebhookJson = null;

function renderInfo(data, token) {
  setField(infoFields.name, data.name || "Unnamed");
  setField(infoFields.id, data.id);
  setField(infoFields.token, token);
  setField(
    infoFields.url,
    data.url || `https://discord.com/api/webhooks/${data.id}/${token}`
  );
  setField(infoFields.channel, data.channel_id);
  setField(infoFields.guild, data.guild_id || "No guild");
  setField(infoFields.type, data.type);
  setField(infoFields.app, data.application_id ?? "None");

  showAvatar(data.id, data.avatar);
  lastWebhookJson = buildWebhookJson(data, token);

  if (data.name) $("#edit-name").value = data.name;
}

function clearInfo() {
  Object.values(infoFields).forEach((el) => setField(el, null));
  showAvatar(null, null);
  lastWebhookJson = null;
}

async function fetchInfo() {
  const { id, token } = parseWebhook();
  setStatus("Fetching webhook info…", "info");

  const data = await api(`/api/webhook/${id}/${encodeURIComponent(token)}`);
  renderInfo(data, token);
  setStatus("Webhook info loaded.", "success");
}

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((t) => {
    const active = t.dataset.tab === name;
    t.classList.toggle("active", active);
    t.setAttribute("aria-selected", active ? "true" : "false");
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === name);
  });
  panelEl.classList.toggle("phraser-active", name === "phraser");
}

function applyParsedPreview(parsed) {
  applyWebhookFields(parsed);

  if (parsed.data.name) setField(infoFields.name, parsed.data.name);
  setField(infoFields.id, parsed.id);
  setField(infoFields.token, parsed.token);
  setField(infoFields.url, parsed.url);
  setField(infoFields.channel, parsed.data.channel_id);
  setField(infoFields.guild, parsed.data.guild_id);
  setField(infoFields.type, parsed.data.type);
  setField(infoFields.app, parsed.data.application_id ?? "None");
  showAvatar(parsed.id, parsed.data.avatar);
  lastWebhookJson = buildWebhookJson({ ...parsed.data, id: parsed.id, url: parsed.url }, parsed.token);

  if (parsed.data.name) $("#edit-name").value = parsed.data.name;
}

function formatPhrasedOutput(parsed) {
  const { id, token, url, data } = parsed;
  const lines = [];

  if (data.name) lines.push(`Name: ${data.name}`);
  lines.push(`URL: ${url}`);
  lines.push(`ID: ${id}`);
  lines.push(`Token: ${token}`);
  if (data.channel_id) lines.push(`Channel ID: ${data.channel_id}`);
  if (data.guild_id) lines.push(`Guild ID: ${data.guild_id}`);

  return { display: lines.join("\n"), copy: url };
}

let phraserCopyText = "";

function runPhrase() {
  const parsed = parseWebhookJson(phraserInput.value);
  applyParsedPreview(parsed);

  const phrased = formatPhrasedOutput(parsed);
  phraserCopyText = phrased.copy;
  phraserOutput.value = phrased.display;
  phraserResult.classList.remove("hidden");
  setStatus("Phrased — fields loaded. Use Spam, Delete, or Edit tabs.", "success");
}

btnPhrase.addEventListener("click", () => {
  try {
    runPhrase();
  } catch (err) {
    phraserResult.classList.add("hidden");
    phraserOutput.value = "";
    phraserCopyText = "";
    setStatus(err.message || String(err), "error");
  }
});

btnCopy.addEventListener("click", async () => {
  if (!phraserCopyText) return;
  try {
    await navigator.clipboard.writeText(phraserCopyText);
    flashButton(btnCopy, "Copied!");
  } catch {
    flashButton(btnCopy, "Copy failed");
  }
});

async function copyInfoJson() {
  if (!lastWebhookJson) {
    throw new Error("Fetch webhook info first.");
  }
  await navigator.clipboard.writeText(JSON.stringify(lastWebhookJson, null, 2));
  setStatus("JSON copied to clipboard.", "success");
}

async function flashButton(btn, okText, failText) {
  const label = btn.textContent;
  btn.textContent = okText;
  setTimeout(() => {
    btn.textContent = label;
  }, 1500);
  if (failText) throw new Error(failText);
}

const btnCopyJson = $("#btn-copy-json");
btnCopyJson.addEventListener("click", async () => {
  try {
    await copyInfoJson();
    flashButton(btnCopyJson, "Copied!");
  } catch (err) {
    setStatus(err.message || String(err), "error");
    flashButton(btnCopyJson, "Copy failed");
  }
});

async function deleteWebhook() {
  const { id, token } = parseWebhook();
  if (!confirm(`Delete webhook ${id}? This cannot be undone.`)) return;

  setStatus("Deleting webhook…", "info");
  await api(`/api/webhook/${id}/${encodeURIComponent(token)}`, { method: "DELETE" });
  setStatus("Webhook deleted successfully.", "success");
  clearInfo();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function repeatToLimit(text, times, sep = " ") {
  let out = "";
  for (let i = 0; i < times; i++) {
    const next = out ? `${out}${sep}${text}` : text;
    if (next.length > 1990) break;
    out = next;
  }
  return out;
}

const SPAM_PRESETS = [
  { label: "ggs ×100 wall", message: repeatToLimit("ggs", 100), count: 1, speed: 1 },
  { label: "ggs spam ×100", message: "ggs", count: 100, speed: 1 },
  { label: "ez ×100 wall", message: repeatToLimit("ez", 100), count: 1, speed: 1 },
  { label: "ez spam ×100", message: "ez", count: 100, speed: 1 },
  { label: "L ×200 wall", message: repeatToLimit("L", 200), count: 1, speed: 1 },
  { label: "ratio ×50", message: "ratio", count: 50, speed: 1 },
  { label: "get logged ×50", message: "get logged", count: 50, speed: 1 },
  { label: "gg ez ×100", message: "gg ez", count: 100, speed: 1 },
  {
    label: "skill issue ×100",
    message: repeatToLimit("skill issue", 50),
    count: 1,
    speed: 1,
  },
  {
    label: "cry about it ×75",
    message: "cry about it",
    count: 75,
    speed: 1,
  },
];

function applySpamPreset(preset) {
  $("#spam-content").value = preset.message;
  $("#spam-count").value = preset.count;
  $("#spam-delay").value = preset.speed;
}

function initSpamPresets() {
  const grid = $("#spam-presets");
  for (const preset of SPAM_PRESETS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "preset-btn";
    btn.textContent = preset.label;
    btn.addEventListener("click", () => applySpamPreset(preset));
    grid.appendChild(btn);
  }
}

async function spamWebhook() {
  const { id, token } = parseWebhook();
  const content = $("#spam-content").value.trim();
  const count = Math.min(100, Math.max(1, parseInt($("#spam-count").value, 10) || 1));
  const delaySec = Math.min(60, Math.max(0.1, parseFloat($("#spam-delay").value) || 1));

  if (!content) throw new Error("Enter a message to send.");

  setStatus(`Sending ${count} message(s), ${delaySec}s apart…`, "info");

  for (let i = 0; i < count; i++) {
    await api(`/api/webhook/${id}/${encodeURIComponent(token)}/messages`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });

    if (i < count - 1) await sleep(delaySec * 1000);
  }

  setStatus(`Sent ${count} message(s).`, "success");
}

async function editWebhook() {
  const { id, token } = parseWebhook();
  const name = $("#edit-name").value.trim();
  const avatar = $("#edit-avatar").value.trim();

  if (!name && !avatar) throw new Error("Provide a new name and/or avatar URL.");

  const payload = {};
  if (name) payload.name = name;
  if (avatar) payload.avatar = avatar;

  setStatus("Updating webhook…", "info");
  const data = await api(`/api/webhook/${id}/${encodeURIComponent(token)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

  renderInfo(data, token);
  setStatus("Webhook updated.", "success");
}

function bindAction(btn, fn) {
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      await fn();
    } catch (err) {
      setStatus(err.message || String(err), "error");
    } finally {
      btn.disabled = false;
    }
  });
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
});

bindAction($("#btn-fetch"), fetchInfo);
bindAction($("#btn-delete"), deleteWebhook);
bindAction($("#btn-spam"), spamWebhook);
bindAction($("#btn-edit"), editWebhook);

initSpamPresets();
