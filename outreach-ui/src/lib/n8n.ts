// Utility for calling n8n webhook endpoints with auth header
const N8N_BASE = import.meta.env.VITE_N8N_WEBHOOK_URL;
const WEBHOOK_SECRET = import.meta.env.VITE_WEBHOOK_SECRET;

export function n8nWebhookUrl(path: string): string {
  return `${N8N_BASE}/${path}`;
}

export function n8nHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(WEBHOOK_SECRET ? { 'X-Webhook-Secret': WEBHOOK_SECRET } : {}),
    ...extra,
  };
}
