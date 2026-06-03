const $ = (selector) => document.querySelector(selector);

const elements = {
  authGate: $("#authGate"),
  authForm: $("#authForm"),
  authEmail: $("#authEmail"),
  authPassword: $("#authPassword"),
  authError: $("#authError"),
  authSubmitButton: $("#authSubmitButton"),
  notificationsButton: $("#notificationsButton"),
  notificationBadge: $("#notificationBadge"),
  notificationsPanel: $("#notificationsPanel"),
  closeNotificationsButton: $("#closeNotificationsButton"),
  notificationsList: $("#notificationsList"),
  settingsButton: $("#settingsButton"),
  closeSettingsButton: $("#closeSettingsButton"),
  sidebar: $("#sidebar"),
  settingsNav: $(".settingsNav"),
  connectionBadge: $("#connectionBadge"),
  memberBadge: $("#memberBadge"),
  appLogoutButton: $("#appLogoutButton"),
  settingsStorageGroup: $("#settingsStorageGroup"),
  profileForm: $("#profileForm"),
  profileAvatarPreview: $("#profileAvatarPreview"),
  profileAvatarInput: $("#profileAvatarInput"),
  profileName: $("#profileName"),
  profileEmail: $("#profileEmail"),
  profileUsername: $("#profileUsername"),
  profileMessage: $("#profileMessage"),
  accountSelect: $("#accountSelect"),
  workspaceSelect: $("#workspaceSelect"),
  projectSelect: $("#projectSelect"),
  folderTree: $("#folderTree"),
  sidebarCreateFolderButton: $("#sidebarCreateFolderButton"),
  adminPanel: $("#adminPanel"),
  adminUserForm: $("#adminUserForm"),
  adminUserMessage: $("#adminUserMessage"),
  adminUsersList: $("#adminUsersList"),
  adminNotifyForm: $("#adminNotifyForm"),
  notifyUserSelect: $("#notifyUserSelect"),
  notifySubject: $("#notifySubject"),
  notifyMessage: $("#notifyMessage"),
  adminNotifyMessage: $("#adminNotifyMessage"),
  projectForm: $("#projectForm"),
  projectNameInput: $("#projectNameInput"),
  projectRequireDeletePassword: $("#projectRequireDeletePassword"),
  projectDeletePassword: $("#projectDeletePassword"),
  projectRetentionDays: $("#projectRetentionDays"),
  projectMembersCanUpload: $("#projectMembersCanUpload"),
  projectMembersCanDelete: $("#projectMembersCanDelete"),
  projectMembersCanComment: $("#projectMembersCanComment"),
  projectMembersCanDownload: $("#projectMembersCanDownload"),
  projectMembersCanShare: $("#projectMembersCanShare"),
  projectSettingsMessage: $("#projectSettingsMessage"),
  projectRulesList: $("#projectRulesList"),
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
  destinationModal: $("#destinationModal"),
  destinationEyebrow: $("#destinationEyebrow"),
  destinationTitle: $("#destinationTitle"),
  destinationCloseButton: $("#destinationCloseButton"),
  destinationCancelButton: $("#destinationCancelButton"),
  destinationConfirmButton: $("#destinationConfirmButton"),
  destinationSearchInput: $("#destinationSearchInput"),
  destinationProjectList: $("#destinationProjectList"),
  destinationTree: $("#destinationTree"),
  destinationPath: $("#destinationPath"),
  emptyState: $("#emptyState"),
  detailView: $("#detailView"),
  videoPlayer: $("#videoPlayer"),
  imagePreview: $("#imagePreview"),
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
  tagEditor: $("#tagEditor"),
  tagList: $("#tagList"),
  tagForm: $("#tagForm"),
  tagInput: $("#tagInput"),
  assigneeSelect: $("#assigneeSelect"),
  statusSelect: $("#statusSelect"),
  openFrameButton: $("#openFrameButton"),
  downloadButton: $("#downloadButton"),
  downloadMenu: $("#downloadMenu"),
  downloadPanel: $("#downloadPanel"),
  downloadSelect: $("#downloadButton"),
  renameButton: $("#renameButton"),
  deleteButton: $("#deleteButton"),
  commentsList: $("#commentsList"),
  commentInput: $("#commentInput"),
  commentForm: $("#commentForm"),
  commentButton: $("#commentButton"),
  commentCount: $("#commentCount"),
  mentionHint: $("#mentionHint"),
  mentionList: $("#mentionList"),
  mentionSuggestions: $("#mentionSuggestions"),
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
  folderTreeExpanded: new Set(),
  folderStack: [],
  assets: [],
  selectedAsset: null,
  comments: [],
  commentMeta: {},
  notifications: [],
  unreadNotifications: 0,
  view: localStorage.getItem("mediaflow_view") || "grid",
  commentFilter: "all",
  contextAssetId: "",
  activeMention: null,
  mentionIndex: 0,
  mentionQuery: "",
  commentPosting: false,
  destinationPicker: null,
  activeUploadProgressId: "",
  draggedAsset: null,
};

const RECENT_LOCATION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const LOCATION_STORAGE_KEY = "mediaflow_recent_location";

function persistFolderLocation() {
  if (!state.currentProject || !state.folderStack.length) return;
  const locationState = {
    projectId: state.currentProject.id,
    folderStack: state.folderStack,
    updatedAt: Date.now(),
  };
  localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(locationState));
  localStorage.setItem("mediaflow_project", state.currentProject.id);
  localStorage.setItem("mediaflow_folder_stack", JSON.stringify(state.folderStack));
}

function readRecentFolderLocation() {
  try {
    const stored = JSON.parse(localStorage.getItem(LOCATION_STORAGE_KEY) || "null");
    if (!stored?.projectId || !Array.isArray(stored.folderStack) || !stored.updatedAt) return null;
    if (Date.now() - Number(stored.updatedAt) > RECENT_LOCATION_MAX_AGE_MS) return null;
    return stored;
  } catch {
    return null;
  }
}

function folderStackIsValid(stack, folders, project) {
  if (!project || !Array.isArray(stack) || !stack.length) return false;
  const folderIds = new Set(folders.map((folder) => folder.id));
  return stack[0]?.id === project.root_folder_id && stack.every((item) => folderIds.has(item.id));
}

function expandFolderAncestors(folderId, folders = state.folderTree) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  let current = byId.get(folderId);
  while (current) {
    state.folderTreeExpanded.add(current.id);
    current = current.parent_id ? byId.get(current.parent_id) : null;
  }
}

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

function relativeTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const seconds = Math.max(1, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function initialsFor(value) {
  return String(value || "Member").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "M";
}

function renderProfileForm() {
  const user = state.user;
  if (!user) return;
  elements.profileName.value = user.name || "";
  elements.profileEmail.value = user.email || "";
  elements.profileUsername.value = user.username ? `@${user.username}` : "";
  elements.profileAvatarPreview.textContent = user.avatarUrl ? "" : initialsFor(user.name || user.email);
  elements.profileAvatarPreview.style.backgroundImage = user.avatarUrl ? `url("${user.avatarUrl}")` : "";
  elements.profileAvatarPreview.classList.toggle("hasImage", Boolean(user.avatarUrl));
}

function showSettingsSection(section = "profile") {
  const isAdmin = state.user?.role === "admin";
  const safeSection = (!isAdmin && !["profile", "password"].includes(section)) ? "profile" : section;
  document.querySelectorAll(".settingsSection").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.settingsPanel === safeSection);
  });
  document.querySelectorAll(".settingsNavButton").forEach((button) => {
    button.classList.toggle("active", button.dataset.settingsSection === safeSection);
  });
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
  const isAdmin = user?.role === "admin";
  elements.memberBadge.textContent = user ? `${user.name || user.email} - ${user.role}` : "Signed out";
  elements.adminPanel.hidden = !isAdmin;
  elements.settingsStorageGroup.hidden = !isAdmin;
  document.body.classList.toggle("isAdmin", isAdmin);
  document.body.classList.toggle("isMember", Boolean(user) && !isAdmin);
  if (user) renderProfileForm();
  showSettingsSection(isAdmin ? "members" : "profile");
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
  const { data } = await api("/api/users");
  state.users = data;
  if (state.user?.role === "admin") {
    renderAdminUsers();
  }
  elements.assigneeSelect.innerHTML = data.map((user) => `<option value="${escapeHtml(user.email)}">${escapeHtml(user.name || user.email)}</option>`).join("");
  renderMentionSuggestions();
}

