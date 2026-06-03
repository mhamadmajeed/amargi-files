require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const crypto = require("crypto");
const fs = require("fs/promises");
const http = require("http");
const https = require("https");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const express = require("express");
const selfsigned = require("selfsigned");
const nodemailer = require("nodemailer");
let ffmpegInstaller = null;
try {
  ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
} catch {
  ffmpegInstaller = null;
}
const { list, put } = require("@vercel/blob");
const {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const app = express();
const port = Number(process.env.PORT || 4174);
const httpsPort = Number(process.env.HTTPS_PORT || 4175);
const isProduction = process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
const DATA_DIR = process.env.DATA_DIR || (isProduction ? path.join(os.tmpdir(), "amargi-files-data") : path.join(__dirname, ".data"));
const PUBLIC_DIR = path.join(__dirname, "public");
const USERS_PATH = path.join(DATA_DIR, "users.json");
const MEDIA_DB_PATH = path.join(DATA_DIR, "media-db.json");
const SETTINGS_PATH = path.join(DATA_DIR, "app-settings.json");
const WORKFLOWS_PATH = path.join(DATA_DIR, "file-workflows.json");
const COMMENT_META_PATH = path.join(DATA_DIR, "comment-meta.json");
const NOTIFICATIONS_PATH = path.join(DATA_DIR, "notifications.json");
const ACTIVITY_LOG_PATH = path.join(DATA_DIR, "activity-log.json");
const INTERNAL_ACCOUNT_ID = "mediaflow-account";
const INTERNAL_WORKSPACE_ID = "mediaflow-workspace";
const DEFAULT_PROJECT_ID = "project_uploads";
const DEFAULT_ROOT_FOLDER_ID = "folder_root";
const WORKFLOW_STATUSES = new Set(["work_in_progress", "rejected", "approved", "published"]);
const ACTIVITY_RETENTION_DAYS = 60;

let appSettings = {};
let appSettingsLoaded = false;
let r2ClientCache = null;
let r2ClientKey = "";

app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(PUBLIC_DIR));

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function blobEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function readBlobJson(name, fallback) {
  if (!blobEnabled()) return fallback;
  const result = await list({ prefix: `mediaflow/${name}`, limit: 1 });
  const blob = result.blobs.find((item) => item.pathname === `mediaflow/${name}`);
  if (!blob) return fallback;
  const response = await fetch(blob.url);
  if (!response.ok) return fallback;
  return response.json();
}

async function writeBlobJson(name, value) {
  if (!blobEnabled()) return;
  await put(`mediaflow/${name}`, JSON.stringify(value, null, 2), {
    access: "public",
    allowOverwrite: true,
    contentType: "application/json",
  });
}

async function readJson(filePath, fallback, blobName) {
  if (blobName && hasR2Config()) {
    const r2Value = await readR2Json(blobName, null).catch(() => null);
    if (r2Value) return r2Value;
  }
  if (blobName) {
    const blobValue = await readBlobJson(blobName, null).catch(() => null);
    if (blobValue) return blobValue;
  }
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return fallback;
  }
}

async function writeJson(filePath, value, blobName) {
  if (blobName && hasR2Config()) {
    await writeR2Json(blobName, value);
    if (isProduction) return;
  }
  await ensureDataDir();
  await fs.writeFile(filePath, JSON.stringify(value, null, 2));
  if (blobName) await writeBlobJson(blobName, value).catch(() => {});
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(String(password), salt, 310000, 32, "sha256").toString("hex");
  return { salt, hash };
}

function verifyHashRecord(password, record) {
  if (!record) return false;
  const salt = record.salt || record.passwordSalt;
  const expected = record.hash || record.passwordHash;
  if (!salt || !expected) return false;
  const actual = hashPassword(password, salt).hash;
  return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

function verifyPassword(password, user) {
  return verifyHashRecord(password, user);
}

function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name, role: user.role || "member", createdAt: user.createdAt };
}

async function readUsers() {
  const data = await readJson(USERS_PATH, { users: [] }, "users.json");
  if (!Array.isArray(data.users)) data.users = [];
  if (!data.users.some((user) => normalizeEmail(user.email) === "m.zahawy5@gmail.com")) {
    const password = hashPassword("12345678");
    data.users.push({
      id: crypto.randomUUID(),
      email: "m.zahawy5@gmail.com",
      name: "Main Admin",
      passwordSalt: password.salt,
      passwordHash: password.hash,
      role: "admin",
      createdAt: new Date().toISOString(),
    });
    await writeUsers(data.users);
  }
  return data.users;
}

async function writeUsers(users) {
  await writeJson(USERS_PATH, { users }, "users.json");
}

function defaultMediaDb() {
  const createdAt = new Date().toISOString();
  return {
    version: 1,
    projects: [{ id: DEFAULT_PROJECT_ID, name: "Uploads", root_folder_id: DEFAULT_ROOT_FOLDER_ID, createdAt }],
    folders: [{ id: DEFAULT_ROOT_FOLDER_ID, projectId: DEFAULT_PROJECT_ID, parentId: null, name: "Uploads root", createdAt }],
    files: [],
    comments: {},
    shares: [],
  };
}

async function readMediaDb() {
  const db = await readJson(MEDIA_DB_PATH, defaultMediaDb(), "media-db.json");
  db.projects ||= [];
  db.folders ||= [];
  db.files ||= [];
  db.comments ||= {};
  db.shares ||= [];
  if (!db.projects.length) db.projects.push(defaultMediaDb().projects[0]);
  if (!db.folders.length) db.folders.push(defaultMediaDb().folders[0]);
  return db;
}

async function writeMediaDb(db) {
  await writeJson(MEDIA_DB_PATH, db, "media-db.json");
}

async function readWorkflows() {
  return readJson(WORKFLOWS_PATH, {}, "file-workflows.json");
}

async function writeWorkflows(workflows) {
  await writeJson(WORKFLOWS_PATH, workflows, "file-workflows.json");
}

async function readCommentMeta() {
  return readJson(COMMENT_META_PATH, {}, "comment-meta.json");
}

async function writeCommentMeta(meta) {
  await writeJson(COMMENT_META_PATH, meta, "comment-meta.json");
}

async function loadAppSettings() {
  if (appSettingsLoaded) return appSettings;
  const data = await readJson(SETTINGS_PATH, { settings: {} }, "app-settings.json");
  appSettings = data.settings || {};
  appSettingsLoaded = true;
  return appSettings;
}

async function writeAppSettings(settings) {
  const clean = { ...settings };
  for (const key of Object.keys(clean)) {
    if (/^frame/i.test(key)) delete clean[key];
  }
  appSettings = clean;
  r2ClientCache = null;
  await writeJson(SETTINGS_PATH, { settings: clean }, "app-settings.json");
}

function activityCutoffTime() {
  return Date.now() - ACTIVITY_RETENTION_DAYS * 24 * 60 * 60 * 1000;
}

function pruneActivityEntries(entries) {
  const cutoff = activityCutoffTime();
  return entries.filter((entry) => {
    const time = Date.parse(entry.createdAt);
    return Number.isFinite(time) && time >= cutoff;
  });
}

async function readActivityLog() {
  const data = await readJson(ACTIVITY_LOG_PATH, { entries: [] }, "activity-log.json");
  return pruneActivityEntries(Array.isArray(data.entries) ? data.entries : []);
}

async function writeActivityLog(entries) {
  await writeJson(ACTIVITY_LOG_PATH, { entries: pruneActivityEntries(entries) }, "activity-log.json");
}

function getSetting(key) {
  return appSettings[key] || process.env[key] || "";
}

function getEnvSetting(key) {
  return process.env[key] || "";
}

function maskSecret(value) {
  if (!value) return "";
  const text = String(value);
  return text.length <= 8 ? "••••" : `${text.slice(0, 4)}••••${text.slice(-4)}`;
}

function isEnabled(value) {
  return value === true || String(value).toLowerCase() === "true";
}

