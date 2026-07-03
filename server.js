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
  CopyObjectCommand,
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
const ARCHIVE_PROJECT_ID = "project_archive";
const ARCHIVE_ROOT_FOLDER_ID = "folder_archive_root";
const WORKFLOW_STATUSES = new Set(["work_in_progress", "rejected", "approved", "published"]);
const ACTIVITY_RETENTION_DAYS = 60;
const ARCHIVE_STRUCTURE = [
  { name: "Kurdistan", children: ["Iranian Kurdistan", "Iraqi Kurdistan", "Turkish Kurdistan", "Syrian Kurdistan"] },
  { name: "Iraq" },
  { name: "Iran" },
  { name: "Turkey" },
  { name: "Syria" },
  { name: "Lebanon" },
  { name: "Palestine" },
  { name: "Middle East" },
  { name: "Europe", children: ["Germany", "France", "Sweden", "Other"] },
  { name: "International" },
  { name: "Audio" },
  { name: "Assets" },
];
const ARCHIVE_METADATA_FIELDS = ["date", "country", "regionCity", "peopleFeatured", "organizations", "keywords", "source", "rightsLicenseStatus", "notes", "event", "topic", "year"];
const DEFAULT_PROJECT_RULES = {
  requireDeletePassword: false,
  deletePassword: "",
  membersCanUpload: true,
  membersCanDelete: true,
  membersCanComment: true,
  membersCanDownload: true,
  membersCanShare: true,
  retentionDays: null,
};

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

function cleanUsernamePart(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function usernameFromName(name, email = "") {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length >= 2) {
    return `${cleanUsernamePart(parts[0])}_${cleanUsernamePart(parts.at(-1))}`;
  }
  if (parts.length === 1) return cleanUsernamePart(parts[0]);
  return cleanUsernamePart(String(email).split("@")[0]) || "member";
}

function uniqueUsername(base, users, currentUserId = "") {
  const fallback = cleanUsernamePart(base) || "member";
  const taken = new Set(users
    .filter((user) => user.id !== currentUserId)
    .map((user) => cleanUsernamePart(user.username))
    .filter(Boolean));
  if (!taken.has(fallback)) return fallback;
  let index = 2;
  while (taken.has(`${fallback}${index}`)) index += 1;
  return `${fallback}${index}`;
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
  return { id: user.id, email: user.email, name: user.name, username: user.username || "", avatarUrl: user.avatarUrl || "", role: user.role || "member", createdAt: user.createdAt };
}

async function readUsers() {
  const data = await readJson(USERS_PATH, { users: [] }, "users.json");
  if (!Array.isArray(data.users)) data.users = [];
  const adminEmail = "m.zahawy5@gmail.com";
  const adminPassword = process.env.APP_ADMIN_PASSWORD || "12345678";
  const existingAdmin = data.users.find((user) => normalizeEmail(user.email) === adminEmail);
  if (!existingAdmin) {
    // Admin missing — create with current password
    const password = hashPassword(adminPassword);
    data.users.push({
      id: crypto.randomUUID(),
      email: adminEmail,
      name: "Main Admin",
      username: "main_admin",
      passwordSalt: password.salt,
      passwordHash: password.hash,
      role: "admin",
      createdAt: new Date().toISOString(),
    });
    await writeUsers(data.users);
  } else if (process.env.APP_ADMIN_PASSWORD && !verifyPassword(adminPassword, existingAdmin)) {
    // APP_ADMIN_PASSWORD env var is set and doesn't match stored hash — force reset
    const password = hashPassword(adminPassword);
    existingAdmin.passwordSalt = password.salt;
    existingAdmin.passwordHash = password.hash;
    await writeUsers(data.users);
  }
  let changed = false;
  for (const user of data.users) {
    const normalized = uniqueUsername(user.usernameManual ? user.username : usernameFromName(user.name, user.email), data.users, user.id);
    if (user.username !== normalized) {
      user.username = normalized;
      changed = true;
    }
  }
  if (changed) await writeUsers(data.users);
  return data.users;
}

async function writeUsers(users) {
  await writeJson(USERS_PATH, { users }, "users.json");
}

function defaultMediaDb() {
  const createdAt = new Date().toISOString();
  return {
    version: 1,
    projects: [
      { id: DEFAULT_PROJECT_ID, name: "Uploads", root_folder_id: DEFAULT_ROOT_FOLDER_ID, rules: { ...DEFAULT_PROJECT_RULES }, createdAt },
      { id: ARCHIVE_PROJECT_ID, name: "Archive", root_folder_id: ARCHIVE_ROOT_FOLDER_ID, system: "archive", rules: { ...DEFAULT_PROJECT_RULES, requireDeletePassword: true }, createdAt },
    ],
    folders: [
      { id: DEFAULT_ROOT_FOLDER_ID, projectId: DEFAULT_PROJECT_ID, parentId: null, name: "Uploads root", createdAt },
      { id: ARCHIVE_ROOT_FOLDER_ID, projectId: ARCHIVE_PROJECT_ID, parentId: null, name: "Archive root", system: "project_root", createdAt },
    ],
    files: [],
    comments: {},
    shares: [],
    folderMetadata: {},
    archiveIndex: [],
  };
}

async function readMediaDb() {
  const db = await readJson(MEDIA_DB_PATH, defaultMediaDb(), "media-db.json");
  db.projects ||= [];
  db.folders ||= [];
  db.files ||= [];
  db.comments ||= {};
  db.shares ||= [];
  db.folderMetadata ||= {};
  db.archiveIndex ||= [];
  if (!db.projects.length) db.projects.push(defaultMediaDb().projects[0]);
  if (!db.folders.length) db.folders.push(defaultMediaDb().folders[0]);
  let changed = false;
  if (!db.projects.some((project) => project.id === ARCHIVE_PROJECT_ID || project.system === "archive")) {
    db.projects.push({ id: ARCHIVE_PROJECT_ID, name: "Archive", root_folder_id: ARCHIVE_ROOT_FOLDER_ID, system: "archive", rules: { ...DEFAULT_PROJECT_RULES, requireDeletePassword: true, deletePassword: archiveDeletePassword() }, createdAt: new Date().toISOString() });
    changed = true;
  }
  const archiveProject = db.projects.find((project) => project.system === "archive" || project.id === ARCHIVE_PROJECT_ID);
  archiveProject.rules ||= {};
  archiveProject.rules.requireDeletePassword = true;
  if (!archiveProject.rules.deletePassword && archiveDeletePassword()) archiveProject.rules.deletePassword = archiveDeletePassword();
  if (!db.folders.some((folder) => folder.id === archiveProject.root_folder_id)) {
    const oldArchiveFolder = db.folders.find((folder) => folder.system === "archive" || folder.name === "Archive");
    if (oldArchiveFolder) {
      const oldArchiveId = oldArchiveFolder.id;
      oldArchiveFolder.projectId = archiveProject.id;
      oldArchiveFolder.parentId = null;
      oldArchiveFolder.name = "Archive root";
      oldArchiveFolder.system = "project_root";
      archiveProject.root_folder_id = oldArchiveFolder.id;
      const descendantIds = new Set([oldArchiveId]);
      let foundDescendant = true;
      while (foundDescendant) {
        foundDescendant = false;
        for (const folder of db.folders) {
          if (folder.parentId && descendantIds.has(folder.parentId) && !descendantIds.has(folder.id)) {
            descendantIds.add(folder.id);
            foundDescendant = true;
          }
        }
      }
      for (const folder of db.folders) {
        if (descendantIds.has(folder.id)) folder.projectId = archiveProject.id;
      }
      for (const file of db.files) {
        if (descendantIds.has(file.folderId)) file.projectId = archiveProject.id;
      }
    } else {
      db.folders.push({ id: ARCHIVE_ROOT_FOLDER_ID, projectId: archiveProject.id, parentId: null, name: "Archive root", system: "project_root", createdAt: new Date().toISOString() });
      archiveProject.root_folder_id = ARCHIVE_ROOT_FOLDER_ID;
    }
    changed = true;
  }
  for (const project of db.projects) {
    project.rules = { ...DEFAULT_PROJECT_RULES, ...(project.rules || {}) };
  }
  if (ensureArchiveStructure(db, archiveProject)) changed = true;
  if (changed) {
    await writeMediaDb(db);
  }
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
      getEnvSetting("APP_URL"),
      "https://amargi-files.vercel.app",
      "http://localhost:4174",
      "https://localhost:4175",
    ].filter(Boolean)),
  );
  try {
    await getR2Client().send(
      new PutBucketCorsCommand({
        Bucket: config.bucket,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedHeaders: ["*"],
              AllowedMethods: ["GET", "HEAD", "PUT"],
              AllowedOrigins: allowedOrigins,
              ExposeHeaders: ["ETag", "etag", "Content-Range", "Content-Length", "Accept-Ranges"],
              MaxAgeSeconds: 3600,
            },
          ],
        },
      }),
    );
  } catch (error) {
    if (error?.Code === "AccessDenied" || error?.name === "AccessDenied") {
      const permissionError = new Error("R2 CORS could not be updated because the current R2 token does not have bucket-admin permission. Update the bucket CORS in Cloudflare, or create an R2 token with Admin Read & Write for this bucket.");
      permissionError.status = 403;
      throw permissionError;
    }
    throw error;
  }
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

