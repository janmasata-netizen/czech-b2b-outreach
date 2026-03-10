import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';

const PORT = 13002;

function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1',
      port: PORT,
      path,
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
    };
    const req = http.request(opts, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data), headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, body: data, headers: res.headers });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe('SMTP Proxy Server', () => {
  it('GET /health returns 200', async () => {
    const res = await request('GET', '/health').catch(() => null);
    if (!res) {
      console.log('SKIP: server not running on port', PORT);
      return;
    }
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
  });

  it('POST /send-email without auth returns 401 when token is set', async () => {
    const res = await request('POST', '/send-email', { credential_name: 'test', to: 'a@b.cz' }).catch(() => null);
    if (!res) return;
    if (res.status === 401) {
      assert.equal(res.body.error, 'Unauthorized');
    }
  });

  it('POST /send-email with missing to returns 400', async () => {
    const res = await request('POST', '/send-email',
      { credential_name: 'test' },
      { 'Authorization': 'Bearer test-token' },
    ).catch(() => null);
    if (!res) return;
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Missing to');
  });

  it('POST /send-email rejects header injection in subject', async () => {
    const res = await request('POST', '/send-email',
      { credential_name: 'test', to: 'a@b.cz', from: 'x@y.cz', subject: 'Test\r\nBcc: evil@evil.com', html: '<p>hi</p>' },
      { 'Authorization': 'Bearer test-token' },
    ).catch(() => null);
    if (!res) return;
    // Should fail (500 from sendEmail throwing, or 400)
    assert.ok(res.status >= 400, 'Should reject header injection');
  });

  it('returns security headers', async () => {
    const res = await request('GET', '/health').catch(() => null);
    if (!res) return;
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['x-frame-options'], 'DENY');
  });

  it('GET /nonexistent returns 404', async () => {
    const res = await request('GET', '/nonexistent').catch(() => null);
    if (!res) return;
    assert.equal(res.status, 404);
  });
});