function renderAdminUsers() {
  elements.adminUsersList.innerHTML = state.users.map((user) => {
    const isCurrent = user.email === state.user?.email;
    return `<article class="adminMemberCard" data-id="${escapeHtml(user.id)}">
      <div class="adminMemberAvatar ${user.avatarUrl ? "hasImage" : ""}" ${user.avatarUrl ? `style="background-image:url('${escapeHtml(user.avatarUrl)}')"` : ""}>${user.avatarUrl ? "" : escapeHtml(initialsFor(user.name || user.email))}</div>
      <div class="adminMemberInfo">
        <strong>${escapeHtml(user.name || user.email)}</strong>
        <span class="adminUsername">@${escapeHtml(user.username || "member")}</span>
        <span>${escapeHtml(user.email)}</span>
        <small>${escapeHtml(user.createdAt ? `Joined ${formatDateTime(user.createdAt)}` : "Member")}</small>
      </div>
      <select class="adminRoleSelect" aria-label="Role for ${escapeHtml(user.email)}">
        <option value="member" ${user.role !== "admin" ? "selected" : ""}>Member</option>
        <option value="admin" ${user.role === "admin" ? "selected" : ""}>Admin</option>
      </select>
      <div class="adminMemberActions">
        <button type="button" data-admin-action="rename">Rename</button>
        <button type="button" data-admin-action="username">Username</button>
        <button type="button" data-admin-action="password">Password</button>
        <button type="button" data-admin-action="notify">Notify</button>
        <button type="button" data-admin-action="delete" ${isCurrent ? "disabled" : ""}>Delete</button>
      </div>
    </article>`;
  }).join("") || `<p class="muted">No members yet.</p>`;
  elements.notifyUserSelect.innerHTML = state.users.map((user) => `<option value="${escapeHtml(user.id)}">${escapeHtml(user.name || user.email)} (${escapeHtml(user.email)})</option>`).join("");
}

function renderMentionSuggestions() {
  if (!elements.mentionSuggestions) return;
  elements.mentionSuggestions.innerHTML = state.users.map((user) => `<option value="@${escapeHtml(user.username || user.email)}">${escapeHtml(user.name || user.email)}</option>`).join("");
  updateMentionHint();
}

function firstNameFor(user) {
  return String(user.name || user.email || "").trim().split(/\s+/).find(Boolean) || "";
}

function activeMentionQuery() {
  const input = elements.commentInput;
  const cursor = input.selectionStart ?? input.value.length;
  const beforeCursor = input.value.slice(0, cursor);
  const match = beforeCursor.match(/(^|\s)@([A-Za-z]*)$/);
  if (!match) return null;
  const query = match[2].toLowerCase();
  return {
    query,
    start: cursor - query.length - 1,
    end: cursor,
  };
}

function mentionMatches(query) {
  if (!query) return [];
  return state.users
    .filter((user) => firstNameFor(user).toLowerCase().startsWith(query))
    .sort((a, b) => firstNameFor(a).localeCompare(firstNameFor(b), undefined, { sensitivity: "base" }))
    .slice(0, 8);
}

function renderMentionList(matches = []) {
  if (!elements.mentionList) return;
  if (!matches.length) {
    elements.mentionList.hidden = true;
    elements.mentionList.innerHTML = "";
    return;
  }
  elements.mentionList.hidden = false;
  elements.mentionList.innerHTML = matches.map((user, index) => `
    <button class="mentionOption ${index === state.mentionIndex ? "active" : ""}" type="button" data-user-id="${escapeHtml(user.id)}">
      <span class="mentionOptionAvatar">${escapeHtml(initialsFor(user.name || user.email))}</span>
      <span><strong>${escapeHtml(user.name || user.email)}</strong><small>@${escapeHtml(user.username || user.email)}</small></span>
    </button>
  `).join("");
}

function updateMentionAutocomplete() {
  const active = activeMentionQuery();
  state.activeMention = active;
  if (!active) {
    state.mentionQuery = "";
    renderMentionList([]);
    return [];
  }
  if (active.query !== state.mentionQuery) {
    state.mentionQuery = active.query;
    state.mentionIndex = 0;
  }
  const matches = mentionMatches(active.query);
  state.mentionIndex = Math.min(state.mentionIndex, Math.max(0, matches.length - 1));
  renderMentionList(matches);
  return matches;
}

function insertMention(user) {
  if (!state.activeMention || !user) return;
  const token = `@${user.username || String(user.email || "").split("@")[0]} `;
  const input = elements.commentInput;
  input.value = `${input.value.slice(0, state.activeMention.start)}${token}${input.value.slice(state.activeMention.end)}`;
  const cursor = state.activeMention.start + token.length;
  input.focus();
  input.setSelectionRange(cursor, cursor);
  state.activeMention = null;
  renderMentionList([]);
  updateMentionHint();
}

function mentionedUsersInText(text) {
  const lower = String(text || "").toLowerCase();
  return state.users.filter((user) => {
    const email = String(user.email || "").toLowerCase();
    const name = String(user.name || "").toLowerCase();
    const username = String(user.username || "").toLowerCase();
    const first = name.split(/\s+/).find(Boolean) || "";
    return email && (lower.includes(`@${email}`) || lower.includes(`@${email.split("@")[0]}`) || (username && lower.includes(`@${username}`)) || (first && lower.includes(`@${first}`)));
  });
}

function updateMentionHint() {
  if (!elements.mentionHint) return;
  const matches = updateMentionAutocomplete();
  const mentions = mentionedUsersInText(elements.commentInput?.value || "").filter((user) => user.email !== state.user?.email);
  elements.mentionHint.textContent = mentions.length
    ? `Will notify ${mentions.map((user) => user.name || user.email).join(", ")}`
    : matches.length
      ? `${matches.length} matching teammate${matches.length === 1 ? "" : "s"}`
    : state.users.length
      ? `Mention teammates with @name or @email`
      : "";
}

async function loadNotifications() {
  if (!state.user) return;
  const { data, unreadCount } = await api("/api/notifications");
  state.notifications = data;
  state.unreadNotifications = unreadCount || 0;
  renderNotifications();
}

function renderNotifications() {
  elements.notificationBadge.hidden = !state.unreadNotifications;
  elements.notificationBadge.textContent = state.unreadNotifications > 99 ? "99+" : String(state.unreadNotifications);
  elements.notificationsList.innerHTML = state.notifications.map((notification) => `
    <button class="notificationItem ${notification.unread ? "unread" : ""}" type="button" data-id="${escapeHtml(notification.id)}" data-url="${escapeHtml(notification.url || "")}">
      <span class="notificationDot" aria-hidden="true"></span>
      <strong>${escapeHtml(notification.subject)}</strong>
      <small>${escapeHtml(relativeTime(notification.createdAt))}${notification.fileName ? ` - ${escapeHtml(notification.fileName)}` : ""}</small>
      <span>${escapeHtml(notification.type || "notification")}${notification.emailStatus === "failed" ? ` - Email failed` : notification.emailStatus === "sent" ? ` - Email sent` : ""}</span>
    </button>
  `).join("") || `<p class="muted">No notifications yet.</p>`;
}

function toggleNotifications(force) {
  const next = typeof force === "boolean" ? force : elements.notificationsPanel.hidden;
  elements.notificationsPanel.hidden = !next;
  elements.notificationsButton.setAttribute("aria-expanded", String(next));
  if (next) loadNotifications().catch(() => {});
}

async function handleNotificationClick(event) {
  const item = event.target.closest(".notificationItem");
  if (!item) return;
  await api(`/api/notifications/${item.dataset.id}/read`, { method: "PATCH" }).catch(() => {});
  const url = item.dataset.url;
  await loadNotifications().catch(() => {});
  toggleNotifications(false);
  if (url) location.href = url;
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

async function handleAdminMemberAction(event) {
  const card = event.target.closest(".adminMemberCard");
  if (!card) return;
  const user = state.users.find((item) => item.id === card.dataset.id);
  if (!user) return;
  if (event.target.matches(".adminRoleSelect")) {
    await updateAdminUser(user.id, { role: event.target.value });
    return;
  }
  const action = event.target.closest("[data-admin-action]")?.dataset.adminAction;
  if (!action) return;
  if (action === "rename") {
    const name = prompt("Member name", user.name || user.email);
    if (!name?.trim()) return;
    await updateAdminUser(user.id, { name });
  } else if (action === "username") {
    const username = prompt("Username", user.username || "");
    if (!username?.trim()) return;
    await updateAdminUser(user.id, { username });
  } else if (action === "password") {
    const password = prompt("New password for this member. Minimum 8 characters.");
    if (!password) return;
    await api(`/api/admin/users/${user.id}/password`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    elements.adminUserMessage.textContent = `Password reset for ${user.email}.`;
  } else if (action === "notify") {
    elements.notifyUserSelect.value = user.id;
    elements.notifySubject.focus();
  } else if (action === "delete") {
    if (!confirm(`Delete ${user.email}? This removes their login access.`)) return;
    const result = await api(`/api/admin/users/${user.id}`, { method: "DELETE" });
    state.users = result.users || state.users.filter((item) => item.id !== user.id);
    renderAdminUsers();
    elements.adminUserMessage.textContent = `Deleted ${user.email}.`;
  }
}

async function updateAdminUser(userId, payload) {
  const result = await api(`/api/admin/users/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  state.users = result.users || state.users.map((user) => (user.id === userId ? result.data : user));
  renderAdminUsers();
  elements.assigneeSelect.innerHTML = state.users.map((user) => `<option value="${escapeHtml(user.email)}">${escapeHtml(user.name || user.email)}</option>`).join("");
  renderMentionSuggestions();
  elements.adminUserMessage.textContent = "Member updated.";
}

async function sendMemberNotification(event) {
  event.preventDefault();
  const userId = elements.notifyUserSelect.value;
  if (!userId) return;
  elements.adminNotifyMessage.textContent = "Sending...";
  try {
    await api(`/api/admin/users/${userId}/notifications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: elements.notifySubject.value, message: elements.notifyMessage.value }),
    });
    elements.notifySubject.value = "";
    elements.notifyMessage.value = "";
    elements.adminNotifyMessage.textContent = "Notification sent.";
    await loadNotifications().catch(() => {});
  } catch (error) {
    elements.adminNotifyMessage.textContent = error.message;
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

function readAvatarFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve(state.user?.avatarUrl || "");
      return;
    }
    if (!file.type.startsWith("image/")) {
      reject(new Error("Profile picture must be an image."));
      return;
    }
    if (file.size > 650 * 1024) {
      reject(new Error("Profile picture must be under 650 KB."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read the profile picture."));
    reader.readAsDataURL(file);
  });
}

