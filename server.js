// Import necessary modules
import http from 'http';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import path from 'path';
import { minify as terserMinify } from 'terser';
import pino from 'pino';
import connect from 'connect';
import route from 'connect-route';
import serveStatic from 'st';
import rateLimit from 'connect-ratelimit';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import DocumentHandler from './lib/document_handler.js';

dotenv.config();

const resolvedConfigPath = path.resolve('./config.js');
const resolvedConfigExamplePath = path.resolve('./config.js.example');
let createdConfigFromExample = false;

if (
  !fs.existsSync(resolvedConfigPath) &&
  fs.existsSync(resolvedConfigExamplePath)
) {
  fs.copyFileSync(resolvedConfigExamplePath, resolvedConfigPath);
  createdConfigFromExample = true;
}

const { default: config } = await import('./config.js');

config.port = process.env.PORT || config.port || 7777;
config.host = process.env.HOST || config.host || 'localhost';
config.storage = process.env.STORAGE || config.storage || { type: 'file' };
config.storage.type = process.env.STORAGE_TYPE || config.storage.type || 'file';
const enableDiscordLogging =
  process.env.ENABLE_DISCORD_LOGGING === 'true' ||
  config.enableDiscordLogging === true;
const discordWebhookUrl =
  process.env.DISCORD_WEBHOOK_URL || config.discordWebhookUrl || null;

// Configure Pino logger
const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  },
});

if (createdConfigFromExample) {
  logger.warn(
    'config.js was missing and has been created from config.js.example',
  );
}
logger.info({ configSource: 'config.js' }, 'Configuration loaded');

if (enableDiscordLogging && !discordWebhookUrl) {
  logger.warn('Discord logging is enabled but no webhook URL is configured');
}

// Function to send logs to Discord
function sendLogToDiscord(message) {
  if (enableDiscordLogging && discordWebhookUrl) {
    fetch(discordWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message }),
    }).catch((err) => {
      logger.error('Failed to send log to Discord', { error: err });
    });
  }
}

// Initialize key generator
const { type: keyGenType = 'random', ...keyGenOptions } =
  config.keyGenerator || {};
const KeyGenerator = (await import(`./lib/key_generators/${keyGenType}.js`))
  .default;
const keyGenerator = new KeyGenerator(keyGenOptions);

// Initialize the preferred store
let Store;
let preferredStore;
if (process.env.REDISTOGO_URL && config.storage.type === 'redis') {
  const redisClient = (await import('redis-url')).connect(
    process.env.REDISTOGO_URL,
  );
  Store = (await import('./lib/document_stores/redis.js')).default;
  preferredStore = new Store(config.storage, redisClient);
} else {
  Store = (await import(`./lib/document_stores/${config.storage.type}.js`))
    .default;
  preferredStore = new Store(config.storage);
}

const documentHandler = new DocumentHandler({
  store: preferredStore,
  maxLength: config.maxLength,
  keyLength: config.keyLength,
  keyGenerator,
  config, // Pass the full config including discordWebhookUrl
});

// Resolve __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Compress static JavaScript assets
if (config.recompressStaticAssets) {
  const staticDir = path.join(__dirname, 'static');
  const files = fs.readdirSync(staticDir);

  for (const file of files.filter(
    (file) => file.endsWith('.js') && !file.endsWith('.min.js'),
  )) {
    const filePath = path.join(staticDir, file);
    const minFilePath = filePath.replace(/\.js$/, '.min.js');
    try {
      const code = fs.readFileSync(filePath, 'utf8');
      const minified = await terserMinify(code);

      if (!minified.code) {
        logger.error(`Error minifying file: ${file}`, {
          error: 'Unknown minification error',
          filePath,
        });
      } else {
        fs.writeFileSync(minFilePath, minified.code, 'utf8');
        logger.info(`Compressed ${file} to ${path.basename(minFilePath)}`);
      }
    } catch (err) {
      logger.error(`Failed to process file: ${file}`, { error: err.message });
    }
  }
}

// Preload static documents
for (const [name, documentPath] of Object.entries(config.documents || {})) {
  try {
    const data = fs.readFileSync(documentPath, 'utf8');
    preferredStore.set(
      name,
      data,
      () => {
        logger.debug(`Loaded static document: ${name}`);
      },
      true,
    );
  } catch (err) {
    logger.warn(`Failed to load static document: ${name} - ${err.message}`);
  }
}

