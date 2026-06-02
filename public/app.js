const $ = (selector) => document.querySelector(selector);

const elements = {
  authGate: $("#authGate"),
  authForm: $("#authForm"),
  authEmail: $("#authEmail"),
  authPassword: $("#authPassword"),
  authError: $("#authError"),
  authSubmitButton: $("#authSubmitButton"),
  settingsButton: $("#settingsButton"),
  sidebar: $("#sidebar"),
  connectionBadge: $("#connectionBadge"),
  memberBadge: $("#memberBadge"),
  appLogoutButton: $("#appLogoutButton"),
  accountSelect: $("#accountSelect"),
  workspaceSelect: $("#workspaceSelect"),
  projectSelect: $("#projectSelect"),
  folderTree: $("#folderTree"),
  sidebarCreateFolderButton: $("#sidebarCreateFolderButton"),
  adminPanel: $("#adminPanel"),
  adminUserForm: $("#adminUserForm"),
  adminUserMessage: $("#adminUserMessage"),
  adminUsersList: $("#adminUsersList"),
  apiSettingsForm: $("#apiSettingsForm"),
  apiSettingsMessage: $("#apiSettingsMessage"),
  r2BackendStatus: $("#r2BackendStatus"),
  r2Bucket: $("#r2Bucket"),
  r2AccountId: $("#r2AccountId"),
  r2Endpoint: $("#r2Endpoint"),
  r2AccessKeyId: $("#r2AccessKeyId"),
  r2SecretAccessKey: $("#r2SecretAccessKey"),
  smtpHost: $("#smtpHost"),
  smtpPort: $("#smtpPort"),
  smtpUser: $("#smtpUser"),
  smtpPass: $("#smtpPass"),
  smtpFrom: $("#smtpFrom"),
  smtpSecure: $("#smtpSecure"),
  notificationRecipients: $("#notificationRecipients"),
  passwordForm: $("#passwordForm"),
  passwordMessage: $("#passwordMessage"),
  currentPassword: $("#currentPassword"),
  updatedPassword: $("#updatedPassword"),
  confirmUpdatedPassword: $("#confirmUpdatedPassword"),
  alert: $("#alert"),
  workspaceTitle: $("#workspaceTitle"),
  folderName: $("#folderName"),
  folderBreadcrumbs: $("#folderBreadcrumbs"),
  backFolderButton: $("#backFolderButton"),
  createFolderButton: $("#createFolderButton"),
  refreshButton: $("#refreshButton"),
  uploadForm: $("#uploadForm"),
  fileInput: $("#fileInput"),
  selectedFileName: $("#selectedFileName"),
  uploadButton: $("#uploadButton"),
  progressLabel: $("#progressLabel"),
  progressPercent: $("#progressPercent"),
  progressBar: $("#progressBar"),
  uploadQueue: $("#uploadQueue"),
  gridViewButton: $("#gridViewButton"),
  listViewButton: $("#listViewButton"),
  assetCount: $("#assetCount"),
  folderList: $("#folderList"),
  dropOverlay: $("#dropOverlay"),
  assetContextMenu: $("#assetContextMenu"),
  emptyState: $("#emptyState"),
  detailView: $("#detailView"),
  videoPlayer: $("#videoPlayer"),
  centerPlayButton: $("#centerPlayButton"),
  videoFallback: $("#videoFallback"),
  playPauseButton: $("#playPauseButton"),
  currentTimeLabel: $("#currentTimeLabel"),
  seekBar: $("#seekBar"),
  commentMarkers: $("#commentMarkers"),
  durationLabel: $("#durationLabel"),
  playbackQualitySelect: $("#playbackQualitySelect"),
  reviewHomeButton: $("#reviewHomeButton"),
  reviewBackButton: $("#reviewBackButton"),
  reviewShareButton: $("#reviewShareButton"),
  reviewProjectTitle: $("#reviewProjectTitle"),
  reviewFileTitle: $("#reviewFileTitle"),
  closeReviewButton: $("#closeReviewButton"),
  assetTitle: $("#assetTitle"),
  assetMeta: $("#assetMeta"),
  assigneeSelect: $("#assigneeSelect"),
  statusSelect: $("#statusSelect"),
  openFrameButton: $("#openFrameButton"),
  downloadSelect: $("#downloadSelect"),
  renameButton: $("#renameButton"),
  deleteButton: $("#deleteButton"),
  commentsList: $("#commentsList"),
  commentInput: $("#commentInput"),
  commentForm: $("#commentForm"),
  commentCount: $("#commentCount"),
};

const state = {
  user: null,
  accounts: [],
  workspaces: [],
  projects: [],
  users: [],
  currentAccountId: "",
  currentWorkspaceId: "",
  currentProject: null,
  folderTree: [],
  folderStack: [],
  assets: [],
  selectedAsset: null,
  comments: [],
  commentMeta: {},
  view: localStorage.getItem("mediaflow_view") || "grid",
  commentFilter: "all",
  contextAssetId: "",
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function formatBytes(bytes = 0) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatTime(seconds = 0) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], { month: "2-digit", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function setAlert(message = "") {
  elements.alert.hidden = !message;
  elements.alert.textContent = message;
}

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: "include", ...options });
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) throw new Error(data?.error || data || `Request failed (${response.status})`);
  return data;
}

function setSignedIn(user) {
  state.user = user;
  elements.authGate.hidden = Boolean(user);
  document.body.classList.toggle("isAuthed", Boolean(user));
  elements.memberBadge.textContent = user ? `${user.name || user.email} - ${user.role}` : "Signed out";
  elements.adminPanel.hidden = user?.role !== "admin";
}

async function loadSession() {
  const session = await api("/auth/app/session");
  if (session.authenticated) {
    setSignedIn(session.user);
    await bootStorage();
  } else {
    setSignedIn(null);
  }
}

async function handleLogin(event) {
  event.preventDefault();
  elements.authError.hidden = true;
  elements.authSubmitButton.disabled = true;
  try {
    const result = await api("/auth/app/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: elements.authEmail.value, password: elements.authPassword.value }),
    });
    setSignedIn(result.user);
    await bootStorage();
  } catch (error) {
    elements.authError.textContent = error.message;
    elements.authError.hidden = false;
  } finally {
    elements.authSubmitButton.disabled = false;
  }
}

async function handleLogout() {
  await api("/auth/app/logout", { method: "POST" }).catch(() => {});
  location.reload();
}