async function updateProfile(event) {
  event.preventDefault();
  elements.profileMessage.textContent = "Saving...";
  try {
    const avatarUrl = await readAvatarFile(elements.profileAvatarInput.files?.[0]);
    const result = await api("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: elements.profileName.value,
        email: elements.profileEmail.value,
        avatarUrl,
      }),
    });
    state.user = result.user || result.data;
    elements.profileAvatarInput.value = "";
    setSignedIn(state.user);
    await loadUsers();
    elements.profileMessage.textContent = "Profile saved.";
  } catch (error) {
    elements.profileMessage.textContent = error.message;
  }
}

async function previewProfileAvatar() {
  const file = elements.profileAvatarInput.files?.[0];
  if (!file) return;
  try {
    const avatarUrl = await readAvatarFile(file);
    elements.profileAvatarPreview.textContent = "";
    elements.profileAvatarPreview.style.backgroundImage = `url("${avatarUrl}")`;
    elements.profileAvatarPreview.classList.add("hasImage");
    elements.profileMessage.textContent = "";
  } catch (error) {
    elements.profileAvatarInput.value = "";
    elements.profileMessage.textContent = error.message;
  }
}

async function bootStorage() {
  await loadConfig();
  await loadUsers();
  await loadNotifications();
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
  renderProjectRules();
  const recentLocation = readRecentFolderLocation();
  state.currentProject = data.find((project) => project.id === recentLocation?.projectId) || data[0] || null;
  if (!state.currentProject) return;
  elements.projectSelect.value = state.currentProject.id;
  elements.workspaceTitle.textContent = state.currentProject.name;
  await enterDefaultProjectFolder(recentLocation);
}

function todayFolderNames(date = new Date()) {
  const monthName = date.toLocaleString("en-US", { month: "long" });
  return {
    month: `${String(date.getMonth() + 1).padStart(2, "0")}_${monthName}`,
    day: String(date.getDate()).padStart(2, "0"),
  };
}

function currentMonthFolderId(folders = state.folderTree, project = state.currentProject) {
  if (!project) return "";
  const names = todayFolderNames();
  return folders.find((folder) => folder.parent_id === project.root_folder_id && folder.name === names.month)?.id || "";
}

function resetFolderTreeExpansion(folders = state.folderTree) {
  state.folderTreeExpanded = new Set([
    state.currentProject?.root_folder_id,
    currentMonthFolderId(folders),
  ].filter(Boolean));
}

async function enterDefaultProjectFolder(recentLocation = readRecentFolderLocation()) {
  if (!state.currentProject) return;
  const { data } = await api(`/api/accounts/${state.currentAccountId}/projects/${state.currentProject.id}/folders`);
  const folders = data.sort(assetSort);
  state.folderTree = folders;
  resetFolderTreeExpansion(folders);
  if (recentLocation?.projectId === state.currentProject.id && folderStackIsValid(recentLocation.folderStack, folders, state.currentProject)) {
    state.folderStack = recentLocation.folderStack;
    expandFolderAncestors(state.folderStack[state.folderStack.length - 1]?.id, folders);
    persistFolderLocation();
    await loadFolder({ skipTreeReload: true });
    return;
  }
  const names = todayFolderNames();
  const month = folders.find((folder) => folder.parent_id === state.currentProject.root_folder_id && folder.name === names.month);
  const day = month ? folders.find((folder) => folder.parent_id === month.id && folder.name === names.day) : null;
  if (month && day) {
    state.folderStack = [
      { id: state.currentProject.root_folder_id, name: state.currentProject.name },
      { id: month.id, name: month.name },
      { id: day.id, name: day.name },
    ];
    persistFolderLocation();
    await loadFolder({ skipTreeReload: true });
    return;
  }
  await enterFolder(state.currentProject.root_folder_id, state.currentProject.name, true);
}

function renderProjectRules() {
  if (!elements.projectRulesList) return;
  elements.projectRulesList.innerHTML = state.projects.map((project) => {
    const rules = project.rules || {};
    const isArchive = project.system === "archive";
    return `<article class="projectRuleCard" data-project-id="${escapeHtml(project.id)}">
      <div>
        <strong>${escapeHtml(project.name)}</strong>
        <span>${isArchive ? "Archive project" : "Project"} - ${rules.requireDeletePassword ? "Delete password required" : "Standard delete rules"}</span>
      </div>
      <label>
        Name
        <input class="projectRuleName" type="text" value="${escapeHtml(project.name)}" ${isArchive ? "disabled" : ""} />
      </label>
      <label class="checkboxLabel">
        <input class="projectRuleRequirePassword" type="checkbox" ${rules.requireDeletePassword ? "checked" : ""} ${isArchive ? "disabled" : ""} />
        Require password for deletes
      </label>
      <label>
        Delete password
        <input class="projectRulePassword" type="text" value="${escapeHtml(rules.deletePassword || "")}" placeholder="No password set" />
      </label>
      <label>
        Retention
        <select class="projectRuleRetention">
          <option value="" ${!rules.retentionDays ? "selected" : ""}>Indefinitely</option>
          <option value="30" ${Number(rules.retentionDays) === 30 ? "selected" : ""}>1 month</option>
          <option value="60" ${Number(rules.retentionDays) === 60 ? "selected" : ""}>2 months</option>
          <option value="90" ${Number(rules.retentionDays) === 90 ? "selected" : ""}>3 months</option>
        </select>
      </label>
      <fieldset class="projectPermissionGrid">
        <legend>Member permissions</legend>
        <label class="checkboxLabel">
          <input class="projectRuleCanUpload" type="checkbox" ${rules.membersCanUpload !== false ? "checked" : ""} />
          Upload and create folders
        </label>
        <label class="checkboxLabel">
          <input class="projectRuleCanDelete" type="checkbox" ${rules.membersCanDelete !== false ? "checked" : ""} />
          Delete files and folders
        </label>
        <label class="checkboxLabel">
          <input class="projectRuleCanComment" type="checkbox" ${rules.membersCanComment !== false ? "checked" : ""} />
          Comment and review
        </label>
        <label class="checkboxLabel">
          <input class="projectRuleCanDownload" type="checkbox" ${rules.membersCanDownload !== false ? "checked" : ""} />
          Download files
        </label>
        <label class="checkboxLabel">
          <input class="projectRuleCanShare" type="checkbox" ${rules.membersCanShare !== false ? "checked" : ""} />
          Create share links
        </label>
      </fieldset>
      <button class="ghostButton projectRuleSave" type="button">Save rules</button>
    </article>`;
  }).join("") || `<p class="muted">No projects yet.</p>`;
}