async function copyObjectIfExists(sourceKey, targetKey) {
  if (!sourceKey || !targetKey || !hasR2Config()) return false;
  if (!(await objectExists(sourceKey))) return false;
  const config = getR2Config();
  await getR2Client().send(new CopyObjectCommand({
    Bucket: config.bucket,
    CopySource: `${config.bucket}/${sourceKey}`,
    Key: targetKey,
  }));
  return true;
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

async function headR2Object(key) {
  const config = getR2Config();
  return getR2Client().send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
}

async function streamR2Object(request, response, key, fallbackContentType = "application/octet-stream") {
  if (!key || !hasR2Config()) {
    response.status(404).json({ error: "File not found in storage." });
    return;
  }
  const config = getR2Config();
  const head = await headR2Object(key);
  const size = Number(head.ContentLength || 0);
  const contentType = head.ContentType || fallbackContentType;
  const range = request.headers.range;
  const headers = {
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=300",
    "Content-Type": contentType,
  };

  let command;
  if (range && size) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      response.status(416).set("Content-Range", `bytes */${size}`).end();
      return;
    }
    let start = match[1] ? Number(match[1]) : 0;
    let end = match[2] ? Number(match[2]) : size - 1;
    if (!match[1] && match[2]) {
      const suffixLength = Number(match[2]);
      start = Math.max(size - suffixLength, 0);
      end = size - 1;
    }
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
      response.status(416).set("Content-Range", `bytes */${size}`).end();
      return;
    }
    end = Math.min(end, size - 1);
    headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
    headers["Content-Length"] = String(end - start + 1);
    command = new GetObjectCommand({ Bucket: config.bucket, Key: key, Range: `bytes=${start}-${end}` });
    response.writeHead(206, headers);
  } else {
    if (size) headers["Content-Length"] = String(size);
    command = new GetObjectCommand({ Bucket: config.bucket, Key: key });
    response.writeHead(200, headers);
  }

  const result = await getR2Client().send(command);
  result.Body.on("error", (error) => {
    if (!response.headersSent) response.status(500);
    response.destroy(error);
  });
  result.Body.pipe(response);
}

function metadataKey(name) {
  return storageKey("mediaflow-metadata", name);
}

async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

// Short-lived cache over the R2-backed metadata JSON. Without it every API
// request re-downloads media-db.json (and friends) from R2, adding 200-500ms
// per read; a folder click or comment post stacks several of those. Writes go
// straight to R2 and refresh the cache, so a single server never reads stale
// data from itself. Cross-instance staleness is bounded by the TTL.
const R2_JSON_CACHE_TTL_MS = Number(process.env.METADATA_CACHE_TTL_MS || 4000);
const r2JsonCache = new Map();

async function readR2Json(name, fallback) {
  if (!hasR2Config()) return fallback;
  const cached = r2JsonCache.get(name);
  if (cached && Date.now() - cached.time < R2_JSON_CACHE_TTL_MS) {
    return cached.missing ? fallback : JSON.parse(cached.raw);
  }
  const config = getR2Config();
  try {
    const result = await getR2Client().send(new GetObjectCommand({ Bucket: config.bucket, Key: metadataKey(name) }));
    const raw = await streamToString(result.Body);
    r2JsonCache.set(name, { raw, time: Date.now() });
    return JSON.parse(raw);
  } catch (error) {
    if (error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404) {
      r2JsonCache.set(name, { missing: true, time: Date.now() });
      return fallback;
    }
    throw error;
  }
}

async function writeR2Json(name, value) {
  if (!hasR2Config()) return;
  const config = getR2Config();
  const raw = JSON.stringify(value, null, 2);
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: metadataKey(name),
      Body: raw,
      ContentType: "application/json",
    }),
  );
  r2JsonCache.set(name, { raw, time: Date.now() });
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

function normalizeTags(tags) {
  const values = Array.isArray(tags) ? tags : String(tags || "").split(",");
  return Array.from(new Set(values.map((tag) => String(tag || "").trim()).filter(Boolean))).slice(0, 20);
}

function slugFolderName(value, fallback = "Untitled-Story") {
  return String(value || fallback)
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || fallback;
}

function normalizeArchiveMetadata(value = {}) {
  const metadata = {};
  for (const field of ARCHIVE_METADATA_FIELDS) metadata[field] = String(value[field] || "").trim();
  metadata.year = String(metadata.year || (metadata.date ? new Date(metadata.date).getFullYear() : new Date().getFullYear())).trim();
  if (!/^\d{4}$/.test(metadata.year)) metadata.year = String(new Date().getFullYear());
  metadata.event = slugFolderName(metadata.event || metadata.topic || "Untitled-Story");
  metadata.topic = metadata.topic || metadata.event.replace(/-/g, " ");
  return metadata;
}

function ensureFolderRecord(db, projectId, parentId, name, system = "") {
  let folder = db.folders.find((item) => item.projectId === projectId && item.parentId === parentId && item.name === name);
  if (folder) return folder;
  folder = { id: crypto.randomUUID(), projectId, parentId, name, createdAt: new Date().toISOString() };
  if (system) folder.system = system;
  db.folders.push(folder);
  return folder;
}

function ensureArchiveStructure(db, archiveProject) {
  let changed = false;
  const before = db.folders.length;
  for (const section of ARCHIVE_STRUCTURE) {
    const top = ensureFolderRecord(db, archiveProject.id, archiveProject.root_folder_id, section.name);
    for (const child of section.children || []) ensureFolderRecord(db, archiveProject.id, top.id, child);
  }
  changed = db.folders.length !== before;
  return changed;
}

function archiveSectionForMetadata(db, archiveProject, metadata) {
  const country = String(metadata.country || "").toLowerCase();
  const region = String(metadata.regionCity || "").toLowerCase();
  const topic = String(metadata.topic || metadata.keywords || "").toLowerCase();
  const folders = db.folders.filter((folder) => folder.projectId === archiveProject.id);
  const byParentAndName = (parentId, name) => folders.find((folder) => folder.parentId === parentId && folder.name.toLowerCase() === name.toLowerCase());
  const top = (name) => byParentAndName(archiveProject.root_folder_id, name);
  const child = (parent, name) => parent ? byParentAndName(parent.id, name) : null;
  const kurdistan = top("Kurdistan");
  if (topic.includes("kurd") || region.includes("kurdistan")) {
    if (country.includes("iran")) return child(kurdistan, "Iranian Kurdistan") || kurdistan;
    if (country.includes("iraq")) return child(kurdistan, "Iraqi Kurdistan") || kurdistan;
    if (country.includes("turkey")) return child(kurdistan, "Turkish Kurdistan") || kurdistan;
    if (country.includes("syria")) return child(kurdistan, "Syrian Kurdistan") || kurdistan;
    return kurdistan;
  }
  for (const name of ["Iraq", "Iran", "Turkey", "Syria", "Lebanon", "Palestine"]) {
    if (country.includes(name.toLowerCase())) return top(name);
  }
  const europe = top("Europe");
  for (const name of ["Germany", "France", "Sweden"]) {
    if (country.includes(name.toLowerCase())) return child(europe, name) || europe;
  }
  if (country.includes("europe")) return europe;
  if (topic.includes("audio")) return top("Audio");
  if (topic.includes("asset") || topic.includes("graphic")) return top("Assets");
  if (country || region) return top("International");
  return top("Middle East") || top("International") || kurdistan;
}

function archiveSearchText(metadata, file = null, folder = null) {
  return [
    file?.name,
    folder?.name,
    metadata.person,
    metadata.peopleFeatured,
    metadata.location,
    metadata.country,
    metadata.regionCity,
    metadata.organization,
    metadata.organizations,
    metadata.event,
    metadata.topic,
    metadata.keywords,
    metadata.year,
    metadata.source,
    metadata.notes,
  ].filter(Boolean).join(" ").toLowerCase();
}

function upsertArchiveIndex(db, entry) {
  db.archiveIndex ||= [];
  const index = db.archiveIndex.findIndex((item) => item.fileId === entry.fileId);
  if (index >= 0) db.archiveIndex[index] = { ...db.archiveIndex[index], ...entry };
  else db.archiveIndex.unshift(entry);
  db.archiveIndex = db.archiveIndex.slice(0, 5000);
}

function normalizeRetentionDays(value) {
  if (value === null || value === undefined || value === "" || value === "indefinite") return null;
  const days = Number(value);
  return [30, 60, 90].includes(days) ? days : null;
}

// Lower qualities compress harder (higher CRF + 96k audio) so 720/480 come out
// meaningfully smaller than the 1080 preview, like Frame.io proxy ladders.
const VIDEO_RENDITIONS = [
  { quality: "1080", label: "1080p", maxWidth: 1920, crf: "23", preset: "veryfast" },
  { quality: "720", label: "720p", maxWidth: 1280, crf: "28", preset: "veryfast", audioBitrate: "96k" },
  { quality: "480", label: "480p", maxWidth: 854, crf: "31", preset: "veryfast", audioBitrate: "96k" },
];
const AUTO_VIDEO_RENDITION_QUALITIES = new Set((process.env.AUTO_VIDEO_RENDITIONS || "1080,480").split(",").map((item) => item.trim()).filter(Boolean));

// In-memory export queue — each fileId queued at most once per server session
// Avoids infinite retry loops while still triggering generation when needed.
const exportQueuedIds = new Set();
let exportQueueRunning = false;

// Per-file promise chain so two exports on the same file never run concurrently.
// Concurrent generateVideoProxy runs each hold their own DB snapshot and the
// later write silently drops the earlier run's rendition metadata.
const exportJobChains = new Map();

function runExportJob(fileId, options) {
  const previous = exportJobChains.get(fileId) || Promise.resolve();
  const job = previous.then(() => generateVideoProxy(fileId, options));
  exportJobChains.set(fileId, job.catch(() => {}));
  return job;
}

function queueExport(fileId) {
  if (!getFfmpegPath() || exportQueuedIds.has(fileId)) return;
  exportQueuedIds.add(fileId);
  if (!exportQueueRunning) runExportQueue();
}

async function runExportQueue() {
  exportQueueRunning = true;
  for (const fileId of [...exportQueuedIds]) {
    try {
      await runExportJob(fileId, { qualities: ["1080", "480"], includeAudio: true, includeThumbnail: true });
    } catch (err) {
      console.error(`[Queue] Export failed for ${fileId}:`, err.message);
    }
  }
  exportQueueRunning = false;
}

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