async function loadConfig() {
  const config = await api("/api/config");
  elements.connectionBadge.textContent = config.connected ? "R2 connected" : "Storage missing";
  elements.connectionBadge.classList.toggle("warning", !config.connected);
  if (!config.connected) setAlert("Cloudflare R2 is not configured on the backend. Add the R2 environment variables in Vercel and redeploy.");
  else setAlert("");
  return config.connected;
}

async function loadApiSettings() {
  if (state.user?.role !== "admin") return;
  try {
    const { data } = await api("/api/admin/settings");
    elements.r2Bucket.value = data.r2Bucket || "";
    elements.r2AccountId.value = data.r2AccountId || "";
    elements.r2Endpoint.value = data.r2Endpoint || "";
    elements.r2AccessKeyId.value = "";
    elements.r2AccessKeyId.placeholder = data.r2AccessKeyId?.configured ? `Current: ${data.r2AccessKeyId.masked}` : "Not set";
    elements.r2SecretAccessKey.value = "";
    elements.r2SecretAccessKey.placeholder = data.r2SecretAccessKey?.configured ? `Current: ${data.r2SecretAccessKey.masked}` : "Not set";
    if (elements.r2BackendStatus) {
      elements.r2BackendStatus.textContent = data.r2Configured ? `R2 connected: ${data.r2Bucket || "bucket configured"}` : "R2 backend environment is missing.";
    }
    elements.smtpHost.value = data.smtpHost || "";
    elements.smtpPort.value = data.smtpPort || "587";
    elements.smtpUser.value = data.smtpUser || "";
    elements.smtpPass.value = "";
    elements.smtpPass.placeholder = data.smtpPass?.configured ? `Current: ${data.smtpPass.masked}` : "Not set";
    elements.smtpFrom.value = data.smtpFrom || "";
    elements.smtpSecure.checked = Boolean(data.smtpSecure);
    elements.notificationRecipients.value = data.notificationRecipients || "";
    elements.apiSettingsMessage.textContent = "Email notification settings are saved here. R2 storage is configured in the backend.";
  } catch (error) {
    elements.apiSettingsMessage.textContent = error.message;
  }
}

async function saveApiSettings(event) {
  event.preventDefault();
  elements.apiSettingsMessage.textContent = "Saving...";
  try {
    await api("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        smtpHost: elements.smtpHost.value,
        smtpPort: elements.smtpPort.value,
        smtpUser: elements.smtpUser.value,
        smtpPass: elements.smtpPass.value,
        smtpFrom: elements.smtpFrom.value,
        smtpSecure: elements.smtpSecure.checked,
        notificationRecipients: elements.notificationRecipients.value,
      }),
    });
    elements.apiSettingsMessage.textContent = "Saved.";
    await loadConfig();
    await loadApiSettings();
  } catch (error) {
    elements.apiSettingsMessage.textContent = error.message;
  }
}

async function loadUsers() {
  if (state.user?.role !== "admin") return;
  const { data } = await api("/api/users");
  state.users = data;
  elements.adminUsersList.innerHTML = data.map((user) => `<div class="adminUserRow"><strong>${escapeHtml(user.name || user.email)}</strong><span>${escapeHtml(user.email)} - ${escapeHtml(user.role)}</span></div>`).join("");
  elements.assigneeSelect.innerHTML = `<option value="">Unassigned</option>${data.map((user) => `<option value="${escapeHtml(user.email)}">${escapeHtml(user.name || user.email)}</option>`).join("")}`;
}

async function createUser(event) {
  event.preventDefault();
  elements.adminUserMessage.textContent = "Creating...";
  try {
    await api("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: $("#newUserName").value,
        email: $("#newUserEmail").value,
        password: $("#newUserPassword").value,
        role: $("#newUserRole").value,
      }),
    });
    elements.adminUserForm.reset();
    elements.adminUserMessage.textContent = "User created.";
    await loadUsers();
  } catch (error) {
    elements.adminUserMessage.textContent = error.message;
  }
}

async function updatePassword(event) {
  event.preventDefault();
  if (elements.updatedPassword.value !== elements.confirmUpdatedPassword.value) {
    elements.passwordMessage.textContent = "Passwords do not match.";
    return;
  }
  try {
    await api("/auth/app/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: elements.currentPassword.value, newPassword: elements.updatedPassword.value }),
    });
    elements.passwordForm.reset();
    elements.passwordMessage.textContent = "Password updated.";
  } catch (error) {
    elements.passwordMessage.textContent = error.message;
  }
}

async function bootStorage() {
  await loadConfig();
  await loadUsers();
  await loadApiSettings();
  await loadAccounts();
}

async function loadAccounts() {
  const { data } = await api("/api/accounts");
  state.accounts = data;
  elements.accountSelect.innerHTML = data.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("");
  state.currentAccountId = data[0]?.id || "";
  elements.accountSelect.value = state.currentAccountId;
  await loadWorkspaces();
}

async function loadWorkspaces() {
  const { data } = await api(`/api/accounts/${state.currentAccountId}/workspaces`);
  state.workspaces = data;
  elements.workspaceSelect.disabled = false;
  elements.workspaceSelect.innerHTML = data.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("");
  state.currentWorkspaceId = data[0]?.id || "";
  elements.workspaceSelect.value = state.currentWorkspaceId;
  await loadProjects();
}

async function loadProjects() {
  const { data } = await api(`/api/accounts/${state.currentAccountId}/workspaces/${state.currentWorkspaceId}/projects`);
  state.projects = data;
  elements.projectSelect.disabled = false;
  elements.projectSelect.innerHTML = data.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("");
  const savedProject = localStorage.getItem("mediaflow_project");
  state.currentProject = data.find((project) => project.id === savedProject) || data[0] || null;
  if (!state.currentProject) return;
  elements.projectSelect.value = state.currentProject.id;
  elements.workspaceTitle.textContent = state.currentProject.name;
  await enterFolder(state.currentProject.root_folder_id, state.currentProject.name, true);
}

async function enterFolder(id, name, reset = false) {
  if (reset) state.folderStack = [];
  state.folderStack.push({ id, name });
  localStorage.setItem("mediaflow_folder_stack", JSON.stringify(state.folderStack));
  await loadFolder();
}

async function goToFolder(id) {
  const folder = state.folderTree.find((item) => item.id === id);
  if (!folder) return enterFolder(id, "Folder", true);
  const byId = new Map(state.folderTree.map((item) => [item.id, item]));
  const stack = [];
  let current = folder;
  while (current) {
    stack.unshift({ id: current.id, name: current.name });
    current = current.parent_id ? byId.get(current.parent_id) : null;
  }
  state.folderStack = stack;
  localStorage.setItem("mediaflow_folder_stack", JSON.stringify(state.folderStack));
  await loadFolder();
}