async function createProject(event) {
  event.preventDefault();
  const name = elements.projectNameInput.value.trim();
  if (!name) return;
  elements.projectSettingsMessage.textContent = "Creating...";
  try {
    const result = await api(`/api/accounts/${state.currentAccountId}/workspaces/${state.currentWorkspaceId}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        requireDeletePassword: elements.projectRequireDeletePassword.checked,
        deletePassword: elements.projectDeletePassword.value,
        retentionDays: elements.projectRetentionDays.value,
        membersCanUpload: elements.projectMembersCanUpload.checked,
        membersCanDelete: elements.projectMembersCanDelete.checked,
        membersCanComment: elements.projectMembersCanComment.checked,
        membersCanDownload: elements.projectMembersCanDownload.checked,
        membersCanShare: elements.projectMembersCanShare.checked,
      }),
    });
    elements.projectForm.reset();
    state.projects = result.projects || [...state.projects, result.data];
    renderProjectRules();
    await loadProjects();
    elements.projectSettingsMessage.textContent = "Project created.";
  } catch (error) {
    elements.projectSettingsMessage.textContent = error.message;
  }
}

async function saveProjectRules(event) {
  const button = event.target.closest(".projectRuleSave");
  if (!button) return;
  const card = button.closest(".projectRuleCard");
  const projectId = card?.dataset.projectId;
  if (!projectId) return;
  const project = state.projects.find((item) => item.id === projectId);
  const payload = {
    name: card.querySelector(".projectRuleName")?.value || project?.name || "",
    requireDeletePassword: card.querySelector(".projectRuleRequirePassword")?.checked || project?.system === "archive",
    deletePassword: card.querySelector(".projectRulePassword")?.value || "",
    retentionDays: card.querySelector(".projectRuleRetention")?.value || "",
    membersCanUpload: card.querySelector(".projectRuleCanUpload")?.checked !== false,
    membersCanDelete: card.querySelector(".projectRuleCanDelete")?.checked !== false,
    membersCanComment: card.querySelector(".projectRuleCanComment")?.checked !== false,
    membersCanDownload: card.querySelector(".projectRuleCanDownload")?.checked !== false,
    membersCanShare: card.querySelector(".projectRuleCanShare")?.checked !== false,
  };
  elements.projectSettingsMessage.textContent = "Saving...";
  try {
    const result = await api(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    state.projects = result.projects || state.projects.map((item) => (item.id === projectId ? result.data : item));
    renderProjectRules();
    await loadProjects();
    elements.projectSettingsMessage.textContent = "Project rules saved.";
  } catch (error) {
    elements.projectSettingsMessage.textContent = error.message;
  }
}

async function enterFolder(id, name, reset = false) {
  if (reset) state.folderStack = [];
  state.folderStack.push({ id, name });
  persistFolderLocation();
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
  expandFolderAncestors(id);
  persistFolderLocation();
  await loadFolder();
}

async function loadFolder({ skipTreeReload = false } = {}) {
  const current = state.folderStack[state.folderStack.length - 1];
  if (!current) return;
  elements.folderName.textContent = current.name;
  renderBreadcrumbs();
  elements.backFolderButton.disabled = state.folderStack.length <= 1;
  elements.createFolderButton.disabled = false;
  elements.uploadButton.disabled = false;
  const { data } = await api(`/api/accounts/${state.currentAccountId}/folders/${current.id}/children`);
  state.assets = data.sort(assetSort);
  persistFolderLocation();
  if (skipTreeReload) renderFolderTree();
  else await loadFolderTree();
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
  const currentMonthId = currentMonthFolderId();
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
    const isCurrentMonth = folder.id === currentMonthId;
    const isExpanded = isRoot || isCurrentMonth || state.folderTreeExpanded.has(folder.id);
    const count = (folder.folder_count || 0) + (folder.file_count || 0);
    return `<div class="folderTreeNode" style="--depth:${depth}">
      <button class="folderTreeItem ${isActive ? "active" : ""} ${isRoot ? "rootItem" : ""}" type="button" data-folder-id="${escapeHtml(folder.id)}" title="${escapeHtml(folder.name)}">
        <span class="folderTreeChevron" data-folder-toggle="${escapeHtml(folder.id)}" aria-hidden="true">${children.length ? (isExpanded ? "v" : "&gt;") : ""}</span>
        <span class="folderTreeIcon" aria-hidden="true">${folderTreeIcon()}</span>
        <span class="folderTreeName">${escapeHtml(isRoot ? state.currentProject.name : folder.name)}</span>
        ${isActive ? `<span class="folderTreeCheck" aria-hidden="true">&#10003;</span>` : ""}
        ${count ? `<span class="folderTreeCount">${count}</span>` : ""}
      </button>
      ${children.length && isExpanded ? `<div class="folderTreeChildren">${children.map((child) => renderNode(child, depth + 1)).join("")}</div>` : ""}
    </div>`;
  };
  elements.folderTree.innerHTML = roots.map((folder) => renderNode(folder)).join("") || `<p class="folderTreeEmpty">No folders yet</p>`;
}

function getFolderDescendantIds(folderId, folders = state.folderTree) {
  const descendantIds = new Set([folderId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders) {
      if (folder.parent_id && descendantIds.has(folder.parent_id) && !descendantIds.has(folder.id)) {
        descendantIds.add(folder.id);
        changed = true;
      }
    }
  }
  return descendantIds;
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

function canDeleteAsset(asset) {
  if (state.user?.role === "admin" || asset.type === "folder") return true;
  return String(asset.owner || "").toLowerCase() === String(state.user?.email || "").toLowerCase();
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
    const imagePreview = kind === "image" ? `/api/accounts/${state.currentAccountId}/files/${asset.id}/preview` : "";
    const thumbSrc = asset.thumbnail || imagePreview;
    const thumb = thumbSrc ? `<img src="${thumbSrc}" alt="">${hoverVideo}` : `<span class="assetIcon assetIcon-${kind}">${assetIcon(kind)}</span>${hoverVideo}`;
    const deleteButton = canDeleteAsset(asset) ? `<button class="deleteAsset iconMiniButton deleteFolderButton" type="button" aria-label="Delete ${escapeHtml(asset.name)}" title="Delete"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M6 7l1 14h10l1-14"/><path d="M9 7V4h6v3"/></svg></button>` : "";
    return `<article class="assetCard assetCard-${kind}" data-id="${escapeHtml(asset.id)}" data-type="${asset.type}" draggable="true">
      <button class="assetOpen" type="button" title="${escapeHtml(asset.name)}" draggable="true">
        <div class="assetThumb assetThumb-${kind}">${thumb}</div>
        <div class="assetInfo"><strong>${escapeHtml(asset.name)}</strong><span>${escapeHtml(meta)}</span></div>
        <span class="assetKindPill assetKindPill-${kind}">${escapeHtml(kind)}</span>
      </button>
      <div class="assetCardActions">
        <button class="renameAsset iconMiniButton" type="button" aria-label="Rename ${escapeHtml(asset.name)}" title="Rename"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 20 8-8-4-4-8 8-1 5z"/><path d="m14 6 4 4"/><path d="M5 20h14"/></svg></button>
        ${deleteButton}
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
  const canManageAsset = !asset || canDeleteAsset(asset);
  const items = asset
    ? [
        contextMenuItem("open", folder ? "Open folder" : "Open preview"),
        ...(folder ? [contextMenuItem("uploadHere", "Upload into folder")] : []),
        ...(!folder && canManageAsset ? [
          contextMenuItem("moveFile", "Move to folder"),
          contextMenuItem("moveToArchive", "Move to Archive"),
          contextMenuItem("copyToArchive", "Copy to Archive"),
          contextMenuItem("archiveFootage", "Archive footage"),
        ] : []),
        contextMenuItem("rename", "Rename"),
        ...(canManageAsset ? [contextMenuItem("delete", "Delete")] : []),
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
  if (action === "moveFile") return moveFile(asset);
  if (action === "moveToArchive") return moveFile(asset, { archive: true });
  if (action === "copyToArchive") return copyFile(asset, { archive: true });
  if (action === "archiveFootage") return archiveFootage(asset);
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

async function projectFolders(project) {
  const { data } = await api(`/api/accounts/${state.currentAccountId}/projects/${project.id}/folders`);
  return data.sort(assetSort);
}

function folderPickerLabel(folder, folders, project) {
  if (folder.id === project.root_folder_id) return project.name;
  const byId = new Map(folders.map((item) => [item.id, item]));
  const names = [folder.name];
  let current = byId.get(folder.parent_id);
  while (current && current.id !== project.root_folder_id) {
    names.unshift(current.name);
    current = byId.get(current.parent_id);
  }
  return names.join(" / ");
}

function destinationFolderPath(project, folder, folders) {
  return folderPickerLabel(folder, folders, project);
}

function destinationMatches(project, folder, folders, query) {
  if (!query) return true;
  const haystack = `${project.name} ${destinationFolderPath(project, folder, folders)} ${folder.name}`.toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function descendantFolders(folder, byParent) {
  const children = byParent.get(folder.id) || [];
  return children.flatMap((child) => [child, ...descendantFolders(child, byParent)]);
}

function folderHasVisibleDescendant(project, folder, folders, byParent, query) {
  if (!query) return true;
  if (destinationMatches(project, folder, folders, query)) return true;
  return descendantFolders(folder, byParent).some((child) => destinationMatches(project, child, folders, query));
}

function renderDestinationPicker() {
  const picker = state.destinationPicker;
  if (!picker) return;
  const query = elements.destinationSearchInput.value.trim();
  elements.destinationEyebrow.textContent = picker.mode === "copy" ? "Copy" : "Move";
  elements.destinationTitle.textContent = `${picker.mode === "copy" ? "Copy" : "Move"} "${picker.asset.name}"`;
  elements.destinationProjectList.innerHTML = picker.projects.map((project) => {
    const folders = picker.foldersByProject.get(project.id) || [];
    const count = query ? folders.filter((folder) => destinationMatches(project, folder, folders, query)).length : folders.length;
    const active = project.id === picker.selectedProjectId;
    return `<button class="${active ? "active" : ""}" type="button" data-project-id="${escapeHtml(project.id)}">
      <strong>${escapeHtml(project.name)}</strong>
      <span>${count} folder${count === 1 ? "" : "s"}</span>
    </button>`;
  }).join("");

  const project = picker.projects.find((item) => item.id === picker.selectedProjectId) || picker.projects[0];
  const folders = picker.foldersByProject.get(project?.id) || [];
  const byParent = new Map();
  for (const folder of folders) {
    const parent = folder.parent_id || "root";
    if (!byParent.has(parent)) byParent.set(parent, []);
    byParent.get(parent).push(folder);
  }
  const renderNode = (folder, depth = 0) => {
    if (!folderHasVisibleDescendant(project, folder, folders, byParent, query)) return "";
    const children = (byParent.get(folder.id) || []).sort(assetSort);
    const expanded = query || picker.expanded.has(folder.id) || folder.id === project.root_folder_id;
    const selected = folder.id === picker.selectedFolderId;
    const path = destinationFolderPath(project, folder, folders);
    return `<div class="destinationTreeNode" style="--depth:${depth}">
      <button class="destinationFolderRow ${selected ? "selected" : ""}" type="button" data-folder-id="${escapeHtml(folder.id)}" title="${escapeHtml(path)}">
        <span class="destinationFolderToggle" data-toggle-folder="${escapeHtml(folder.id)}">${children.length ? (expanded ? "v" : ">") : ""}</span>
        <span class="destinationFolderIcon" aria-hidden="true">${folderTreeIcon()}</span>
        <span class="destinationFolderName">${escapeHtml(folder.id === project.root_folder_id ? project.name : folder.name)}</span>
        <small>${escapeHtml(path)}</small>
      </button>
      ${children.length && expanded ? `<div class="destinationTreeChildren">${children.map((child) => renderNode(child, depth + 1)).join("")}</div>` : ""}
    </div>`;
  };
  const roots = (byParent.get("root") || folders.filter((folder) => folder.id === project?.root_folder_id)).sort(assetSort);
  elements.destinationTree.innerHTML = roots.map((folder) => renderNode(folder)).join("") || `<p class="destinationEmpty">No matching folders.</p>`;
  const selectedProject = picker.projects.find((item) => item.id === picker.selectedProjectId);
  const selectedFolders = picker.foldersByProject.get(picker.selectedProjectId) || [];
  const selectedFolder = selectedFolders.find((folder) => folder.id === picker.selectedFolderId);
  elements.destinationPath.textContent = selectedProject && selectedFolder ? destinationFolderPath(selectedProject, selectedFolder, selectedFolders) : "Select a folder";
  elements.destinationConfirmButton.disabled = !selectedFolder;
}

async function chooseProjectFolder({ initialProject = null, mode = "move", asset }) {
  const projects = state.projects.length ? state.projects : (await api(`/api/accounts/${state.currentAccountId}/workspaces/${state.currentWorkspaceId}/projects`)).data;
  const foldersByProject = new Map();
  await Promise.all(projects.map(async (project) => {
    foldersByProject.set(project.id, await projectFolders(project));
  }));
  return new Promise((resolve) => {
    const selectedProject = initialProject || projects.find((project) => project.id === state.currentProject?.id) || projects[0];
    state.destinationPicker = {
      asset,
      mode,
      projects,
      foldersByProject,
      selectedProjectId: selectedProject?.id || "",
      selectedFolderId: selectedProject?.root_folder_id || "",
      expanded: new Set([selectedProject?.root_folder_id].filter(Boolean)),
      resolve,
    };
    elements.destinationSearchInput.value = "";
    elements.destinationModal.hidden = false;
    document.body.classList.add("destinationModalOpen");
    renderDestinationPicker();
    elements.destinationSearchInput.focus();
  });
}

function closeDestinationPicker(value = null) {
  const picker = state.destinationPicker;
  if (!picker) return;
  state.destinationPicker = null;
  elements.destinationModal.hidden = true;
  document.body.classList.remove("destinationModalOpen");
  picker.resolve(value);
}

function selectedDestination() {
  const picker = state.destinationPicker;
  if (!picker) return null;
  const project = picker.projects.find((item) => item.id === picker.selectedProjectId);
  const folders = picker.foldersByProject.get(project?.id) || [];
  const folder = folders.find((item) => item.id === picker.selectedFolderId);
  return project && folder ? { project, folder, path: destinationFolderPath(project, folder, folders) } : null;
}

function archiveProject() {
  return state.projects.find((project) => project.system === "archive" || project.name === "Archive");
}

async function moveFile(asset, { archive = false } = {}) {
  if (asset.type !== "file") return;
  const targetProject = archive ? archiveProject() : state.currentProject;
  if (!targetProject) return setAlert("Target project was not found.");
  const destination = await chooseProjectFolder({ initialProject: targetProject, mode: "move", asset });
  if (!destination) return;
  await api(`/api/accounts/${state.currentAccountId}/files/${asset.id}/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folderId: destination.folder.id }),
  });
  if (state.selectedAsset?.id === asset.id) state.selectedAsset = { ...state.selectedAsset, parent_id: destination.folder.id, project_id: destination.project.id };
  await loadFolder();
  setAlert(`Moved "${asset.name}" to ${destination.path}.`);
}

