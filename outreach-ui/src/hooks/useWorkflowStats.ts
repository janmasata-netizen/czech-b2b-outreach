import { useQuery } from '@tanstack/react-query';
import { n8nWebhookUrl, n8nHeaders } from '@/lib/n8n';
import { useDemoMode } from '@/contexts/DemoModeContext';
import { DEMO_WORKFLOW_STATS } from '@/lib/demo-data';

export interface WorkflowTimeSeries {
  bucket: string;
  success: number;
  failure: number;
}

export interface WorkflowStat {
  name: string;
  totalRuns: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  avgDurationMs: number;
  lastFailure: string | null;
}

export interface RecentFailure {
  workflowName: string;
  error: string;
  timestamp: string;
}

interface WorkflowStatsResponse {
  timeSeries: WorkflowTimeSeries[];
  workflows: WorkflowStat[];
  recentFailures: RecentFailure[];
}

export function useWorkflowStats(range: '24h' | '7d' | '30d' = '24h') {
  const { isDemoMode } = useDemoMode();
  return useQuery<WorkflowStatsResponse>({
    queryKey: ['workflow-stats', range],
    refetchInterval: isDemoMode ? false : 30_000,
    retry: 1,
    queryFn: async () => {
      if (isDemoMode) return DEMO_WORKFLOW_STATS as WorkflowStatsResponse;
      const res = await fetch(n8nWebhookUrl(`wf-execution-stats?range=${range}`), {
        headers: n8nHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });
}