async function loadFolder() {
  const current = state.folderStack[state.folderStack.length - 1];
  if (!current) return;
  elements.folderName.textContent = current.name;
  renderBreadcrumbs();
  elements.backFolderButton.disabled = state.folderStack.length <= 1;
  elements.createFolderButton.disabled = false;
  elements.uploadButton.disabled = false;
  const { data } = await api(`/api/accounts/${state.currentAccountId}/folders/${current.id}/children`);
  state.assets = data.sort(assetSort);
  await loadFolderTree();
  renderAssets();
}

async function loadFolderTree() {
  if (!state.currentProject) return;
  const { data } = await api(`/api/accounts/${state.currentAccountId}/projects/${state.currentProject.id}/folders`);
  state.folderTree = data.sort(assetSort);
  renderFolderTree();
}

function folderTreeIcon() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z"/></svg>`;
}

function renderFolderTree() {
  if (!elements.folderTree || !state.currentProject) return;
  const activeId = currentFolder()?.id || "";
  const byParent = new Map();
  for (const folder of state.folderTree) {
    const parentId = folder.parent_id || "root";
    if (!byParent.has(parentId)) byParent.set(parentId, []);
    byParent.get(parentId).push(folder);
  }
  const roots = byParent.get("root") || state.folderTree.filter((folder) => folder.id === state.currentProject.root_folder_id);
  const renderNode = (folder, depth = 0) => {
    const children = (byParent.get(folder.id) || []).sort(assetSort);
    const isActive = folder.id === activeId;
    const isRoot = folder.id === state.currentProject.root_folder_id;
    const count = (folder.folder_count || 0) + (folder.file_count || 0);
    return `<div class="folderTreeNode" style="--depth:${depth}">
      <button class="folderTreeItem ${isActive ? "active" : ""} ${isRoot ? "rootItem" : ""}" type="button" data-folder-id="${escapeHtml(folder.id)}" title="${escapeHtml(folder.name)}">
        <span class="folderTreeChevron" aria-hidden="true">${children.length ? "&rsaquo;" : ""}</span>
        <span class="folderTreeIcon" aria-hidden="true">${folderTreeIcon()}</span>
        <span class="folderTreeName">${escapeHtml(isRoot ? state.currentProject.name : folder.name)}</span>
        ${isActive ? `<span class="folderTreeCheck" aria-hidden="true">&#10003;</span>` : ""}
        ${count ? `<span class="folderTreeCount">${count}</span>` : ""}
      </button>
      ${children.length ? `<div class="folderTreeChildren">${children.map((child) => renderNode(child, depth + 1)).join("")}</div>` : ""}
    </div>`;
  };
  elements.folderTree.innerHTML = roots.map((folder) => renderNode(folder)).join("") || `<p class="folderTreeEmpty">No folders yet</p>`;
}

function renderBreadcrumbs() {
  if (!elements.folderBreadcrumbs) return;
  elements.folderBreadcrumbs.innerHTML = state.folderStack.map((folder, index) => {
    const current = index === state.folderStack.length - 1;
    return `<button type="button" data-index="${index}" ${current ? "aria-current=\"page\"" : ""}>${escapeHtml(folder.name)}</button>`;
  }).join("");
}

function assetSort(a, b) {
  if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
  return String(a.name).localeCompare(String(b.name), undefined, { numeric: true, sensitivity: "base" });
}

function assetKind(asset) {
  if (asset.type === "folder") return "folder";
  const mime = asset.mimetype || asset.filetype || "";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "image";
  return "file";
}

function assetIcon(kind) {
  const icons = {
    folder: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z"/></svg>`,
    video: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="14" height="14" rx="2"/><path d="m17 9 4-2v10l-4-2z"/></svg>`,
    audio: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/></svg>`,
    image: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m7 15 3-3 3 3 2-2 3 3"/><circle cx="8" cy="9" r="1.5"/></svg>`,
    file: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/></svg>`,
  };
  return icons[kind] || icons.file;
}

function renderAssets() {
  elements.folderList.className = state.view === "list" ? "assetGrid listView" : "assetGrid";
  elements.gridViewButton.classList.toggle("active", state.view === "grid");
  elements.listViewButton.classList.toggle("active", state.view === "list");
  const folders = state.assets.filter((item) => item.type === "folder").length;
  const files = state.assets.length - folders;
  elements.assetCount.textContent = `${folders} folders - ${files} files`;
  if (!state.assets.length) {
    elements.folderList.innerHTML = `<button class="emptyAssets fileBrowserEmpty" type="button">
      <span class="emptyAssetsIcon">${assetIcon("folder")}</span>
      <strong>No assets here yet</strong>
      <small>Drop files here, right-click for actions, or double-click to upload.</small>
    </button>`;
    return;
  }
  elements.folderList.innerHTML = state.assets.map((asset) => {
    const kind = assetKind(asset);
    const created = formatDateTime(asset.created_at);
    const meta = asset.type === "folder" ? `Folder${created ? ` - ${created}` : ""}` : `${asset.mimetype || "File"} - ${formatBytes(asset.filesize || asset.size)}${created ? ` - ${created}` : ""}`;
    const hoverVideo = kind === "video" ? `<video class="assetHoverVideo" muted playsinline preload="auto" data-preview-seconds="6" src="/api/accounts/${state.currentAccountId}/files/${asset.id}/playback"></video><span class="assetHoverProgress" aria-hidden="true"></span>` : "";
    const thumb = asset.thumbnail ? `<img src="${asset.thumbnail}" alt="">${hoverVideo}` : `<span class="assetIcon assetIcon-${kind}">${assetIcon(kind)}</span>${hoverVideo}`;
    return `<article class="assetCard assetCard-${kind}" data-id="${escapeHtml(asset.id)}" data-type="${asset.type}" draggable="true">
      <button class="assetOpen" type="button" title="${escapeHtml(asset.name)}">
        <div class="assetThumb assetThumb-${kind}">${thumb}</div>
        <div class="assetInfo"><strong>${escapeHtml(asset.name)}</strong><span>${escapeHtml(meta)}</span></div>
        <span class="assetKindPill assetKindPill-${kind}">${escapeHtml(kind)}</span>
      </button>
      <div class="assetCardActions">
        <button class="renameAsset iconMiniButton" type="button" aria-label="Rename ${escapeHtml(asset.name)}" title="Rename"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 20 8-8-4-4-8 8-1 5z"/><path d="m14 6 4 4"/><path d="M5 20h14"/></svg></button>
        <button class="deleteAsset iconMiniButton deleteFolderButton" type="button" aria-label="Delete ${escapeHtml(asset.name)}" title="Delete"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M6 7l1 14h10l1-14"/><path d="M9 7V4h6v3"/></svg></button>
      </div>
    </article>`;
  }).join("");
  setupHoverPreviews();
  generateMissingVideoThumbnails();
}

function setupHoverPreviews() {
  elements.folderList.querySelectorAll(".assetCard-video").forEach((card) => {
    const video = card.querySelector(".assetHoverVideo");
    if (!video) return;
    const previewSeconds = Number(video.dataset.previewSeconds || 6);
    let rafId = 0;
    let hovering = false;
    const seekToStart = () => {
      try {
        video.currentTime = 0;
      } catch {
        // Retry after metadata is available.
      }
    };
    const updateProgress = () => {
      if (!hovering) return;
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? Math.min(previewSeconds, video.duration) : previewSeconds;
      const progress = duration ? Math.min(1, Math.max(0, video.currentTime / duration)) : 0;
      card.style.setProperty("--hover-progress", `${progress * 100}%`);
      if (duration && video.currentTime >= duration) {
        seekToStart();
        video.play().catch(() => {});
      }
      rafId = requestAnimationFrame(updateProgress);
    };
    const play = () => {
      hovering = true;
      card.classList.add("isPreviewing");
      card.style.setProperty("--hover-progress", "0%");
      seekToStart();
      video.play().catch(() => {});
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updateProgress);
    };
    const stop = () => {
      hovering = false;
      card.classList.remove("isPreviewing");
      cancelAnimationFrame(rafId);
      video.pause();
      seekToStart();
      card.style.setProperty("--hover-progress", "0%");
    };
    video.addEventListener("loadedmetadata", () => {
      if (hovering) seekToStart();
    });
    card.addEventListener("mouseenter", play);
    card.addEventListener("mouseleave", stop);
    card.addEventListener("focusin", play);
    card.addEventListener("focusout", stop);
  });
}

function captureThumbnailFromVideoUrl(src) {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = src;
    const cleanup = () => {
      video.removeAttribute("src");
      video.load();
    };
    const finish = () => {
      try {
        const width = video.videoWidth || 1280;
        const height = video.videoHeight || 720;
        const canvas = document.createElement("canvas");
        const maxWidth = 960;
        const scale = Math.min(1, maxWidth / width);
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          cleanup();
          resolve(blob);
        }, "image/jpeg", 0.82);
      } catch {
        cleanup();
        resolve(null);
      }
    };
    video.addEventListener("loadeddata", () => {
      const seekTo = Math.min(0.2, Math.max(0, (video.duration || 1) / 20));
      if (seekTo > 0) video.currentTime = seekTo;
      else finish();
    }, { once: true });
    video.addEventListener("seeked", finish, { once: true });
    video.addEventListener("error", () => {
      cleanup();
      resolve(null);
    }, { once: true });
  });
}

async function generateMissingVideoThumbnails() {
  const videos = state.assets.filter((asset) => assetKind(asset) === "video" && !asset.thumbnail);
  for (const asset of videos.slice(0, 4)) {
    const key = `mediaflow_thumb_attempt_${asset.id}`;
    if (sessionStorage.getItem(key)) continue;
    sessionStorage.setItem(key, "1");
    const playbackUrl = `/api/accounts/${state.currentAccountId}/files/${asset.id}/playback`;
    const thumbnail = await captureThumbnailFromVideoUrl(playbackUrl).catch(() => null);
    if (!thumbnail) continue;
    const { data } = await api(`/api/files/${asset.id}/thumbnail-upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentType: "image/jpeg" }),
    });
    await putBlob(data.uploadUrl, thumbnail, "image/jpeg");
    asset.thumbnail = data.thumbnail;
    const card = elements.folderList.querySelector(`.assetCard[data-id="${CSS.escape(asset.id)}"]`);
    const thumb = card?.querySelector(".assetThumb-video");
    if (thumb) {
      const hoverVideo = thumb.querySelector(".assetHoverVideo")?.outerHTML || "";
      thumb.innerHTML = `<img src="${data.thumbnail}" alt="">${hoverVideo}`;
    }
  }
}

