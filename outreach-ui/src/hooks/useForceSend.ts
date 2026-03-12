import { useMutation, useQueryClient } from '@tanstack/react-query';
import { n8nWebhookUrl, n8nHeaders } from '@/lib/n8n';

interface ForceSendResult {
  success: boolean;
  message?: string;
  error?: string;
}

export function useForceSendSequence(waveId: string) {
  const qc = useQueryClient();
  return useMutation<ForceSendResult, Error, { queueIds: string[] }>({
    mutationFn: async ({ queueIds }) => {
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
      qc.invalidateQueries({ queryKey: ['waves', waveId] });
      qc.invalidateQueries({ queryKey: ['waves'] });
      qc.invalidateQueries({ queryKey: ['settings', 'teams'] });
    },
  });
}