async function moveAssetToFolder(asset, targetFolderId) {
  if (!asset || !targetFolderId) return;
  if (asset.type === "folder") {
    if (asset.id === targetFolderId || getFolderDescendantIds(asset.id).has(targetFolderId)) {
      setAlert("A folder cannot be moved inside itself.");
      return;
    }
    if (asset.parent_id === targetFolderId) return;
    await api(`/api/accounts/${state.currentAccountId}/folders/${asset.id}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId: targetFolderId }),
    });
  } else {
    if (asset.parent_id === targetFolderId) return;
    await api(`/api/accounts/${state.currentAccountId}/files/${asset.id}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId: targetFolderId }),
    });
  }
  if (state.selectedAsset?.id === asset.id && asset.type !== "folder") {
    state.selectedAsset = { ...state.selectedAsset, parent_id: targetFolderId };
  }
  await loadFolder();
  setAlert(`Moved "${asset.name}" into the selected folder.`);
}

async function copyFile(asset, { archive = false } = {}) {
  if (asset.type !== "file") return;
  const targetProject = archive ? archiveProject() : state.currentProject;
  if (!targetProject) return setAlert("Target project was not found.");
  const destination = await chooseProjectFolder({ initialProject: targetProject, mode: "copy", asset });
  if (!destination) return;
  await api(`/api/accounts/${state.currentAccountId}/files/${asset.id}/copy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folderId: destination.folder.id }),
  });
  await loadFolder();
  setAlert(`Copied "${asset.name}" to ${destination.path}.`);
}

function promptArchiveMetadata(asset) {
  const today = new Date().toISOString().slice(0, 10);
  const event = prompt("Archive story/event folder name", asset.name.replace(/\.[^.]+$/, ""));
  if (!event?.trim()) return null;
  const date = prompt("Date of footage (YYYY-MM-DD)", today);
  if (date === null) return null;
  const country = prompt("Country", "");
  if (country === null) return null;
  const regionCity = prompt("Region / City", "");
  if (regionCity === null) return null;
  const peopleFeatured = prompt("People featured", "");
  if (peopleFeatured === null) return null;
  const organizations = prompt("Organizations", "");
  if (organizations === null) return null;
  const keywords = prompt("Keywords / topics", "");
  if (keywords === null) return null;
  const source = prompt("Source", "");
  if (source === null) return null;
  const rightsLicenseStatus = prompt("Rights / License status", "");
  if (rightsLicenseStatus === null) return null;
  const notes = prompt("Notes", "");
  if (notes === null) return null;
  const year = (date && /^\d{4}/.test(date)) ? date.slice(0, 4) : String(new Date().getFullYear());
  return { event, date, country, regionCity, peopleFeatured, organizations, keywords, topic: keywords, source, rightsLicenseStatus, notes, year };
}

async function archiveFootage(asset) {
  if (asset.type !== "file") return;
  const archive = archiveProject();
  if (!archive) return setAlert("Archive project was not found.");
  const metadata = promptArchiveMetadata(asset);
  if (!metadata) return;
  const { data, folder } = await api(`/api/accounts/${state.currentAccountId}/files/${asset.id}/archive`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ metadata }),
  });
  await loadFolder();
  setAlert(`Archived "${data.name}" to ${archive.name} / ${folder.name}.`);
}

async function deleteAsset(asset) {
  if (!confirm(`Delete "${asset.name}"?`)) return;
  const archivePassword = asset.archive_protected
    ? prompt("This item is in a protected project. Enter the project delete password.")
    : "";
  if (asset.archive_protected && !archivePassword) return;
  const url = asset.type === "folder" ? `/api/accounts/${state.currentAccountId}/folders/${asset.id}` : `/api/accounts/${state.currentAccountId}/files/${asset.id}`;
  await api(url, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ archivePassword }),
  });
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
  const uploadItems = files.map((file, index) => ({
    id: `upload-${Date.now()}-${index}`,
    name: file.name,
    size: file.size,
    status: "Waiting",
    progress: 0,
  }));
  renderUploadQueue(uploadItems);
  try {
    for (const [index, file] of files.entries()) {
      state.activeUploadProgressId = uploadItems[index].id;
      uploadItems[index].status = "Uploading";
      uploadItems[index].progress = 0;
      renderUploadQueue(uploadItems);
      elements.progressLabel.textContent = files.length > 1 ? `File ${index + 1} of ${files.length}` : "Preparing";
      const data = file.size >= 100 * 1024 * 1024 ? await uploadMultipartFile(folderId, file) : await uploadSingleFile(folderId, file);
      uploadItems[index].status = "Processing preview";
      uploadItems[index].progress = 100;
      renderUploadQueue(uploadItems);
      await uploadVideoThumbnail(data.id, file).catch(() => {});
      uploadItems[index].status = "Uploaded";
      renderUploadQueue(uploadItems);
    }
    elements.progressLabel.textContent = files.length > 1 ? "All uploaded" : "Uploaded";
    elements.fileInput.value = "";
    updateSelectedFileName();
    await loadFolder();
  } catch (error) {
    setAlert(error.message);
    elements.progressLabel.textContent = "Failed";
    const activeItem = uploadItems.find((item) => item.id === state.activeUploadProgressId);
    if (activeItem) {
      activeItem.status = "Failed";
      renderUploadQueue(uploadItems);
    }
  } finally {
    state.activeUploadProgressId = "";
    elements.uploadButton.disabled = false;
    setTimeout(() => {
      elements.progressBar.value = 0;
      elements.progressPercent.textContent = "0%";
      elements.progressLabel.textContent = "Ready";
      elements.uploadQueue.innerHTML = "";
    }, 1500);
  }
}

function renderUploadQueue(items = []) {
  elements.uploadQueue.innerHTML = items.map((item) => `
    <article class="uploadQueueItem ${item.status === "Failed" ? "failed" : ""} ${item.status === "Uploaded" ? "done" : ""}" data-upload-id="${escapeHtml(item.id)}">
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <span>${escapeHtml(formatBytes(item.size))} - ${escapeHtml(item.status)}</span>
      </div>
      <div class="uploadQueueProgress" aria-label="Upload progress">
        <span style="width:${Math.max(0, Math.min(100, Number(item.progress) || 0))}%"></span>
      </div>
      <b>${Math.round(Math.max(0, Math.min(100, Number(item.progress) || 0)))}%</b>
    </article>
  `).join("");
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
  if (state.activeUploadProgressId) {
    const item = Array.from(elements.uploadQueue.querySelectorAll(".uploadQueueItem")).find((row) => row.dataset.uploadId === state.activeUploadProgressId);
    if (item) {
      item.querySelector(".uploadQueueProgress span").style.width = `${pct}%`;
      item.querySelector("b").textContent = `${pct}%`;
    }
  }
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
  persistFolderLocation();
  loadFolder();
}

function handleFolderTreeClick(event) {
  const toggle = event.target.closest("[data-folder-toggle]");
  if (toggle) {
    event.stopPropagation();
    const folderId = toggle.dataset.folderToggle;
    if (folderId === state.currentProject?.root_folder_id || folderId === currentMonthFolderId()) return;
    if (state.folderTreeExpanded.has(folderId)) state.folderTreeExpanded.delete(folderId);
    else state.folderTreeExpanded.add(folderId);
    renderFolderTree();
    return;
  }
  const button = event.target.closest("button[data-folder-id]");
  if (!button) return;
  goToFolder(button.dataset.folderId);
}

function handleDestinationProjectClick(event) {
  const button = event.target.closest("button[data-project-id]");
  const picker = state.destinationPicker;
  if (!button || !picker) return;
  const project = picker.projects.find((item) => item.id === button.dataset.projectId);
  if (!project) return;
  picker.selectedProjectId = project.id;
  picker.selectedFolderId = project.root_folder_id;
  picker.expanded.add(project.root_folder_id);
  renderDestinationPicker();
}

function handleDestinationTreeClick(event) {
  const picker = state.destinationPicker;
  if (!picker) return;
  const toggle = event.target.closest("[data-toggle-folder]");
  if (toggle) {
    event.stopPropagation();
    const folderId = toggle.dataset.toggleFolder;
    if (picker.expanded.has(folderId)) picker.expanded.delete(folderId);
    else picker.expanded.add(folderId);
    renderDestinationPicker();
    return;
  }
  const button = event.target.closest("button[data-folder-id]");
  if (!button) return;
  picker.selectedFolderId = button.dataset.folderId;
  picker.expanded.add(button.dataset.folderId);
  renderDestinationPicker();
}

function confirmDestinationPicker() {
  const destination = selectedDestination();
  if (!destination) return;
  closeDestinationPicker(destination);
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
    if (!event.dataTransfer?.files?.length || state.draggedAsset || event.dataTransfer?.types?.includes("application/x-amargi-asset-id")) return;
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
  elements.folderList.addEventListener("dragstart", handleAssetDragStart);
  elements.folderList.addEventListener("dragend", handleAssetDragEnd);
  elements.folderList.addEventListener("dragover", (event) => {
    const appAsset = draggedAppAsset(event);
    const folderCard = event.target.closest(".assetCard[data-type=\"folder\"]");
    elements.folderList.querySelectorAll(".isDropTarget").forEach((card) => {
      if (card !== folderCard) card.classList.remove("isDropTarget");
    });
    if (folderCard && event.dataTransfer?.types?.includes("Files")) folderCard.classList.add("isDropTarget");
    if (folderCard && appAsset && validAssetDropTarget(appAsset, folderCard.dataset.id)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      folderCard.classList.add("isDropTarget");
    }
  });
  elements.folderList.addEventListener("dragleave", (event) => {
    event.target.closest(".assetCard")?.classList.remove("isDropTarget");
  });
  elements.folderList.addEventListener("drop", async (event) => {
    const folderCard = event.target.closest(".assetCard[data-type=\"folder\"]");
    const appAsset = draggedAppAsset(event);
    if (!folderCard || !appAsset || !validAssetDropTarget(appAsset, folderCard.dataset.id)) return;
    event.preventDefault();
    event.stopPropagation();
    clearAssetDropTargets();
    try {
      await moveAssetToFolder(appAsset, folderCard.dataset.id);
    } catch (error) {
      setAlert(error.message);
    } finally {
      state.draggedAsset = null;
    }
  }, true);
  elements.folderTree.addEventListener("dragover", (event) => {
    const appAsset = draggedAppAsset(event);
    const row = event.target.closest(".folderTreeItem[data-folder-id]");
    elements.folderTree.querySelectorAll(".isDropTarget").forEach((item) => {
      if (item !== row) item.classList.remove("isDropTarget");
    });
    if (!row || !appAsset || !validAssetDropTarget(appAsset, row.dataset.folderId)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    row.classList.add("isDropTarget");
  });
  elements.folderTree.addEventListener("dragleave", (event) => {
    event.target.closest(".folderTreeItem")?.classList.remove("isDropTarget");
  });
  elements.folderTree.addEventListener("drop", async (event) => {
    const row = event.target.closest(".folderTreeItem[data-folder-id]");
    const appAsset = draggedAppAsset(event);
    clearAssetDropTargets();
    if (!row || !appAsset || !validAssetDropTarget(appAsset, row.dataset.folderId)) return;
    event.preventDefault();
    try {
      await moveAssetToFolder(appAsset, row.dataset.folderId);
    } catch (error) {
      setAlert(error.message);
    } finally {
      state.draggedAsset = null;
    }
  });
}

function handleAssetDragStart(event) {
  if (event.target.closest(".assetCardActions, .assetCardActions button")) {
    event.preventDefault();
    return;
  }
  const card = event.target.closest(".assetCard[data-id]");
  const asset = state.assets.find((item) => item.id === card?.dataset.id);
  if (!card || !asset) return;
  state.draggedAsset = asset;
  card.classList.add("isDraggingAsset");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("application/x-amargi-asset-id", asset.id);
  event.dataTransfer.setData("application/x-amargi-asset-type", asset.type);
  event.dataTransfer.setData("text/plain", asset.name || "Asset");
}

function handleAssetDragEnd() {
  state.draggedAsset = null;
  clearAssetDropTargets();
}

function draggedAppAsset(event) {
  const id = event.dataTransfer?.getData("application/x-amargi-asset-id") || state.draggedAsset?.id || "";
  return state.assets.find((asset) => asset.id === id) || state.draggedAsset;
}

function validAssetDropTarget(asset, folderId) {
  if (!asset || !folderId) return false;
  if (asset.type !== "folder") return asset.parent_id !== folderId;
  return asset.id !== folderId && asset.parent_id !== folderId && !getFolderDescendantIds(asset.id).has(folderId);
}

function clearAssetDropTargets() {
  elements.folderList.querySelectorAll(".isDropTarget, .isDraggingAsset").forEach((card) => {
    card.classList.remove("isDropTarget", "isDraggingAsset");
  });
  elements.folderTree?.querySelectorAll(".isDropTarget").forEach((item) => item.classList.remove("isDropTarget"));
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
  const kind = assetKind(asset);
  document.body.classList.add("reviewMode");
  document.body.classList.remove("isPlayingVideo");
  elements.emptyState.hidden = true;
  elements.detailView.hidden = false;
  elements.assetTitle.textContent = asset.name;
  elements.reviewProjectTitle.textContent = state.currentProject?.name || "Project";
  elements.reviewFileTitle.textContent = asset.name;
  elements.assetMeta.textContent = `${asset.mimetype || "file"} - ${formatBytes(asset.filesize || asset.size)}`;
  elements.deleteButton.hidden = !canDeleteAsset(asset);
  renderTags(asset);
  elements.videoPlayer.pause();
  elements.videoPlayer.removeAttribute("src");
  elements.videoPlayer.load();
  elements.videoFallback.textContent = "No playable preview URL was returned for this file.";
  elements.videoPlayer.hidden = kind !== "video";
  elements.centerPlayButton.hidden = kind !== "video";
  elements.playbackQualitySelect.hidden = kind !== "video";
  elements.playPauseButton.disabled = kind !== "video";
  elements.seekBar.disabled = kind !== "video";
  elements.imagePreview.hidden = kind !== "image";
  elements.imagePreview.removeAttribute("src");
  if (kind === "video") {
    const playbackUrl = `/api/accounts/${state.currentAccountId}/files/${asset.id}/playback?quality=${elements.playbackQualitySelect.value}`;
    elements.videoPlayer.src = playbackUrl;
    elements.videoFallback.hidden = false;
    elements.videoPlayer.load();
  } else if (kind === "image") {
    elements.imagePreview.onload = () => { elements.videoFallback.hidden = true; };
    elements.imagePreview.onerror = () => {
      elements.imagePreview.hidden = true;
      elements.videoFallback.textContent = "Image preview could not be loaded. Use the download options below.";
      elements.videoFallback.hidden = false;
    };
    elements.imagePreview.src = `/api/accounts/${state.currentAccountId}/files/${asset.id}/preview`;
    elements.videoFallback.hidden = true;
    elements.currentTimeLabel.textContent = "00:00";
    elements.durationLabel.textContent = "Image";
    elements.seekBar.value = 0;
  } else {
    elements.videoFallback.textContent = "Preview is not available for this file type. Use the download options below.";
    elements.videoFallback.hidden = false;
  }
  await Promise.all([loadDownloads(asset), loadComments(asset), loadWorkflow(asset)]);
}

function renderTags(asset = state.selectedAsset) {
  const isVideoAsset = asset && assetKind(asset) === "video";
  elements.tagEditor.hidden = !isVideoAsset;
  if (!isVideoAsset) return;
  const tags = Array.isArray(asset.tags) ? asset.tags : [];
  elements.tagList.innerHTML = tags.map((tag) => `
    <span class="tagPill">${escapeHtml(tag)}<button type="button" data-tag="${escapeHtml(tag)}" aria-label="Remove ${escapeHtml(tag)}">&times;</button></span>
  `).join("") || `<span class="tagEmpty">No tags yet</span>`;
}

async function saveTags(tags) {
  if (!state.selectedAsset) return;
  const { data } = await api(`/api/accounts/${state.currentAccountId}/files/${state.selectedAsset.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tags }),
  });
  state.selectedAsset = { ...state.selectedAsset, ...data };
  state.assets = state.assets.map((asset) => (asset.id === data.id ? { ...asset, ...data } : asset));
  renderTags(state.selectedAsset);
  renderAssets();
}