async function handleAssetClick(event) {
  const card = event.target.closest(".assetCard");
  if (!card) return;
  const asset = state.assets.find((item) => item.id === card.dataset.id);
  if (!asset) return;
  if (event.target.closest(".renameAsset")) return renameAsset(asset);
  if (event.target.closest(".deleteAsset")) return deleteAsset(asset);
  if (asset.type === "folder") await enterFolder(asset.id, asset.name);
  else await selectAsset(asset);
}

async function handleAssetDoubleClick(event) {
  const card = event.target.closest(".assetCard");
  if (!card) {
    if (event.target.closest("#folderList")) openFilePicker({ autoUpload: true });
    return;
  }
  const asset = state.assets.find((item) => item.id === card.dataset.id);
  if (!asset) return;
  if (event.target.closest(".renameAsset, .deleteAsset")) return;
  if (asset.type === "folder") await enterFolder(asset.id, asset.name);
  else await selectAsset(asset);
}

function currentFolder() {
  return state.folderStack[state.folderStack.length - 1] || null;
}

function openFilePicker({ autoUpload = false, targetFolderId = "" } = {}) {
  if (elements.uploadButton.disabled) return;
  if (autoUpload) elements.fileInput.dataset.autoUpload = "true";
  if (targetFolderId) elements.fileInput.dataset.targetFolderId = targetFolderId;
  elements.fileInput.click();
  window.addEventListener("focus", () => {
    setTimeout(() => {
      if (!elements.fileInput.files?.length) {
        delete elements.fileInput.dataset.autoUpload;
        delete elements.fileInput.dataset.targetFolderId;
      }
    }, 500);
  }, { once: true });
}

function hideContextMenu() {
  state.contextAssetId = "";
  elements.assetContextMenu.hidden = true;
  elements.assetContextMenu.innerHTML = "";
}

function contextMenuItem(action, label, icon = "") {
  return `<button type="button" role="menuitem" data-action="${action}">${icon}<span>${escapeHtml(label)}</span></button>`;
}