function shouldStartProxyJob(file) {
  if (!isVideo(file) || !hasR2Config()) return false;
  if (!getFfmpegPath()) return false;
  const autoRenditions = VIDEO_RENDITIONS.filter((rendition) => AUTO_VIDEO_RENDITION_QUALITIES.has(rendition.quality));
  const missingAutoRendition = autoRenditions.some((rendition) => !file.renditions?.[rendition.quality]?.key);
  const missingThumbnail = !file.thumbnailKey;
  if (!missingAutoRendition && !missingThumbnail) return false;
  if (file.proxyStatus !== "processing") return true;
  const startedAt = Date.parse(file.proxyStartedAt || file.updatedAt || "");
  return !startedAt || Date.now() - startedAt > 5 * 60 * 1000;
}

function getFfmpegPath() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  // Serverless cannot run transcodes: execution freezes after the response and
  // long jobs hit time limits. The studio (local) server sweeps these up instead.
  if (process.env.VERCEL === "1") return "";
  return ffmpegInstaller?.path || "";
}

function transcoderConfigured() {
  return Boolean(process.env.TRANSCODER_TRIGGER_URL);
}

// True when SOMETHING can generate exports: local ffmpeg or the remote worker.
function canPrepareExports() {
  return Boolean(getFfmpegPath()) || transcoderConfigured();
}

// Wakes the Cloudflare transcoder container. Fire-and-forget: the container
// reads pending work from the shared metadata DB, so a lost ping is retried
// by its cron. Payload optionally names a specific export job.
function pingTranscoder(job = null) {
  if (!transcoderConfigured() || getFfmpegPath()) return;
  fetch(process.env.TRANSCODER_TRIGGER_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.TRANSCODER_TRIGGER_SECRET || ""}`,
    },
    body: JSON.stringify(job || {}),
  }).catch((error) => console.warn("[transcoder] trigger failed:", error.message));
}

// Returns { longSide, duration } using ffprobe, zeros on failure.
// Renditions cap the long side so portrait video (reels) downscales correctly.
async function probeVideoMeta(filePath) {
  const ffmpegPath = getFfmpegPath();
  if (!ffmpegPath) return { longSide: 0, duration: 0 };
  const ffprobePath = process.env.FFPROBE_PATH || ffmpegPath.replace(/ffmpeg(\.exe)?$/i, (m, ext) => `ffprobe${ext || ""}`);
  try {
    const { execFile } = require("child_process");
    const output = await new Promise((resolve, reject) => {
      execFile(ffprobePath, ["-v", "quiet", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "default=noprint_wrappers=1", filePath], { timeout: 15000 }, (err, stdout) => {
        if (err) reject(err); else resolve(stdout.trim());
      });
    });
    const values = Object.fromEntries(output.split(/\r?\n/).map((line) => line.split("=")));
    const width = parseInt(values.width, 10) || 0;
    const height = parseInt(values.height, 10) || 0;
    return { longSide: Math.max(width, height), duration: Number(values.duration) || 0 };
  } catch {
    return { longSide: 0, duration: 0 };
  }
}

function fileStorageKeys(file) {
  return [file.r2Key, file.proxyKey, file.thumbnailKey, file.audioKey, ...fileRenditionEntries(file).map((item) => item.key)];
}

function fileStorageKeysForDelete(db, file) {
  const keys = fileStorageKeys(file).filter(Boolean);
  return keys.filter((key) => !db.files.some((item) => item.id !== file.id && !item.deletedAt && fileStorageKeys(item).includes(key)));
}

function createArchiveReferenceRecord(sourceFile, targetFolder, metadata) {
  const createdAt = new Date().toISOString();
  return {
    ...sourceFile,
    id: crypto.randomUUID(),
    projectId: targetFolder.projectId,
    folderId: targetFolder.id,
    createdAt,
    updatedAt: createdAt,
    archivedAt: createdAt,
    archivedFromFileId: sourceFile.id,
    archiveReference: true,
    archiveMetadata: metadata,
    deletedAt: undefined,
    multipartUploadId: undefined,
  };
}

async function copyFileRecordToFolder(sourceFile, targetFolder) {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const copy = {
    ...sourceFile,
    id,
    projectId: targetFolder.projectId,
    folderId: targetFolder.id,
    ownerEmail: sourceFile.ownerEmail,
    createdAt,
    updatedAt: createdAt,
    sourceFileId: sourceFile.id,
    copiedAt: createdAt,
    deletedAt: undefined,
    multipartUploadId: undefined,
    uploadType: sourceFile.uploadType || "",
  };
  copy.r2Key = storageKey("projects", targetFolder.projectId, "files", id, "original" + extensionFor(sourceFile.name));
  if (!(await copyObjectIfExists(sourceFile.r2Key, copy.r2Key))) copy.r2Key = sourceFile.r2Key;
  if (sourceFile.proxyKey) {
    const proxyKey = storageKey("projects", targetFolder.projectId, "files", id, "proxy-1080.mp4");
    copy.proxyKey = (await copyObjectIfExists(sourceFile.proxyKey, proxyKey)) ? proxyKey : sourceFile.proxyKey;
  }
  if (sourceFile.thumbnailKey) {
    const thumbnailKey = storageKey("projects", targetFolder.projectId, "files", id, "thumb.jpg");
    copy.thumbnailKey = (await copyObjectIfExists(sourceFile.thumbnailKey, thumbnailKey)) ? thumbnailKey : sourceFile.thumbnailKey;
  }
  if (sourceFile.audioKey) {
    const audioKey = storageKey("projects", targetFolder.projectId, "files", id, "audio.mp3");
    copy.audioKey = (await copyObjectIfExists(sourceFile.audioKey, audioKey)) ? audioKey : sourceFile.audioKey;
  }
  if (sourceFile.renditions) {
    copy.renditions = {};
    for (const rendition of fileRenditionEntries(sourceFile)) {
      const renditionKey = storageKey("projects", targetFolder.projectId, "files", id, `proxy-${rendition.quality}.mp4`);
      copy.renditions[rendition.quality] = {
        ...rendition,
        key: (await copyObjectIfExists(rendition.key, renditionKey)) ? renditionKey : rendition.key,
      };
    }
  }
  return copy;
}

function toApiFolder(folder, db = null) {
  return { id: folder.id, name: folder.name, type: "folder", project_id: folder.projectId, parent_id: folder.parentId, created_at: folder.createdAt, system: folder.system || "", archive_protected: db ? isFolderInArchive(db, folder.id) : folder.system === "archive", archive_metadata: db?.folderMetadata?.[folder.id] || null };
}

function toApiProject(project) {
  const rules = { ...DEFAULT_PROJECT_RULES, ...(project.rules || {}) };
  return {
    id: project.id,
    name: project.name,
    root_folder_id: project.root_folder_id,
    system: project.system || "",
    rules: {
      requireDeletePassword: Boolean(rules.requireDeletePassword),
      deletePassword: String(rules.deletePassword || ""),
      membersCanUpload: rules.membersCanUpload !== false,
      membersCanDelete: rules.membersCanDelete !== false,
      membersCanComment: rules.membersCanComment !== false,
      membersCanDownload: rules.membersCanDownload !== false,
      membersCanShare: rules.membersCanShare !== false,
      retentionDays: normalizeRetentionDays(rules.retentionDays),
    },
    createdAt: project.createdAt,
    updatedAt: project.updatedAt || "",
  };
}

function toApiFile(file, db = null) {
  const project = db ? db.projects.find((item) => item.id === file.projectId) : null;
  const retentionDays = normalizeRetentionDays(project?.rules?.retentionDays);
  const retentionExpiresAt = retentionDays && file.createdAt
    ? new Date(Date.parse(file.createdAt) + retentionDays * 24 * 60 * 60 * 1000).toISOString()
    : "";
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
    tags: Array.isArray(file.tags) ? file.tags : [],
    archive_metadata: file.archiveMetadata || null,
    archive_protected: db ? isFolderInArchive(db, file.folderId) : false,
    retention_days: retentionDays,
    retention_expires_at: retentionExpiresAt,
    comment_count: (db?.comments?.[file.id] || []).length,
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

function projectRequiresDeletePassword(project) {
  return Boolean(project?.rules?.requireDeletePassword);
}

function isFolderInArchive(db, folderId) {
  const folder = db.folders.find((item) => item.id === folderId);
  const project = folder ? db.projects.find((item) => item.id === folder.projectId) : null;
  return projectRequiresDeletePassword(project);
}

function archiveDeletePassword() {
  return String(getSetting("ARCHIVE_DELETE_PASSWORD") || "");
}

function assertArchiveDeleteAllowed(request, db, folderId) {
  const folder = db.folders.find((item) => item.id === folderId);
  const project = folder ? db.projects.find((item) => item.id === folder.projectId) : null;
  if (!projectRequiresDeletePassword(project)) return;
  const configured = String(project.rules?.deletePassword || archiveDeletePassword());
  if (!configured) {
    const error = new Error("Project delete password is not configured.");
    error.status = 403;
    throw error;
  }
  const supplied = String(request.body?.archivePassword || request.query?.archivePassword || "");
  if (supplied !== configured) {
    const error = new Error("Project delete password is required to delete protected items.");
    error.status = 403;
    throw error;
  }
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

function assertProjectRuleAllowed(user, project, ruleName, message) {
  if (user?.role === "admin") return;
  const rules = { ...DEFAULT_PROJECT_RULES, ...(project?.rules || {}) };
  if (rules[ruleName] === false) {
    const error = new Error(message);
    error.status = 403;
    throw error;
  }
}

function assertFileOwnerOrAdmin(user, file, message) {
  if (user?.role === "admin") return;
  if (normalizeEmail(file.ownerEmail) === normalizeEmail(user?.email)) return;
  const error = new Error(message);
  error.status = 403;
  throw error;
}

function videoRenditionsForQualities(qualities = []) {
  const requested = new Set(qualities.map((quality) => String(quality)));
  return VIDEO_RENDITIONS.filter((rendition) => requested.has(rendition.quality));
}

async function runFfmpeg(args, label) {
  const ffmpegPath = getFfmpegPath();
  if (!ffmpegPath) throw new Error("FFmpeg is not available. Set FFMPEG_PATH to generate video exports on this machine.");
  await new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (stderr.length > 4000) stderr = stderr.slice(-4000); // keep the tail, where the real error usually is
    });
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${label} failed with code ${code}: ${stderr.trim().split("\n").slice(-6).join(" | ")}`))));
    child.on("error", reject);
  });
}

