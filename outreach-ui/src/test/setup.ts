import '@testing-library/jest-dom';
import '@/i18n';

// Mock env vars for tests
Object.defineProperty(import.meta, 'env', {
  value: {
    VITE_SUPABASE_URL: 'https://test.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    VITE_N8N_WEBHOOK_URL: 'https://n8n.test.com/webhook',
    VITE_WEBHOOK_SECRET: 'test-secret',
    DEV: true,
    MODE: 'test',
  },
});