function showAssetContextMenu(event) {
  const card = event.target.closest(".assetCard");
  const asset = card ? state.assets.find((item) => item.id === card.dataset.id) : null;
  event.preventDefault();
  state.contextAssetId = asset?.id || "";
  const folder = asset?.type === "folder";
  const items = asset
    ? [
        contextMenuItem("open", folder ? "Open folder" : "Open preview"),
        ...(folder ? [contextMenuItem("uploadHere", "Upload into folder")] : []),
        contextMenuItem("rename", "Rename"),
        contextMenuItem("delete", "Delete"),
      ]
    : [
        contextMenuItem("upload", "Upload files"),
        contextMenuItem("newFolder", "New folder"),
        contextMenuItem("refresh", "Refresh"),
      ];
  elements.assetContextMenu.innerHTML = items.join("");
  elements.assetContextMenu.hidden = false;
  const rect = elements.assetContextMenu.getBoundingClientRect();
  const left = Math.min(event.clientX, window.innerWidth - rect.width - 10);
  const top = Math.min(event.clientY, window.innerHeight - rect.height - 10);
  elements.assetContextMenu.style.left = `${Math.max(10, left)}px`;
  elements.assetContextMenu.style.top = `${Math.max(10, top)}px`;
}

async function handleContextMenuAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  const asset = state.assets.find((item) => item.id === state.contextAssetId);
  hideContextMenu();
  if (action === "upload") return openFilePicker({ autoUpload: true });
  if (action === "newFolder") return createFolder();
  if (action === "refresh") return loadFolder();
  if (!asset) return;
  if (action === "open") return asset.type === "folder" ? enterFolder(asset.id, asset.name) : selectAsset(asset);
  if (action === "uploadHere" && asset.type === "folder") {
    return openFilePicker({ autoUpload: true, targetFolderId: asset.id });
  }
  if (action === "rename") return renameAsset(asset);
  if (action === "delete") return deleteAsset(asset);
}

async function createFolder() {
  const current = state.folderStack[state.folderStack.length - 1];
  const name = prompt("Folder name");
  if (!name?.trim()) return;
  await api(`/api/accounts/${state.currentAccountId}/folders/${current.id}/folders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  await loadFolder();
}

async function renameAsset(asset) {
  const name = prompt("New name", asset.name);
  if (!name?.trim() || name === asset.name) return;
  const url = asset.type === "folder" ? `/api/accounts/${state.currentAccountId}/folders/${asset.id}` : `/api/accounts/${state.currentAccountId}/files/${asset.id}`;
  await api(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
  await loadFolder();
}

async function deleteAsset(asset) {
  if (!confirm(`Delete "${asset.name}"?`)) return;
  const url = asset.type === "folder" ? `/api/accounts/${state.currentAccountId}/folders/${asset.id}` : `/api/accounts/${state.currentAccountId}/files/${asset.id}`;
  await api(url, { method: "DELETE" });
  if (state.selectedAsset?.id === asset.id) closeReview();
  await loadFolder();
}

async function uploadFile(event) {
  event.preventDefault();
  const files = [...(elements.fileInput.files || [])];
  const current = currentFolder();
  const targetFolderId = elements.fileInput.dataset.targetFolderId || current?.id;
  delete elements.fileInput.dataset.targetFolderId;
  delete elements.fileInput.dataset.autoUpload;
  if (!files.length || !targetFolderId) return;
  await uploadFiles(files, targetFolderId);
}

async function handleFileInputChange() {
  updateSelectedFileName();
  try {
    if (elements.fileInput.dataset.autoUpload === "true") {
      const files = [...(elements.fileInput.files || [])];
      const targetFolderId = elements.fileInput.dataset.targetFolderId || currentFolder()?.id;
      delete elements.fileInput.dataset.autoUpload;
      delete elements.fileInput.dataset.targetFolderId;
      if (files.length && targetFolderId) await uploadFiles(files, targetFolderId);
    }
  } catch (error) {
    setAlert(error.message);
  }
}

async function uploadFiles(files, folderId) {
  if (!files?.length || !folderId) return;
  elements.uploadButton.disabled = true;
  elements.progressLabel.textContent = "Preparing";
  try {
    elements.uploadQueue.innerHTML = files.length > 1 ? `<div class="uploadQueueItem">Uploading ${files.length} files...</div>` : "";
    for (const [index, file] of files.entries()) {
      elements.progressLabel.textContent = files.length > 1 ? `File ${index + 1} of ${files.length}` : "Preparing";
      const data = file.size >= 100 * 1024 * 1024 ? await uploadMultipartFile(folderId, file) : await uploadSingleFile(folderId, file);
      await uploadVideoThumbnail(data.id, file).catch(() => {});
    }
    elements.progressLabel.textContent = files.length > 1 ? "All uploaded" : "Uploaded";
    elements.fileInput.value = "";
    updateSelectedFileName();
    await loadFolder();
  } catch (error) {
    setAlert(error.message);
    elements.progressLabel.textContent = "Failed";
  } finally {
    elements.uploadButton.disabled = false;
    setTimeout(() => {
      elements.progressBar.value = 0;
      elements.progressPercent.textContent = "0%";
      elements.progressLabel.textContent = "Ready";
      elements.uploadQueue.innerHTML = "";
    }, 1500);
  }
}

function isVideoFile(file) {
  return String(file.type || "").startsWith("video/") || /\.(mp4|mov|m4v|webm)$/i.test(file.name || "");
}

function captureVideoThumbnail(file) {
  if (!isVideoFile(file)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const cleanup = () => URL.revokeObjectURL(url);
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    const finish = () => {
      try {
        const width = video.videoWidth || 1280;
        const height = video.videoHeight || 720;
        const canvas = document.createElement("canvas");
        const maxWidth = 960;
        const scale = Math.min(1, maxWidth / width);
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          cleanup();
          resolve(blob);
        }, "image/jpeg", 0.82);
      } catch {
        cleanup();
        resolve(null);
      }
    };
    video.addEventListener("loadeddata", () => {
      const seekTo = Math.min(0.2, Math.max(0, (video.duration || 1) / 20));
      if (seekTo > 0) video.currentTime = seekTo;
      else finish();
    }, { once: true });
    video.addEventListener("seeked", finish, { once: true });
    video.addEventListener("error", () => {
      cleanup();
      resolve(null);
    }, { once: true });
  });
}

async function uploadVideoThumbnail(fileId, file) {
  const thumbnail = await captureVideoThumbnail(file);
  if (!thumbnail) return;
  elements.progressLabel.textContent = "Thumbnail";
  const { data } = await api(`/api/files/${fileId}/thumbnail-upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType: "image/jpeg" }),
  });
  await putBlob(data.uploadUrl, thumbnail, "image/jpeg");
}