async function addTag(event) {
  event.preventDefault();
  const tag = elements.tagInput.value.trim();
  if (!tag || !state.selectedAsset) return;
  const tags = Array.from(new Set([...(state.selectedAsset.tags || []), tag]));
  elements.tagInput.value = "";
  await saveTags(tags);
}

async function removeTag(event) {
  const button = event.target.closest("[data-tag]");
  if (!button || !state.selectedAsset) return;
  await saveTags((state.selectedAsset.tags || []).filter((tag) => tag !== button.dataset.tag));
}

function closeReview() {
  state.selectedAsset = null;
  document.body.classList.remove("reviewMode");
  document.body.classList.remove("isPlayingVideo");
  elements.videoPlayer.pause();
  elements.videoPlayer.removeAttribute("src");
  elements.videoPlayer.load();
  elements.videoPlayer.hidden = false;
  elements.imagePreview.hidden = true;
  elements.imagePreview.removeAttribute("src");
  elements.centerPlayButton.hidden = false;
  elements.playbackQualitySelect.hidden = false;
  elements.playPauseButton.disabled = false;
  elements.seekBar.disabled = false;
  elements.detailView.hidden = true;
  elements.emptyState.hidden = false;
}

async function loadDownloads(asset) {
  elements.downloadButton.disabled = true;
  elements.downloadButton.textContent = "Loading...";
  elements.downloadMenu.hidden = true;
  elements.downloadMenu.innerHTML = "";
  renderDownloadPanel([], "Loading download options...");
  try {
    const { data } = await api(`/api/accounts/${state.currentAccountId}/files/${asset.id}/downloads`);
    const items = Array.isArray(data) ? data : [];
    const markup = items.map(downloadOptionMarkup).join("");
    elements.downloadMenu.innerHTML = markup;
    renderDownloadPanel(items);
    elements.downloadButton.disabled = !items.length;
    elements.downloadButton.textContent = `Download options (${items.length})`;
    elements.downloadMenu.hidden = false;
  } catch (error) {
    elements.downloadButton.textContent = "Downloads unavailable";
    renderDownloadPanel([], error.message || "Download options could not be loaded.");
  }
}