function parseCookies(header = "") {
  return Object.fromEntries(
    String(header)
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

function signSession(user) {
  const payload = Buffer.from(JSON.stringify({ email: user.email, role: user.role || "member", ts: Date.now() })).toString("base64url");
  const sig = crypto.createHmac("sha256", process.env.APP_SESSION_SECRET || "mediaflow-local-secret").update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function verifySession(token) {
  if (!token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", process.env.APP_SESSION_SECRET || "mediaflow-local-secret").update(payload).digest("base64url");
  if (sig !== expected) return null;
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

async function requireAppSession(request, response, next) {
  try {
    await loadAppSettings();
    const cookies = parseCookies(request.headers.cookie);
    const session = verifySession(cookies.mediaflow_session);
    if (!session) {
      response.status(401).json({ error: "Sign in required." });
      return;
    }
    const users = await readUsers();
    const user = users.find((item) => normalizeEmail(item.email) === normalizeEmail(session.email));
    if (!user) {
      response.status(401).json({ error: "User no longer exists." });
      return;
    }
    request.appUser = publicUser(user);
    next();
  } catch (error) {
    next(error);
  }
}

function requireAdminSession(request, response, next) {
  requireAppSession(request, response, (error) => {
    if (error) return next(error);
    if (request.appUser?.role !== "admin") {
      response.status(403).json({ error: "Admin access required." });
      return;
    }
    next();
  });
}

function cookieOptions() {
  return `HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000${isProduction || isEnabled(process.env.APP_SECURE_COOKIES) ? "; Secure" : ""}`;
}

function getR2Config() {
  const accountId = getEnvSetting("R2_ACCOUNT_ID") || getEnvSetting("CLOUDFLARE_ACCOUNT_ID");
  return {
    accountId,
    bucket: getEnvSetting("R2_BUCKET"),
    accessKeyId: getEnvSetting("R2_ACCESS_KEY_ID"),
    secretAccessKey: getEnvSetting("R2_SECRET_ACCESS_KEY"),
    endpoint: getEnvSetting("R2_ENDPOINT") || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : ""),
  };
}

function hasR2Config() {
  const config = getR2Config();
  return Boolean(config.bucket && config.accessKeyId && config.secretAccessKey && config.endpoint);
}

function getR2Client() {
  const config = getR2Config();
  if (!hasR2Config()) {
    const error = new Error("Cloudflare R2 is not configured.");
    error.status = 503;
    throw error;
  }
  const cacheKey = `${config.endpoint}:${config.accessKeyId}`;
  if (r2ClientCache && r2ClientKey === cacheKey) return r2ClientCache;
  r2ClientKey = cacheKey;
  r2ClientCache = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  return r2ClientCache;
}

async function signedPutUrl(key, contentType) {
  const config = getR2Config();
  return getSignedUrl(getR2Client(), new PutObjectCommand({ Bucket: config.bucket, Key: key, ContentType: contentType }), { expiresIn: 60 * 60 });
}

async function createMultipartUpload(key, contentType) {
  const config = getR2Config();
  const result = await getR2Client().send(
    new CreateMultipartUploadCommand({
      Bucket: config.bucket,
      Key: key,
      ContentType: contentType,
    }),
  );
  return result.UploadId;
}

async function signedUploadPartUrl(key, uploadId, partNumber) {
  const config = getR2Config();
  return getSignedUrl(
    getR2Client(),
    new UploadPartCommand({
      Bucket: config.bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    }),
    { expiresIn: 60 * 60 * 6 },
  );
}

async function completeMultipartUpload(key, uploadId, parts) {
  const config = getR2Config();
  return getR2Client().send(
    new CompleteMultipartUploadCommand({
      Bucket: config.bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts.map((part) => ({ ETag: part.ETag || part.etag, PartNumber: Number(part.PartNumber || part.partNumber) })),
      },
    }),
  );
}

async function abortMultipartUpload(key, uploadId) {
  if (!key || !uploadId || !hasR2Config()) return;
  const config = getR2Config();
  await getR2Client()
    .send(new AbortMultipartUploadCommand({ Bucket: config.bucket, Key: key, UploadId: uploadId }))
    .catch(() => {});
}

async function configureBucketCors(origin) {
  const config = getR2Config();
  const allowedOrigins = Array.from(
    new Set([
      origin,
      "https://amargi-files.vercel.app",
      "http://localhost:4174",
      "https://localhost:4175",
    ].filter(Boolean)),
  );
  await getR2Client().send(
    new PutBucketCorsCommand({
      Bucket: config.bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedHeaders: ["*"],
            AllowedMethods: ["GET", "HEAD", "PUT"],
            AllowedOrigins: allowedOrigins,
            ExposeHeaders: ["ETag", "etag"],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  );
}

async function signedGetUrl(key, contentDisposition = "", expiresIn = 60 * 30) {
  const config = getR2Config();
  const command = new GetObjectCommand({ Bucket: config.bucket, Key: key, ResponseContentDisposition: contentDisposition || undefined });
  return getSignedUrl(getR2Client(), command, { expiresIn });
}

async function uploadFileToR2(key, filePath, contentType) {
  const config = getR2Config();
  const body = await fs.readFile(filePath);
  await getR2Client().send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: body, ContentType: contentType }));
}

async function deleteObject(key) {
  if (!key || !hasR2Config()) return;
  const config = getR2Config();
  await getR2Client().send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key })).catch(() => {});
}

async function objectExists(key) {
  if (!key || !hasR2Config()) return false;
  const config = getR2Config();
  try {
    await getR2Client().send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

function metadataKey(name) {
  return storageKey("mediaflow-metadata", name);
}

async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function readR2Json(name, fallback) {
  if (!hasR2Config()) return fallback;
  const config = getR2Config();
  try {
    const result = await getR2Client().send(new GetObjectCommand({ Bucket: config.bucket, Key: metadataKey(name) }));
    return JSON.parse(await streamToString(result.Body));
  } catch (error) {
    if (error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404) return fallback;
    throw error;
  }
}

async function writeR2Json(name, value) {
  if (!hasR2Config()) return;
  const config = getR2Config();
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: metadataKey(name),
      Body: JSON.stringify(value, null, 2),
      ContentType: "application/json",
    }),
  );
}

function extensionFor(name) {
  return path.extname(String(name || "")).toLowerCase() || "";
}

function storageKey(...parts) {
  return parts.map((part) => String(part).replace(/^\/+|\/+$/g, "").replace(/[^a-zA-Z0-9._/-]+/g, "-")).join("/");
}

function isVideo(file) {
  return String(file.mimeType || file.type || "").startsWith("video/") || /\.(mp4|mov|m4v|webm)$/i.test(file.name || "");
}

const VIDEO_RENDITIONS = [
  { quality: "1080", label: "1080p", maxWidth: 1920, crf: "23" },
  { quality: "720", label: "720p", maxWidth: 1280, crf: "24" },
  { quality: "480", label: "480p", maxWidth: 854, crf: "26" },
];

function fileBaseName(name = "video") {
  return String(name || "video").replace(/\.[^.]+$/, "").replaceAll('"', "'");
}

function formatBytes(bytes = 0) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function fileRenditionEntries(file) {
  const renditions = file.renditions || {};
  return VIDEO_RENDITIONS.map((rendition) => ({ ...rendition, key: renditions[rendition.quality]?.key })).filter((item) => item.key);
}

function fileStorageKeys(file) {
  return [file.r2Key, file.proxyKey, file.thumbnailKey, ...fileRenditionEntries(file).map((item) => item.key)];
}

function toApiFolder(folder) {
  return { id: folder.id, name: folder.name, type: "folder", project_id: folder.projectId, parent_id: folder.parentId, created_at: folder.createdAt };
}

function toApiFile(file) {
  return {
    id: file.id,
    name: file.name,
    type: "file",
    filetype: file.mimeType,
    mimetype: file.mimeType,
    filesize: file.size,
    size: file.size,
    duration: file.duration,
    project_id: file.projectId,
    parent_id: file.folderId,
    status: file.status,
    proxyStatus: file.proxyStatus,
    created_at: file.createdAt,
    updated_at: file.updatedAt,
    owner: file.ownerEmail,
    version: file.version || 1,
    thumbnail: file.thumbnailKey ? `/api/accounts/${INTERNAL_ACCOUNT_ID}/files/${file.id}/thumbnail` : "",
  };
}

