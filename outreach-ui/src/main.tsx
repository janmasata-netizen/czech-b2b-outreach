import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster } from 'sonner';
import './i18n';
import App from './App';
import './index.css';

// Validate required env vars at startup
const REQUIRED_ENV_VARS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_N8N_WEBHOOK_URL',
] as const;

const missingVars = REQUIRED_ENV_VARS.filter(v => !import.meta.env[v]);
if (missingVars.length > 0) {
  document.getElementById('root')!.innerHTML =
    `<div style="color:#f87171;padding:40px;font-family:monospace;text-align:center">
      <h2>Missing environment variables</h2>
      <p>${missingVars.join(', ')}</p>
      <p style="color:#888;margin-top:16px">Copy .env.example to .env.local and fill in values.</p>
    </div>`;
  throw new Error(`Missing env vars: ${missingVars.join(', ')}`);
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <App />
        <Toaster
          richColors
          position="top-right"
          toastOptions={{
            style: {
              background: '#1a1a1a',
              border: '1px solid #2a2a2a',
              color: '#ededed',
            },
          }}
        />
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>
);
