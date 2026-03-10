import { describe, it, expect, vi } from 'vitest';

// Mock import.meta.env before importing n8n module
vi.stubEnv('VITE_N8N_WEBHOOK_URL', 'https://n8n.test.com/webhook');
vi.stubEnv('VITE_WEBHOOK_SECRET', 'test-secret');

// Dynamic import to pick up mocked env
const { n8nWebhookUrl, n8nHeaders } = await import('./n8n');

describe('n8nWebhookUrl', () => {
  it('builds full URL from path', () => {
    const url = n8nWebhookUrl('lead-ingest');
    expect(url).toContain('/webhook/lead-ingest');
  });

  it('handles paths with leading slash', () => {
    const url = n8nWebhookUrl('/lead-ingest');
    expect(url).toContain('lead-ingest');
  });
});

describe('n8nHeaders', () => {
  it('includes Content-Type', () => {
    const h = n8nHeaders();
    expect(h['Content-Type']).toBe('application/json');
  });

  it('includes X-Webhook-Secret when configured', () => {
    const h = n8nHeaders();
    expect(h).toHaveProperty('X-Webhook-Secret');
    expect(typeof h['X-Webhook-Secret']).toBe('string');
    expect(h['X-Webhook-Secret']!.length).toBeGreaterThan(0);
  });

  it('merges extra headers', () => {
    const h = n8nHeaders({ 'X-Custom': 'value' });
    expect(h['X-Custom']).toBe('value');
    expect(h['Content-Type']).toBe('application/json');
  });
});