async function generateVideoProxy(fileId, options = {}) {
  // Check FFmpeg BEFORE reading/writing the DB to avoid race conditions
  // that can overwrite comments when FFmpeg is unavailable (e.g. on Vercel)
  if (!getFfmpegPath()) return;
  const db = await readMediaDb();
  const file = getFileRecord(db, fileId);
  if (!isVideo(file) || !hasR2Config()) return;
  const qualities = options.qualities
    ? videoRenditionsForQualities(options.qualities)
    : VIDEO_RENDITIONS.filter((rendition) => AUTO_VIDEO_RENDITION_QUALITIES.has(rendition.quality));
  const includeAudio = Boolean(options.includeAudio);
  const includeThumbnail = options.includeThumbnail !== false;
  if (!qualities.length && !includeAudio && !includeThumbnail) return;
  file.proxyStatus = "processing";
  file.proxyStartedAt = new Date().toISOString();
  file.proxyError = "";
  file.exportJobs ||= {};
  for (const rendition of qualities) file.exportJobs[rendition.quality] = "processing";
  if (includeAudio) file.exportJobs.mp3 = "processing";
  await writeMediaDb(db);
  const tempDir = path.join(DATA_DIR, "tmp", `${file.id}-${crypto.randomUUID()}`);
  try {
    await fs.mkdir(tempDir, { recursive: true });

    // ── Download source file ONCE so all jobs share a local copy ──
    const inputUrl = await signedGetUrl(file.r2Key, "", 60 * 60);
    const ext = path.extname(file.name || ".mp4") || ".mp4";
    const localInput = path.join(tempDir, `source${ext}`);
    console.log(`[export] Downloading source to ${localInput} …`);
    // A stuck network request (e.g. no container egress) must fail fast rather
    // than hang forever, since exports run one-at-a-time per file and a hang
    // here blocks every job queued behind it indefinitely.
    const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;
    await new Promise((resolve, reject) => {
      const https = require("https");
      const http = require("http");
      const protocol = inputUrl.startsWith("https") ? https : http;
      const withTimeout = (request) => {
        request.setTimeout(DOWNLOAD_TIMEOUT_MS, () => request.destroy(new Error("Source download timed out")));
        return request;
      };
      withTimeout(protocol.get(inputUrl, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // Follow one redirect
          const redirectProto = res.headers.location.startsWith("https") ? https : http;
          withTimeout(redirectProto.get(res.headers.location, (res2) => {
            const dest = require("fs").createWriteStream(localInput);
            res2.pipe(dest);
            dest.on("finish", resolve);
            dest.on("error", reject);
          })).on("error", reject);
        } else {
          const dest = require("fs").createWriteStream(localInput);
          res.pipe(dest);
          dest.on("finish", resolve);
          dest.on("error", reject);
        }
      })).on("error", reject);
    });
    console.log(`[export] Source downloaded, starting transcoding …`);

    // Skip only true upscales (target above the source's longer dimension).
    // A 1080p source still gets a compressed 1080p rendition, matching Frame.io,
    // and portrait reels (1080x1920) are measured by their long side.
    const { longSide: sourceLongSide, duration: sourceDuration } = await probeVideoMeta(localInput);
    if (sourceLongSide > 0) file.sourceLongSide = sourceLongSide;
    if (sourceDuration > 0 && !file.duration) file.duration = Math.round(sourceDuration);
    const effectiveQualities = qualities.filter((r) => {
      if (sourceLongSide > 0 && r.maxWidth > sourceLongSide) {
        console.log(`[export] Skipping ${r.label} — source long side ${sourceLongSide}px is below ${r.maxWidth}px`);
        file.exportJobs[r.quality] = "skipped";
        return false;
      }
      return true;
    });

    const thumbPath = path.join(tempDir, "thumb.jpg");
    if (includeThumbnail && !file.thumbnailKey) {
      await runFfmpeg(["-y", "-ss", "00:00:01", "-i", localInput, "-frames:v", "1", "-q:v", "3", thumbPath], "Thumbnail export").catch(() => {});
      try {
        await fs.access(thumbPath);
        const thumbnailKey = storageKey("projects", file.projectId, "files", file.id, "thumb.jpg");
        await uploadFileToR2(thumbnailKey, thumbPath, "image/jpeg");
        file.thumbnailKey = thumbnailKey;
      } catch {}
    }
    file.renditions ||= {};
    const force = Boolean(options.force);
    for (const rendition of effectiveQualities) {
      if (!force && file.renditions?.[rendition.quality]?.key && await objectExists(file.renditions[rendition.quality].key)) {
        file.exportJobs[rendition.quality] = "ready";
        continue;
      }
      const outputPath = path.join(tempDir, `${rendition.quality}.mp4`);
      // Cap the longer dimension (keeps portrait reels downscaling correctly) and keep dimensions even for libx264.
      const scale = `scale=w='if(gt(iw,ih),trunc(min(${rendition.maxWidth},iw)/2)*2,-2)':h='if(gt(iw,ih),-2,trunc(min(${rendition.maxWidth},ih)/2)*2)'`;
      const preset = rendition.preset || "veryfast";
      if (rendition.audioBitrate) {
        // Lower renditions always re-encode audio at a small bitrate.
        await runFfmpeg([
          "-y", "-threads", "0",
          "-i", localInput,
          "-vf", scale,
          "-c:v", "libx264", "-preset", preset, "-crf", rendition.crf,
          "-c:a", "aac", "-b:a", rendition.audioBitrate, "-ac", "2",
          "-movflags", "+faststart",
          outputPath,
        ], `${rendition.label} MP4 export`);
      } else {
        await runFfmpeg([
          "-y", "-threads", "0",
          "-i", localInput,
          "-vf", scale,
          "-c:v", "libx264", "-preset", preset, "-crf", rendition.crf,
          "-c:a", "copy",          // copy audio stream — no re-encode, instant
          "-movflags", "+faststart",
          outputPath,
        ], `${rendition.label} MP4 export`)
          .catch(() =>
            // fallback: re-encode audio if copy fails (incompatible source codec)
            runFfmpeg([
              "-y", "-threads", "0",
              "-i", localInput,
              "-vf", scale,
              "-c:v", "libx264", "-preset", preset, "-crf", rendition.crf,
              "-c:a", "aac", "-b:a", "128k",
              "-movflags", "+faststart",
              outputPath,
            ], `${rendition.label} MP4 export (re-encode audio)`)
          );
      }
      const renditionKey = storageKey("projects", file.projectId, "files", file.id, `proxy-${rendition.quality}.mp4`);
      await uploadFileToR2(renditionKey, outputPath, "video/mp4");
      file.renditions[rendition.quality] = { key: renditionKey, label: rendition.label, maxWidth: rendition.maxWidth, contentType: "video/mp4" };
      if (rendition.quality === "1080") file.proxyKey = renditionKey;
      if (!file.proxyKey) file.proxyKey = renditionKey;
      file.exportJobs[rendition.quality] = "ready";
      file.updatedAt = new Date().toISOString();
      await writeMediaDb(db);
    }
    if (includeAudio) {
      if (!force && file.audioKey && await objectExists(file.audioKey)) {
        file.audioStatus = "ready";
        file.exportJobs.mp3 = "ready";
      } else {
        const audioPath = path.join(tempDir, "audio.mp3");
        await runFfmpeg(["-y", "-threads", "0", "-i", localInput, "-vn", "-codec:a", "libmp3lame", "-b:a", "128k", "-q:a", "4", audioPath], "MP3 export");
        await fs.access(audioPath);
        const audioKey = storageKey("projects", file.projectId, "files", file.id, "audio.mp3");
        await uploadFileToR2(audioKey, audioPath, "audio/mpeg");
        file.audioKey = audioKey;
        file.audioStatus = "ready";
        file.exportJobs.mp3 = "ready";
      }
    }
    file.proxyStatus = file.proxyKey || file.thumbnailKey ? "ready" : "pending";
    file.proxyStartedAt = "";
    file.updatedAt = new Date().toISOString();
    await writeMediaDb(db);
  } catch (error) {
    file.proxyStatus = file.proxyKey || file.thumbnailKey ? "ready" : "failed";
    file.proxyStartedAt = "";
    file.proxyError = error.message || "Video processing failed.";
    file.exportJobs ||= {};
    for (const rendition of qualities) {
      if (file.exportJobs[rendition.quality] === "processing") file.exportJobs[rendition.quality] = "failed";
    }
    if (includeAudio && file.exportJobs.mp3 === "processing") {
      file.exportJobs.mp3 = "failed";
      file.audioStatus = "failed";
    }
    file.updatedAt = new Date().toISOString();
    await writeMediaDb(db);
    throw error;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

function normalizeWorkflowAssignees(workflow = {}) {
  const values = Array.isArray(workflow.assigneeEmails) ? workflow.assigneeEmails : [workflow.assigneeEmail];
  return Array.from(new Set(values.map((email) => normalizeEmail(email)).filter(Boolean)));
}

function workflowFor(fileId, workflows, users) {
  const workflow = workflows[fileId] || { assigneeEmails: [], status: "work_in_progress" };
  const assigneeEmails = normalizeWorkflowAssignees(workflow);
  const assignees = assigneeEmails.map((email) => users.find((user) => normalizeEmail(user.email) === email)).filter(Boolean);
  return {
    ...workflow,
    assigneeEmail: assigneeEmails[0] || "",
    assigneeName: assignees[0]?.name || "",
    assigneeEmails,
    assigneeNames: assignees.map((user) => user.name || user.email),
  };
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
    const username = cleanUsernamePart(user.username);
    return tokens.some((token) => token === email || token === email.split("@")[0] || token === username || names.includes(token));
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
  const item = { id: crypto.randomUUID(), ...notification, emailStatus: "not_configured", emailError: "", createdAt: new Date().toISOString() };
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
    try {
      const info = await transporter.sendMail({
        from: getSetting("SMTP_FROM") || getSetting("SMTP_USER"),
        to: recipients.join(","),
        subject: notification.subject,
        text: notification.text,
      });
      item.emailStatus = "sent";
      item.emailAccepted = info.accepted || [];
      item.emailRejected = info.rejected || [];
    } catch (error) {
      item.emailStatus = "failed";
      item.emailError = [error.code, error.command, error.message].filter(Boolean).join(" - ");
    }
    await writeJson(NOTIFICATIONS_PATH, data.slice(0, 200), "notifications.json");
  } else if (recipients.length) {
    item.emailStatus = "not_configured";
    item.emailError = "SMTP is not configured.";
    await writeJson(NOTIFICATIONS_PATH, data.slice(0, 200), "notifications.json");
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
    emailStatus: notification.emailStatus || "",
    emailError: notification.emailError || "",
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
        archiveDeletePassword: archiveDeletePassword(),
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
    assignIfPresent("ARCHIVE_DELETE_PASSWORD", request.body?.archiveDeletePassword);
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
    const name = String(request.body?.name || email).trim();
    const user = {
      id: crypto.randomUUID(),
      email,
      name,
      username: uniqueUsername(usernameFromName(name, email), users),
      usernameManual: false,
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

app.patch("/api/admin/users/:userId", requireAdminSession, async (request, response, next) => {
  try {
    const users = await readUsers();
    const user = users.find((item) => item.id === request.params.userId);
    if (!user) {
      response.status(404).json({ error: "User not found." });
      return;
    }
    const previous = publicUser(user);
    const name = String(request.body?.name || "").trim();
    if (name) user.name = name;
    if (Object.hasOwn(request.body || {}, "username")) {
      const username = cleanUsernamePart(request.body?.username);
      if (!username) {
        response.status(400).json({ error: "Username is required." });
        return;
      }
      user.username = uniqueUsername(username, users, user.id);
      user.usernameManual = true;
    }
    if (request.body?.role) {
      const adminCount = users.filter((item) => item.role === "admin").length;
      const nextRole = request.body.role === "admin" ? "admin" : "member";
      if (user.role === "admin" && nextRole !== "admin" && adminCount <= 1) {
        response.status(400).json({ error: "At least one admin account is required." });
        return;
      }
      user.role = nextRole;
    }
    user.updatedAt = new Date().toISOString();
    await writeUsers(users);
    await recordActivity(request, "admin.user_updated", { type: "user", id: user.id, email: user.email, name: user.name }, { previousRole: previous.role, role: user.role, previousName: previous.name, name: user.name, previousUsername: previous.username, username: user.username });
    response.json({ data: publicUser(user), users: users.map(publicUser) });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/admin/users/:userId/password", requireAdminSession, async (request, response, next) => {
  try {
    const password = String(request.body?.password || "");
    if (password.length < 8) {
      response.status(400).json({ error: "Password must be at least 8 characters." });
      return;
    }
    const users = await readUsers();
    const user = users.find((item) => item.id === request.params.userId);
    if (!user) {
      response.status(404).json({ error: "User not found." });
      return;
    }
    const passwordParts = hashPassword(password);
    user.passwordSalt = passwordParts.salt;
    user.passwordHash = passwordParts.hash;
    user.passwordUpdatedAt = new Date().toISOString();
    await writeUsers(users);
    await recordActivity(request, "admin.user_password_reset", { type: "user", id: user.id, email: user.email, name: user.name });
    response.json({ data: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/users/:userId", requireAdminSession, async (request, response, next) => {
  try {
    const users = await readUsers();
    const user = users.find((item) => item.id === request.params.userId);
    if (!user) {
      response.status(404).json({ error: "User not found." });
      return;
    }
    if (normalizeEmail(user.email) === normalizeEmail(request.appUser.email)) {
      response.status(400).json({ error: "You cannot delete your own account." });
      return;
    }
    if (user.role === "admin" && users.filter((item) => item.role === "admin").length <= 1) {
      response.status(400).json({ error: "At least one admin account is required." });
      return;
    }
    const nextUsers = users.filter((item) => item.id !== user.id);
    await writeUsers(nextUsers);
    await recordActivity(request, "admin.user_deleted", { type: "user", id: user.id, email: user.email, name: user.name }, { role: user.role });
    response.json({ ok: true, users: nextUsers.map(publicUser) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/users/:userId/notifications", requireAdminSession, async (request, response, next) => {
  try {
    const users = await readUsers();
    const user = users.find((item) => item.id === request.params.userId);
    if (!user) {
      response.status(404).json({ error: "User not found." });
      return;
    }
    const subject = String(request.body?.subject || "Admin notification").trim();
    const message = String(request.body?.message || "").trim();
    if (!message) {
      response.status(400).json({ error: "Notification message is required." });
      return;
    }
    const notification = await recordNotification({
      type: "admin",
      to: user.email,
      subject,
      text: message,
      actor: request.appUser.email,
    });
    await recordActivity(request, "admin.user_notified", { type: "user", id: user.id, email: user.email, name: user.name }, { subject });
    response.status(201).json({ data: notification });
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
    transcoder: transcoderConfigured(),
    build: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "local",
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
    const user = users.find((item) => normalizeEmail(item.email) === normalizeEmail(request.appUser.email));
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

app.patch("/api/profile", requireAppSession, async (request, response, next) => {
  try {
    const users = await readUsers();
    const user = users.find((item) => normalizeEmail(item.email) === normalizeEmail(request.appUser.email));
    if (!user) {
      response.status(404).json({ error: "User not found." });
      return;
    }
    const previous = publicUser(user);
    const name = String(request.body?.name || "").trim();
    const email = normalizeEmail(request.body?.email);
    const avatarUrl = String(request.body?.avatarUrl || "").trim();
    if (!name) {
      response.status(400).json({ error: "Name is required." });
      return;
    }
    if (!email) {
      response.status(400).json({ error: "Email is required." });
      return;
    }
    if (users.some((item) => item.id !== user.id && normalizeEmail(item.email) === email)) {
      response.status(409).json({ error: "Another member already uses that email." });
      return;
    }
    if (avatarUrl && (!avatarUrl.startsWith("data:image/") || avatarUrl.length > 900000)) {
      response.status(400).json({ error: "Profile picture must be an image under 650 KB." });
      return;
    }
    user.name = name;
    user.email = email;
    if (Object.hasOwn(request.body || {}, "avatarUrl")) user.avatarUrl = avatarUrl;
    user.updatedAt = new Date().toISOString();
    await writeUsers(users);
    await recordActivity(request, "account.profile_updated", { type: "user", id: user.id, email: user.email, name: user.name }, { previousEmail: previous.email, previousName: previous.name });
    response.setHeader("Set-Cookie", `mediaflow_session=${signSession(user)}; ${cookieOptions()}`);
    response.json({ data: publicUser(user), user: publicUser(user) });
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
    response.json({ data: db.projects.map(toApiProject) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/accounts/:accountId/workspaces/:workspaceId/projects", requireAdminSession, async (request, response, next) => {
  try {
    const name = String(request.body?.name || "").trim();
    if (!name) {
      response.status(400).json({ error: "Project name is required." });
      return;
    }
    const db = await readMediaDb();
    const projectId = `project_${crypto.randomUUID()}`;
    const rootFolderId = `folder_${crypto.randomUUID()}`;
    const createdAt = new Date().toISOString();
    const project = {
      id: projectId,
      name,
      root_folder_id: rootFolderId,
      rules: {
        ...DEFAULT_PROJECT_RULES,
        requireDeletePassword: Boolean(request.body?.requireDeletePassword),
        deletePassword: String(request.body?.deletePassword || ""),
        membersCanUpload: request.body?.membersCanUpload !== false,
        membersCanDelete: request.body?.membersCanDelete !== false,
        membersCanComment: request.body?.membersCanComment !== false,
        membersCanDownload: request.body?.membersCanDownload !== false,
        membersCanShare: request.body?.membersCanShare !== false,
        retentionDays: normalizeRetentionDays(request.body?.retentionDays),
      },
      createdAt,
    };
    const folder = { id: rootFolderId, projectId, parentId: null, name: `${name} root`, system: "project_root", createdAt };
    db.projects.push(project);
    db.folders.push(folder);
    await writeMediaDb(db);
    await recordActivity(request, "project.created", { type: "project", id: project.id, name: project.name }, { requireDeletePassword: project.rules.requireDeletePassword });
    response.status(201).json({ data: toApiProject(project), projects: db.projects.map(toApiProject) });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/projects/:projectId", requireAdminSession, async (request, response, next) => {
  try {
    const db = await readMediaDb();
    const project = getProject(db, request.params.projectId);
    const previous = toApiProject(project);
    if (Object.hasOwn(request.body || {}, "name")) {
      const name = String(request.body?.name || "").trim();
      if (!name) {
        response.status(400).json({ error: "Project name is required." });
        return;
      }
      project.name = name;
    }
    project.rules ||= {};
    if (Object.hasOwn(request.body || {}, "requireDeletePassword")) {
      project.rules.requireDeletePassword = Boolean(request.body.requireDeletePassword);
    }
    if (Object.hasOwn(request.body || {}, "deletePassword")) {
      project.rules.deletePassword = String(request.body.deletePassword || "");
      if (project.system === "archive") {
        await loadAppSettings();
        appSettings.ARCHIVE_DELETE_PASSWORD = project.rules.deletePassword;
        await writeAppSettings(appSettings);
      }
    }
    for (const key of ["membersCanUpload", "membersCanDelete", "membersCanComment", "membersCanDownload", "membersCanShare"]) {
      if (Object.hasOwn(request.body || {}, key)) project.rules[key] = Boolean(request.body[key]);
    }
    if (Object.hasOwn(request.body || {}, "retentionDays")) {
      project.rules.retentionDays = normalizeRetentionDays(request.body.retentionDays);
    }
    if (project.system === "archive") project.rules.requireDeletePassword = true;
    project.updatedAt = new Date().toISOString();
    await writeMediaDb(db);
    await recordActivity(request, "project.updated", { type: "project", id: project.id, name: project.name }, { previousName: previous.name, name: project.name, previousRules: previous.rules, rules: project.rules });
    response.json({ data: toApiProject(project), projects: db.projects.map(toApiProject) });
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
        return { ...toApiFolder(folder, db), file_count: fileCount, folder_count: childFolderCount };
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
    const folders = db.folders.filter((item) => item.parentId === folder.id).map((item) => toApiFolder(item, db));
    const files = db.files.filter((item) => item.folderId === folder.id && !item.deletedAt).map((item) => toApiFile(item, db));
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
    assertProjectRuleAllowed(request.appUser, getProject(db, parent.projectId), "membersCanUpload", "Members cannot create folders in this project.");
    const folder = { id: crypto.randomUUID(), projectId: parent.projectId, parentId: parent.id, name, createdAt: new Date().toISOString() };
    db.folders.push(folder);
    await writeMediaDb(db);
    await recordActivity(request, "folder.created", { type: "folder", id: folder.id, name: folder.name, projectId: folder.projectId, parentId: folder.parentId });
    response.status(201).json({ data: toApiFolder(folder, db) });
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
    response.json({ data: toApiFolder(folder, db) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/accounts/:accountId/folders/:folderId/move", async (request, response, next) => {
  try {
    const targetFolderId = String(request.body?.folderId || "").trim();
    if (!targetFolderId) {
      response.status(400).json({ error: "Target folder is required." });
      return;
    }
    const db = await readMediaDb();
    const folder = getFolder(db, request.params.folderId);
    const targetFolder = getFolder(db, targetFolderId);
    assertProjectAccess(request.appUser, folder.projectId);
    assertProjectAccess(request.appUser, targetFolder.projectId);
    if (folder.system === "project_root") {
      response.status(400).json({ error: "Cannot move a project root folder." });
      return;
    }
    if (folder.projectId !== targetFolder.projectId) {
      response.status(400).json({ error: "Folders can only be moved inside the same project." });
      return;
    }
    assertProjectRuleAllowed(request.appUser, getProject(db, targetFolder.projectId), "membersCanUpload", "Members cannot move folders in this project.");
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
    if (descendantIds.has(targetFolder.id)) {
      response.status(400).json({ error: "Cannot move a folder inside itself." });
      return;
    }
    if (folder.parentId === targetFolder.id) {
      response.json({ data: toApiFolder(folder, db) });
      return;
    }
    const previousParentId = folder.parentId;
    folder.parentId = targetFolder.id;
    folder.updatedAt = new Date().toISOString();
    await writeMediaDb(db);
    await recordActivity(request, "folder.moved", { type: "folder", id: folder.id, name: folder.name, projectId: folder.projectId, parentId: folder.parentId }, { previousParentId, parentId: folder.parentId });
    response.json({ data: toApiFolder(folder, db) });
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
    assertProjectRuleAllowed(request.appUser, project, "membersCanDelete", "Members cannot delete items in this project.");
    if (project.root_folder_id === folder.id) {
      response.status(400).json({ error: "Cannot delete the project root folder." });
      return;
    }
    assertArchiveDeleteAllowed(request, db, folder.id);
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
    const deletedFileIds = new Set(filesToDelete.map((file) => file.id));
    for (const file of filesToDelete) {
      file.deletedAt = new Date().toISOString();
      await Promise.all(fileStorageKeysForDelete(db, file).map((key) => deleteObject(key)));
    }
    db.archiveIndex = (db.archiveIndex || []).filter((entry) => !deletedFileIds.has(entry.fileId));
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
    assertProjectRuleAllowed(request.appUser, getProject(db, folder.projectId), "membersCanUpload", "Members cannot upload files in this project.");
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
        ...toApiFile(file, db),
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
    assertProjectRuleAllowed(request.appUser, getProject(db, folder.projectId), "membersCanUpload", "Members cannot upload files in this project.");
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
    response.status(201).json({ data: { ...toApiFile(file, db), uploadId, partUrls: urls } });
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
    if (isVideo(file)) {
      if (getFfmpegPath()) runExportJob(file.id, { qualities: ["1080", "480"], includeAudio: true }).catch(() => {});
      else pingTranscoder({ fileId: file.id, qualities: ["1080", "480"], includeAudio: true });
    }
    response.json({ data: toApiFile(file, db) });
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
    if (isVideo(file)) {
      if (getFfmpegPath()) runExportJob(file.id, { qualities: ["1080", "480"], includeAudio: true }).catch(() => {});
      else pingTranscoder({ fileId: file.id, qualities: ["1080", "480"], includeAudio: true });
    }
    response.json({ data: toApiFile(file, db) });
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
    response.json({ data: { uploadUrl: await signedPutUrl(thumbnailKey, mimeType), thumbnail: toApiFile(file, db).thumbnail } });
  } catch (error) {
    next(error);
  }
});

app.get("/api/accounts/:accountId/files/:fileId", async (request, response, next) => {
  try {
    const db = await readMediaDb();
    const file = getFileRecord(db, request.params.fileId);
    assertProjectAccess(request.appUser, file.projectId);
    response.json({ data: toApiFile(file, db) });
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
    // Prefer proxy/rendition files (faststart); fall back to original so video always plays
    const playbackKey = file.renditions?.[requestedQuality]?.key || file.renditions?.["1080"]?.key || file.proxyKey || file.r2Key;
    if (!playbackKey) {
      response.status(503).json({ error: "File not found in storage." });
      return;
    }
    await streamR2Object(request, response, playbackKey, file.mimeType || "video/mp4");
  } catch (error) {
    next(error);
  }
});

app.get("/api/accounts/:accountId/files/:fileId/preview", async (request, response, next) => {
  try {
    const db = await readMediaDb();
    const file = getFileRecord(db, request.params.fileId);
    assertProjectAccess(request.appUser, file.projectId);
    if (String(file.mimeType || "").startsWith("image/") && request.query.metadata !== "1") {
      response.redirect(302, await signedGetUrl(file.r2Key, "", 60 * 30));
      return;
    }
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
    assertProjectRuleAllowed(request.appUser, getProject(db, file.projectId), "membersCanDownload", "Members cannot download files from this project.");
    const downloads = [];
    const originalExists = await objectExists(file.r2Key);
    if (originalExists) {
      const originalUrl = await signedGetUrl(file.r2Key, `attachment; filename="${file.name.replaceAll('"', "'")}"`, 60 * 30);
      downloads.push({ key: "original", label: "Original full quality", detail: `${formatBytes(file.size)} source file`, url: originalUrl });
    } else {
      downloads.push({ key: "original-missing", label: "Original full quality", detail: "Original file is missing from storage", pending: true });
    }
    const discoveredRenditions = [];
    for (const rendition of VIDEO_RENDITIONS) {
      const metadataKeyForRendition = file.renditions?.[rendition.quality]?.key;
      const expectedKey = storageKey("projects", file.projectId, "files", file.id, `proxy-${rendition.quality}.mp4`);
      const key = metadataKeyForRendition || expectedKey;
      if (await objectExists(key)) discoveredRenditions.push({ ...rendition, key });
    }
    const renditionEntries = discoveredRenditions;
    const ffmpegAvailable = Boolean(getFfmpegPath());
    for (const rendition of renditionEntries) {
      downloads.push({
        key: rendition.quality,
        label: `${rendition.label} MP4`,
        detail: rendition.quality === "1080" ? "Preview quality MP4" : "Lower size MP4",
        url: await signedGetUrl(rendition.key, `attachment; filename="${fileBaseName(file.name)}-${rendition.label}.mp4"`, 60 * 30),
      });
    }
    if (isVideo(file) && originalExists) {
      const jobs = file.exportJobs || {};
      const expectedAudioKey = file.audioKey || storageKey("projects", file.projectId, "files", file.id, "audio.mp3");
      const hasAudio = await objectExists(expectedAudioKey);
      const ffmpegAvailableForExport = canPrepareExports();

      // A job is stale if it has been "processing" for more than 10 minutes
      // (server restart or crash killed the FFmpeg process — never self-resolves).
      const startedAt = Date.parse(file.proxyStartedAt || "");
      const jobIsStale = startedAt > 0 && Date.now() - startedAt > 10 * 60 * 1000;

      // ── Show video renditions not yet ready ──
      for (const rendition of VIDEO_RENDITIONS.filter((item) => !renditionEntries.some((entry) => entry.quality === item.quality))) {
        const status = jobs[rendition.quality] || "";
        // Hide only confirmed upscales. Stale "skipped" marks (from the old
        // width-based rule, or with no recorded source size) stay preparable.
        const sourceLongSide = Number(file.sourceLongSide) || Number(file.sourceWidth) || 0;
        if (status === "skipped" && sourceLongSide > 0 && rendition.maxWidth > sourceLongSide) continue;
        const isGenerating = status === "processing" && !jobIsStale;
        downloads.push({
          key: `pending-${rendition.quality}`,
          label: `${rendition.label} MP4`,
          detail: isGenerating ? "Generating… check back soon" : ffmpegAvailableForExport ? "Click Prepare to generate" : "Prepared automatically when the studio server is online",
          pending: !isGenerating,
          generating: isGenerating,
          prepare: !isGenerating && ffmpegAvailableForExport,
          exportType: "video",
          quality: rendition.quality,
        });
      }

      // ── MP3 ──
      if (hasAudio) {
        downloads.push({
          key: "mp3",
          label: "MP3 audio",
          detail: "128 kbps audio",
          url: await signedGetUrl(expectedAudioKey, `attachment; filename="${fileBaseName(file.name)}.mp3"`, 60 * 30),
        });
      } else if (jobs.mp3 !== "skipped") {
        const isGenerating = jobs.mp3 === "processing" && !jobIsStale;
        downloads.push({
          key: "pending-mp3",
          label: "MP3 audio",
          detail: isGenerating ? "Generating… check back soon" : ffmpegAvailableForExport ? "Click Prepare to generate" : "Prepared automatically when the studio server is online",
          pending: !isGenerating,
          generating: isGenerating,
          prepare: !isGenerating && ffmpegAvailableForExport,
          exportType: "audio",
        });
      }
    }
    if (!renditionEntries.length && file.proxyKey) {
      const proxyExists = await objectExists(file.proxyKey);
      if (proxyExists) {
        downloads.push({
          key: "proxy",
          label: "Preview MP4",
          detail: "Compressed preview",
          url: await signedGetUrl(file.proxyKey, `attachment; filename="${fileBaseName(file.name)}-proxy.mp4"`, 60 * 30),
        });
      }
    }
    response.json({ data: downloads });
  } catch (error) {
    next(error);
  }
});

app.post("/api/accounts/:accountId/files/:fileId/exports", async (request, response, next) => {
  try {
    const db = await readMediaDb();
    const file = getFileRecord(db, request.params.fileId);
    assertProjectAccess(request.appUser, file.projectId);
    assertProjectRuleAllowed(request.appUser, getProject(db, file.projectId), "membersCanDownload", "Members cannot download files from this project.");
    if (!isVideo(file)) {
      response.status(400).json({ error: "Only videos can be exported." });
      return;
    }
    if (!canPrepareExports()) {
      response.status(400).json({ error: "No transcoder is available to generate exports." });
      return;
    }
    if (!(await objectExists(file.r2Key))) {
      response.status(409).json({ error: "Original file is missing from storage." });
      return;
    }
    const type = String(request.body?.type || "");
    const quality = String(request.body?.quality || "");
    if (type === "audio") {
      if (getFfmpegPath()) runExportJob(file.id, { qualities: [], includeAudio: true, includeThumbnail: false }).catch(() => {});
      else pingTranscoder({ fileId: file.id, includeAudio: true, qualities: [] });
      response.status(202).json({ ok: true, message: "MP3 export started." });
      return;
    }
    const rendition = VIDEO_RENDITIONS.find((item) => item.quality === quality);
    if (!rendition) {
      response.status(400).json({ error: "Choose a valid video quality." });
      return;
    }
    if (getFfmpegPath()) runExportJob(file.id, { qualities: [rendition.quality], includeAudio: false, includeThumbnail: false, force: Boolean(request.body?.force) }).catch(() => {});
    else pingTranscoder({ fileId: file.id, qualities: [rendition.quality], includeAudio: false, force: Boolean(request.body?.force) });
    response.status(202).json({ ok: true, message: `${rendition.label} export started.` });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/accounts/:accountId/files/:fileId", async (request, response, next) => {
  try {
    const db = await readMediaDb();
    const file = getFileRecord(db, request.params.fileId);
    assertProjectAccess(request.appUser, file.projectId);
    const previousName = file.name;
    const previousTags = Array.isArray(file.tags) ? file.tags : [];
    const name = Object.hasOwn(request.body || {}, "name") ? String(request.body?.name || "").trim() : "";
    if (Object.hasOwn(request.body || {}, "name")) {
      if (!name) {
        response.status(400).json({ error: "file name is required" });
        return;
      }
      file.name = name;
    }
    if (Object.hasOwn(request.body || {}, "tags")) {
      if (!isVideo(file)) {
        response.status(400).json({ error: "Tags can only be added to videos." });
        return;
      }
      file.tags = normalizeTags(request.body.tags);
    }
    if (Object.hasOwn(request.body || {}, "duration")) {
      const duration = Math.round(Number(request.body.duration));
      if (Number.isFinite(duration) && duration > 0 && !file.duration) file.duration = duration;
    }
    file.updatedAt = new Date().toISOString();
    await writeMediaDb(db);
    if (previousName !== file.name) {
      await recordActivity(request, "file.renamed", { type: "file", id: file.id, name: file.name, projectId: file.projectId, folderId: file.folderId }, { previousName, newName: file.name });
    }
    if (JSON.stringify(previousTags) !== JSON.stringify(file.tags || [])) {
      await recordActivity(request, "file.tags_updated", { type: "file", id: file.id, name: file.name, projectId: file.projectId, folderId: file.folderId }, { previousTags, tags: file.tags || [] });
    }
    response.json({ data: toApiFile(file, db) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/accounts/:accountId/files/:fileId/move", async (request, response, next) => {
  try {
    const targetFolderId = String(request.body?.folderId || "").trim();
    if (!targetFolderId) {
      response.status(400).json({ error: "Target folder is required." });
      return;
    }
    const db = await readMediaDb();
    const file = getFileRecord(db, request.params.fileId);
    const targetFolder = getFolder(db, targetFolderId);
    assertProjectAccess(request.appUser, file.projectId);
    assertProjectAccess(request.appUser, targetFolder.projectId);
    assertFileOwnerOrAdmin(request.appUser, file, "Members can only move videos they uploaded themselves.");
    assertProjectRuleAllowed(request.appUser, getProject(db, targetFolder.projectId), "membersCanUpload", "Members cannot move files into this project.");
    if (file.folderId === targetFolder.id) {
      response.json({ data: toApiFile(file, db) });
      return;
    }
    const previousProjectId = file.projectId;
    const previousFolderId = file.folderId;
    file.projectId = targetFolder.projectId;
    file.folderId = targetFolder.id;
    file.updatedAt = new Date().toISOString();
    await writeMediaDb(db);
    await recordActivity(request, "file.moved", { type: "file", id: file.id, name: file.name, projectId: file.projectId, folderId: file.folderId }, { previousProjectId, previousFolderId, projectId: file.projectId, folderId: file.folderId });
    response.json({ data: toApiFile(file, db) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/accounts/:accountId/files/:fileId/copy", async (request, response, next) => {
  try {
    const targetFolderId = String(request.body?.folderId || "").trim();
    if (!targetFolderId) {
      response.status(400).json({ error: "Target folder is required." });
      return;
    }
    const db = await readMediaDb();
    const file = getFileRecord(db, request.params.fileId);
    const targetFolder = getFolder(db, targetFolderId);
    assertProjectAccess(request.appUser, file.projectId);
    assertProjectAccess(request.appUser, targetFolder.projectId);
    assertFileOwnerOrAdmin(request.appUser, file, "Members can only copy videos they uploaded themselves.");
    assertProjectRuleAllowed(request.appUser, getProject(db, targetFolder.projectId), "membersCanUpload", "Members cannot copy files into this project.");
    const copiedFile = await copyFileRecordToFolder(file, targetFolder);
    db.files.push(copiedFile);
    await writeMediaDb(db);
    await recordActivity(request, "file.copied", { type: "file", id: copiedFile.id, name: copiedFile.name, projectId: copiedFile.projectId, folderId: copiedFile.folderId }, { sourceFileId: file.id, sourceProjectId: file.projectId, sourceFolderId: file.folderId });
    response.status(201).json({ data: toApiFile(copiedFile, db) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/accounts/:accountId/files/:fileId/archive", async (request, response, next) => {
  try {
    const db = await readMediaDb();
    const sourceFile = getFileRecord(db, request.params.fileId);
    assertProjectAccess(request.appUser, sourceFile.projectId);
    assertFileOwnerOrAdmin(request.appUser, sourceFile, "Members can only archive videos they uploaded themselves.");
    const archiveProject = db.projects.find((project) => project.system === "archive" || project.id === ARCHIVE_PROJECT_ID);
    if (!archiveProject) {
      response.status(404).json({ error: "Archive project was not found." });
      return;
    }
    ensureArchiveStructure(db, archiveProject);
    const metadata = normalizeArchiveMetadata(request.body?.metadata || {});
    const sectionFolder = archiveSectionForMetadata(db, archiveProject, metadata);
    if (!sectionFolder) {
      response.status(404).json({ error: "Archive destination was not found." });
      return;
    }
    const yearFolder = ensureFolderRecord(db, archiveProject.id, sectionFolder.id, metadata.year);
    const storyFolder = ensureFolderRecord(db, archiveProject.id, yearFolder.id, metadata.event);
    db.folderMetadata ||= {};
    db.folderMetadata[storyFolder.id] = {
      ...metadata,
      updatedAt: new Date().toISOString(),
      updatedBy: request.appUser.email,
    };
    const archivedFile = createArchiveReferenceRecord(sourceFile, storyFolder, metadata);
    db.files.push(archivedFile);
    upsertArchiveIndex(db, {
      id: crypto.randomUUID(),
      fileId: archivedFile.id,
      sourceFileId: sourceFile.id,
      folderId: storyFolder.id,
      projectId: archiveProject.id,
      fileName: archivedFile.name,
      metadata,
      createdAt: archivedFile.createdAt,
      createdBy: request.appUser.email,
      search: archiveSearchText(metadata, archivedFile, storyFolder),
    });
    await writeMediaDb(db);
    await recordActivity(request, "archive.footage_added", { type: "file", id: archivedFile.id, name: archivedFile.name, projectId: archivedFile.projectId, folderId: archivedFile.folderId }, { sourceFileId: sourceFile.id, metadata });
    response.status(201).json({ data: toApiFile(archivedFile, db), folder: toApiFolder(storyFolder, db), metadata, archiveIndex: db.archiveIndex });
  } catch (error) {
    next(error);
  }
});

app.get("/api/archive/index", requireAppSession, async (request, response, next) => {
  try {
    const db = await readMediaDb();
    const query = String(request.query.q || "").trim().toLowerCase();
    const year = String(request.query.year || "").trim();
    let entries = db.archiveIndex || [];
    if (query) entries = entries.filter((entry) => String(entry.search || archiveSearchText(entry.metadata || {}, { name: entry.fileName }, null)).includes(query));
    if (year) entries = entries.filter((entry) => String(entry.metadata?.year || "") === year);
    response.json({ data: entries.slice(0, 500) });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/accounts/:accountId/files/:fileId", async (request, response, next) => {
  try {
    const db = await readMediaDb();
    const file = getFileRecord(db, request.params.fileId);
    assertProjectAccess(request.appUser, file.projectId);
    assertProjectRuleAllowed(request.appUser, getProject(db, file.projectId), "membersCanDelete", "Members cannot delete items in this project.");
    assertFileOwnerOrAdmin(request.appUser, file, "Members can only delete videos they uploaded themselves.");
    assertArchiveDeleteAllowed(request, db, file.folderId);
    file.deletedAt = new Date().toISOString();
    await Promise.all(fileStorageKeysForDelete(db, file).map((key) => deleteObject(key)));
    db.archiveIndex = (db.archiveIndex || []).filter((entry) => entry.fileId !== file.id);
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
    assertProjectRuleAllowed(request.appUser, getProject(db, file.projectId), "membersCanComment", "Members cannot comment on files in this project.");
    const comment = {
      id: crypto.randomUUID(),
      text: String(text).trim(),
      timestamp,
      owner: { name: request.appUser.name || request.appUser.email, email: request.appUser.email },
      created_at: new Date().toISOString(),
    };
    db.comments[file.id] = [...(db.comments[file.id] || []), comment];
    // The comment and the activity entry live in different R2 objects — write
    // them concurrently so posting costs one round-trip, not two.
    await Promise.all([
      writeMediaDb(db),
      recordActivity(request, "comment.created", { type: "comment", id: comment.id, fileId: file.id, fileName: file.name, projectId: file.projectId }, { timestamp: comment.timestamp, textLength: comment.text.length }),
    ]);
    const users = await readUsers();
    const mentions = mentionedUsers(comment.text, users, request.appUser.email);
    const actorName = request.appUser.name || request.appUser.email;
    const actorEmail = request.appUser.email;
    const url = reviewUrl(request, file.id);
    response.status(201).json({ data: comment });
    Promise.all(mentions.map((user) => recordNotification({
      type: "mention",
      to: user.email,
      subject: `${actorName} mentioned you on ${file.name}`,
      text: [
        `${actorName} mentioned you in a comment.`,
        "",
        `File: ${file.name}`,
        `Timestamp: ${commentTimestamp(comment.timestamp)}`,
        `Comment: ${comment.text}`,
        "",
        `Open review: ${url}`,
      ].join("\n"),
      fileName: file.name,
      fileId: file.id,
      url,
      actor: actorEmail,
    }))).catch(() => {});
  } catch (error) {
    next(error);
  }
});

app.delete("/api/accounts/:accountId/files/:fileId/comments/:commentId", requireAppSession, async (request, response, next) => {
  try {
    const db = await readMediaDb();
    const file = getFileRecord(db, request.params.fileId);
    assertProjectAccess(request.appUser, file.projectId);
    assertProjectRuleAllowed(request.appUser, getProject(db, file.projectId), "membersCanComment", "Members cannot edit comments in this project.");
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
    const { assigneeEmail, assigneeEmails, status } = request.body || {};
    const requestedAssignees = Array.isArray(assigneeEmails) ? assigneeEmails : [assigneeEmail];
    const normalizedAssignees = Array.from(new Set(requestedAssignees.map((email) => normalizeEmail(email)).filter(Boolean)));
    const normalizedStatus = WORKFLOW_STATUSES.has(status) ? status : "work_in_progress";
    const users = await readUsers();
    if (normalizedAssignees.some((email) => !users.some((user) => normalizeEmail(user.email) === email))) {
      response.status(400).json({ error: "Assignee must be an existing member." });
      return;
    }
    const workflows = await readWorkflows();
    const previous = workflows[request.params.fileId] || {};
    const previousAssignees = normalizeWorkflowAssignees(previous);
    const assignees = normalizedAssignees.map((email) => users.find((user) => normalizeEmail(user.email) === email)).filter(Boolean);
    workflows[request.params.fileId] = {
      assigneeEmail: normalizedAssignees[0] || "",
      assigneeName: assignees[0]?.name || "",
      assigneeEmails: normalizedAssignees,
      assigneeNames: assignees.map((user) => user.name || user.email),
      status: normalizedStatus,
      updatedAt: new Date().toISOString(),
      updatedBy: request.appUser.email,
    };
    const dbForActivity = await readMediaDb();
    const workflowFile = getFileRecord(dbForActivity, request.params.fileId);
    await Promise.all([
      writeWorkflows(workflows),
      recordActivity(request, "workflow.updated", { type: "file", id: workflowFile.id, name: workflowFile.name, projectId: workflowFile.projectId, folderId: workflowFile.folderId }, {
        previousAssignees,
        assigneeEmails: normalizedAssignees,
        previousStatus: previous.status,
        status: normalizedStatus,
      }),
    ]);
    const newlyAssigned = assignees.filter((user) => !previousAssignees.includes(normalizeEmail(user.email)));
    // Respond before notifications: SMTP sends can take seconds and made
    // status changes feel stuck. Same fire-and-forget pattern as comments.
    response.json({ data: workflowFor(request.params.fileId, workflows, users) });
    Promise.all(newlyAssigned.map((assignee) => recordNotification({
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
      }))).catch(() => {});
    if (normalizedStatus === "rejected" && previous.status !== "rejected") {
      const rejectionRecipients = Array.from(new Set([
        normalizeEmail(workflowFile.ownerEmail),
        ...normalizedAssignees,
      ].filter(Boolean)));
      Promise.all(rejectionRecipients.map((email) => recordNotification({
        type: "rejection",
        to: email,
        subject: `${workflowFile.name} was rejected`,
        text: [
          `${request.appUser.name || request.appUser.email} marked a file as rejected.`,
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
      }))).catch(() => {});
    }
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
    assertProjectRuleAllowed(request.appUser, getProject(db, file.projectId), "membersCanComment", "Members cannot edit comments in this project.");
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
    const project = getProject(db, request.params.projectId);
    assertProjectRuleAllowed(request.appUser, project, "membersCanShare", "Members cannot create share links for this project.");
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
    const requestedQuality = String(request.query.quality || "1080");
    const playbackKey = file.renditions?.[requestedQuality]?.key || file.renditions?.["1080"]?.key || file.proxyKey || file.r2Key;
    await streamR2Object(request, response, playbackKey, file.mimeType || "video/mp4");
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

async function cleanStuckExportJobs() {
  // Run on every startup (even without FFmpeg) to clear stuck "processing" jobs
  // that were left behind by crashed/timed-out transcoding on a previous run.
  if (!hasR2Config()) return;
  try {
    const db = await readMediaDb();
    let changed = false;
    for (const f of db.files || []) {
      if (f.proxyStatus === "processing") { f.proxyStatus = "pending"; changed = true; }
      if (f.exportJobs) {
        for (const k of Object.keys(f.exportJobs)) {
          if (f.exportJobs[k] === "processing") { f.exportJobs[k] = ""; changed = true; }
        }
      }
    }
    if (changed) { await writeMediaDb(db); console.log("[Startup] Cleared stuck export jobs."); }
  } catch (err) {
    console.warn("[Startup] cleanStuckExportJobs error:", err.message);
  }
}

let exportSweepRunning = false;

async function requeuePendingProxies() {
  if (exportSweepRunning || !getFfmpegPath() || !hasR2Config()) return;
  exportSweepRunning = true;
  try {
    const db = await readMediaDb();
    // Find videos with unfinished AUTO exports (on-demand qualities like 720
    // don't count) — existing rendition/audio objects also count as done, so
    // legacy files without exportJobs bookkeeping are not reprocessed.
    const autoRenditions = VIDEO_RENDITIONS.filter((r) => AUTO_VIDEO_RENDITION_QUALITIES.has(r.quality));
    const toProcess = (db.files || []).filter((f) => {
      if (!f.r2Key || f.deletedAt || !isVideo(f)) return false;
      const jobs = f.exportJobs || {};
      const missingRendition = autoRenditions.some((r) => {
        const s = jobs[r.quality] || "";
        if (s === "ready" || s === "skipped") return false;
        return !f.renditions?.[r.quality]?.key;
      });
      const missingAudio = jobs.mp3 !== "ready" && jobs.mp3 !== "skipped" && !f.audioKey;
      return missingRendition || missingAudio;
    });
    if (!toProcess.length) return;
    // Reset stuck "processing" state so jobs can restart
    let changed = false;
    for (const f of toProcess) {
      if (f.proxyStatus === "processing") { f.proxyStatus = "pending"; changed = true; }
      if (f.exportJobs) {
        for (const k of Object.keys(f.exportJobs)) {
          if (f.exportJobs[k] === "processing") { f.exportJobs[k] = ""; changed = true; }
        }
      }
    }
    if (changed) await writeMediaDb(db);
    console.log(`[Sweep] Queuing ${toProcess.length} file(s) for export…`);
    // Process one at a time to avoid freezing
    for (const f of toProcess) {
      try {
        await runExportJob(f.id, { qualities: ["1080", "480"], includeAudio: true, includeThumbnail: true });
      } catch (err) {
        console.error(`[Sweep] Export failed for ${f.name}:`, err.message);
      }
    }
    console.log("[Sweep] Export queue complete.");
  } catch (err) {
    console.error("[Sweep] requeuePendingProxies error:", err.message);
  } finally {
    exportSweepRunning = false;
  }
}

async function applyR2CorsOnStartup() {
  if (!hasR2Config()) return;
  try {
    await configureBucketCors(process.env.APP_URL || "");
    console.log("[Startup] R2 CORS applied.");
  } catch (err) {
    console.warn("[Startup] R2 CORS update skipped:", err.message);
  }
}

if (require.main === module) {
  app.listen(port, () => {
    console.log(`MediaFlow running at http://localhost:${port}`);
    applyR2CorsOnStartup();
    cleanStuckExportJobs();
    // Sweep for videos uploaded through Vercel (which cannot transcode) so
    // their renditions generate whenever this studio server is running.
    if (getFfmpegPath()) {
      setTimeout(requeuePendingProxies, 15 * 1000);
      setInterval(requeuePendingProxies, 5 * 60 * 1000);
    }
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

// Exposed for the transcoder container (transcoder/container-entry.js), which
// reuses the exact same sweep/export pipeline with FFmpeg available.
app.requeuePendingProxies = requeuePendingProxies;
app.runExportJob = runExportJob;

module.exports = app;