function setUploadProgress(loaded, total, label = "Uploading") {
  const pct = total ? Math.max(0, Math.min(100, Math.round((loaded / total) * 100))) : 0;
  elements.progressBar.value = pct;
  elements.progressPercent.textContent = `${pct}%`;
  elements.progressLabel.textContent = label;
}

function updateSelectedFileName() {
  const files = [...(elements.fileInput.files || [])];
  elements.selectedFileName.textContent = files.length > 1 ? `${files.length} files selected` : files[0]?.name || "Choose file";
  elements.uploadForm.classList.toggle("hasFile", Boolean(files.length));
}

function handleFolderBreadcrumbClick(event) {
  const button = event.target.closest("button[data-index]");
  if (!button) return;
  const index = Number(button.dataset.index);
  if (!Number.isInteger(index) || index < 0 || index >= state.folderStack.length - 1) return;
  state.folderStack = state.folderStack.slice(0, index + 1);
  localStorage.setItem("mediaflow_folder_stack", JSON.stringify(state.folderStack));
  loadFolder();
}

function handleFolderTreeClick(event) {
  const button = event.target.closest("button[data-folder-id]");
  if (!button) return;
  goToFolder(button.dataset.folderId);
}

function setDroppedFiles(files) {
  if (!files?.length) return;
  const transfer = new DataTransfer();
  [...files].forEach((file) => transfer.items.add(file));
  elements.fileInput.files = transfer.files;
  updateSelectedFileName();
}

function setupDropUpload() {
  const pane = document.querySelector(".assetPane");
  if (!pane) return;
  let depth = 0;
  const setActive = (active) => {
    pane.classList.toggle("isDraggingFile", active);
    if (elements.dropOverlay) elements.dropOverlay.hidden = !active;
  };
  ["dragenter", "dragover"].forEach((eventName) => {
    pane.addEventListener(eventName, (event) => {
      if (!event.dataTransfer?.types?.includes("Files")) return;
      event.preventDefault();
      if (eventName === "dragenter") depth += 1;
      setActive(true);
      event.dataTransfer.dropEffect = "copy";
    });
  });
  pane.addEventListener("dragleave", (event) => {
    if (!event.dataTransfer?.types?.includes("Files")) return;
    depth = Math.max(0, depth - 1);
    if (!depth) setActive(false);
  });
  pane.addEventListener("drop", (event) => {
    if (!event.dataTransfer?.files?.length) return;
    event.preventDefault();
    depth = 0;
    setActive(false);
    const folderCard = event.target.closest(".assetCard[data-type=\"folder\"]");
    const targetFolderId = folderCard?.dataset.id || currentFolder()?.id;
    uploadFiles([...event.dataTransfer.files], targetFolderId);
  });
}

function setupFileBrowserInteractions() {
  elements.folderList.addEventListener("dblclick", handleAssetDoubleClick);
  elements.folderList.addEventListener("contextmenu", showAssetContextMenu);
  elements.assetContextMenu.addEventListener("click", handleContextMenuAction);
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".fileContextMenu")) hideContextMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hideContextMenu();
  });
  elements.folderList.addEventListener("dragover", (event) => {
    const folderCard = event.target.closest(".assetCard[data-type=\"folder\"]");
    elements.folderList.querySelectorAll(".isDropTarget").forEach((card) => {
      if (card !== folderCard) card.classList.remove("isDropTarget");
    });
    if (folderCard && event.dataTransfer?.types?.includes("Files")) folderCard.classList.add("isDropTarget");
  });
  elements.folderList.addEventListener("dragleave", (event) => {
    event.target.closest(".assetCard")?.classList.remove("isDropTarget");
  });
  elements.folderList.addEventListener("drop", () => {
    elements.folderList.querySelectorAll(".isDropTarget").forEach((card) => card.classList.remove("isDropTarget"));
  });
}

