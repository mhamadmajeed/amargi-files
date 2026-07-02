# Cloudflare Container image for the Amargi Files transcoder.
# Runs the app's own export pipeline (server.js) with real FFmpeg.
FROM node:20-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY server.js ./server.js
COPY transcoder/container-entry.js ./transcoder/container-entry.js

ENV FFMPEG_PATH=/usr/bin/ffmpeg \
    FFPROBE_PATH=/usr/bin/ffprobe \
    DATA_DIR=/tmp/amargi-data \
    NODE_ENV=production

EXPOSE 8080
CMD ["node", "transcoder/container-entry.js"]