const app = connect();

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=()',
  );
  next();
});

app.use((req, res, next) => {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  logger.info(
    { requestId, method: req.method, path: req.url },
    'Request started',
  );

  res.on('finish', () => {
    logger.info(
      {
        requestId,
        method: req.method,
        path: req.url,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
      },
      'Request completed',
    );
  });

  next();
});

app.use((req, res, next) => {
  const routePath = (req.url || '').split('?')[0];
  const originalWriteHead = res.writeHead;

  res.writeHead = function patchedWriteHead(...args) {
    if (
      routePath === '/health' ||
      routePath.startsWith('/documents') ||
      routePath.startsWith('/raw/')
    ) {
      res.setHeader('Cache-Control', 'no-store');
    } else if (
      routePath === '/' ||
      routePath.endsWith('.html') ||
      !path.extname(routePath)
    ) {
      res.setHeader('Cache-Control', 'no-cache');
    } else if (
      routePath.endsWith('.min.js') ||
      routePath.endsWith('.min.css')
    ) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      res.setHeader(
        'Cache-Control',
        `public, max-age=${config.staticMaxAge || 86400}`,
      );
    }

    return originalWriteHead.apply(this, args);
  };

  next();
});

app.use((req, res, next) => {
  if (req.method === 'POST' && req.url === '/documents') {
    const contentLength = Number(req.headers['content-length'] || 0);
    const postTimeoutMs = Number(
      process.env.POST_TIMEOUT_MS || config.postTimeoutMs || 15000,
    );

    if (config.maxLength && contentLength && contentLength > config.maxLength) {
      res.writeHead(413, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          message: 'Payload too large.',
          requestId: req.requestId || null,
        }),
      );
      return;
    }

    req.setTimeout(postTimeoutMs, () => {
      if (!res.headersSent) {
        res.writeHead(408, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            message: 'Request timeout.',
            requestId: req.requestId || null,
          }),
        );
      }
      req.destroy();
    });
  }

  next();
});

// Apply rate limiting if configured
if (config.rateLimits) {
  app.use(rateLimit({ ...config.rateLimits, end: true }));
}

// Define API routes
app.use(
  route((router) => {
    router.get('/health', (req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({ status: 'ok', requestId: req.requestId || null }),
      );
    });
    router.get('/raw/:id', (req, res) =>
      documentHandler.handleRawGet(req, res, config),
    );
    router.head('/raw/:id', (req, res) =>
      documentHandler.handleRawGet(req, res, config),
    );
    router.get('/documents/:id', (req, res) =>
      documentHandler.handleGet(req, res, config),
    );
    router.post('/documents', (req, res) =>
      documentHandler.handlePost(req, res),
    );
    router.head('/documents/:id', (req, res) =>
      documentHandler.handleGet(req, res, config),
    );
  }),
);

// Serve static files
const staticOptions = {
  path: path.join(__dirname, 'static'),
  content: { maxAge: config.staticMaxAge },
  passthrough: true,
  index: false,
};
app.use(serveStatic(staticOptions));

// Fallback to index.html for unmatched routes
app.use(
  route((router) => {
    router.get('/:id', (req, res, next) => {
      // Strip any file extension from the ID
      req.params.id = req.params.id.split('.')[0];
      req.sturl = '/';
      next();
    });
  }),
);
app.use(serveStatic({ ...staticOptions, index: 'index.html' }));

// Start the server
const server = http.createServer(app);

server.requestTimeout = Number(
  process.env.REQUEST_TIMEOUT_MS || config.requestTimeoutMs || 30000,
);
server.headersTimeout = Number(
  process.env.HEADERS_TIMEOUT_MS || config.headersTimeoutMs || 60000,
);

server.listen(config.port, config.host, () => {
  const message = `Server listening on ${config.host}:${config.port}`;
  logger.info(message);
  sendLogToDiscord(message);
});

server.on('error', (error) => {
  logger.error(`Server error: ${error.message}`, { error });
  sendLogToDiscord(
    `:x: Server error on ${config.host}:${config.port} - ${error.message}`,
  );
});

const shutdown = (signal) => {
  logger.info(`Received ${signal}, shutting down server...`);
  server.close(() => {
    logger.info('Server shutdown complete.');
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
