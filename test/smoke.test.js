import assert from 'assert';
import { spawn } from 'child_process';

const TEST_PORT = 18080;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
let serverProcess;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServerReady() {
  const retries = 30;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetch(`${BASE_URL}/health`);
      if (response.ok) {
        return;
      }
    } catch (error) {
      await wait(250);
    }
  }

  throw new Error('Server did not become ready in time.');
}

describe('Smoke Tests', function () {
  this.timeout(15000);

  before(async () => {
    serverProcess = spawn('node', ['server.js'], {
      env: {
        ...process.env,
        PORT: String(TEST_PORT),
        HOST: '127.0.0.1',
        ENABLE_DISCORD_LOGGING: 'false',
      },
      stdio: 'ignore',
    });

    await waitForServerReady();
  });

  after(() => {
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill('SIGTERM');
    }
  });

  it('responds to health endpoint', async () => {
    const response = await fetch(`${BASE_URL}/health`);
    const body = await response.json();

    assert.strictEqual(response.status, 200);
    assert.strictEqual(body.status, 'ok');
    assert.ok(body.requestId);
    assert.strictEqual(typeof body.requestId, 'string');
  });

  it('creates a document and serves it as raw text', async () => {
    const createResponse = await fetch(`${BASE_URL}/documents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
      body: 'smoke-test-content',
    });

    assert.strictEqual(createResponse.status, 200);

    const created = await createResponse.json();
    assert.ok(created.key);

    const rawResponse = await fetch(`${BASE_URL}/raw/${created.key}`);
    const rawBody = await rawResponse.text();

    assert.strictEqual(rawResponse.status, 200);
    assert.strictEqual(rawBody, 'smoke-test-content');
  });
});
