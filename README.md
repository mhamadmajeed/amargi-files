# Amargi Files

Amargi Files is a private media review app backed by Cloudflare R2. It supports admin-created users, project folders, large direct-to-R2 uploads, original downloads, video proxy playback, timestamped comments, assignments, workflow status, and shareable review links.

## Setup

Create a private Cloudflare R2 bucket and an R2 API token with object read/write permissions for that bucket. If you want the app to update bucket CORS from the admin settings, the token also needs R2 Admin Read & Write for that bucket. Add these environment variables:

```bash
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_BUCKET=your_bucket_name
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_ENDPOINT=https://your_account_id.r2.cloudflarestorage.com
APP_SESSION_SECRET=replace-with-a-long-random-string
```

`R2_ENDPOINT` is optional when `R2_ACCOUNT_ID` is set. The bucket should stay private. The app creates signed upload and download URLs. R2 credentials are backend-only environment variables and are not editable from the web UI.

### R2 Browser Upload CORS

Direct browser uploads require CORS on the private R2 bucket. Apply the rules in `r2-cors.json` to the bucket, or use the Cloudflare dashboard:

- Allowed origins: `https://amargi-files.vercel.app`, `http://localhost:4174`, `https://localhost:4175`
- Allowed methods: `GET`, `HEAD`, `PUT`
- Allowed headers: `*`
- Exposed headers: `ETag`, `etag`

If this is missing, uploads fail in the browser with a CORS/storage-bucket message. If the app cannot save CORS automatically, the R2 token likely only has object read/write permissions and not bucket-admin permission.

On Vercel, also set:

```bash
APP_SECURE_COOKIES=true
APP_URL=https://amargi-files.vercel.app
```

JSON metadata is persisted in the private R2 bucket when R2 is configured. Vercel Blob support remains as an optional fallback, but it is not required for the current R2-backed setup.

## Email Notifications

Set SMTP environment variables to send email when a user is assigned to a file or mentioned in a comment. For Zoho EU mailboxes:

```bash
SMTP_HOST=smtp.zoho.eu
SMTP_PORT=465
SMTP_USER=footage@theamargi.com
SMTP_PASS=your_mailbox_or_app_password
SMTP_FROM=Amargi Files <footage@theamargi.com>
SMTP_SECURE=true
```

Mentions work with `@email@example.com`, `@username`, or a user's first/last name from their profile.

## Metadata Database

The current implementation stores metadata in `media-db.json` using the same persistent JSON pattern as the existing membership system:

- Projects
- Folders
- Files
- R2 object keys
- Upload status
- Owner
- Created date
- File size/type
- Proxy status
- Comments
- Share links
- Activity log

For higher-volume production, migrate `media-db.json`, `users.json`, `file-workflows.json`, `comment-meta.json`, and `activity-log.json` to Postgres, D1, Neon, Supabase, or another transactional database. The server code keeps metadata access centralized so this can be replaced later.

## Activity Retention

The app records important user activity in `activity-log.json` and automatically keeps only the most recent 60 days. Activity includes:

- Logins and logouts
- Admin settings changes
- User creation and password updates
- Folder creation, rename, and delete
- Upload start, completion, and abort
- Thumbnail updates
- File rename and delete
- Comment creation, edit, reply, resolve, and reopen
- Assignment and workflow status changes
- Share link creation and unlocks

Admins can read recent activity with:

```bash
GET /api/admin/activity?limit=100
```

## Upload Flow

1. The browser asks the server to create a file record.
2. The server creates an R2 object key and returns a signed PUT URL.
3. The browser uploads the original file directly to R2.
4. The browser calls `/api/files/:fileId/complete`.
5. The server marks the file ready and starts proxy generation for videos.

The original file is never modified. Downloads use signed private R2 URLs.

## Video Proxy Generation

Video proxy generation uses FFmpeg:

- Input: signed private URL for the original R2 object
- Output: H.264/AAC MP4 proxy
- Upload: proxy MP4 is saved as a separate R2 object
- Thumbnail: first-frame JPEG is uploaded separately when possible

The review player streams the proxy when available and falls back to the original signed URL while the proxy is processing.

The app uses `@ffmpeg-installer/ffmpeg` by default. You can override it:

```bash
FFMPEG_PATH=/path/to/ffmpeg
```

## Access Control

- Users must log in before accessing internal project, folder, file, upload, comment, and download APIs.
- Admins create users manually.
- R2 objects are private.
- Uploads and downloads use short-lived signed URLs.
- Share links only expose selected files.

Share-link password enforcement is scaffolded in metadata and should be hardened before public client use.

## Testing

1. Start the app:

```bash
npm start
```

2. Log in with an admin account.
3. Confirm the storage badge says R2 connected. If it says storage is missing, add the R2 environment variables in Vercel and redeploy.
4. Create a folder.
5. Upload a video.
6. Confirm the original appears in the folder.
7. Open the video and check preview playback.
8. Add a timestamped comment and click it to seek.
9. Use the Download menu to download the original.
10. Click Share to create a review link.

## Notes

The UI intentionally keeps the previous review workflow: folders first, opening a video switches to a large player with comments on the right.