function downloadOptionMarkup(item) {
  return `
    <button class="downloadMenuItem ${item.pending || !item.url ? "pending" : ""}" type="button" data-url="${escapeHtml(item.url || "")}" ${item.pending || !item.url ? "disabled" : ""}>
      <strong>${escapeHtml(item.label)}</strong>
      <span>${escapeHtml(item.detail || "")}</span>
    </button>
  `;
}

function renderDownloadPanel(items = [], emptyText = "No download options are available yet.") {
  if (!elements.downloadPanel) return;
  const options = elements.downloadPanel.querySelector(".downloadPanelOptions");
  if (!options) return;
  if (!items.length) {
    options.innerHTML = `<span class="downloadPanelEmpty">${escapeHtml(emptyText)}</span>`;
    return;
  }
  options.innerHTML = items.map(downloadOptionMarkup).join("");
}

function toggleDownloadMenu(force) {
  const shouldOpen = typeof force === "boolean" ? force : elements.downloadMenu.hidden;
  elements.downloadMenu.hidden = !shouldOpen;
}

function handleDownloadMenuClick(event) {
  const item = event.target.closest(".downloadMenuItem");
  if (!item || item.disabled || !item.dataset.url) return;
  toggleDownloadMenu(false);
  location.href = item.dataset.url;
}

async function loadWorkflow(asset) {
  const { data } = await api(`/api/files/${asset.id}/workflow`);
  const selectedEmails = new Set(data.assigneeEmails || (data.assigneeEmail ? [data.assigneeEmail] : []));
  Array.from(elements.assigneeSelect.options).forEach((option) => {
    option.selected = selectedEmails.has(option.value);
  });
  elements.statusSelect.value = data.status || "work_in_progress";
  updateWorkflowAppearance();
}

async function saveWorkflow() {
  if (!state.selectedAsset) return;
  const assigneeEmails = Array.from(elements.assigneeSelect.selectedOptions).map((option) => option.value).filter(Boolean);
  await api(`/api/files/${state.selectedAsset.id}/workflow`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assigneeEmails, status: elements.statusSelect.value }),
  });
  updateWorkflowAppearance();
}

