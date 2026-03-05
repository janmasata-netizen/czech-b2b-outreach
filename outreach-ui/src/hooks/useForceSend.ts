import { useMutation, useQueryClient } from '@tanstack/react-query';

interface ForceSendResult {
  success: boolean;
  message?: string;
  error?: string;
}

export function useForceSendSequence(waveId: string) {
  const qc = useQueryClient();
  return useMutation<ForceSendResult, Error, { queueIds: string[] }>({
    mutationFn: async ({ queueIds }) => {
      const res = await fetch(`${import.meta.env.VITE_N8N_WEBHOOK_URL}/wf-force-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    },
  });
}