function getProject(db, id) {
  const project = db.projects.find((item) => item.id === id);
  if (!project) {
    const error = new Error("Project not found.");
    error.status = 404;
    throw error;
  }
  return project;
}

function getFolder(db, id) {
  const folder = db.folders.find((item) => item.id === id);
  if (!folder) {
    const error = new Error("Folder not found.");
    error.status = 404;
    throw error;
  }
  return folder;
}

function getFileRecord(db, id) {
  const file = db.files.find((item) => item.id === id && !item.deletedAt);
  if (!file) {
    const error = new Error("File not found.");
    error.status = 404;
    throw error;
  }
  return file;
}

function assertProjectAccess(_user, _projectId) {
  return true;
}

async function generateVideoProxy(fileId) {
  const db = await readMediaDb();
  const file = getFileRecord(db, fileId);
  if (!isVideo(file) || !hasR2Config()) return;
  file.proxyStatus = "processing";
  await writeMediaDb(db);
  const tempDir = path.join(DATA_DIR, "tmp", file.id);
  await fs.mkdir(tempDir, { recursive: true });
  const inputUrl = await signedGetUrl(file.r2Key, "", 60 * 60);
  const thumbPath = path.join(tempDir, "thumb.jpg");
  const ffmpegPath = process.env.FFMPEG_PATH || ffmpegInstaller?.path;
  if (!ffmpegPath) throw new Error("FFmpeg is not available. Set FFMPEG_PATH to generate video proxies on this machine.");
  file.renditions ||= {};
  for (const rendition of VIDEO_RENDITIONS) {
    const outputPath = path.join(tempDir, `${rendition.quality}.mp4`);
    await new Promise((resolve, reject) => {
      const scale = `scale='min(${rendition.maxWidth},iw)':-2`;
      const child = spawn(ffmpegPath, ["-y", "-i", inputUrl, "-vf", scale, "-c:v", "libx264", "-preset", "veryfast", "-crf", rendition.crf, "-c:a", "aac", "-movflags", "+faststart", outputPath], { windowsHide: true });
      child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`FFmpeg ${rendition.label} proxy failed with code ${code}`))));
      child.on("error", reject);
    });
    const renditionKey = storageKey("projects", file.projectId, "files", file.id, `proxy-${rendition.quality}.mp4`);
    await uploadFileToR2(renditionKey, outputPath, "video/mp4");
    file.renditions[rendition.quality] = { key: renditionKey, label: rendition.label, maxWidth: rendition.maxWidth, contentType: "video/mp4" };
    if (rendition.quality === "1080") file.proxyKey = renditionKey;
  }
  await new Promise((resolve) => {
    const child = spawn(ffmpegPath, ["-y", "-ss", "00:00:01", "-i", inputUrl, "-frames:v", "1", "-q:v", "3", thumbPath], { windowsHide: true });
    child.on("close", () => resolve());
    child.on("error", () => resolve());
  });
  try {
    await fs.access(thumbPath);
    const thumbnailKey = storageKey("projects", file.projectId, "files", file.id, "thumb.jpg");
    await uploadFileToR2(thumbnailKey, thumbPath, "image/jpeg");
    file.thumbnailKey = thumbnailKey;
  } catch {}
  file.proxyStatus = "ready";
  file.updatedAt = new Date().toISOString();
  await writeMediaDb(db);
  await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
}

function workflowFor(fileId, workflows, users) {
  const workflow = workflows[fileId] || { assigneeEmail: "", status: "work_in_progress" };
  const assignee = users.find((user) => user.email === workflow.assigneeEmail);
  return { ...workflow, assigneeName: workflow.assigneeName || assignee?.name || "" };
}

function appOrigin(request) {
  const configured = process.env.APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || "";
  if (configured) return configured.startsWith("http") ? configured : `https://${configured}`;
  return `${request.protocol}://${request.get("host")}`;
}

function reviewUrl(request, fileId) {
  return `${appOrigin(request)}/?file=${encodeURIComponent(fileId)}`;
}