function putBlob(url, blob, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType || "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ etag: xhr.getResponseHeader("ETag") || xhr.getResponseHeader("etag") || "" });
        return;
      }
      reject(new Error(`Upload failed (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("Upload failed. The storage bucket may need browser CORS enabled."));
    xhr.send(blob);
  });
}

async function uploadSingleFile(folderId, file) {
  const { data } = await api(`/api/accounts/${state.currentAccountId}/folders/${folderId}/files/local-upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, fileSize: file.size, contentType: file.type || "application/octet-stream" }),
  });
  const uploadUrl = data.upload_urls?.[0]?.url;
  if (!uploadUrl) throw new Error("No upload URL was returned.");
  await putBlob(uploadUrl, file, file.type, (loaded) => setUploadProgress(loaded, file.size));
  await api(`/api/files/${data.id}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType: file.type }),
  });
  return data;
}

async function uploadMultipartFile(folderId, file) {
  const partSize = 64 * 1024 * 1024;
  const partCount = Math.ceil(file.size / partSize);
  const { data } = await api(`/api/accounts/${state.currentAccountId}/folders/${folderId}/files/multipart-upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, fileSize: file.size, contentType: file.type || "application/octet-stream", partCount }),
  });
  const partUrls = data.partUrls || [];
  const loadedByPart = new Array(partCount).fill(0);
  const parts = new Array(partCount);
  let nextIndex = 0;
  const updateTotal = () => setUploadProgress(loadedByPart.reduce((sum, value) => sum + value, 0), file.size, "Uploading");

  async function worker() {
    while (nextIndex < partUrls.length) {
      const index = nextIndex;
      nextIndex += 1;
      const part = partUrls[index];
      const start = (part.partNumber - 1) * partSize;
      const end = Math.min(file.size, start + partSize);
      const blob = file.slice(start, end);
      const result = await putBlob(part.url, blob, file.type, (loaded) => {
        loadedByPart[index] = loaded;
        updateTotal();
      });
      loadedByPart[index] = blob.size;
      parts[index] = { PartNumber: part.partNumber, ETag: result.etag };
      updateTotal();
    }
  }

  try {
    await Promise.all(Array.from({ length: Math.min(3, partUrls.length) }, () => worker()));
    if (parts.some((part) => !part?.ETag)) throw new Error("R2 did not return ETag headers. Enable CORS exposed header ETag on the bucket.");
    elements.progressLabel.textContent = "Finalizing";
    await api(`/api/files/${data.id}/multipart/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentType: file.type, parts }),
    });
    return data;
  } catch (error) {
    await api(`/api/files/${data.id}/multipart/abort`, { method: "POST" }).catch(() => {});
    throw error;
  }
}

async function selectAsset(asset) {
  state.selectedAsset = asset;
  document.body.classList.add("reviewMode");
  document.body.classList.remove("isPlayingVideo");
  elements.emptyState.hidden = true;
  elements.detailView.hidden = false;
  elements.assetTitle.textContent = asset.name;
  elements.reviewProjectTitle.textContent = state.currentProject?.name || "Project";
  elements.reviewFileTitle.textContent = asset.name;
  elements.assetMeta.textContent = `${asset.mimetype || "file"} - ${formatBytes(asset.filesize || asset.size)}`;
  const playbackUrl = `/api/accounts/${state.currentAccountId}/files/${asset.id}/playback?quality=${elements.playbackQualitySelect.value}`;
  elements.videoPlayer.src = playbackUrl;
  elements.videoFallback.hidden = false;
  elements.videoPlayer.load();
  await Promise.all([loadDownloads(asset), loadComments(asset), loadWorkflow(asset)]);
}

function closeReview() {
  state.selectedAsset = null;
  document.body.classList.remove("reviewMode");
  document.body.classList.remove("isPlayingVideo");
  elements.videoPlayer.pause();
  elements.videoPlayer.removeAttribute("src");
  elements.videoPlayer.load();
  elements.detailView.hidden = true;
  elements.emptyState.hidden = false;
}

async function loadDownloads(asset) {
  elements.downloadSelect.disabled = true;
  elements.downloadSelect.innerHTML = `<option value="">Download</option>`;
  const { data } = await api(`/api/accounts/${state.currentAccountId}/files/${asset.id}/downloads`);
  for (const item of data) {
    const option = document.createElement("option");
    option.value = item.url || "";
    option.disabled = Boolean(item.pending || !item.url);
    option.textContent = `${item.label} ${item.detail ? `(${item.detail})` : ""}`;
    elements.downloadSelect.append(option);
  }
  elements.downloadSelect.disabled = false;
}

async function loadWorkflow(asset) {
  const { data } = await api(`/api/files/${asset.id}/workflow`);
  elements.assigneeSelect.value = data.assigneeEmail || "";
  elements.statusSelect.value = data.status || "work_in_progress";
  updateWorkflowAppearance();
}

async function saveWorkflow() {
  if (!state.selectedAsset) return;
  await api(`/api/files/${state.selectedAsset.id}/workflow`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assigneeEmail: elements.assigneeSelect.value, status: elements.statusSelect.value }),
  });
  updateWorkflowAppearance();
}

function updateWorkflowAppearance() {
  const status = elements.statusSelect.value || "work_in_progress";
  const assigned = Boolean(elements.assigneeSelect.value);
  elements.statusSelect.closest(".reviewField")?.setAttribute("data-status", status);
  elements.assigneeSelect.closest(".reviewField")?.setAttribute("data-assigned", assigned ? "true" : "false");
}

async function loadComments(asset) {
  const [{ data: comments }, { data: meta }] = await Promise.all([
    api(`/api/accounts/${state.currentAccountId}/files/${asset.id}/comments`),
    api(`/api/files/${asset.id}/comment-meta`),
  ]);
  state.comments = comments;
  state.commentMeta = meta;
  renderComments();
  renderCommentMarkers();
}

function renderComments() {
  const rows = state.comments.filter((comment) => {
    const meta = state.commentMeta[comment.id] || {};
    if (state.commentFilter === "open") return !meta.resolved;
    if (state.commentFilter === "resolved") return meta.resolved;
    return true;
  });
  elements.commentCount.textContent = String(rows.length);
  elements.commentsList.innerHTML = rows.map((comment, index) => {
    const meta = state.commentMeta[comment.id] || {};
    const text = meta.editedText || comment.text;
    const replies = (meta.replies || []).map((reply) => `<div class="commentReply">${escapeHtml(reply.text)}</div>`).join("");
    const owner = comment.owner?.name || comment.owner?.email || "Member";
    const initials = String(owner).split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "M";
    return `<article class="commentItem ${meta.resolved ? "resolved" : ""}" data-id="${escapeHtml(comment.id)}" data-time="${Number(comment.timestamp) || 0}">
      <span class="commentAvatar" aria-hidden="true">${escapeHtml(initials)}</span>
      <button class="commentJump" type="button">
        <strong>${escapeHtml(owner)} <em>Just now</em></strong>
        <small>#${index + 1}</small>
        <span>${formatTime(comment.timestamp)}</span>
        <p>${escapeHtml(text)}</p>
      </button>
      <div class="commentActions">
        <button class="commentReplyButton ghostButton" type="button">Reply</button>
        <button class="commentEdit ghostButton" type="button">Edit</button>
        <button class="commentResolve ghostButton" type="button">${meta.resolved ? "Reopen" : "Solved"}</button>
      </div>
      ${replies}
    </article>`;
  }).join("") || `<p class="muted">No comments yet.</p>`;
}

function renderCommentMarkers() {
  const duration = elements.videoPlayer.duration || 0;
  elements.commentMarkers.innerHTML = "";
  if (!duration) return;
  for (const comment of state.comments) {
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = "commentMarker";
    marker.style.left = `${Math.min(100, ((Number(comment.timestamp) || 0) / duration) * 100)}%`;
    marker.title = `${formatTime(comment.timestamp)} - ${comment.text}`;
    marker.addEventListener("click", () => {
      elements.videoPlayer.currentTime = Number(comment.timestamp) || 0;
    });
    elements.commentMarkers.append(marker);
  }
}

async function addComment(event) {
  event.preventDefault();
  if (!state.selectedAsset || !elements.commentInput.value.trim()) return;
  await api(`/api/accounts/${state.currentAccountId}/files/${state.selectedAsset.id}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: elements.commentInput.value, timestamp: elements.videoPlayer.currentTime || 0 }),
  });
  elements.commentInput.value = "";
  await loadComments(state.selectedAsset);
}

