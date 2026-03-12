import { useState, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { useParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useWave, useTemplateSets, useDeleteWave, useUpdateWave, useCreateWave, useFailedEmails, useRetryFailedEmail } from '@/hooks/useWaves';
import { useForceSendSequence } from '@/hooks/useForceSend';
import { supabase } from '@/lib/supabase';
import { n8nWebhookUrl, n8nHeaders } from '@/lib/n8n';
import type { WaveLeadRow, EmailQueue, EmailTemplate, Wave } from '@/types/database';
import PageHeader from '@/components/layout/PageHeader';
import GlassButton from '@/components/glass/GlassButton';
import GlassCard from '@/components/glass/GlassCard';
import GlassModal from '@/components/glass/GlassModal';
import ConfirmDialog from '@/components/glass/ConfirmDialog';
import StatusBadge from '@/components/shared/StatusBadge';
import LoadingSkeleton from '@/components/shared/LoadingSkeleton';
import EmptyState from '@/components/shared/EmptyState';
import WaveConfigForm from '@/components/waves/WaveConfigForm';
import WaveLeadsManager from '@/components/waves/WaveLeadsManager';
import WaveResults from '@/components/waves/WaveResults';
import { extractVariables, buildTemplateContext, findMissingVariables, renderTemplate } from '@/lib/templateRenderer';
import Breadcrumb from '@/components/shared/Breadcrumb';
import { exportCsv } from '@/lib/export';
import { toast } from 'sonner';

/** Format YYYY-MM-DD → DD.MM.YYYY */
function fmtDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/** Tab id + label for each wave status */
const TAB_META: Record<string, { id: string; label: string }> = {
  draft:     { id: 'manager', label: 'Manager' },
  scheduled: { id: 'live',    label: 'Live' },
  sending:   { id: 'live',    label: 'Live' },
  done:      { id: 'archive', label: 'Archiv' },
  completed: { id: 'archive', label: 'Archiv' },
  paused:    { id: 'archive', label: 'Archiv' },
};

export default function WaveDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading, error } = useWave(id);
  const { data: templateSets } = useTemplateSets();
  const deleteWave = useDeleteWave();
  const updateWave = useUpdateWave();
  const [seqDates, setSeqDates] = useState<Record<number, string>>({
    1: data?.wave?.send_date_seq1?.slice(0, 10) ?? '',
    2: data?.wave?.send_date_seq2?.slice(0, 10) ?? '',
    3: data?.wave?.send_date_seq3?.slice(0, 10) ?? '',
  });
  const [seqTimes, setSeqTimes] = useState<Record<number, string>>({
    1: data?.wave?.send_time_seq1?.slice(0, 5) ?? '08:00',
    2: data?.wave?.send_time_seq2?.slice(0, 5) ?? '08:00',
    3: data?.wave?.send_time_seq3?.slice(0, 5) ?? '08:00',
  });
  // Hydrate dates/times when wave data loads (useState init runs before useWave resolves)
  useEffect(() => {
    if (!data?.wave) return;
    const w = data.wave;
    setSeqDates(prev => ({
      1: prev[1] || w.send_date_seq1?.slice(0, 10) || '',
      2: prev[2] || w.send_date_seq2?.slice(0, 10) || '',
      3: prev[3] || w.send_date_seq3?.slice(0, 10) || '',
    }));
    setSeqTimes(prev => ({
      1: prev[1] !== '08:00' ? prev[1] : (w.send_time_seq1?.slice(0, 5) || '08:00'),
      2: prev[2] !== '08:00' ? prev[2] : (w.send_time_seq2?.slice(0, 5) || '08:00'),
      3: prev[3] !== '08:00' ? prev[3] : (w.send_time_seq3?.slice(0, 5) || '08:00'),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.wave?.id]);

  const [scheduling, setScheduling] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [rerunSeqDates, setRerunSeqDates] = useState<Record<number, string>>({ 1: '', 2: '', 3: '' });
  const [rerunSeqTimes, setRerunSeqTimes] = useState<Record<number, string>>({ 1: '08:00', 2: '08:00', 3: '08:00' });
  const [rerunning, setRerunning] = useState(false);
  const [sendingNow, setSendingNow] = useState(false);

  // Confirm dialog state
  const [confirmSchedule, setConfirmSchedule] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [confirmRerun, setConfirmRerun] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmSendNow, setConfirmSendNow] = useState(false);
  const [missingVarsWarning, setMissingVarsWarning] = useState<Array<{ lead: string; missing: string[] }> | null>(null);
  const [confirmForceSendAll, setConfirmForceSendAll] = useState(false);
  const [confirmForceSendItem, setConfirmForceSendItem] = useState<EmailQueue | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const forceSend = useForceSendSequence(id ?? '');
  const createWave = useCreateWave();
  const { data: failedEmails } = useFailedEmails(id ?? '');
  const retryFailed = useRetryFailedEmail();

  if (isLoading) return <LoadingSkeleton />;
  if (error || !data) return (
    <EmptyState icon="⌁" title="Vlna nenalezena" action={<GlassButton onClick={() => navigate('/vlny')}>← Zpět na vlny</GlassButton>} />
  );

  const { wave, waveLeads } = data;
  const meta = TAB_META[wave.status] ?? { id: 'manager', label: 'Manager' };
  const backUrl = `/vlny?tab=${meta.id}`;
  const tabLabel = meta.label;
  const hasSentEmails = waveLeads.some((wl: WaveLeadRow) => (wl.sent_emails?.length ?? 0) > 0);
  const _now = new Date();
  const today = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`;

  // Compute available sequences from template set
  const currentTemplateSet = templateSets?.find(ts => ts.id === wave.template_set_id);
  const availableSeqs: number[] = currentTemplateSet?.email_templates
    ? Array.from(new Set<number>(currentTemplateSet.email_templates.map((t: EmailTemplate) => t.sequence_number))).sort((a, b) => a - b)
    : [];

  const canLaunch = wave.status === 'draft'
    && waveLeads.length > 0
    && availableSeqs.length > 0
    && availableSeqs.every(seq => !!seqDates[seq]);

  // Gap button options and defaults
  const GAP_OPTIONS = [1, 2, 3, 5, 7];
  const DEFAULT_GAPS: Record<string, number> = { '1-2': 2, '2-3': 3 };

  function addDays(dateStr: string, days: number): string {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function applyGap(fromSeq: number, toSeq: number, days: number, mode: 'schedule' | 'rerun' = 'schedule') {
    const dates = mode === 'schedule' ? seqDates : rerunSeqDates;
    const times = mode === 'schedule' ? seqTimes : rerunSeqTimes;
    const setDates = mode === 'schedule' ? setSeqDates : setRerunSeqDates;
    const setTimes = mode === 'schedule' ? setSeqTimes : setRerunSeqTimes;
    if (!dates[fromSeq]) return;
    const newDate = addDays(dates[fromSeq], days);
    setDates(prev => ({ ...prev, [toSeq]: newDate }));
    setTimes(prev => ({ ...prev, [toSeq]: times[fromSeq] }));
  }

  function handleSeqDateChange(seq: number, value: string, mode: 'schedule' | 'rerun' = 'schedule') {
    const setDates = mode === 'schedule' ? setSeqDates : setRerunSeqDates;
    const setTimes = mode === 'schedule' ? setSeqTimes : setRerunSeqTimes;
    const dates = mode === 'schedule' ? seqDates : rerunSeqDates;
    const times = mode === 'schedule' ? seqTimes : rerunSeqTimes;
    setDates(prev => {
      const next = { ...prev, [seq]: value };
      // Auto-fill subsequent empty seqs with default gaps
      if (seq === 1 && value) {
        if (!dates[2] && availableSeqs.includes(2)) {
          next[2] = addDays(value, DEFAULT_GAPS['1-2']);
          setTimes(t => ({ ...t, 2: times[1] }));
        }
        if (!dates[3] && availableSeqs.includes(3)) {
          const seq2Date = next[2] || addDays(value, DEFAULT_GAPS['1-2']);
          next[3] = addDays(seq2Date, DEFAULT_GAPS['2-3']);
          setTimes(t => ({ ...t, 3: times[1] }));
        }
      } else if (seq === 2 && value && !dates[3] && availableSeqs.includes(3)) {
        next[3] = addDays(value, DEFAULT_GAPS['2-3']);
        setTimes(t => ({ ...t, 3: times[2] }));
      }
      return next;
    });
  }

  // Compute force-send eligible items: pending_prev where previous seq is sent
  const forceSendEligibleItems = waveLeads.flatMap((wl: WaveLeadRow) => {
    const queue: EmailQueue[] = wl.email_queue ?? [];
    return queue.filter((qi: EmailQueue) => {
      if (qi.status !== 'pending_prev') return false;
      return queue.some((q: EmailQueue) => q.sequence_number === qi.sequence_number - 1 && q.status === 'sent');
    });
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handlePreScheduleValidation() {
    if (!canLaunch) return;
    // Get template set for this wave
    const ts = templateSets?.find(t => t.id === wave.template_set_id);
    const tpls = ts?.email_templates ?? [];
    // Extract all variables used across all templates
    const allVarsUsed = new Set<string>();
    for (const t of tpls) {
      for (const v of extractVariables(t.subject)) allVarsUsed.add(v);
      for (const v of extractVariables(t.body_html)) allVarsUsed.add(v);
    }
    if (allVarsUsed.size === 0) {
      setConfirmSchedule(true);
      return;
    }
    // Check each wave lead for missing variables
    const warnings: Array<{ lead: string; missing: string[] }> = [];
    for (const wl of waveLeads) {
      const lead = wl.leads ?? wl.lead;
      const jednatels = lead?.jednatels ?? [];
      const jednatel = jednatels[0] ?? null;
      const ctx = buildTemplateContext(lead, jednatel);
      const missing = findMissingVariables(Array.from(allVarsUsed), ctx);
      if (missing.length > 0) {
        warnings.push({ lead: lead?.company_name ?? lead?.ico ?? 'Neznámý', missing });
      }
    }
    if (warnings.length > 0) {
      setMissingVarsWarning(warnings);
    } else {
      setConfirmSchedule(true);
    }
  }

  async function handleSchedule() {
    if (!canLaunch) return;
    setScheduling(true);
    try {
      await updateWave.mutateAsync({
        id: wave.id,
        updates: {
          send_date_seq1: seqDates[1] || null,
          send_date_seq2: seqDates[2] || null,
          send_date_seq3: seqDates[3] || null,
          send_time_seq1: seqTimes[1] || '08:00',
          send_time_seq2: seqTimes[2] || '08:00',
          send_time_seq3: seqTimes[3] || '08:00',
          send_window_start: seqTimes[1] || '08:00',
        } as Partial<Wave>,
      });
      const res = await fetch(n8nWebhookUrl('wf7-wave-schedule'), {
        method: 'POST',
        headers: n8nHeaders(),
        body: JSON.stringify({ wave_id: wave.id }),
      });
      if (!res.ok) throw new Error(`WF7 vrátil ${res.status}`);
      // Parse WF7 response for scheduling report
      let reportMsg = '';
      try {
        const wf7Data = await res.json();
        if (wf7Data?.scheduling_report?.skipped > 0) {
          reportMsg = ` (${wf7Data.scheduling_report.skipped} leadů přeskočeno)`;
        }
      } catch { /* response may not be JSON */ }
      toast.success('Vlna naplánována — SEQ1: ' + fmtDate(seqDates[1]) + ' ' + seqTimes[1] + reportMsg);
      qc.invalidateQueries({ queryKey: ['waves', id] });
      qc.invalidateQueries({ queryKey: ['waves'] });
    } catch (e: unknown) {
      toast.error('Chyba: ' + (e as Error).message, { duration: Infinity, closeButton: true });
    } finally {
      setScheduling(false);
      setConfirmSchedule(false);
    }
  }

  async function handleStop() {
    setStopping(true);
    try {
      const waveleadIds = waveLeads.map((wl: WaveLeadRow) => wl.id);
      if (waveleadIds.length > 0) {
        const { error: qErr } = await supabase
          .from('email_queue')
          .update({ status: 'cancelled' })
          .in('wave_lead_id', waveleadIds)
          .in('status', ['queued', 'pending', 'scheduled']);
        if (qErr) throw qErr;
      }
      await updateWave.mutateAsync({ id: wave.id, updates: { status: 'paused' } as Partial<Wave> });
      toast.success('Vlna zastavena — čekající e-maily zrušeny.');
      qc.invalidateQueries({ queryKey: ['waves', id] });
      qc.invalidateQueries({ queryKey: ['waves'] });
    } catch (e: unknown) {
      toast.error('Chyba při zastavování vlny: ' + (e as Error).message);
    } finally {
      setStopping(false);
      setConfirmStop(false);
    }
  }

  async function handleRerun() {
    const hasAnyDate = availableSeqs.some(seq => !!rerunSeqDates[seq]);
    if (!hasAnyDate) { toast.warning('Nastavte datum nového odeslání'); return; }
    setRerunning(true);
    try {
      await updateWave.mutateAsync({
        id: wave.id,
        updates: {
          send_date_seq1: rerunSeqDates[1] || null,
          send_date_seq2: rerunSeqDates[2] || null,
          send_date_seq3: rerunSeqDates[3] || null,
          send_time_seq1: rerunSeqTimes[1] || '08:00',
          send_time_seq2: rerunSeqTimes[2] || '08:00',
          send_time_seq3: rerunSeqTimes[3] || '08:00',
          send_window_start: rerunSeqTimes[1] || '08:00',
          status: 'scheduled',
        } as Partial<Wave>,
      });
      const res = await fetch(n8nWebhookUrl('wf7-wave-schedule'), {
        method: 'POST',
        headers: n8nHeaders(),
        body: JSON.stringify({ wave_id: wave.id }),
      });
      if (!res.ok) throw new Error(`WF7 vrátil ${res.status}`);
      toast.success('Vlna obnovena — sekvence znovu naplánovány');
      qc.invalidateQueries({ queryKey: ['waves', id] });
      qc.invalidateQueries({ queryKey: ['waves'] });
    } catch (e: unknown) {
      toast.error('Chyba při obnovování vlny: ' + (e as Error).message);
    } finally {
      setRerunning(false);
      setConfirmRerun(false);
    }
  }

  async function handleDelete() {
    if (hasSentEmails) {
      toast.error('Vlna s odeslanými e-maily nemůže být smazána. Použijte tlačítko "Zastavit".');
      setConfirmDelete(false);
      return;
    }
    try {
      await deleteWave.mutateAsync(wave.id);
      toast.success('Vlna smazána');
      navigate(backUrl);
    } catch {
      toast.error('Chyba při mazání vlny');
    } finally {
      setConfirmDelete(false);
    }
  }

  async function handleSendNow() {
    setSendingNow(true);
    try {
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      await updateWave.mutateAsync({
        id: wave.id,
        updates: {
          send_date_seq1: todayStr,
          send_date_seq2: todayStr,
          send_date_seq3: todayStr,
          send_time_seq1: nowTime,
          send_time_seq2: nowTime,
          send_time_seq3: nowTime,
          send_window_start: nowTime,
        } as Partial<Wave>,
      });

      const res = await fetch(n8nWebhookUrl('wf7-wave-schedule'), {
        method: 'POST',
        headers: n8nHeaders(),
        body: JSON.stringify({ wave_id: wave.id }),
      });
      if (!res.ok) throw new Error(`WF7 vrátil ${res.status}`);

      toast.success('Testovací vlna spuštěna — e-maily se odešlou do 5 minut na ' + wave.dummy_email);
      qc.invalidateQueries({ queryKey: ['waves', id] });
      qc.invalidateQueries({ queryKey: ['waves'] });
    } catch (e: unknown) {
      toast.error('Chyba: ' + (e as Error).message);
    } finally {
      setSendingNow(false);
      setConfirmSendNow(false);
    }
  }

  async function handleForceSendSingle(qi: EmailQueue) {
    try {
      await forceSend.mutateAsync({ queueIds: [qi.id] });
      toast.success(`SEQ${qi.sequence_number} odeslán na ${qi.email_address}`);
      qc.invalidateQueries({ queryKey: ['waves', id] });
    } catch (e: unknown) {
      toast.error('Chyba: ' + (e as Error).message);
    } finally {
      setConfirmForceSendItem(null);
    }
  }

  async function handleForceSendAll() {
    try {
      const ids = forceSendEligibleItems.map((qi: EmailQueue) => qi.id);
      await forceSend.mutateAsync({ queueIds: ids });
      toast.success(`Force send dokončen pro ${ids.length} e-mailů`);
      qc.invalidateQueries({ queryKey: ['waves', id] });
    } catch (e: unknown) {
      toast.error('Chyba: ' + (e as Error).message);
    } finally {
      setConfirmForceSendAll(false);
    }
  }

  // ── Header actions ────────────────────────────────────────────────────────

  function renderActions() {
    const buttons: React.ReactNode[] = [];

    if (['scheduled', 'sending'].includes(wave.status)) {
      if (forceSendEligibleItems.length > 0) {
        buttons.push(
          <GlassButton
            key="force-send-all"
            variant="secondary"
            onClick={() => setConfirmForceSendAll(true)}
            disabled={forceSend.isPending}
            style={{
              background: 'rgba(251,191,36,0.12)',
              borderColor: 'rgba(251,191,36,0.35)',
              color: '#fbbf24',
            }}
          >
            {forceSend.isPending ? 'Odesílám…' : `Odeslat další seq. (${forceSendEligibleItems.length})`}
          </GlassButton>
        );
      }
      buttons.push(
        <GlassButton key="stop" variant="danger" onClick={() => setConfirmStop(true)} disabled={stopping}>
          {stopping ? 'Zastavuji…' : '⏹ Zastavit'}
        </GlassButton>
      );
    }

    // Email preview button
    if (wave.template_set_id && waveLeads.length > 0) {
      buttons.push(
        <GlassButton key="preview" variant="secondary" onClick={() => setShowPreview(true)}>
          Náhled e-mailu
        </GlassButton>
      );
    }

    // Duplicate button
    buttons.push(
      <GlassButton key="duplicate" variant="secondary" onClick={async () => {
        try {
          const newWave = await createWave.mutateAsync({
            name: `${wave.name} (kopie)`,
            template_set_id: wave.template_set_id,
            salesman_id: wave.salesman_id,
            outreach_account_id: wave.outreach_account_id,
            from_email: wave.from_email,
            team_id: wave.team_id,
            is_dummy: wave.is_dummy,
            dummy_email: wave.dummy_email,
            status: 'draft',
          } as Partial<Wave>);
          toast.success('Vlna duplikována');
          navigate(`/vlny/${newWave.id}`);
        } catch {
          toast.error('Chyba při duplikování vlny');
        }
      }} disabled={createWave.isPending}>
        {createWave.isPending ? 'Duplikuji…' : 'Duplikovat'}
      </GlassButton>
    );

    if (['draft', 'paused'].includes(wave.status)) {
      buttons.push(
        <GlassButton
          key="delete"
          variant="danger"
          onClick={() => setConfirmDelete(true)}
          disabled={deleteWave.isPending || hasSentEmails}
          title={hasSentEmails ? 'Nelze smazat — alespoň jeden e-mail byl odeslán' : undefined}
        >
          Smazat
        </GlassButton>
      );
    }

    if (waveLeads.length > 0) {
      buttons.push(
        <GlassButton key="export" variant="secondary" onClick={() => {
          const rows = waveLeads.map((wl: WaveLeadRow) => {
            const lead = wl.leads ?? wl.lead;
            const sent = wl.sent_emails ?? [];
            return {
              company_name: lead?.company_name ?? '',
              ico: lead?.ico ?? '',
              email: (wl as WaveLeadRow & { email_address?: string }).email_address ?? '',
              status: wl.status ?? '',
              seq1_sent: sent.find((s: { sequence_number: number }) => s.sequence_number === 1) ? 'ano' : 'ne',
              seq2_sent: sent.find((s: { sequence_number: number }) => s.sequence_number === 2) ? 'ano' : 'ne',
              seq3_sent: sent.find((s: { sequence_number: number }) => s.sequence_number === 3) ? 'ano' : 'ne',
            };
          });
          exportCsv(`vlna-${wave.name ?? wave.id}.csv`, ['company_name', 'ico', 'email', 'status', 'seq1_sent', 'seq2_sent', 'seq3_sent'], rows);
        }}>
          Export CSV
        </GlassButton>
      );
    }

    buttons.push(
      <GlassButton key="back" variant="secondary" onClick={() => navigate(backUrl)}>← Zpět</GlassButton>
    );
    return <div style={{ display: 'flex', gap: 8 }}>{buttons}</div>;
  }

  // ── JSX ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Breadcrumb items={[
        { label: 'Vlny', to: '/vlny' },
        { label: tabLabel, to: backUrl },
        { label: wave.name ?? 'Vlna' },
      ]} />
      <PageHeader
        title={wave.name ?? 'Vlna'}
        subtitle={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StatusBadge status={wave.status} type="wave" />
            {wave.template_set_name && (
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{wave.template_set_name}</span>
            )}
            {wave.is_dummy && (
              <span style={{ fontSize: 11, background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 4, padding: '1px 7px', fontWeight: 600 }}>
                TESTOVACÍ
              </span>
            )}
          </span>
        }
        actions={renderActions()}
      />

      <WaveResults wave={wave} waveLeads={waveLeads} />

      {/* Scheduling report - skipped leads warning */}
      {wave.scheduling_report && wave.scheduling_report.skipped > 0 && (
        <GlassCard padding={16} style={{ marginBottom: 16 }}>
          <div style={{
            padding: '12px 16px', borderRadius: 8,
            background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)',
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#fbbf24', marginBottom: 8 }}>
              {wave.scheduling_report.skipped} leadů přeskočeno (chybí ověřený e-mail)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {wave.scheduling_report.skipped_leads.map((sl, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  • {sl.company_name} — {sl.reason === 'no_verified_email' ? 'žádný ověřený e-mail' : sl.reason}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
              Naplánováno: {wave.scheduling_report.queued} e-mailů
            </div>
          </div>
        </GlassCard>
      )}

      {/* Failed emails section */}
      {failedEmails && failedEmails.length > 0 && (
        <GlassCard padding={20} style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#f87171', marginBottom: 12 }}>
            Neúspěšné e-maily ({failedEmails.length})
          </h3>
          <div style={{ overflowX: 'auto', borderRadius: 6, border: '1px solid var(--border)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>E-mail</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>Seq</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>Chyba</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>Pokusy</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-dim)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}></th>
                </tr>
              </thead>
              <tbody>
                {failedEmails.map((fe) => (
                  <tr key={fe.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 12px', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text)' }}>{fe.email_address}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-dim)' }}>SEQ{fe.sequence_number}</td>
                    <td style={{ padding: '8px 12px', color: '#f87171', fontSize: 11, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>{fe.error_message || '—'}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-dim)', fontFamily: 'JetBrains Mono, monospace' }}>{fe.retry_count ?? 0}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                      <button
                        onClick={() => retryFailed.mutate(fe.id)}
                        disabled={retryFailed.isPending}
                        style={{
                          background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)',
                          borderRadius: 4, padding: '3px 10px', fontSize: 11, color: 'var(--green)',
                          cursor: 'pointer', fontWeight: 500,
                        }}
                      >
                        Zkusit znovu
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {/* ── Draft: per-sequence schedule card ── */}
      {wave.status === 'draft' && (
        <GlassCard padding={20}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Naplánovat vlnu</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
            Nastavte datum a čas odeslání pro každou sekvenci.
          </div>

          {availableSeqs.length === 0 && (
            <div style={{ fontSize: 12, color: '#fbbf24', fontStyle: 'italic', marginBottom: 12 }}>
              Vyberte sadu šablon v konfiguraci vlny.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {availableSeqs.map((seq, idx) => (
              <div key={seq}>
                {/* Sequence row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
                  <span style={{
                    fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700,
                    color: 'var(--green)', background: 'rgba(62,207,142,0.1)',
                    padding: '2px 8px', borderRadius: 4, minWidth: 44, textAlign: 'center',
                  }}>
                    SEQ{seq}
                  </span>
                  <input
                    className="glass-input"
                    type="date"
                    value={seqDates[seq] || ''}
                    min={today}
                    onChange={e => handleSeqDateChange(seq, e.target.value, 'schedule')}
                    style={{ fontFamily: 'JetBrains Mono, monospace', maxWidth: 170 }}
                  />
                  <input
                    className="glass-input"
                    type="time"
                    value={seqTimes[seq] || '08:00'}
                    onChange={e => setSeqTimes(prev => ({ ...prev, [seq]: e.target.value }))}
                    style={{ fontFamily: 'JetBrains Mono, monospace', maxWidth: 120 }}
                  />
                </div>

                {/* Gap buttons between sequences */}
                {idx < availableSeqs.length - 1 && (() => {
                  const fromSeq = seq;
                  const toSeq = availableSeqs[idx + 1];
                  const gapKey = `${fromSeq}-${toSeq}`;
                  const defaultGap = DEFAULT_GAPS[gapKey] ?? 3;
                  return (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0 4px 56px',
                    }}>
                      <div style={{ width: 24, height: 1, background: 'var(--border)' }} />
                      {GAP_OPTIONS.map(days => (
                        <button
                          key={days}
                          onClick={() => applyGap(fromSeq, toSeq, days, 'schedule')}
                          disabled={!seqDates[fromSeq]}
                          style={{
                            fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
                            padding: '2px 8px', borderRadius: 4, cursor: seqDates[fromSeq] ? 'pointer' : 'default',
                            border: days === defaultGap
                              ? '1px solid rgba(62,207,142,0.5)'
                              : '1px solid var(--border)',
                            background: days === defaultGap
                              ? 'rgba(62,207,142,0.1)'
                              : 'var(--bg-subtle)',
                            color: days === defaultGap ? 'var(--green)' : 'var(--text-muted)',
                            opacity: seqDates[fromSeq] ? 1 : 0.4,
                          }}
                        >
                          +{days}d
                        </button>
                      ))}
                      <div style={{ width: 24, height: 1, background: 'var(--border)' }} />
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>

          {/* Scheduling summary */}
          {canLaunch && (
            <div style={{
              marginTop: 14, padding: '12px 16px', borderRadius: 8,
              background: 'rgba(62,207,142,0.04)', border: '1px solid rgba(62,207,142,0.15)',
              display: 'flex', gap: 24, flexWrap: 'wrap',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Leady</span>
                <span style={{ fontSize: 15, fontFamily: 'JetBrains Mono, monospace', color: 'var(--green)', fontWeight: 600 }}>{waveLeads.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>E-mailů celkem</span>
                <span style={{ fontSize: 15, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text)', fontWeight: 600 }}>{waveLeads.length * availableSeqs.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sekvence</span>
                <span style={{ fontSize: 15, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text)', fontWeight: 600 }}>{availableSeqs.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Období</span>
                <span style={{ fontSize: 13, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text)' }}>
                  {fmtDate(seqDates[availableSeqs[0]] || '')} — {fmtDate(seqDates[availableSeqs[availableSeqs.length - 1]] || '')}
                </span>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'center' }}>
            <GlassButton
              variant="primary"
              onClick={() => handlePreScheduleValidation()}
              disabled={!canLaunch || scheduling}
              title={!waveLeads.length ? 'Přidejte leady do vlny' : !canLaunch ? 'Nastavte datum pro všechny sekvence' : ''}
            >
              {scheduling ? 'Spouštím…' : '▶ Naplánovat vlnu'}
            </GlassButton>
            {wave.is_dummy && (
              <GlassButton
                variant="secondary"
                onClick={() => setConfirmSendNow(true)}
                disabled={sendingNow || !waveLeads.length || !wave.template_set_id || (!wave.dummy_email)}
                style={{
                  background: 'rgba(251,191,36,0.12)',
                  borderColor: 'rgba(251,191,36,0.35)',
                  color: '#fbbf24',
                }}
              >
                {sendingNow ? 'Spouštím…' : 'Odeslat hned (test)'}
              </GlassButton>
            )}
          </div>
          {!waveLeads.length && (
            <div style={{ fontSize: 11, color: '#fbbf24', marginTop: 8 }}>Přidejte leady do vlny</div>
          )}
          {wave.is_dummy && !wave.dummy_email && (
            <div style={{ fontSize: 11, color: '#ef4444', marginTop: 8 }}>Nastavte testovací e-mail v konfiguraci vlny</div>
          )}
        </GlassCard>
      )}

      {/* ── Re-run card (paused) ── */}
      {wave.status === 'paused' && (
        <GlassCard padding={20}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Vlna zastavena</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
            Zbývající sekvence budou znovu naplánovány od zvolených dat.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {availableSeqs.map((seq, idx) => (
              <div key={seq}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
                  <span style={{
                    fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700,
                    color: 'var(--green)', background: 'rgba(62,207,142,0.1)',
                    padding: '2px 8px', borderRadius: 4, minWidth: 44, textAlign: 'center',
                  }}>
                    SEQ{seq}
                  </span>
                  <input
                    className="glass-input"
                    type="date"
                    value={rerunSeqDates[seq] || ''}
                    min={today}
                    onChange={e => handleSeqDateChange(seq, e.target.value, 'rerun')}
                    style={{ fontFamily: 'JetBrains Mono, monospace', maxWidth: 170 }}
                  />
                  <input
                    className="glass-input"
                    type="time"
                    value={rerunSeqTimes[seq] || '08:00'}
                    onChange={e => setRerunSeqTimes(prev => ({ ...prev, [seq]: e.target.value }))}
                    style={{ fontFamily: 'JetBrains Mono, monospace', maxWidth: 120 }}
                  />
                </div>

                {idx < availableSeqs.length - 1 && (() => {
                  const fromSeq = seq;
                  const toSeq = availableSeqs[idx + 1];
                  const gapKey = `${fromSeq}-${toSeq}`;
                  const defaultGap = DEFAULT_GAPS[gapKey] ?? 3;
                  return (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0 4px 56px',
                    }}>
                      <div style={{ width: 24, height: 1, background: 'var(--border)' }} />
                      {GAP_OPTIONS.map(days => (
                        <button
                          key={days}
                          onClick={() => applyGap(fromSeq, toSeq, days, 'rerun')}
                          disabled={!rerunSeqDates[fromSeq]}
                          style={{
                            fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
                            padding: '2px 8px', borderRadius: 4, cursor: rerunSeqDates[fromSeq] ? 'pointer' : 'default',
                            border: days === defaultGap
                              ? '1px solid rgba(62,207,142,0.5)'
                              : '1px solid var(--border)',
                            background: days === defaultGap
                              ? 'rgba(62,207,142,0.1)'
                              : 'var(--bg-subtle)',
                            color: days === defaultGap ? 'var(--green)' : 'var(--text-muted)',
                            opacity: rerunSeqDates[fromSeq] ? 1 : 0.4,
                          }}
                        >
                          +{days}d
                        </button>
                      ))}
                      <div style={{ width: 24, height: 1, background: 'var(--border)' }} />
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'center' }}>
            <GlassButton
              variant="primary"
              onClick={() => setConfirmRerun(true)}
              disabled={!availableSeqs.some(seq => !!rerunSeqDates[seq]) || rerunning}
            >
              {rerunning ? 'Obnovuji…' : '▶ Obnovit vlnu'}
            </GlassButton>
          </div>
          {!availableSeqs.some(seq => !!rerunSeqDates[seq]) && (
            <div style={{ fontSize: 11, color: '#fbbf24', marginTop: 8 }}>Nastavte nové datum alespoň pro jednu sekvenci</div>
          )}
        </GlassCard>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <WaveConfigForm wave={wave} />
        {wave.template_set_id && templateSets && (
          <GlassCard padding={20}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Šablona</h3>
            {(() => {
              const ts = templateSets.find(t => t.id === wave.template_set_id);
              const templates = ts?.email_templates ?? [];
              const seqNums = Array.from(new Set<number>(templates.map((t: EmailTemplate) => t.sequence_number))).sort((a, b) => a - b);
              if (seqNums.length === 0) {
                return <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Žádné šablony</div>;
              }
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {seqNums.map(seq => {
                    const t = templates.find((x: EmailTemplate) => x.sequence_number === seq);
                    return (
                      <div key={seq} style={{ padding: '8px 12px', background: 'var(--bg-subtle)', borderRadius: 6, border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: 'var(--green)', background: 'rgba(62,207,142,0.1)', padding: '1px 6px', borderRadius: 3 }}>SEQ{seq}</span>
                          {t
                            ? <span style={{ fontSize: 12, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subject || <em style={{ color: 'var(--text-muted)' }}>(bez předmětu)</em>}</span>
                            : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>— bez šablony —</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </GlassCard>
        )}
      </div>

      <WaveLeadsManager
        waveId={wave.id}
        waveLeads={waveLeads}
        waveStatus={wave.status}
        teamId={wave.team_id}
        templates={
          wave.template_set_id && templateSets
            ? (templateSets.find(ts => ts.id === wave.template_set_id)?.email_templates ?? [])
            : []
        }
        variables={
          wave.template_set_id && templateSets
            ? (templateSets.find(ts => ts.id === wave.template_set_id)?.variables ?? [])
            : []
        }
        onForceSend={(qi) => setConfirmForceSendItem(qi)}
        forceSending={forceSend.isPending}
      />

      {/* ── Confirm Dialogs ── */}

      <ConfirmDialog
        open={confirmSchedule}
        onClose={() => setConfirmSchedule(false)}
        onConfirm={handleSchedule}
        title="Naplánovat vlnu"
        confirmLabel="Naplánovat"
        loading={scheduling}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5 }}>
            Spustit vlnu <strong style={{ color: 'var(--text)' }}>{wave.name}</strong>?
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {availableSeqs.map(seq => (
              <div key={seq} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: 'var(--green)', minWidth: 38 }}>SEQ{seq}</span>
                <span style={{ fontSize: 13, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text)' }}>
                  {fmtDate(seqDates[seq] || '')} {seqTimes[seq] || '08:00'}
                </span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Leady</span>
              <span style={{ fontSize: 14, fontFamily: 'JetBrains Mono, monospace', color: 'var(--green)' }}>{waveLeads.length}</span>
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            E-maily se začnou odesílat v nastavený čas s náhodnými rozestupy 4–8 minut.
          </div>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmStop}
        onClose={() => setConfirmStop(false)}
        onConfirm={handleStop}
        title="Zastavit vlnu"
        confirmLabel="Zastavit"
        variant="danger"
        loading={stopping}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5 }}>
            Zastavit vlnu <strong style={{ color: 'var(--text)' }}>{wave.name}</strong>?
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Čekající e-maily (sekvence 2 a 3) budou zrušeny. Již odeslané e-maily zůstanou beze změny.
          </div>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmRerun}
        onClose={() => setConfirmRerun(false)}
        onConfirm={handleRerun}
        title="Obnovit vlnu"
        confirmLabel="Obnovit"
        loading={rerunning}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5 }}>
            Obnovit vlnu <strong style={{ color: 'var(--text)' }}>{wave.name}</strong>?
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {availableSeqs.filter(seq => !!rerunSeqDates[seq]).map(seq => (
              <div key={seq} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: 'var(--green)', minWidth: 38 }}>SEQ{seq}</span>
                <span style={{ fontSize: 13, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text)' }}>
                  {fmtDate(rerunSeqDates[seq])} {rerunSeqTimes[seq] || '08:00'}
                </span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Zbývající sekvence budou znovu naplánovány od zvolených dat a časů.
          </div>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Smazat vlnu"
        confirmLabel="Smazat"
        variant="danger"
        loading={deleteWave.isPending}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5 }}>
            Smazat vlnu <strong style={{ color: 'var(--text)' }}>{wave.name}</strong>?
          </div>
          <div style={{ fontSize: 12, color: 'var(--red)', lineHeight: 1.5 }}>
            Tato akce je nevratná. Vlna a všechny přiřazené leady budou odstraněny.
          </div>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmSendNow}
        onClose={() => setConfirmSendNow(false)}
        onConfirm={handleSendNow}
        title="Odeslat hned (test)"
        confirmLabel="Odeslat"
        loading={sendingNow}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5 }}>
            Testovací e-maily se odešlou na{' '}
            <strong style={{ color: '#fbbf24', fontFamily: 'JetBrains Mono, monospace' }}>
              {wave.dummy_email}
            </strong>{' '}
            do 5 minut.
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Leady</span>
              <span style={{ fontSize: 14, fontFamily: 'JetBrains Mono, monospace', color: 'var(--green)' }}>{waveLeads.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Příjemce</span>
              <span style={{ fontSize: 14, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text)' }}>{wave.dummy_email}</span>
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, padding: '8px 12px', background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 8 }}>
            Všechny 3 sekvence se odešlou s rozestupem ~2 minuty. Ověření e-mailů bude přeskočeno.
            Předmět bude mít prefix <code style={{ color: '#fbbf24' }}>[TEST]</code>.
          </div>
        </div>
      </ConfirmDialog>

      {/* Force send single confirm */}
      <ConfirmDialog
        open={!!confirmForceSendItem}
        onClose={() => setConfirmForceSendItem(null)}
        onConfirm={() => confirmForceSendItem && handleForceSendSingle(confirmForceSendItem)}
        title="Odeslat sekvenci"
        confirmLabel="Odeslat"
        loading={forceSend.isPending}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5 }}>
            Ihned odeslat SEQ{confirmForceSendItem?.sequence_number} na{' '}
            <strong style={{ color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace' }}>
              {confirmForceSendItem?.email_address}
            </strong>?
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            E-mail bude odeslán okamžitě. Denní limit bude respektován.
          </div>
        </div>
      </ConfirmDialog>

      {/* Force send bulk confirm */}
      <ConfirmDialog
        open={confirmForceSendAll}
        onClose={() => setConfirmForceSendAll(false)}
        onConfirm={handleForceSendAll}
        title="Odeslat další sekvence"
        confirmLabel="Odeslat"
        loading={forceSend.isPending}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5 }}>
            Ihned odeslat další sekvenci pro{' '}
            <strong style={{ color: '#fbbf24' }}>{forceSendEligibleItems.length}</strong> e-mailů?
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            E-maily budou odeslány okamžitě. Denní limit bude respektován.
          </div>
        </div>
      </ConfirmDialog>

      {/* Missing variables warning */}
      <GlassModal
        open={!!missingVarsWarning}
        onClose={() => setMissingVarsWarning(null)}
        title="Chybějící proměnné"
        width={520}
        footer={
          <>
            <GlassButton variant="secondary" onClick={() => setMissingVarsWarning(null)}>Zrušit</GlassButton>
            <GlassButton variant="primary" onClick={() => { setMissingVarsWarning(null); setConfirmSchedule(true); }}>
              Pokračovat přesto
            </GlassButton>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5 }}>
            Některé leady nemají vyplněné všechny proměnné použité v šablonách. Chybějící proměnné zůstanou
            v e-mailu jako <code style={{ color: '#fbbf24' }}>{`{{nazev}}`}</code>.
          </div>
          <div style={{
            maxHeight: 250, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6,
            padding: '8px 12px', background: 'rgba(251,191,36,0.06)',
            border: '1px solid rgba(251,191,36,0.2)', borderRadius: 8,
          }}>
            {(missingVarsWarning ?? []).map((w, i) => (
              <div key={i} style={{ fontSize: 12, color: 'var(--text)' }}>
                <strong>{w.lead}</strong>
                <span style={{ color: 'var(--text-muted)' }}> — chybí: </span>
                <span style={{ color: '#fbbf24', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
                  {w.missing.join(', ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      </GlassModal>

      {/* Email preview modal */}
      <GlassModal
        open={showPreview}
        onClose={() => setShowPreview(false)}
        title="Náhled e-mailu"
        width={640}
        footer={
          <GlassButton variant="secondary" onClick={() => setShowPreview(false)}>Zavřít</GlassButton>
        }
      >
        {(() => {
          const ts = templateSets?.find(t => t.id === wave.template_set_id);
          const templates = ts?.email_templates ?? [];
          const sampleWl = waveLeads[0];
          const sampleLead = sampleWl?.leads ?? sampleWl?.lead ?? {};
          const jednatels = sampleLead?.jednatels ?? [];
          const jednatel = jednatels[0] ?? null;
          const ctx = buildTemplateContext(sampleLead, jednatel);
          const seqNums = Array.from(new Set<number>(templates.map((t: EmailTemplate) => t.sequence_number))).sort((a: number, b: number) => a - b);

          if (!templates.length) {
            return <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Žádné šablony k zobrazení</p>;
          }

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 12px', background: 'var(--bg-subtle)', borderRadius: 6, border: '1px solid var(--border)' }}>
                Náhled s daty leadu: <strong style={{ color: 'var(--text)' }}>{sampleLead?.company_name ?? '—'}</strong>
                {jednatel && <span> · {jednatel.full_name}</span>}
              </div>
              {seqNums.map(seq => {
                const tpl = templates.find((t: EmailTemplate) => t.sequence_number === seq);
                if (!tpl) return null;
                const renderedSubject = renderTemplate(tpl.subject ?? '', ctx);
                const renderedBody = renderTemplate(tpl.body_html ?? '', ctx);
                return (
                  <div key={seq} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                      background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)',
                    }}>
                      <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: 'var(--green)', background: 'rgba(62,207,142,0.1)', padding: '1px 6px', borderRadius: 3 }}>SEQ{seq}</span>
                      <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{renderedSubject || '(bez předmětu)'}</span>
                    </div>
                    <div
                      style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderedBody) }}
                    />
                  </div>
                );
              })}
            </div>
          );
        })()}
      </GlassModal>
    </div>
  );
}