function humanStatus(status) {
  return String(status || "work_in_progress")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function commentTimestamp(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function mentionTokens(text) {
  return Array.from(new Set(String(text || "").match(/@([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|[A-Za-z][A-Za-z0-9._-]*)/g) || []))
    .map((token) => token.slice(1).toLowerCase());
}

function mentionedUsers(text, users, actorEmail) {
  const tokens = mentionTokens(text);
  const actor = normalizeEmail(actorEmail);
  return users.filter((user) => {
    const email = normalizeEmail(user.email);
    if (!email || email === actor) return false;
    const names = String(user.name || "")
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    return tokens.some((token) => token === email || token === email.split("@")[0] || names.includes(token));
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function actorFromRequest(request, fallback = {}) {
  const user = request?.appUser || fallback || {};
  const email = normalizeEmail(user.email);
  return {
    id: user.id || "",
    email,
    name: user.name || email || "Unknown user",
    role: user.role || "",
  };
}

function requestActivityContext(request) {
  return {
    ip: request?.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() || request?.ip || "",
    userAgent: request?.headers?.["user-agent"] || "",
  };
}

function compactDetails(details = {}) {
  return Object.fromEntries(
    Object.entries(details).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
}

async function recordActivity(request, action, target = {}, details = {}) {
  const entries = await readActivityLog();
  const entry = {
    id: crypto.randomUUID(),
    action,
    actor: actorFromRequest(request),
    target: compactDetails(target),
    details: compactDetails(details),
    context: requestActivityContext(request),
    createdAt: new Date().toISOString(),
  };
  entries.unshift(entry);
  await writeActivityLog(entries);
  return entry;
}

async function recordNotification(notification) {
  const data = await readJson(NOTIFICATIONS_PATH, [], "notifications.json");
  const item = { id: crypto.randomUUID(), ...notification, createdAt: new Date().toISOString() };
  data.unshift(item);
  await writeJson(NOTIFICATIONS_PATH, data.slice(0, 200), "notifications.json");
  const recipients = Array.from(new Set([
    ...String(notification.to || "").split(","),
    ...String(getSetting("NOTIFICATION_RECIPIENTS") || "").split(","),
  ].map((email) => normalizeEmail(email)).filter(Boolean)));
  if (getSetting("SMTP_HOST") && recipients.length) {
    const transporter = nodemailer.createTransport({
      host: getSetting("SMTP_HOST"),
      port: Number(getSetting("SMTP_PORT") || 587),
      secure: isEnabled(getSetting("SMTP_SECURE")),
      auth: getSetting("SMTP_USER") ? { user: getSetting("SMTP_USER"), pass: getSetting("SMTP_PASS") } : undefined,
    });
    await transporter.sendMail({
      from: getSetting("SMTP_FROM") || getSetting("SMTP_USER"),
      to: recipients.join(","),
      subject: notification.subject,
      text: notification.text,
    }).catch(() => {});
  }
  return item;
}

function notificationRecipients(notification) {
  return String(notification.to || "")
    .split(",")
    .map((email) => normalizeEmail(email))
    .filter(Boolean);
}

function notificationVisibleTo(notification, user) {
  const recipients = notificationRecipients(notification);
  if (!recipients.length) return user?.role === "admin";
  return recipients.includes(normalizeEmail(user?.email));
}

function toApiNotification(notification, user) {
  const email = normalizeEmail(user?.email);
  const readBy = notification.readBy || {};
  return {
    id: notification.id,
    type: notification.type || "activity",
    subject: notification.subject || "Notification",
    text: notification.text || "",
    fileName: notification.fileName || "",
    fileId: notification.fileId || "",
    url: notification.url || "",
    status: notification.status || "",
    actor: notification.actor || "",
    createdAt: notification.createdAt,
    readAt: readBy[email] || "",
    unread: !readBy[email],
  };
}

app.get("/auth/app/session", async (request, response, next) => {
  try {
    await loadAppSettings();
    const session = verifySession(parseCookies(request.headers.cookie).mediaflow_session);
    if (!session) {
      response.json({ authenticated: false });
      return;
    }
    const user = (await readUsers()).find((item) => normalizeEmail(item.email) === normalizeEmail(session.email));
    response.json({ authenticated: Boolean(user), user: user ? publicUser(user) : null });
  } catch (error) {
    next(error);
  }
});

app.post("/auth/app/login", async (request, response, next) => {
  try {
    await loadAppSettings();
    const email = normalizeEmail(request.body?.email);
    const users = await readUsers();
    const user = users.find((item) => normalizeEmail(item.email) === email);
    if (!user || !verifyPassword(request.body?.password, user)) {
      response.status(401).json({ error: "Invalid email or password." });
      return;
    }
    request.appUser = publicUser(user);
    await recordActivity(request, "auth.login", { type: "user", id: user.id, email: user.email, name: user.name });
    response.setHeader("Set-Cookie", `mediaflow_session=${signSession(user)}; ${cookieOptions()}`);
    response.json({ ok: true, user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

app.post("/auth/app/logout", requireAppSession, async (request, response, next) => {
  try {
    await recordActivity(request, "auth.logout", { type: "user", id: request.appUser.id, email: request.appUser.email, name: request.appUser.name });
  } catch (error) {
    next(error);
    return;
  }
  response.setHeader("Set-Cookie", "mediaflow_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
  response.json({ ok: true });
});

app.get("/api/admin/activity", requireAdminSession, async (request, response, next) => {
  try {
    const limit = Math.min(500, Math.max(1, Number(request.query.limit) || 100));
    const entries = await readActivityLog();
    response.json({ data: entries.slice(0, limit), retentionDays: ACTIVITY_RETENTION_DAYS });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/settings", requireAdminSession, async (_request, response, next) => {
  try {
    await loadAppSettings();
    response.json({
      data: {
        r2Configured: hasR2Config(),
        r2AccountId: getEnvSetting("R2_ACCOUNT_ID") || getEnvSetting("CLOUDFLARE_ACCOUNT_ID"),
        r2Bucket: getEnvSetting("R2_BUCKET"),
        r2Endpoint: getEnvSetting("R2_ENDPOINT"),
        r2AccessKeyId: { configured: Boolean(getEnvSetting("R2_ACCESS_KEY_ID")), masked: maskSecret(getEnvSetting("R2_ACCESS_KEY_ID")) },
        r2SecretAccessKey: { configured: Boolean(getEnvSetting("R2_SECRET_ACCESS_KEY")), masked: maskSecret(getEnvSetting("R2_SECRET_ACCESS_KEY")) },
        smtpHost: getSetting("SMTP_HOST"),
        smtpPort: getSetting("SMTP_PORT") || "587",
        smtpUser: getSetting("SMTP_USER"),
        smtpPass: { configured: Boolean(getSetting("SMTP_PASS")), masked: maskSecret(getSetting("SMTP_PASS")) },
        smtpFrom: getSetting("SMTP_FROM"),
        smtpSecure: isEnabled(getSetting("SMTP_SECURE")),
        notificationRecipients: getSetting("NOTIFICATION_RECIPIENTS"),
      },
    });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/admin/settings", requireAdminSession, async (request, response, next) => {
  try {
    await loadAppSettings();
    const nextSettings = { ...appSettings };
    const assignIfPresent = (key, value) => {
      if (value === undefined) return;
      const text = String(value).trim();
      if (text) nextSettings[key] = text;
    };
    assignIfPresent("SMTP_HOST", request.body?.smtpHost);
    assignIfPresent("SMTP_PORT", request.body?.smtpPort);
    assignIfPresent("SMTP_USER", request.body?.smtpUser);
    assignIfPresent("SMTP_PASS", request.body?.smtpPass);
    assignIfPresent("SMTP_FROM", request.body?.smtpFrom);
    assignIfPresent("NOTIFICATION_RECIPIENTS", request.body?.notificationRecipients);
    nextSettings.SMTP_SECURE = String(Boolean(request.body?.smtpSecure));
    await writeAppSettings(nextSettings);
    await recordActivity(request, "admin.settings_updated", { type: "settings", id: "admin-settings" }, {
      smtpHost: Boolean(request.body?.smtpHost),
      smtpPort: Boolean(request.body?.smtpPort),
      smtpUser: Boolean(request.body?.smtpUser),
      smtpPass: Boolean(request.body?.smtpPass),
      smtpFrom: Boolean(request.body?.smtpFrom),
      notificationRecipients: Boolean(request.body?.notificationRecipients),
      smtpSecure: Boolean(request.body?.smtpSecure),
    });
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/storage/cors", requireAdminSession, async (request, response, next) => {
  try {
    await configureBucketCors(request.headers.origin);
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/users", requireAdminSession, async (request, response, next) => {
  try {
    const email = normalizeEmail(request.body?.email);
    const password = String(request.body?.password || "");
    if (!email || password.length < 8) {
      response.status(400).json({ error: "Email and an 8+ character password are required." });
      return;
    }
    const users = await readUsers();
    if (users.some((user) => normalizeEmail(user.email) === email)) {
      response.status(409).json({ error: "A user with that email already exists." });
      return;
    }
    const passwordParts = hashPassword(password);
    const user = {
      id: crypto.randomUUID(),
      email,
      name: String(request.body?.name || email).trim(),
      passwordSalt: passwordParts.salt,
      passwordHash: passwordParts.hash,
      role: request.body?.role === "admin" ? "admin" : "member",
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    await writeUsers(users);
    await recordActivity(request, "admin.user_created", { type: "user", id: user.id, email: user.email, name: user.name }, { role: user.role });
    response.status(201).json({ data: publicUser(user), users: users.map(publicUser) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/users", requireAppSession, async (_request, response, next) => {
  try {
    const users = await readUsers();
    response.json({ data: users.map(publicUser) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/notifications", requireAppSession, async (request, response, next) => {
  try {
    const notifications = await readJson(NOTIFICATIONS_PATH, [], "notifications.json");
    const visible = notifications
      .filter((notification) => notificationVisibleTo(notification, request.appUser))
      .map((notification) => toApiNotification(notification, request.appUser));
    response.json({ data: visible, unreadCount: visible.filter((notification) => notification.unread).length });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/notifications/:notificationId/read", requireAppSession, async (request, response, next) => {
  try {
    const notifications = await readJson(NOTIFICATIONS_PATH, [], "notifications.json");
    const notification = notifications.find((item) => item.id === request.params.notificationId);
    if (!notification || !notificationVisibleTo(notification, request.appUser)) {
      response.status(404).json({ error: "Notification not found." });
      return;
    }
    notification.readBy ||= {};
    notification.readBy[normalizeEmail(request.appUser.email)] = new Date().toISOString();
    await writeJson(NOTIFICATIONS_PATH, notifications.slice(0, 200), "notifications.json");
    response.json({ data: toApiNotification(notification, request.appUser) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/notifications", requireAppSession, async (request, response, next) => {
  try {
    const { type, title, message, fileName, status } = request.body || {};
    const subject = title || `MediaFlow ${type || "notification"}`;
    const notification = await recordNotification({
      type: type || "activity",
      subject,
      text: message || subject,
      fileName: fileName || "",
      status: status || "",
      actor: request.appUser.email,
    });
    response.status(201).json({ data: notification });
  } catch (error) {
    next(error);
  }
});

app.use("/api", (request, response, next) => {
  if (request.path === "/session" || request.path.startsWith("/admin/")) {
    next();
    return;
  }
  requireAppSession(request, response, next);
});

app.get("/api/config", (_request, response) => {
  response.json({
    connected: hasR2Config(),
    authConfigured: false,
    serverToServerConfigured: false,
    redirectUri: "",
    tokenSource: hasR2Config() ? "r2" : null,
    storage: "cloudflare-r2",
  });
});

app.post("/auth/logout", requireAppSession, async (request, response, next) => {
  try {
    await recordActivity(request, "auth.logout", { type: "user", id: request.appUser.id, email: request.appUser.email, name: request.appUser.name });
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.patch("/auth/app/password", requireAppSession, async (request, response, next) => {
  try {
    const { currentPassword, newPassword } = request.body || {};
    const users = await readUsers();
    const user = users.find((item) => item.email === request.appUser.email);
    if (!user || !verifyPassword(currentPassword, user)) {
      response.status(401).json({ error: "Current password is incorrect." });
      return;
    }
    if (!newPassword || String(newPassword).length < 8) {
      response.status(400).json({ error: "New password must be at least 8 characters." });
      return;
    }
    const passwordParts = hashPassword(newPassword);
    user.passwordSalt = passwordParts.salt;
    user.passwordHash = passwordParts.hash;
    user.passwordUpdatedAt = new Date().toISOString();
    await writeUsers(users);
    await recordActivity(request, "account.password_updated", { type: "user", id: user.id, email: user.email, name: user.name });
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/accounts", async (_request, response) => {
  response.json({ data: [{ id: INTERNAL_ACCOUNT_ID, name: "MediaFlow Storage" }] });
});

app.get("/api/accounts/:accountId/workspaces", async (_request, response) => {
  response.json({ data: [{ id: INTERNAL_WORKSPACE_ID, name: "Review Workspace" }] });
});

app.get("/api/accounts/:accountId/workspaces/:workspaceId/projects", async (request, response, next) => {
  try {
    const db = await readMediaDb();
    response.json({ data: db.projects.map((project) => ({ ...project, root_folder_id: project.root_folder_id })) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/accounts/:accountId/projects/:projectId/folders", async (request, response, next) => {
  try {
    const db = await readMediaDb();
    const project = getProject(db, request.params.projectId);
    assertProjectAccess(request.appUser, project.id);
    const folders = db.folders
      .filter((folder) => folder.projectId === project.id)
      .map((folder) => {
        const fileCount = db.files.filter((file) => file.folderId === folder.id && !file.deletedAt).length;
        const childFolderCount = db.folders.filter((child) => child.parentId === folder.id).length;
        return { ...toApiFolder(folder), file_count: fileCount, folder_count: childFolderCount };
      });
    response.json({ data: folders });
  } catch (error) {
    next(error);
  }
});

app.get("/api/accounts/:accountId/folders/:folderId/children", async (request, response, next) => {
  try {
    const db = await readMediaDb();
    const folder = getFolder(db, request.params.folderId);
    assertProjectAccess(request.appUser, folder.projectId);
    const folders = db.folders.filter((item) => item.parentId === folder.id).map(toApiFolder);
    const files = db.files.filter((item) => item.folderId === folder.id && !item.deletedAt).map(toApiFile);
    response.json({ data: [...folders, ...files] });
  } catch (error) {
    next(error);
  }
});

app.post("/api/accounts/:accountId/folders/:folderId/folders", async (request, response, next) => {
  try {
    const name = String(request.body?.name || "").trim();
    if (!name) {
      response.status(400).json({ error: "folder name is required" });
      return;
    }
    const db = await readMediaDb();
    const parent = getFolder(db, request.params.folderId);
    assertProjectAccess(request.appUser, parent.projectId);
    const folder = { id: crypto.randomUUID(), projectId: parent.projectId, parentId: parent.id, name, createdAt: new Date().toISOString() };
    db.folders.push(folder);
    await writeMediaDb(db);
    await recordActivity(request, "folder.created", { type: "folder", id: folder.id, name: folder.name, projectId: folder.projectId, parentId: folder.parentId });
    response.status(201).json({ data: toApiFolder(folder) });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/accounts/:accountId/folders/:folderId", async (request, response, next) => {
  try {
    const name = String(request.body?.name || "").trim();
    if (!name) {
      response.status(400).json({ error: "folder name is required" });
      return;
    }
    const db = await readMediaDb();
    const folder = getFolder(db, request.params.folderId);
    assertProjectAccess(request.appUser, folder.projectId);
    const previousName = folder.name;
    folder.name = name;
    folder.updatedAt = new Date().toISOString();
    await writeMediaDb(db);
    await recordActivity(request, "folder.renamed", { type: "folder", id: folder.id, name: folder.name, projectId: folder.projectId, parentId: folder.parentId }, { previousName, newName: folder.name });
    response.json({ data: toApiFolder(folder) });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/accounts/:accountId/folders/:folderId", async (request, response, next) => {
  try {
    const db = await readMediaDb();
    const folder = getFolder(db, request.params.folderId);
    assertProjectAccess(request.appUser, folder.projectId);
    const project = getProject(db, folder.projectId);
    if (project.root_folder_id === folder.id) {
      response.status(400).json({ error: "Cannot delete the project root folder." });
      return;
    }
    const descendantIds = new Set([folder.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const item of db.folders) {
        if (item.parentId && descendantIds.has(item.parentId) && !descendantIds.has(item.id)) {
          descendantIds.add(item.id);
          changed = true;
        }
      }
    }
    const filesToDelete = db.files.filter((file) => descendantIds.has(file.folderId));
    const deletedFolderCount = descendantIds.size;
    const deletedFileCount = filesToDelete.length;
    for (const file of filesToDelete) {
      file.deletedAt = new Date().toISOString();
      await Promise.all(fileStorageKeys(file).map((key) => deleteObject(key)));
    }
    db.folders = db.folders.filter((item) => !descendantIds.has(item.id));
    await writeMediaDb(db);
    await recordActivity(request, "folder.deleted", { type: "folder", id: folder.id, name: folder.name, projectId: folder.projectId, parentId: folder.parentId }, { deletedFolderCount, deletedFileCount });
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/accounts/:accountId/folders/:folderId/files/local-upload", async (request, response, next) => {
  try {
    const { name, fileSize, contentType } = request.body || {};
    if (!name || !Number.isFinite(Number(fileSize)) || Number(fileSize) <= 0) {
      response.status(400).json({ error: "name and positive fileSize are required" });
      return;
    }
    const db = await readMediaDb();
    const folder = getFolder(db, request.params.folderId);
    assertProjectAccess(request.appUser, folder.projectId);
    const id = crypto.randomUUID();
    const mimeType = contentType || "application/octet-stream";
    const key = storageKey("projects", folder.projectId, "files", id, "original" + extensionFor(name));
    const uploadUrl = await signedPutUrl(key, mimeType);
    const file = {
      id,
      projectId: folder.projectId,
      folderId: folder.id,
      name: String(name),
      size: Number(fileSize),
      mimeType,
      duration: null,
      status: "uploading",
      ownerEmail: request.appUser.email,
      createdAt: new Date().toISOString(),
      r2Key: key,
      proxyStatus: isVideo({ name, mimeType }) ? "pending" : "not_applicable",
      version: 1,
      versions: [],
    };
    db.files.push(file);
    await writeMediaDb(db);
    await recordActivity(request, "file.upload_started", { type: "file", id: file.id, name: file.name, projectId: file.projectId, folderId: file.folderId }, { size: file.size, mimeType: file.mimeType, uploadType: "single" });
    response.status(201).json({
      data: {
        ...toApiFile(file),
        upload_urls: [{ url: uploadUrl, size: Number(fileSize) }],
      },
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/accounts/:accountId/folders/:folderId/files/multipart-upload", async (request, response, next) => {
  try {
    const { name, fileSize, contentType, partCount } = request.body || {};
    const normalizedPartCount = Number(partCount);
    if (!name || !Number.isFinite(Number(fileSize)) || Number(fileSize) <= 0 || !Number.isInteger(normalizedPartCount) || normalizedPartCount < 1) {
      response.status(400).json({ error: "name, positive fileSize, and partCount are required" });
      return;
    }
    if (normalizedPartCount > 10000) {
      response.status(400).json({ error: "Too many upload parts. Use a larger part size." });
      return;
    }
    const db = await readMediaDb();
    const folder = getFolder(db, request.params.folderId);
    assertProjectAccess(request.appUser, folder.projectId);
    const id = crypto.randomUUID();
    const mimeType = contentType || "application/octet-stream";
    const key = storageKey("projects", folder.projectId, "files", id, "original" + extensionFor(name));
    const uploadId = await createMultipartUpload(key, mimeType);
    const urls = [];
    for (let partNumber = 1; partNumber <= normalizedPartCount; partNumber += 1) {
      urls.push({ partNumber, url: await signedUploadPartUrl(key, uploadId, partNumber) });
    }
    const file = {
      id,
      projectId: folder.projectId,
      folderId: folder.id,
      name: String(name),
      size: Number(fileSize),
      mimeType,
      duration: null,
      status: "uploading",
      uploadType: "multipart",
      multipartUploadId: uploadId,
      ownerEmail: request.appUser.email,
      createdAt: new Date().toISOString(),
      r2Key: key,
      proxyStatus: isVideo({ name, mimeType }) ? "pending" : "not_applicable",
      version: 1,
      versions: [],
    };
    db.files.push(file);
    await writeMediaDb(db);
    await recordActivity(request, "file.upload_started", { type: "file", id: file.id, name: file.name, projectId: file.projectId, folderId: file.folderId }, { size: file.size, mimeType: file.mimeType, uploadType: "multipart", partCount: normalizedPartCount });
    response.status(201).json({ data: { ...toApiFile(file), uploadId, partUrls: urls } });
  } catch (error) {
    next(error);
  }
});

app.post("/api/files/:fileId/multipart/complete", async (request, response, next) => {
  try {
    const parts = Array.isArray(request.body?.parts) ? request.body.parts : [];
    if (!parts.length) {
      response.status(400).json({ error: "Uploaded part metadata is required." });
      return;
    }
    const db = await readMediaDb();
    const file = getFileRecord(db, request.params.fileId);
    assertProjectAccess(request.appUser, file.projectId);
    if (!file.multipartUploadId) {
      response.status(400).json({ error: "This file is not a multipart upload." });
      return;
    }
    await completeMultipartUpload(file.r2Key, file.multipartUploadId, parts);
    delete file.multipartUploadId;
    file.status = "ready";
    file.mimeType = request.body?.contentType || file.mimeType;
    file.updatedAt = new Date().toISOString();
    await writeMediaDb(db);
    await recordActivity(request, "file.upload_completed", { type: "file", id: file.id, name: file.name, projectId: file.projectId, folderId: file.folderId }, { size: file.size, mimeType: file.mimeType, uploadType: "multipart" });
    if (isVideo(file)) generateVideoProxy(file.id).catch(() => {});
    response.json({ data: toApiFile(file) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/files/:fileId/multipart/abort", async (request, response, next) => {
  try {
    const db = await readMediaDb();
    const file = getFileRecord(db, request.params.fileId);
    assertProjectAccess(request.appUser, file.projectId);
    await abortMultipartUpload(file.r2Key, file.multipartUploadId);
    file.deletedAt = new Date().toISOString();
    file.status = "canceled";
    await writeMediaDb(db);
    await recordActivity(request, "file.upload_aborted", { type: "file", id: file.id, name: file.name, projectId: file.projectId, folderId: file.folderId }, { uploadType: "multipart" });
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/files/:fileId/complete", async (request, response, next) => {
  try {
    const db = await readMediaDb();
    const file = getFileRecord(db, request.params.fileId);
    assertProjectAccess(request.appUser, file.projectId);
    if (!(await objectExists(file.r2Key))) {
      response.status(409).json({ error: "Uploaded object was not found in R2 yet." });
      return;
    }
    file.status = "ready";
    file.mimeType = request.body?.contentType || file.mimeType;
    file.updatedAt = new Date().toISOString();
    await writeMediaDb(db);
    await recordActivity(request, "file.upload_completed", { type: "file", id: file.id, name: file.name, projectId: file.projectId, folderId: file.folderId }, { size: file.size, mimeType: file.mimeType, uploadType: "single" });
    if (isVideo(file)) generateVideoProxy(file.id).catch(() => {});
    response.json({ data: toApiFile(file) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/files/:fileId/thumbnail-upload", async (request, response, next) => {
  try {
    const { contentType } = request.body || {};
    const mimeType = contentType || "image/jpeg";
    const db = await readMediaDb();
    const file = getFileRecord(db, request.params.fileId);
    assertProjectAccess(request.appUser, file.projectId);
    const thumbnailKey = storageKey("projects", file.projectId, "files", file.id, "thumb.jpg");
    file.thumbnailKey = thumbnailKey;
    file.updatedAt = new Date().toISOString();
    await writeMediaDb(db);
    await recordActivity(request, "file.thumbnail_updated", { type: "file", id: file.id, name: file.name, projectId: file.projectId, folderId: file.folderId });
    response.json({ data: { uploadUrl: await signedPutUrl(thumbnailKey, mimeType), thumbnail: toApiFile(file).thumbnail } });
  } catch (error) {
    next(error);
  }
});

app.get("/api/accounts/:accountId/files/:fileId", async (request, response, next) => {
  try {
    const db = await readMediaDb();
    const file = getFileRecord(db, request.params.fileId);
    assertProjectAccess(request.appUser, file.projectId);
    response.json({ data: toApiFile(file) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/accounts/:accountId/files/:fileId/thumbnail", async (request, response, next) => {
  try {
    const db = await readMediaDb();
    const file = getFileRecord(db, request.params.fileId);
    assertProjectAccess(request.appUser, file.projectId);
    if (!file.thumbnailKey) {
      const fallbackThumbnailKey = storageKey("projects", file.projectId, "files", file.id, "thumb.jpg");
      if (await objectExists(fallbackThumbnailKey)) {
        file.thumbnailKey = fallbackThumbnailKey;
        file.updatedAt = new Date().toISOString();
        await writeMediaDb(db);
      }
    }
    if (!file.thumbnailKey) {
      response.status(404).send("Thumbnail is not ready.");
      return;
    }
    response.redirect(302, await signedGetUrl(file.thumbnailKey, "", 60 * 30));
  } catch (error) {
    next(error);
  }
});

app.get("/api/accounts/:accountId/files/:fileId/playback", async (request, response, next) => {
  try {
    const db = await readMediaDb();
    const file = getFileRecord(db, request.params.fileId);
    assertProjectAccess(request.appUser, file.projectId);
    const requestedQuality = String(request.query.quality || "1080");
    const playbackKey = file.renditions?.[requestedQuality]?.key || file.renditions?.["1080"]?.key || file.proxyKey || file.r2Key;
    const url = await signedGetUrl(playbackKey, "", 60 * 30);
    response.redirect(302, url);
  } catch (error) {
    next(error);
  }
});

app.get("/api/accounts/:accountId/files/:fileId/preview", async (request, response, next) => {
  try {
    const db = await readMediaDb();
    const file = getFileRecord(db, request.params.fileId);
    assertProjectAccess(request.appUser, file.projectId);
    response.json({
      data: {
        id: file.id,
        status: file.status,
        thumbnailUrl: file.thumbnailKey ? await signedGetUrl(file.thumbnailKey, "", 60 * 30) : "",
        hoverUrl: file.proxyKey ? `/api/accounts/${request.params.accountId}/files/${file.id}/playback` : "",
      },
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/accounts/:accountId/files/:fileId/downloads", async (request, response, next) => {
  try {
    const db = await readMediaDb();
    const file = getFileRecord(db, request.params.fileId);
    assertProjectAccess(request.appUser, file.projectId);
    const originalUrl = await signedGetUrl(file.r2Key, `attachment; filename="${file.name.replaceAll('"', "'")}"`, 60 * 30);
    const downloads = [{ key: "original", label: "Original", detail: `${formatBytes(file.size)} source file`, url: originalUrl }];
    const renditionEntries = fileRenditionEntries(file);
    for (const rendition of renditionEntries) {
      downloads.push({
        key: rendition.quality,
        label: `${rendition.label} MP4`,
        detail: rendition.quality === "1080" ? "High quality proxy" : "Smaller download",
        url: await signedGetUrl(rendition.key, `attachment; filename="${fileBaseName(file.name)}-${rendition.label}.mp4"`, 60 * 30),
      });
    }
    if (!renditionEntries.length && file.proxyKey) {
      downloads.push({
        key: "proxy",
        label: "Preview MP4",
        detail: "Generated proxy",
        url: await signedGetUrl(file.proxyKey, `attachment; filename="${fileBaseName(file.name)}-proxy.mp4"`, 60 * 30),
      });
    }
    if (isVideo(file) && !renditionEntries.some((item) => item.quality === "720")) {
      downloads.push({
        key: "processing",
        label: "Lower sizes",
        detail: file.proxyStatus === "processing" ? "Generating..." : "Will appear after processing",
        pending: true,
      });
    }
    if (isVideo(file) && hasR2Config() && file.proxyStatus !== "processing" && !renditionEntries.some((item) => item.quality === "720")) generateVideoProxy(file.id).catch(() => {});
    response.json({ data: downloads });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/accounts/:accountId/files/:fileId", async (request, response, next) => {
  try {
    const name = String(request.body?.name || "").trim();
    if (!name) {
      response.status(400).json({ error: "file name is required" });
      return;
    }
    const db = await readMediaDb();
    const file = getFileRecord(db, request.params.fileId);
    assertProjectAccess(request.appUser, file.projectId);
    const previousName = file.name;
    file.name = name;
    file.updatedAt = new Date().toISOString();
    await writeMediaDb(db);
    await recordActivity(request, "file.renamed", { type: "file", id: file.id, name: file.name, projectId: file.projectId, folderId: file.folderId }, { previousName, newName: file.name });
    response.json({ data: toApiFile(file) });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/accounts/:accountId/files/:fileId", async (request, response, next) => {
  try {
    const db = await readMediaDb();
    const file = getFileRecord(db, request.params.fileId);
    assertProjectAccess(request.appUser, file.projectId);
    file.deletedAt = new Date().toISOString();
    await Promise.all(fileStorageKeys(file).map((key) => deleteObject(key)));
    await writeMediaDb(db);
    await recordActivity(request, "file.deleted", { type: "file", id: file.id, name: file.name, projectId: file.projectId, folderId: file.folderId }, { size: file.size, mimeType: file.mimeType });
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/accounts/:accountId/files/:fileId/comments", requireAppSession, async (request, response, next) => {
  try {
    const db = await readMediaDb();
    const file = getFileRecord(db, request.params.fileId);
    assertProjectAccess(request.appUser, file.projectId);
    response.json({ data: db.comments[file.id] || [] });
  } catch (error) {
    next(error);
  }
});

app.post("/api/accounts/:accountId/files/:fileId/comments", requireAppSession, async (request, response, next) => {
  try {
    const { text, timestamp } = request.body || {};
    if (!String(text || "").trim()) {
      response.status(400).json({ error: "comment text is required" });
      return;
    }
    const db = await readMediaDb();
    const file = getFileRecord(db, request.params.fileId);
    assertProjectAccess(request.appUser, file.projectId);
    const comment = {
      id: crypto.randomUUID(),
      text: String(text).trim(),
      timestamp,
      owner: { name: request.appUser.name || request.appUser.email, email: request.appUser.email },
      created_at: new Date().toISOString(),
    };
    db.comments[file.id] = [...(db.comments[file.id] || []), comment];
    await writeMediaDb(db);
    await recordActivity(request, "comment.created", { type: "comment", id: comment.id, fileId: file.id, fileName: file.name, projectId: file.projectId }, { timestamp: comment.timestamp, textLength: comment.text.length });
    const users = await readUsers();
    const mentions = mentionedUsers(comment.text, users, request.appUser.email);
    await Promise.all(mentions.map((user) => recordNotification({
      type: "mention",
      to: user.email,
      subject: `${request.appUser.name || request.appUser.email} mentioned you on ${file.name}`,
      text: [
        `${request.appUser.name || request.appUser.email} mentioned you in a comment.`,
        "",
        `File: ${file.name}`,
        `Timestamp: ${commentTimestamp(comment.timestamp)}`,
        `Comment: ${comment.text}`,
        "",
        `Open review: ${reviewUrl(request, file.id)}`,
      ].join("\n"),
      fileName: file.name,
      fileId: file.id,
      url: reviewUrl(request, file.id),
      actor: request.appUser.email,
    })));
    response.status(201).json({ data: comment });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/accounts/:accountId/files/:fileId/comments/:commentId", requireAppSession, async (request, response, next) => {
  try {
    const db = await readMediaDb();
    const file = getFileRecord(db, request.params.fileId);
    assertProjectAccess(request.appUser, file.projectId);
    const comments = db.comments[file.id] || [];
    const comment = comments.find((item) => item.id === request.params.commentId);
    if (!comment) {
      response.status(404).json({ error: "Comment not found." });
      return;
    }
    const isOwner = normalizeEmail(comment.owner?.email) === normalizeEmail(request.appUser.email);
    if (!isOwner && request.appUser.role !== "admin") {
      response.status(403).json({ error: "Only the comment owner or an admin can delete this comment." });
      return;
    }
    db.comments[file.id] = comments.filter((item) => item.id !== request.params.commentId);
    await writeMediaDb(db);
    const meta = await readCommentMeta();
    if (meta[file.id]?.[request.params.commentId]) {
      delete meta[file.id][request.params.commentId];
      await writeCommentMeta(meta);
    }
    await recordActivity(request, "comment.deleted", { type: "comment", id: request.params.commentId, fileId: file.id, fileName: file.name, projectId: file.projectId }, { timestamp: comment.timestamp });
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/workflows/query", requireAppSession, async (request, response, next) => {
  try {
    const fileIds = Array.isArray(request.body?.fileIds) ? request.body.fileIds : [];
    const workflows = await readWorkflows();
    const users = await readUsers();
    const data = {};
    for (const fileId of fileIds) data[fileId] = workflowFor(fileId, workflows, users);
    response.json({ data });
  } catch (error) {
    next(error);
  }
});

app.get("/api/files/:fileId/workflow", requireAppSession, async (request, response, next) => {
  try {
    const workflows = await readWorkflows();
    const users = await readUsers();
    response.json({ data: workflowFor(request.params.fileId, workflows, users) });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/files/:fileId/workflow", requireAppSession, async (request, response, next) => {
  try {
    const { assigneeEmail, status } = request.body || {};
    const normalizedAssignee = normalizeEmail(assigneeEmail);
    const normalizedStatus = WORKFLOW_STATUSES.has(status) ? status : "work_in_progress";
    const users = await readUsers();
    if (normalizedAssignee && !users.some((user) => user.email === normalizedAssignee)) {
      response.status(400).json({ error: "Assignee must be an existing member." });
      return;
    }
    const workflows = await readWorkflows();
    const previous = workflows[request.params.fileId] || {};
    const assignee = normalizedAssignee ? users.find((user) => user.email === normalizedAssignee) : null;
    workflows[request.params.fileId] = {
      assigneeEmail: normalizedAssignee,
      assigneeName: assignee?.name || "",
      status: normalizedStatus,
      updatedAt: new Date().toISOString(),
      updatedBy: request.appUser.email,
    };
    await writeWorkflows(workflows);
    const dbForActivity = await readMediaDb();
    const workflowFile = getFileRecord(dbForActivity, request.params.fileId);
    await recordActivity(request, "workflow.updated", { type: "file", id: workflowFile.id, name: workflowFile.name, projectId: workflowFile.projectId, folderId: workflowFile.folderId }, {
      previousAssignee: previous.assigneeEmail,
      assigneeEmail: normalizedAssignee,
      previousStatus: previous.status,
      status: normalizedStatus,
    });
    if (assignee && normalizeEmail(previous.assigneeEmail) !== normalizedAssignee) {
      await recordNotification({
        type: "assignment",
        to: assignee.email,
        subject: `You were assigned to ${workflowFile.name}`,
        text: [
          `${request.appUser.name || request.appUser.email} assigned you to a file.`,
          "",
          `File: ${workflowFile.name}`,
          `Status: ${humanStatus(normalizedStatus)}`,
          "",
          `Open review: ${reviewUrl(request, workflowFile.id)}`,
        ].join("\n"),
        fileName: workflowFile.name,
        fileId: workflowFile.id,
        url: reviewUrl(request, workflowFile.id),
        status: normalizedStatus,
        actor: request.appUser.email,
      });
    }
    response.json({ data: workflowFor(request.params.fileId, workflows, users) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/files/:fileId/comment-meta", requireAppSession, async (request, response, next) => {
  try {
    const files = await readCommentMeta();
    response.json({ data: files[request.params.fileId] || {} });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/files/:fileId/comment-meta/:commentId", requireAppSession, async (request, response, next) => {
  try {
    const { editedText, replyText, resolved } = request.body || {};
    const files = await readCommentMeta();
    const fileMeta = files[request.params.fileId] || {};
    const current = fileMeta[request.params.commentId] || { replies: [], resolved: false };
    const nextMeta = { ...current, replies: Array.isArray(current.replies) ? current.replies : [] };
    if (editedText !== undefined) {
      const text = String(editedText).trim();
      if (!text) {
        response.status(400).json({ error: "edited text cannot be empty." });
        return;
      }
      nextMeta.editedText = text;
      nextMeta.editedAt = new Date().toISOString();
      nextMeta.editedBy = request.appUser.email;
    }
    if (resolved !== undefined) {
      nextMeta.resolved = Boolean(resolved);
      nextMeta.resolvedAt = new Date().toISOString();
      nextMeta.resolvedBy = request.appUser.email;
    }
    if (replyText !== undefined) {
      const text = String(replyText).trim();
      if (!text) {
        response.status(400).json({ error: "reply text cannot be empty." });
        return;
      }
      nextMeta.replies = [...nextMeta.replies, { id: crypto.randomUUID(), text, createdAt: new Date().toISOString(), createdBy: request.appUser.email }];
    }
    fileMeta[request.params.commentId] = nextMeta;
    files[request.params.fileId] = fileMeta;
    await writeCommentMeta(files);
    const db = await readMediaDb();
    const file = getFileRecord(db, request.params.fileId);
    const actions = [];
    if (editedText !== undefined) actions.push("comment.edited");
    if (replyText !== undefined) actions.push("comment.replied");
    if (resolved !== undefined) actions.push(nextMeta.resolved ? "comment.resolved" : "comment.reopened");
    for (const action of actions) {
      await recordActivity(request, action, { type: "comment", id: request.params.commentId, fileId: file.id, fileName: file.name, projectId: file.projectId }, { resolved: nextMeta.resolved });
    }
    response.json({ data: nextMeta });
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects/:projectId/shares", requireAppSession, async (request, response, next) => {
  try {
    const db = await readMediaDb();
    getProject(db, request.params.projectId);
    const assetIds = Array.isArray(request.body?.assetIds) ? request.body.assetIds : [];
    const password = String(request.body?.password || "").trim();
    const share = {
      id: crypto.randomUUID(),
      token: crypto.randomBytes(18).toString("base64url"),
      projectId: request.params.projectId,
      assetIds,
      name: String(request.body?.name || "Review link").trim(),
      passwordHash: password ? hashPassword(password) : null,
      createdAt: new Date().toISOString(),
      createdBy: request.appUser.email,
    };
    db.shares.push(share);
    await writeMediaDb(db);
    await recordActivity(request, "share.created", { type: "share", id: share.id, name: share.name, projectId: share.projectId }, { assetCount: assetIds.length, passwordProtected: Boolean(password) });
    response.status(201).json({ data: { ...share, passwordHash: undefined, url: `/share/${share.token}` } });
  } catch (error) {
    next(error);
  }
});

app.get("/share/:token", async (request, response, next) => {
  try {
    const db = await readMediaDb();
    const share = db.shares.find((item) => item.token === request.params.token);
    if (!share) {
      response.status(404).send("Review link not found.");
      return;
    }
    const cookies = parseCookies(request.headers.cookie);
    const unlocked = !share.passwordHash || cookies[`mediaflow_share_${share.token}`] === "1";
    if (!unlocked) {
      response.send(`<!doctype html><html><head><title>${escapeHtml(share.name)}</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:system-ui;background:#0d1016;color:#f8fafc;display:grid;place-items:center;min-height:100vh}form{display:grid;gap:12px;width:min(360px,calc(100vw - 32px))}input,button{font:inherit;padding:12px;border-radius:8px;border:1px solid #303748}button{background:#625bff;color:white;font-weight:800}</style></head><body><form method="post" action="/share/${share.token}/unlock"><h1>${escapeHtml(share.name)}</h1><input name="password" type="password" placeholder="Review password" autofocus><button type="submit">Open review</button></form></body></html>`);
      return;
    }
    const files = db.files.filter((file) => !file.deletedAt && share.assetIds.includes(file.id));
    const rows = files.map((file) => `<li><strong>${escapeHtml(file.name)}</strong> <a href="/share/${share.token}/files/${file.id}/playback">Preview</a></li>`).join("");
    response.send(`<!doctype html><html><head><title>${escapeHtml(share.name)}</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:system-ui;background:#0d1016;color:#f8fafc;padding:32px}a{color:#8b86ff}</style></head><body><h1>${escapeHtml(share.name)}</h1><ul>${rows}</ul></body></html>`);
  } catch (error) {
    next(error);
  }
});

app.post("/share/:token/unlock", async (request, response, next) => {
  try {
    const db = await readMediaDb();
    const share = db.shares.find((item) => item.token === request.params.token);
    if (!share) {
      response.status(404).send("Review link not found.");
      return;
    }
    if (!share.passwordHash || verifyHashRecord(request.body?.password, share.passwordHash)) {
      await recordActivity(request, "share.unlocked", { type: "share", id: share.id, name: share.name, projectId: share.projectId }, { assetCount: share.assetIds?.length || 0 });
      response.setHeader("Set-Cookie", `mediaflow_share_${share.token}=1; HttpOnly; SameSite=Lax; Path=/share/${share.token}; Max-Age=604800`);
      response.redirect(`/share/${share.token}`);
      return;
    }
    response.status(401).send("Incorrect review password.");
  } catch (error) {
    next(error);
  }
});

app.get("/share/:token/files/:fileId/playback", async (request, response, next) => {
  try {
    const db = await readMediaDb();
    const share = db.shares.find((item) => item.token === request.params.token);
    if (!share || !share.assetIds.includes(request.params.fileId)) {
      response.status(404).send("Review file not found.");
      return;
    }
    const cookies = parseCookies(request.headers.cookie);
    if (share.passwordHash && cookies[`mediaflow_share_${share.token}`] !== "1") {
      response.status(401).send("Review password required.");
      return;
    }
    const file = getFileRecord(db, request.params.fileId);
    response.redirect(302, await signedGetUrl(file.proxyKey || file.r2Key, "", 60 * 30));
  } catch (error) {
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  const status = error.status || 500;
  response.status(status).json({ error: error.message || "Unexpected server error", details: error.payload });
});

async function getHttpsCredentials() {
  // Prefer mkcert-generated trusted cert (no browser warning)
  const mkcertKey = path.join(__dirname, "localhost+2-key.pem");
  const mkcertCert = path.join(__dirname, "localhost+2.pem");
  try {
    const [key, cert] = await Promise.all([fs.readFile(mkcertKey), fs.readFile(mkcertCert)]);
    return { key, cert };
  } catch {}

  // Fall back to stored or generated self-signed cert
  const certDir = path.join(DATA_DIR, "cert");
  const keyPath = path.join(certDir, "localhost-key.pem");
  const certPath = path.join(certDir, "localhost-cert.pem");
  try {
    const [key, cert] = await Promise.all([fs.readFile(keyPath), fs.readFile(certPath)]);
    return { key, cert };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const generated = await selfsigned.generate([{ name: "commonName", value: "localhost" }], {
    days: 365,
    keySize: 2048,
    extensions: [{ name: "subjectAltName", altNames: [{ type: 2, value: "localhost" }, { type: 7, ip: "127.0.0.1" }] }],
  });
  await fs.mkdir(certDir, { recursive: true });
  await Promise.all([fs.writeFile(keyPath, generated.private), fs.writeFile(certPath, generated.cert)]);
  return { key: generated.private, cert: generated.cert };
}

if (require.main === module) {
  app.listen(port, () => {
    console.log(`MediaFlow running at http://localhost:${port}`);
  });
  getHttpsCredentials()
    .then((credentials) => {
      https.createServer(credentials, app).listen(httpsPort, () => {
        console.log(`MediaFlow running at https://localhost:${httpsPort}`);
      });
    })
    .catch((error) => {
      console.warn(`HTTPS server was not started: ${error.message}`);
    });
}

module.exports = app;