async function handleCommentAction(event) {
  const item = event.target.closest(".commentItem");
  if (!item || !state.selectedAsset) return;
  if (event.target.closest(".commentJump")) {
    elements.videoPlayer.currentTime = Number(item.dataset.time) || 0;
    elements.videoPlayer.play().catch(() => {});
    return;
  }
  const id = item.dataset.id;
  const body = {};
  if (event.target.closest(".commentEdit")) {
    const current = state.comments.find((comment) => comment.id === id);
    const text = prompt("Edit comment", state.commentMeta[id]?.editedText || current?.text || "");
    if (!text?.trim()) return;
    body.editedText = text;
  } else if (event.target.closest(".commentReplyButton")) {
    const text = prompt("Reply");
    if (!text?.trim()) return;
    body.replyText = text;
  } else if (event.target.closest(".commentResolve")) {
    body.resolved = !state.commentMeta[id]?.resolved;
  } else return;
  const { data } = await api(`/api/files/${state.selectedAsset.id}/comment-meta/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  state.commentMeta[id] = data;
  renderComments();
}

async function shareSelectedAsset() {
  if (!state.selectedAsset || !state.currentProject) return;
  const password = prompt("Optional password for this review link. Leave blank for public access.", "");
  const { data } = await api(`/api/projects/${state.currentProject.id}/shares`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assetIds: [state.selectedAsset.id], password, name: `${state.selectedAsset.name} review` }),
  });
  await navigator.clipboard?.writeText(new URL(data.url, location.origin).href).catch(() => {});
  alert(`Share link ready:\\n${new URL(data.url, location.origin).href}`);
}

function updatePlayerUi() {
  const duration = elements.videoPlayer.duration || 0;
  const current = elements.videoPlayer.currentTime || 0;
  elements.currentTimeLabel.textContent = formatTime(current);
  elements.durationLabel.textContent = formatTime(duration);
  elements.commentForm.dataset.time = formatTime(current);
  elements.seekBar.value = duration ? Math.round((current / duration) * 1000) : 0;
}

elements.authForm.addEventListener("submit", handleLogin);
elements.appLogoutButton.addEventListener("click", handleLogout);
elements.settingsButton.addEventListener("click", () => {
  elements.sidebar.classList.toggle("open");
  elements.settingsButton.setAttribute("aria-expanded", String(elements.sidebar.classList.contains("open")));
});
elements.apiSettingsForm.addEventListener("submit", saveApiSettings);
elements.adminUserForm.addEventListener("submit", createUser);
elements.passwordForm.addEventListener("submit", updatePassword);
elements.accountSelect.addEventListener("change", async () => { state.currentAccountId = elements.accountSelect.value; await loadWorkspaces(); });
elements.workspaceSelect.addEventListener("change", async () => { state.currentWorkspaceId = elements.workspaceSelect.value; await loadProjects(); });
elements.projectSelect.addEventListener("change", async () => {
  state.currentProject = state.projects.find((project) => project.id === elements.projectSelect.value);
  localStorage.setItem("mediaflow_project", state.currentProject?.id || "");
  if (state.currentProject) await enterFolder(state.currentProject.root_folder_id, state.currentProject.name, true);
});
elements.refreshButton.addEventListener("click", loadFolder);
elements.createFolderButton.addEventListener("click", createFolder);
elements.sidebarCreateFolderButton.addEventListener("click", createFolder);
elements.backFolderButton.addEventListener("click", async () => { if (state.folderStack.length > 1) state.folderStack.pop(); await loadFolder(); });
elements.folderBreadcrumbs.addEventListener("click", handleFolderBreadcrumbClick);
elements.folderTree.addEventListener("click", handleFolderTreeClick);
elements.fileInput.addEventListener("change", handleFileInputChange);
elements.uploadForm.addEventListener("submit", uploadFile);
elements.folderList.addEventListener("click", handleAssetClick);
elements.gridViewButton.addEventListener("click", () => { state.view = "grid"; localStorage.setItem("mediaflow_view", state.view); renderAssets(); });
elements.listViewButton.addEventListener("click", () => { state.view = "list"; localStorage.setItem("mediaflow_view", state.view); renderAssets(); });
elements.closeReviewButton.addEventListener("click", closeReview);
elements.reviewHomeButton.addEventListener("click", closeReview);
elements.reviewBackButton.addEventListener("click", closeReview);
elements.reviewProjectTitle.addEventListener("click", closeReview);
elements.reviewShareButton.addEventListener("click", shareSelectedAsset);
elements.centerPlayButton.addEventListener("click", () => { elements.videoPlayer.paused ? elements.videoPlayer.play() : elements.videoPlayer.pause(); });
elements.videoPlayer.addEventListener("click", () => { elements.videoPlayer.paused ? elements.videoPlayer.play() : elements.videoPlayer.pause(); });
elements.playPauseButton.addEventListener("click", () => { elements.videoPlayer.paused ? elements.videoPlayer.play() : elements.videoPlayer.pause(); });
elements.videoPlayer.addEventListener("play", () => {
  document.body.classList.add("isPlayingVideo");
  elements.playPauseButton.textContent = "Pause";
});
elements.videoPlayer.addEventListener("pause", () => {
  document.body.classList.remove("isPlayingVideo");
  elements.playPauseButton.textContent = "Play";
});
elements.videoPlayer.addEventListener("timeupdate", updatePlayerUi);
elements.videoPlayer.addEventListener("loadedmetadata", () => { updatePlayerUi(); renderCommentMarkers(); elements.videoFallback.hidden = true; });
elements.videoPlayer.addEventListener("error", () => { elements.videoFallback.hidden = false; });
elements.seekBar.addEventListener("input", () => {
  const duration = elements.videoPlayer.duration || 0;
  if (duration) elements.videoPlayer.currentTime = (Number(elements.seekBar.value) / 1000) * duration;
});
elements.playbackQualitySelect.addEventListener("change", () => { if (state.selectedAsset) selectAsset(state.selectedAsset); });
elements.downloadSelect.addEventListener("change", () => {
  if (!elements.downloadSelect.value) return;
  location.href = elements.downloadSelect.value;
  elements.downloadSelect.value = "";
});
elements.assigneeSelect.addEventListener("change", () => { updateWorkflowAppearance(); saveWorkflow(); });
elements.statusSelect.addEventListener("change", () => { updateWorkflowAppearance(); saveWorkflow(); });
elements.openFrameButton.addEventListener("click", shareSelectedAsset);
elements.renameButton.addEventListener("click", () => state.selectedAsset && renameAsset(state.selectedAsset));
elements.deleteButton.addEventListener("click", () => state.selectedAsset && deleteAsset(state.selectedAsset));
elements.commentForm.addEventListener("submit", addComment);
elements.commentsList.addEventListener("click", handleCommentAction);
document.querySelectorAll(".commentFilter").forEach((button) => {
  button.addEventListener("click", () => {
    state.commentFilter = button.dataset.commentFilter;
    document.querySelectorAll(".commentFilter").forEach((item) => item.classList.toggle("active", item === button));
    renderComments();
  });
});

setupDropUpload();
setupFileBrowserInteractions();
loadSession().catch((error) => {
  setSignedIn(null);
  elements.authError.textContent = error.message;
  elements.authError.hidden = false;
});
