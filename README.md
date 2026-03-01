# Euphoria Paste (Haste Fork)

Euphoria Paste is an open-source pastebin server written in Node.js and forked from Haste.
It supports multiple storage backends and includes a modernized frontend, structured logging,
health checks, and safer runtime defaults.

## Highlights

- ES Modules runtime
- Mobile-friendly UI updates
- Line/word/character counters
- Request tracing with `X-Request-Id`
- `GET /health` endpoint
- Graceful shutdown handling
- Optional Discord webhook logging (explicitly gated)
- Security-focused runtime headers and request limits

## Requirements

- Node.js `>=18`

## Quick Start

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the server:

   ```bash
   npm start
   ```

3. Open the app:

   ```text
   http://localhost:8080
   ```

### Config Bootstrap Behavior

- The app expects `config.js`.
- If `config.js` is missing, the server automatically copies `config.js.example` to `config.js` on startup.
- `config.js` is ignored by git so local secrets/settings stay local.

## Scripts

- `npm start` — start server
- `npm run dev` — start with auto-reload (`nodemon`)
- `npm run lint` — lint maintained server/store/test files
- `npm test` — run smoke tests
- `npm run format` — format files with Prettier
- `npm run format:check` — check formatting without changing files

## API

### Health

`GET /health`

Example response:

```json
{
  "status": "ok",
  "requestId": "f8f5f8c1-4bb0-4d76-9a13-0d0cb5e1f893"
}
```

### Create Document

`POST /documents` (plain text body)

Success response:

```json
{
  "key": "exampleKey",
  "requestId": "0a4d2fef-37b0-4100-9077-97d3642b4da7"
}
```

### Read Document JSON

`GET /documents/:id`

Success response:

```json
{
  "data": "document contents",
  "key": "exampleKey",
  "requestId": "4e946b8e-5ebc-46df-a937-3b8e10f145ca"
}
```

### Read Raw

`GET /raw/:id`

Returns plain text body.

### Error Responses

Error payloads now include request tracing:

```json
{
  "message": "Document not found.",
  "requestId": "40ea3f76-e4ac-4b85-9d03-f8e1d1507ef2"
}
```

## Key Runtime Settings

Configured in `config.js` (based on `config.js.example`):

- `host` — bind host (default `0.0.0.0`)
- `port` — bind port (default `8080`)
- `keyLength` — generated document key length
- `maxLength` — max document body length
- `staticMaxAge` — static asset cache max-age seconds
- `recompressStaticAssets` — minify static JS on startup
- `postTimeoutMs` — upload timeout for `POST /documents`
- `requestTimeoutMs` — Node server request timeout
- `headersTimeoutMs` — Node server headers timeout
- `documents` — static preloaded documents map
- `storage` — storage backend config
- `rateLimits` — connect-ratelimit settings
- `discordWebhookUrl` — webhook URL
- `enableDiscordLogging` — must be `true` to forward Discord logs

Environment variable overrides used by server:

- `PORT`, `HOST`
- `STORAGE`, `STORAGE_TYPE`
- `DISCORD_WEBHOOK_URL`
- `ENABLE_DISCORD_LOGGING`
- `POST_TIMEOUT_MS`, `REQUEST_TIMEOUT_MS`, `HEADERS_TIMEOUT_MS`

## Storage Backends

Set `storage.type` in `config.js`.

### File (Default)

```json
{
  "type": "file",
  "path": "./data"
}
```

### Redis

```json
{
  "type": "redis",
  "host": "localhost",
  "port": 6379,
  "db": 2
}
```

### Postgres

```json
{
  "type": "postgres",
  "connectionUrl": "postgres://user:password@host:5432/database"
}
```

### MongoDB

```json
{
  "type": "mongo",
  "connectionUrl": "mongodb://localhost:27017/database"
}
```

### Memcached

```json
{
  "type": "memcached",
  "host": "127.0.0.1",
  "port": 11211
}
```

### RethinkDB

```json
{
  "type": "rethinkdb",
  "host": "127.0.0.1",
  "port": 28015,
  "db": "haste"
}
```

### Google Datastore

```json
{
  "type": "google-datastore"
}
```

### Amazon S3

```json
{
  "type": "amazon-s3",
  "bucket": "your-bucket-name",
  "region": "us-east-1"
}
```

Uses AWS SDK v3 (`@aws-sdk/client-s3`).

## CI & Security

Workflow: `.github/workflows/ci.yml`

Runs on push, PR, and weekly schedule:

- `npm ci`
- `npm run lint`
- `npm test`
- `npm audit --omit=dev`

## Local Redis via Docker Compose

This repo includes a Redis profile for local backend testing:

```bash
docker compose --profile local-redis up -d
```

Then configure `storage.type` to `redis` in `config.js`.

## Troubleshooting

### `Cannot find module './config.js'`

Run `npm start` once; the server auto-creates `config.js` from `config.js.example` if needed.

### Port already in use

Change `port` in `config.js` or set `PORT` env var.

### Favicon/logo not loading

The app uses local static assets (`static/favicon.ico`, `static/logo.png`).
Hard refresh browser cache if needed.

## Author

Rep Graphics <repgraphics@euphoriadevelopment.uk>

## Third-Party Components

- jQuery: MIT/GPL
- highlight.js: Copyright © 2006 Ivan Sagalaev
- highlightjs-coffeescript: WTFPL, Copyright © 2011 Dmytrii Nagirniak
