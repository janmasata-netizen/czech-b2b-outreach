import { useMutation, useQueryClient } from '@tanstack/react-query';
import { n8nWebhookUrl, n8nHeaders } from '@/lib/n8n';
import { useDemoMode } from '@/contexts/DemoModeContext';

interface ForceSendResult {
  success: boolean;
  message?: string;
  error?: string;
}

export function useForceSendSequence(waveId: string) {
  const qc = useQueryClient();
  const { isDemoMode } = useDemoMode();
  return useMutation<ForceSendResult, Error, { queueIds: string[] }>({
    mutationFn: async ({ queueIds }) => {
      if (isDemoMode) return { success: true, message: 'Demo mode' };
      const res = await fetch(n8nWebhookUrl('wf-force-send'), {
        method: 'POST',
        headers: n8nHeaders(),
        body: JSON.stringify({ queue_ids: queueIds }),
      });
      if (!res.ok) {
        const text = await res.text();
        let parsed;
        try { parsed = JSON.parse(text); } catch { parsed = null; }
        throw new Error(parsed?.error || `HTTP ${res.status}: ${text}`);
      }
      return res.json();
    },
    onSuccess: () => {
      if (!isDemoMode) {
        qc.invalidateQueries({ queryKey: ['waves', waveId] });
        qc.invalidateQueries({ queryKey: ['waves'] });
        qc.invalidateQueries({ queryKey: ['settings', 'teams'] });
      }
    },
  });
}