function updateWorkflowAppearance() {
  const status = elements.statusSelect.value || "work_in_progress";
  const assigned = Array.from(elements.assigneeSelect.selectedOptions).some((option) => option.value);
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

function sortedComments(comments = state.comments) {
  return [...comments].sort((a, b) => {
    const timeA = Number(a.timestamp) || 0;
    const timeB = Number(b.timestamp) || 0;
    if (timeA !== timeB) return timeA - timeB;
    const createdA = Date.parse(a.created_at || a.createdAt || "") || 0;
    const createdB = Date.parse(b.created_at || b.createdAt || "") || 0;
    return createdA - createdB;
  });
}

function renderComments() {
  const rows = sortedComments().filter((comment) => {
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
    const initials = initialsFor(owner);
    return `<article class="commentItem ${meta.resolved ? "resolved" : ""}" data-id="${escapeHtml(comment.id)}" data-time="${Number(comment.timestamp) || 0}">
      <span class="commentAvatar" aria-hidden="true">${escapeHtml(initials)}</span>
      <button class="commentJump" type="button">
        <strong>${escapeHtml(owner)} <em>Just now</em></strong>
        <small>#${index + 1}</small>
        <span class="commentBodyLine"><span class="commentTimecode">${formatTime(comment.timestamp)}</span><span class="commentText">${escapeHtml(text)}</span></span>
      </button>
      <div class="commentActions">
        <button class="commentReplyButton ghostButton" type="button" title="Reply" aria-label="Reply">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 17-5-5 5-5"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
        </button>
        <button class="commentEdit ghostButton" type="button" title="Edit" aria-label="Edit">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
        </button>
        <button class="commentResolve ghostButton" type="button" title="${meta.resolved ? "Reopen" : "Solved"}" aria-label="${meta.resolved ? "Reopen" : "Solved"}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m20 6-11 11-5-5"/></svg>
        </button>
        <button class="commentDelete ghostButton" type="button" title="Delete" aria-label="Delete">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
        </button>
      </div>
      ${replies}
    </article>`;
  }).join("") || `<p class="muted">No comments yet.</p>`;
}

function renderCommentMarkers() {
  const duration = elements.videoPlayer.duration || 0;
  elements.commentMarkers.innerHTML = "";
  if (!duration) return;
  for (const comment of sortedComments()) {
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
  const text = elements.commentInput.value.trim();
  if (!state.selectedAsset || !text || state.commentPosting) return;
  const asset = state.selectedAsset;
  const timestamp = elements.videoPlayer.currentTime || 0;
  state.commentPosting = true;
  elements.commentButton.disabled = true;
  elements.commentButton.textContent = "Posting...";
  elements.commentInput.value = "";
  state.activeMention = null;
  renderMentionList([]);
  updateMentionHint();
  try {
    await api(`/api/accounts/${state.currentAccountId}/files/${asset.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, timestamp }),
    });
    await loadComments(asset);
    await loadNotifications().catch(() => {});
  } catch (error) {
    elements.commentInput.value = text;
    updateMentionHint();
    setAlert(error.message);
  } finally {
    state.commentPosting = false;
    elements.commentButton.disabled = false;
    elements.commentButton.textContent = "Post";
  }
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
  } else if (event.target.closest(".commentDelete")) {
    if (!confirm("Delete this comment?")) return;
    await api(`/api/accounts/${state.currentAccountId}/files/${state.selectedAsset.id}/comments/${id}`, { method: "DELETE" });
    await loadComments(state.selectedAsset);
    return;
  } else return;
  const { data } = await api(`/api/files/${state.selectedAsset.id}/comment-meta/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  state.commentMeta[id] = data;
  renderComments();
}

function handleMentionListClick(event) {
  const option = event.target.closest(".mentionOption");
  if (!option) return;
  const user = state.users.find((item) => item.id === option.dataset.userId);
  insertMention(user);
}

function handleMentionKeydown(event) {
  if (elements.mentionList.hidden) return;
  const matches = mentionMatches(state.activeMention?.query || "");
  if (!matches.length) return;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    state.mentionIndex = (state.mentionIndex + 1) % matches.length;
    renderMentionList(matches);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    state.mentionIndex = (state.mentionIndex - 1 + matches.length) % matches.length;
    renderMentionList(matches);
  } else if (event.key === "Enter" || event.key === "Tab") {
    event.preventDefault();
    insertMention(matches[state.mentionIndex]);
  } else if (event.key === "Escape") {
    state.activeMention = null;
    renderMentionList([]);
  }
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
elements.notificationsButton.addEventListener("click", () => toggleNotifications());
elements.closeNotificationsButton.addEventListener("click", () => toggleNotifications(false));
elements.notificationsList.addEventListener("click", handleNotificationClick);
elements.settingsButton.addEventListener("click", () => {
  elements.sidebar.classList.toggle("open");
  elements.settingsButton.setAttribute("aria-expanded", String(elements.sidebar.classList.contains("open")));
});
elements.closeSettingsButton.addEventListener("click", () => {
  elements.sidebar.classList.remove("open");
  elements.settingsButton.setAttribute("aria-expanded", "false");
});
elements.settingsNav.addEventListener("click", (event) => {
  const button = event.target.closest(".settingsNavButton");
  if (!button) return;
  showSettingsSection(button.dataset.settingsSection);
});
elements.profileForm.addEventListener("submit", updateProfile);
elements.profileAvatarInput.addEventListener("change", previewProfileAvatar);
elements.apiSettingsForm.addEventListener("submit", saveApiSettings);
elements.adminUserForm.addEventListener("submit", createUser);
elements.adminUsersList.addEventListener("click", handleAdminMemberAction);
elements.adminUsersList.addEventListener("change", handleAdminMemberAction);
elements.adminNotifyForm.addEventListener("submit", sendMemberNotification);
elements.passwordForm.addEventListener("submit", updatePassword);
elements.accountSelect.addEventListener("change", async () => { state.currentAccountId = elements.accountSelect.value; await loadWorkspaces(); });
elements.workspaceSelect.addEventListener("change", async () => { state.currentWorkspaceId = elements.workspaceSelect.value; await loadProjects(); });
elements.projectSelect.addEventListener("change", async () => {
  state.currentProject = state.projects.find((project) => project.id === elements.projectSelect.value);
  localStorage.setItem("mediaflow_project", state.currentProject?.id || "");
  if (state.currentProject) {
    elements.workspaceTitle.textContent = state.currentProject.name;
    await enterDefaultProjectFolder();
  }
});
elements.refreshButton.addEventListener("click", loadFolder);
elements.createFolderButton.addEventListener("click", createFolder);
elements.sidebarCreateFolderButton.addEventListener("click", createFolder);
elements.backFolderButton.addEventListener("click", async () => { if (state.folderStack.length > 1) state.folderStack.pop(); await loadFolder(); });
elements.folderBreadcrumbs.addEventListener("click", handleFolderBreadcrumbClick);
elements.folderTree.addEventListener("click", handleFolderTreeClick);
elements.destinationProjectList.addEventListener("click", handleDestinationProjectClick);
elements.destinationTree.addEventListener("click", handleDestinationTreeClick);
elements.destinationSearchInput.addEventListener("input", renderDestinationPicker);
elements.destinationConfirmButton.addEventListener("click", confirmDestinationPicker);
elements.destinationCloseButton.addEventListener("click", () => closeDestinationPicker(null));
elements.destinationCancelButton.addEventListener("click", () => closeDestinationPicker(null));
elements.destinationModal.addEventListener("click", (event) => {
  if (event.target === elements.destinationModal) closeDestinationPicker(null);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.destinationPicker) closeDestinationPicker(null);
});
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
elements.downloadButton.addEventListener("click", () => toggleDownloadMenu());
elements.downloadMenu.addEventListener("click", handleDownloadMenuClick);
elements.downloadPanel?.addEventListener("click", handleDownloadMenuClick);
document.addEventListener("click", (event) => {
  if (!event.target.closest(".downloadControl")) toggleDownloadMenu(false);
});
elements.assigneeSelect.addEventListener("change", () => { updateWorkflowAppearance(); saveWorkflow(); });
elements.statusSelect.addEventListener("change", () => { updateWorkflowAppearance(); saveWorkflow(); });
elements.openFrameButton.addEventListener("click", shareSelectedAsset);
elements.renameButton.addEventListener("click", () => state.selectedAsset && renameAsset(state.selectedAsset));
elements.deleteButton.addEventListener("click", () => state.selectedAsset && deleteAsset(state.selectedAsset));
elements.commentForm.addEventListener("submit", addComment);
elements.commentInput.addEventListener("input", updateMentionHint);
elements.commentInput.addEventListener("keydown", handleMentionKeydown);
elements.commentInput.addEventListener("blur", () => setTimeout(() => renderMentionList([]), 120));
elements.mentionList.addEventListener("mousedown", (event) => event.preventDefault());
elements.mentionList.addEventListener("click", handleMentionListClick);
elements.commentsList.addEventListener("click", handleCommentAction);
elements.tagForm.addEventListener("submit", addTag);
elements.tagList.addEventListener("click", removeTag);
elements.projectForm.addEventListener("submit", createProject);
elements.projectRulesList.addEventListener("click", saveProjectRules);
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
setInterval(() => {
  if (state.user) loadNotifications().catch(() => {});
}, 60000);
