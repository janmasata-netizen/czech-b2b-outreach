import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import DOMPurify from 'dompurify';
import { useParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useWave, useTemplateSets, useDeleteWave, useUpdateWave, useCreateWave, useFailedEmails, useRetryFailedEmail } from '@/hooks/useWaves';
import { useForceSendSequence } from '@/hooks/useForceSend';
import { supabase } from '@/lib/supabase';
import { n8nWebhookUrl, n8nHeaders } from '@/lib/n8n';
import type { WaveLeadRow, EmailQueue, EmailTemplate, Wave, SequenceScheduleEntry } from '@/types/database';
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

/**
 * Infinite-scroll wheel column — renders items repeated many times so
 * the user can scroll endlessly in either direction. When scroll nears
 * the edge, it silently jumps back to the middle set.
 */
const ITEM_H = 34;
const VISIBLE = 5;
const COL_H = ITEM_H * VISIBLE;
const REPEAT = 40; // how many copies of the list to render
const MID = Math.floor(REPEAT / 2);

function InfiniteWheelColumn({ items, selected, onSelect }: {
  items: string[];
  selected: string;
  onSelect: (v: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const suppressSnap = useRef(false);
  const snapTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const len = items.length;
  const oneSetH = len * ITEM_H;
  // padding so the center slot aligns with the middle of the visible area
  const padTop = Math.floor(VISIBLE / 2) * ITEM_H;

  // scroll to selected item in the middle set (no animation)
  const jumpToSelected = useCallback((val: string) => {
    if (!ref.current) return;
    const idx = items.indexOf(val);
    if (idx < 0) return;
    ref.current.scrollTop = MID * oneSetH + idx * ITEM_H;
  }, [items, oneSetH]);

  // on mount / when selected changes externally, jump
  useEffect(() => {
    jumpToSelected(selected);
  }, [selected, jumpToSelected]);

  // intercept mouse wheel: move exactly 1 item per tick
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const direction = e.deltaY > 0 ? 1 : -1;
      el.scrollTop += direction * ITEM_H;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const handleScroll = () => {
    if (!ref.current || suppressSnap.current) return;
    const el = ref.current;
    const scrollTop = el.scrollTop;

    // if near top or bottom quarter, silently recenter
    const lowerBound = 5 * oneSetH;
    const upperBound = (REPEAT - 5) * oneSetH;
    if (scrollTop < lowerBound || scrollTop > upperBound) {
      suppressSnap.current = true;
      // figure out which item index is currently centered
      const rawIdx = Math.round(scrollTop / ITEM_H);
      const itemIdx = ((rawIdx % len) + len) % len;
      el.scrollTop = MID * oneSetH + itemIdx * ITEM_H;
      requestAnimationFrame(() => { suppressSnap.current = false; });
    }

    // debounced snap: after scrolling stops, snap to nearest item and select it
    clearTimeout(snapTimer.current);
    snapTimer.current = setTimeout(() => {
      if (!ref.current) return;
      const top = ref.current.scrollTop;
      const rawIdx = Math.round(top / ITEM_H);
      const snappedTop = rawIdx * ITEM_H;
      const itemIdx = ((rawIdx % len) + len) % len;
      ref.current.scrollTo({ top: snappedTop, behavior: 'smooth' });
      if (items[itemIdx] !== selected) onSelect(items[itemIdx]);
    }, 100);
  };

  return (
    <div style={{ position: 'relative', height: COL_H, width: 54, overflow: 'hidden' }}>
      {/* highlight band in center */}
      <div style={{
        position: 'absolute', top: padTop, left: 0, right: 0, height: ITEM_H,
        background: 'var(--green-bg)', borderRadius: 6, border: '1px solid var(--green-border)',
        pointerEvents: 'none', zIndex: 2,
      }} />
      {/* fade top */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: padTop,
        background: 'linear-gradient(to bottom, var(--bg-base) 20%, transparent 100%)',
        pointerEvents: 'none', zIndex: 3,
      }} />
      {/* fade bottom */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: padTop,
        background: 'linear-gradient(to top, var(--bg-base) 20%, transparent 100%)',
        pointerEvents: 'none', zIndex: 3,
      }} />
      <div
        ref={ref}
        onScroll={handleScroll}
        style={{
          height: COL_H, overflowY: 'scroll', position: 'relative', zIndex: 1,
          scrollbarWidth: 'none',
          paddingTop: padTop, paddingBottom: padTop,
        }}
      >
        {Array.from({ length: REPEAT }, (_, setIdx) =>
          items.map((item, i) => {
            const active = item === selected;
            return (
              <div
                key={`${setIdx}-${i}`}
                onClick={() => {
                  onSelect(item);
                  // jump so clicked item is centered
                  if (ref.current) {
                    ref.current.scrollTo({
                      top: MID * oneSetH + i * ITEM_H,
                      behavior: 'smooth',
                    });
                  }
                }}
                style={{
                  height: ITEM_H, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                  fontFamily: 'JetBrains Mono, monospace', fontSize: 15, fontWeight: active ? 700 : 500,
                  color: active ? 'var(--green)' : 'var(--text-muted)',
                  transition: 'color 0.1s',
                }}
              >
                {item}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

/** 24h time picker with infinite-scroll wheels */
function TimeInput24h({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hh, mm] = (value || '08:00').split(':');

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className="glass-input"
        onClick={() => setOpen(p => !p)}
        style={{
          fontFamily: 'JetBrains Mono, monospace', fontSize: 15, fontWeight: 600,
          width: 90, textAlign: 'center', cursor: 'pointer', letterSpacing: 1,
        }}
      >
        {hh}:{mm}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 50,
          background: 'var(--bg-base)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '8px 6px', display: 'flex', gap: 4, alignItems: 'center',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          <InfiniteWheelColumn items={HOURS} selected={hh} onSelect={h => onChange(`${h}:${mm}`)} />
          <span style={{ color: 'var(--text-muted)', fontWeight: 700, fontSize: 18, userSelect: 'none' }}>:</span>
          <InfiniteWheelColumn items={MINUTES} selected={mm} onSelect={m => onChange(`${hh}:${m}`)} />
        </div>
      )}
    </div>
  );
}

/** Format YYYY-MM-DD → DD.MM.YYYY */
function fmtDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/** Tab id + label key for each wave status */
const TAB_META: Record<string, { id: string; labelKey: string }> = {
  draft:     { id: 'manager', labelKey: 'sub.manager' },
  scheduled: { id: 'live',    labelKey: 'sub.live' },
  sending:   { id: 'live',    labelKey: 'sub.live' },
  done:      { id: 'archive', labelKey: 'sub.archive' },
  completed: { id: 'archive', labelKey: 'sub.archive' },
  paused:    { id: 'archive', labelKey: 'sub.archive' },
};

export default function WaveDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading, error } = useWave(id);
  const { data: templateSets } = useTemplateSets();
  const deleteWave = useDeleteWave();
  const updateWave = useUpdateWave();
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [leadsPerDay, setLeadsPerDay] = useState<number | null>(null);
  const [seqDelays, setSeqDelays] = useState<Record<string, number>>({});
  // Hydrate scheduling state when wave data loads
  useEffect(() => {
    if (!data?.wave) return;
    const w = data.wave;
    // Read start date from seq1
    let d1 = '';
    let t1 = '08:00';
    if (w.sequence_schedule?.length) {
      const s1 = w.sequence_schedule.find(e => e.seq === (w.sequence_schedule![0]?.seq ?? 1));
      if (s1) { d1 = s1.send_date?.slice(0, 10) ?? ''; t1 = s1.send_time?.slice(0, 5) ?? '08:00'; }
    } else if (w.send_date_seq1) {
      d1 = w.send_date_seq1.slice(0, 10);
      t1 = w.send_time_seq1?.slice(0, 5) || '08:00';
    }
    setStartDate(prev => prev || d1);
    setStartTime(prev => prev !== '08:00' ? prev : t1);
    setLeadsPerDay(prev => prev ?? (w.daily_lead_count ?? null));
    // Read delays from wave columns
    setSeqDelays(prev => {
      if (Object.keys(prev).length > 0) return prev;
      const delays: Record<string, number> = {};
      if (w.delay_seq1_to_seq2_days) delays['1→2'] = w.delay_seq1_to_seq2_days;
      if (w.delay_seq2_to_seq3_days) delays['2→3'] = w.delay_seq2_to_seq3_days;
      return delays;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.wave?.id]);

  const [scheduling, setScheduling] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [rerunSeqDates, setRerunSeqDates] = useState<Record<number, string>>({});
  const [rerunSeqTimes, setRerunSeqTimes] = useState<Record<number, string>>({});
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
    <EmptyState icon="⌁" title={t('waves.notFound')} action={<GlassButton onClick={() => navigate('/vlny')}>{t('waves.backToWaves')}</GlassButton>} />
  );

  const { wave, waveLeads } = data;
  const meta = TAB_META[wave.status] ?? { id: 'manager', labelKey: 'sub.manager' };
  const backUrl = `/vlny?tab=${meta.id}`;
  const tabLabel = t(meta.labelKey);
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
    && !!wave.from_email
    && !!startDate;

  // Gap button options and defaults
  const GAP_OPTIONS = [1, 2, 3, 5, 7];
  const DEFAULT_GAP = 3;

  function addDays(dateStr: string, days: number): string {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // Compute delay for gap between two consecutive sequences
  function getDelay(fromSeq: number, toSeq: number): number {
    return seqDelays[`${fromSeq}→${toSeq}`] ?? DEFAULT_GAP;
  }

  // Compute per-sequence dates from start date + delays + drip offset
  function computeSeqDates(): Record<number, string> {
    if (!startDate) return {};
    const dates: Record<number, string> = {};
    dates[availableSeqs[0]] = startDate;
    let cumulativeDelay = 0;
    for (let i = 1; i < availableSeqs.length; i++) {
      cumulativeDelay += getDelay(availableSeqs[i - 1], availableSeqs[i]);
      dates[availableSeqs[i]] = addDays(startDate, cumulativeDelay);
    }
    return dates;
  }

  // Compute drip summary stats
  const dripStats = (() => {
    if (!startDate || !availableSeqs.length) return null;
    const leadCount = waveLeads.length;
    const effectivePerDay = leadsPerDay ?? leadCount;
    const dripDays = effectivePerDay > 0 ? Math.ceil(leadCount / effectivePerDay) : 1;
    const lastDripDayOffset = dripDays - 1;
    const seqDatesComputed = computeSeqDates();

    const seqRanges = availableSeqs.map((seq, idx) => {
      const baseDate = seqDatesComputed[seq] || startDate;
      const endDate = addDays(baseDate, lastDripDayOffset);
      const delayFromPrev = idx > 0 ? getDelay(availableSeqs[idx - 1], seq) : 0;
      return { seq, startDate: baseDate, endDate, delayFromPrev };
    });

    return { leadCount, effectivePerDay, dripDays, seqRanges, totalEmails: leadCount * availableSeqs.length };
  })();

  // Rerun-specific helpers (keep old per-seq behavior for paused waves)
  function handleSeqDateChange(seq: number, value: string, mode: 'rerun') {
    const setDates = setRerunSeqDates;
    const setTimes = setRerunSeqTimes;
    const dates = rerunSeqDates;
    const times = rerunSeqTimes;
    setDates(prev => {
      const next = { ...prev, [seq]: value };
      const seqIdx = availableSeqs.indexOf(seq);
      if (value && seqIdx >= 0) {
        let prevDate = value;
        for (let i = seqIdx + 1; i < availableSeqs.length; i++) {
          const target = availableSeqs[i];
          if (dates[target]) break;
          prevDate = addDays(prevDate, DEFAULT_GAP);
          next[target] = prevDate;
          setTimes(t => ({ ...t, [target]: times[seq] }));
        }
      }
      return next;
    });
  }

  function applyGap(fromSeq: number, toSeq: number, days: number) {
    if (!rerunSeqDates[fromSeq]) return;
    const newDate = addDays(rerunSeqDates[fromSeq], days);
    setRerunSeqDates(prev => ({ ...prev, [toSeq]: newDate }));
    setRerunSeqTimes(prev => ({ ...prev, [toSeq]: rerunSeqTimes[fromSeq] }));
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
      const contacts = lead?.companies?.contacts ?? [];
      const contact = contacts[0] ?? null;
      const ctx = buildTemplateContext(lead, contact);
      const missing = findMissingVariables(Array.from(allVarsUsed), ctx);
      if (missing.length > 0) {
        warnings.push({ lead: lead?.company_name ?? lead?.ico ?? t('waves.unknownLead'), missing });
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
      const seqDatesComputed = computeSeqDates();
      const schedule: SequenceScheduleEntry[] = availableSeqs.map(seq => ({
        seq, send_date: seqDatesComputed[seq] || null, send_time: startTime || '08:00',
      }));

      // Compute delay values for DB columns
      const delay12 = availableSeqs.length >= 2 ? getDelay(availableSeqs[0], availableSeqs[1]) : undefined;
      const delay23 = availableSeqs.length >= 3 ? getDelay(availableSeqs[1], availableSeqs[2]) : undefined;

      await updateWave.mutateAsync({
        id: wave.id,
        updates: {
          status: 'draft',
          sequence_schedule: schedule,
          daily_lead_count: leadsPerDay,
          delay_seq1_to_seq2_days: delay12,
          delay_seq2_to_seq3_days: delay23,
          // Legacy compat: first 3 seqs
          ...(schedule[0] ? { send_date_seq1: schedule[0].send_date, send_time_seq1: schedule[0].send_time } : {}),
          ...(schedule[1] ? { send_date_seq2: schedule[1].send_date, send_time_seq2: schedule[1].send_time } : {}),
          ...(schedule[2] ? { send_date_seq3: schedule[2].send_date, send_time_seq3: schedule[2].send_time } : {}),
          send_window_start: startTime || '08:00',
        } as Partial<Wave>,
      });
      const res = await fetch(n8nWebhookUrl('wf7-wave-schedule'), {
        method: 'POST',
        headers: n8nHeaders(),
        body: JSON.stringify({ wave_id: wave.id }),
      });
      if (!res.ok) throw new Error(`WF7 vrátil ${res.status}`);
      let reportMsg = '';
      try {
        const wf7Data = await res.json();
        if (wf7Data?.scheduling_report?.skipped > 0) {
          reportMsg = t('waves.scheduledSkipped', { count: wf7Data.scheduling_report.skipped });
        }
      } catch { /* response may not be JSON */ }
      toast.success(t('waves.scheduled', { date: fmtDate(startDate), time: startTime || '08:00', report: reportMsg }));
      qc.invalidateQueries({ queryKey: ['waves', id] });
      qc.invalidateQueries({ queryKey: ['waves'] });
    } catch (e: unknown) {
      toast.error(t('waves.errorScheduling') + (e as Error).message, { duration: Infinity, closeButton: true });
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
          .in('status', ['queued', 'pending_prev']);
        if (qErr) throw qErr;
      }
      await updateWave.mutateAsync({ id: wave.id, updates: { status: 'paused' } as Partial<Wave> });
      toast.success(t('waves.stopped'));
      qc.invalidateQueries({ queryKey: ['waves', id] });
      qc.invalidateQueries({ queryKey: ['waves'] });
    } catch (e: unknown) {
      toast.error(t('waves.errorStopping') + (e as Error).message);
    } finally {
      setStopping(false);
      setConfirmStop(false);
    }
  }

  async function handleRerun() {
    const hasAnyDate = availableSeqs.some(seq => !!rerunSeqDates[seq]);
    if (!hasAnyDate) { toast.warning(t('waves.setRerunDate')); return; }
    setRerunning(true);
    try {
      const rerunSchedule: SequenceScheduleEntry[] = availableSeqs.map(seq => ({
        seq, send_date: rerunSeqDates[seq] || null, send_time: rerunSeqTimes[seq] || '08:00',
      }));
      await updateWave.mutateAsync({
        id: wave.id,
        updates: {
          sequence_schedule: rerunSchedule,
          ...(rerunSchedule[0] ? { send_date_seq1: rerunSchedule[0].send_date, send_time_seq1: rerunSchedule[0].send_time } : {}),
          ...(rerunSchedule[1] ? { send_date_seq2: rerunSchedule[1].send_date, send_time_seq2: rerunSchedule[1].send_time } : {}),
          ...(rerunSchedule[2] ? { send_date_seq3: rerunSchedule[2].send_date, send_time_seq3: rerunSchedule[2].send_time } : {}),
          send_window_start: rerunSeqTimes[availableSeqs[0]] || '08:00',
          status: 'scheduled',
        } as Partial<Wave>,
      });
      const res = await fetch(n8nWebhookUrl('wf7-wave-schedule'), {
        method: 'POST',
        headers: n8nHeaders(),
        body: JSON.stringify({ wave_id: wave.id }),
      });
      if (!res.ok) throw new Error(`WF7 vrátil ${res.status}`);
      toast.success(t('waves.resumed'));
      qc.invalidateQueries({ queryKey: ['waves', id] });
      qc.invalidateQueries({ queryKey: ['waves'] });
    } catch (e: unknown) {
      toast.error(t('waves.errorResuming') + (e as Error).message);
    } finally {
      setRerunning(false);
      setConfirmRerun(false);
    }
  }

  async function handleDelete() {
    if (hasSentEmails) {
      toast.error(t('waves.cannotDeleteSent'));
      setConfirmDelete(false);
      return;
    }
    try {
      await deleteWave.mutateAsync(wave.id);
      toast.success(t('waves.waveDeleted'));
      navigate(backUrl);
    } catch {
      toast.error(t('waves.errorDeleting'));
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

      const nowSchedule: SequenceScheduleEntry[] = availableSeqs.map(seq => ({
        seq, send_date: todayStr, send_time: nowTime,
      }));
      await updateWave.mutateAsync({
        id: wave.id,
        updates: {
          sequence_schedule: nowSchedule,
          daily_lead_count: null, // no drip for test sends
          ...(nowSchedule[0] ? { send_date_seq1: nowSchedule[0].send_date, send_time_seq1: nowSchedule[0].send_time } : {}),
          ...(nowSchedule[1] ? { send_date_seq2: nowSchedule[1].send_date, send_time_seq2: nowSchedule[1].send_time } : {}),
          ...(nowSchedule[2] ? { send_date_seq3: nowSchedule[2].send_date, send_time_seq3: nowSchedule[2].send_time } : {}),
          send_window_start: nowTime,
        } as Partial<Wave>,
      });

      const res = await fetch(n8nWebhookUrl('wf7-wave-schedule'), {
        method: 'POST',
        headers: n8nHeaders(),
        body: JSON.stringify({ wave_id: wave.id }),
      });
      if (!res.ok) throw new Error(`WF7 vrátil ${res.status}`);

      toast.success(t('waves.testWaveLaunched', { email: wave.dummy_email }));
      qc.invalidateQueries({ queryKey: ['waves', id] });
      qc.invalidateQueries({ queryKey: ['waves'] });
    } catch (e: unknown) {
      toast.error(t('waves.errorScheduling') + (e as Error).message);
    } finally {
      setSendingNow(false);
      setConfirmSendNow(false);
    }
  }

  async function handleForceSendSingle(qi: EmailQueue) {
    try {
      await forceSend.mutateAsync({ queueIds: [qi.id] });
      toast.success(`SEQ${qi.sequence_number} → ${qi.email_address}`);
      qc.invalidateQueries({ queryKey: ['waves', id] });
    } catch (e: unknown) {
      toast.error(t('waves.errorScheduling') + (e as Error).message);
    } finally {
      setConfirmForceSendItem(null);
    }
  }

  async function handleForceSendAll() {
    try {
      const ids = forceSendEligibleItems.map((qi: EmailQueue) => qi.id);
      await forceSend.mutateAsync({ queueIds: ids });
      toast.success(t('waves.forceSendDone', { count: ids.length }));
      qc.invalidateQueries({ queryKey: ['waves', id] });
    } catch (e: unknown) {
      toast.error(t('waves.errorScheduling') + (e as Error).message);
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
            {forceSend.isPending ? t('waves.forceSending') : t('waves.forceSendNext', { count: forceSendEligibleItems.length })}
          </GlassButton>
        );
      }
      buttons.push(
        <GlassButton key="stop" variant="danger" onClick={() => setConfirmStop(true)} disabled={stopping}>
          {stopping ? t('waves.stopping') : t('waves.stop')}
        </GlassButton>
      );
    }

    // Email preview button
    if (wave.template_set_id && waveLeads.length > 0) {
      buttons.push(
        <GlassButton key="preview" variant="secondary" onClick={() => setShowPreview(true)}>
          {t('waves.emailPreview')}
        </GlassButton>
      );
    }

    // Duplicate button
    buttons.push(
      <GlassButton key="duplicate" variant="secondary" onClick={async () => {
        try {
          const newWave = await createWave.mutateAsync({
            name: `${wave.name} ${t('waves.copy')}`,
            template_set_id: wave.template_set_id,
            salesman_id: wave.salesman_id,
            outreach_account_id: wave.outreach_account_id,
            from_email: wave.from_email,
            team_id: wave.team_id,
            is_dummy: wave.is_dummy,
            dummy_email: wave.dummy_email,
            status: 'draft',
          } as Partial<Wave>);
          toast.success(t('waves.waveDuplicated'));
          navigate(`/vlny/${newWave.id}`);
        } catch {
          toast.error(t('waves.errorDuplicating'));
        }
      }} disabled={createWave.isPending}>
        {createWave.isPending ? t('waves.duplicating') : t('waves.duplicate')}
      </GlassButton>
    );

    if (['draft', 'paused'].includes(wave.status)) {
      buttons.push(
        <GlassButton
          key="delete"
          variant="danger"
          onClick={() => setConfirmDelete(true)}
          disabled={deleteWave.isPending || hasSentEmails}
          title={hasSentEmails ? t('waves.cannotDeleteTitle') : undefined}
        >
          {t('waves.deleteBtn')}
        </GlassButton>
      );
    }

    if (waveLeads.length > 0) {
      buttons.push(
        <GlassButton key="export" variant="secondary" onClick={() => {
          const seqCols = availableSeqs.map(seq => `seq${seq}_sent`);
          const rows = waveLeads.map((wl: WaveLeadRow) => {
            const lead = wl.leads ?? wl.lead;
            const sent = wl.sent_emails ?? [];
            const row: Record<string, string> = {
              company_name: lead?.company_name ?? '',
              ico: lead?.ico ?? '',
              email: (wl as WaveLeadRow & { email_address?: string }).email_address ?? '',
              status: wl.status ?? '',
            };
            for (const seq of availableSeqs) {
              row[`seq${seq}_sent`] = sent.find((s: { sequence_number: number }) => s.sequence_number === seq) ? 'ano' : 'ne';
            }
            return row;
          });
          exportCsv(`vlna-${wave.name ?? wave.id}.csv`, ['company_name', 'ico', 'email', 'status', ...seqCols], rows);
        }}>
          Export CSV
        </GlassButton>
      );
    }

    buttons.push(
      <GlassButton key="back" variant="secondary" onClick={() => navigate(backUrl)}>{t('waves.backBtn')}</GlassButton>
    );
    return <div style={{ display: 'flex', gap: 8 }}>{buttons}</div>;
  }

  // ── JSX ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Breadcrumb items={[
        { label: t('nav.waves'), to: '/vlny' },
        { label: tabLabel, to: backUrl },
        { label: wave.name ?? t('nav.waves') },
      ]} />
      <PageHeader
        title={wave.name ?? t('nav.waves')}
        subtitle={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StatusBadge status={wave.status} type="wave" />
            {wave.template_set_name && (
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{wave.template_set_name}</span>
            )}
            {wave.is_dummy && (
              <span style={{ fontSize: 11, background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 4, padding: '1px 7px', fontWeight: 600 }}>
                {t('waves.test')}
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
              {t('waves.skippedLeads', { count: wave.scheduling_report.skipped })}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {wave.scheduling_report.skipped_leads.map((sl, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  • {sl.company_name} — {sl.reason === 'no_verified_email' ? t('waves.noVerifiedEmail') : sl.reason}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
              {t('waves.scheduledEmails', { count: wave.scheduling_report.queued })}
            </div>
          </div>
        </GlassCard>
      )}

      {/* Failed emails section */}
      {failedEmails && failedEmails.length > 0 && (
        <GlassCard padding={20} style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#f87171', marginBottom: 12 }}>
            {t('waves.failedEmails', { count: failedEmails.length })}
          </h3>
          <div style={{ overflowX: 'auto', borderRadius: 6, border: '1px solid var(--border)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>E-mail</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>Seq</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>{t('waves.error')}</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>{t('waves.attempts')}</th>
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
                        {t('waves.retryBtn')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {/* ── Draft: scheduling card ── */}
      {wave.status === 'draft' && (
        <GlassCard padding={20}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{t('waves.scheduleWave')}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
            {t('waves.scheduleDesc')}
          </div>

          {availableSeqs.length === 0 && (
            <div style={{ fontSize: 12, color: '#fbbf24', fontStyle: 'italic', marginBottom: 12 }}>
              {t('waves.selectTemplateSet')}
            </div>
          )}

          {/* Start date + time */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
            <span style={{
              fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700,
              color: 'var(--green)', background: 'rgba(62,207,142,0.1)',
              padding: '2px 8px', borderRadius: 4,
            }}>
              Start
            </span>
            <input
              className="glass-input"
              type="date"
              value={startDate}
              min={today}
              onChange={e => setStartDate(e.target.value)}
              style={{ fontFamily: 'JetBrains Mono, monospace', maxWidth: 170 }}
            />
            <TimeInput24h value={startTime} onChange={setStartTime} />
          </div>

          {/* Leads per day (drip) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0 10px' }}>
            <span style={{
              fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600,
              color: 'var(--text-dim)', minWidth: 90,
            }}>
              {t('waves.leadsPerDay')}
            </span>
            <input
              className="glass-input"
              type="number"
              min={1}
              placeholder={String(waveLeads.length)}
              value={leadsPerDay ?? ''}
              onChange={e => {
                const v = e.target.value;
                setLeadsPerDay(v === '' ? null : Math.max(1, parseInt(v) || 1));
              }}
              style={{ fontFamily: 'JetBrains Mono, monospace', maxWidth: 90, textAlign: 'center' }}
            />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              ({t('waves.leadsPerDayHint')})
            </span>
          </div>

          {/* Sequence delay buttons */}
          {availableSeqs.length > 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '4px 0 10px' }}>
              {availableSeqs.slice(0, -1).map((fromSeq, idx) => {
                const toSeq = availableSeqs[idx + 1];
                const key = `${fromSeq}→${toSeq}`;
                const current = seqDelays[key] ?? DEFAULT_GAP;
                return (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600,
                      color: 'var(--text-dim)', minWidth: 90,
                    }}>
                      SEQ{fromSeq} → SEQ{toSeq}
                    </span>
                    <div style={{ width: 16, height: 1, background: 'var(--border)' }} />
                    {GAP_OPTIONS.map(days => (
                      <button
                        key={days}
                        onClick={() => setSeqDelays(prev => ({ ...prev, [key]: days }))}
                        style={{
                          fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
                          padding: '2px 8px', borderRadius: 4, cursor: 'pointer',
                          border: days === current
                            ? '1px solid rgba(62,207,142,0.5)'
                            : '1px solid var(--border)',
                          background: days === current
                            ? 'rgba(62,207,142,0.1)'
                            : 'var(--bg-subtle)',
                          color: days === current ? 'var(--green)' : 'var(--text-muted)',
                        }}
                      >
                        +{days}d
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {/* Drip summary */}
          {canLaunch && dripStats && (
            <div style={{
              marginTop: 6, padding: '12px 16px', borderRadius: 8,
              background: 'rgba(62,207,142,0.04)', border: '1px solid rgba(62,207,142,0.15)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                {t('waves.dripSummaryTitle')}
              </div>
              {leadsPerDay && leadsPerDay < waveLeads.length && (
                <div style={{ fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text)', marginBottom: 8 }}>
                  {dripStats.leadCount} {t('waves.leads').toLowerCase()} × {dripStats.effectivePerDay}/{t('waves.leadsPerDay').toLowerCase().split(' ').pop()} = {dripStats.dripDays} {t('waves.dripDays', { count: dripStats.dripDays }).split(' ').pop()}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {dripStats.seqRanges.map(({ seq, startDate: sd, endDate, delayFromPrev }) => (
                  <div key={seq} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}>
                    <span style={{
                      fontWeight: 700, color: 'var(--green)', background: 'rgba(62,207,142,0.1)',
                      padding: '1px 6px', borderRadius: 3, minWidth: 38, textAlign: 'center', fontSize: 11,
                    }}>SEQ{seq}</span>
                    <span style={{ color: 'var(--text)' }}>
                      {fmtDate(sd)}{sd !== endDate ? ` – ${fmtDate(endDate)}` : ''}
                    </span>
                    {delayFromPrev > 0 && (
                      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                        (+{delayFromPrev}d)
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 20, marginTop: 10 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('waves.totalEmails')}</span>
                  <span style={{ fontSize: 14, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text)', fontWeight: 600 }}>{dripStats.totalEmails}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('waves.sequences')}</span>
                  <span style={{ fontSize: 14, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text)', fontWeight: 600 }}>{availableSeqs.length}</span>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'center' }}>
            <GlassButton
              variant="primary"
              onClick={() => handlePreScheduleValidation()}
              disabled={!canLaunch || scheduling}
              title={!waveLeads.length ? t('waves.addLeadsToWave') : !canLaunch ? t('waves.setDateForAllSeqs') : ''}
            >
              {scheduling ? t('waves.launching') : t('waves.launchWave')}
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
                {sendingNow ? t('waves.launching') : t('waves.sendNowTest')}
              </GlassButton>
            )}
          </div>
          {!waveLeads.length && (
            <div style={{ fontSize: 11, color: '#fbbf24', marginTop: 8 }}>{t('waves.addLeadsToWave')}</div>
          )}
          {wave.is_dummy && !wave.dummy_email && (
            <div style={{ fontSize: 11, color: '#ef4444', marginTop: 8 }}>{t('waves.setTestEmail')}</div>
          )}
        </GlassCard>
      )}

      {/* ── Re-run card (paused) ── */}
      {wave.status === 'paused' && (
        <GlassCard padding={20}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{t('waves.wavePaused')}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
            {t('waves.rerunDesc')}
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
                  <TimeInput24h value={rerunSeqTimes[seq] || '08:00'} onChange={v => setRerunSeqTimes(prev => ({ ...prev, [seq]: v }))} />
                </div>

                {idx < availableSeqs.length - 1 && (() => {
                  const fromSeq = seq;
                  const toSeq = availableSeqs[idx + 1];
                  const defaultGap = DEFAULT_GAP;
                  return (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0 4px 56px',
                    }}>
                      <div style={{ width: 24, height: 1, background: 'var(--border)' }} />
                      {GAP_OPTIONS.map(days => (
                        <button
                          key={days}
                          onClick={() => applyGap(fromSeq, toSeq, days)}
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
              {rerunning ? t('waves.resuming') : t('waves.resumeWave')}
            </GlassButton>
          </div>
          {!availableSeqs.some(seq => !!rerunSeqDates[seq]) && (
            <div style={{ fontSize: 11, color: '#fbbf24', marginTop: 8 }}>{t('waves.setNewDateForSeq')}</div>
          )}
        </GlassCard>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <WaveConfigForm wave={wave} />
        {wave.template_set_id && templateSets && (
          <GlassCard padding={20}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>{t('waves.templateHeader')}</h3>
            {(() => {
              const ts = templateSets.find(t => t.id === wave.template_set_id);
              const templates = ts?.email_templates ?? [];
              const seqNums = Array.from(new Set<number>(templates.map((t: EmailTemplate) => t.sequence_number))).sort((a, b) => a - b);
              if (seqNums.length === 0) {
                return <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>{t('waves.noTemplatesInSet')}</div>;
              }
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {seqNums.map(seq => {
                    const tpl = templates.find((x: EmailTemplate) => x.sequence_number === seq);
                    return (
                      <div key={seq} style={{ padding: '8px 12px', background: 'var(--bg-subtle)', borderRadius: 6, border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: 'var(--green)', background: 'rgba(62,207,142,0.1)', padding: '1px 6px', borderRadius: 3 }}>SEQ{seq}</span>
                          {tpl
                            ? <span style={{ fontSize: 12, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tpl.subject || <em style={{ color: 'var(--text-muted)' }}>{t('waves.noSubject')}</em>}</span>
                            : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('waves.noTemplateAssigned')}</span>}
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
        title={t('waves.scheduleWave')}
        confirmLabel={t('waves.scheduleWave')}
        loading={scheduling}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5 }}>
            {t('waves.confirmLaunchPrefix')} <strong style={{ color: 'var(--text)' }}>{wave.name}</strong>?
          </div>
          {dripStats && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {dripStats.seqRanges.map(({ seq, startDate: sd, endDate, delayFromPrev }) => (
                <div key={seq} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: 'var(--green)', minWidth: 38 }}>SEQ{seq}</span>
                  <span style={{ fontSize: 13, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text)' }}>
                    {fmtDate(sd)}{sd !== endDate ? ` – ${fmtDate(endDate)}` : ''} {startTime}
                  </span>
                  {delayFromPrev > 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(+{delayFromPrev}d)</span>}
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('waves.leads')}</span>
              <span style={{ fontSize: 14, fontFamily: 'JetBrains Mono, monospace', color: 'var(--green)' }}>{waveLeads.length}</span>
            </div>
            {leadsPerDay && leadsPerDay < waveLeads.length && dripStats && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('waves.leadsPerDay')}</span>
                <span style={{ fontSize: 14, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text)' }}>{leadsPerDay} ({dripStats.dripDays}d)</span>
              </div>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {t('waves.confirmScheduleNote')}
          </div>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmStop}
        onClose={() => setConfirmStop(false)}
        onConfirm={handleStop}
        title={t('waves.confirmStopTitle')}
        confirmLabel={t('waves.confirmStopLabel')}
        variant="danger"
        loading={stopping}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5 }}>
            {t('waves.confirmStopPrefix')} <strong style={{ color: 'var(--text)' }}>{wave.name}</strong>?
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {t('waves.confirmStopNote')}
          </div>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmRerun}
        onClose={() => setConfirmRerun(false)}
        onConfirm={handleRerun}
        title={t('waves.confirmRerunTitle')}
        confirmLabel={t('waves.confirmRerunLabel')}
        loading={rerunning}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5 }}>
            {t('waves.confirmRerunPrefix')} <strong style={{ color: 'var(--text)' }}>{wave.name}</strong>?
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
            {t('waves.confirmRerunNote')}
          </div>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title={t('waves.confirmDeleteTitle')}
        confirmLabel={t('waves.confirmDeleteLabel')}
        variant="danger"
        loading={deleteWave.isPending}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5 }}>
            {t('waves.confirmDeletePrefix')} <strong style={{ color: 'var(--text)' }}>{wave.name}</strong>?
          </div>
          <div style={{ fontSize: 12, color: 'var(--red)', lineHeight: 1.5 }}>
            {t('waves.confirmDeleteNote')}
          </div>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmSendNow}
        onClose={() => setConfirmSendNow(false)}
        onConfirm={handleSendNow}
        title={t('waves.confirmSendNowTitle')}
        confirmLabel={t('waves.confirmSendNowLabel')}
        loading={sendingNow}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5 }}>
            {t('waves.confirmSendNowDesc')}{' '}
            <strong style={{ color: '#fbbf24', fontFamily: 'JetBrains Mono, monospace' }}>
              {wave.dummy_email}
            </strong>{' '}
            {t('waves.confirmSendNowSuffix')}
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('waves.leads')}</span>
              <span style={{ fontSize: 14, fontFamily: 'JetBrains Mono, monospace', color: 'var(--green)' }}>{waveLeads.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('waves.confirmSendNowRecipient')}</span>
              <span style={{ fontSize: 14, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text)' }}>{wave.dummy_email}</span>
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, padding: '8px 12px', background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 8 }}>
            {t('waves.confirmSendNowNote')}{' '}
            {t('waves.confirmSendNowTestPrefix')} <code style={{ color: '#fbbf24' }}>[TEST]</code>.
          </div>
        </div>
      </ConfirmDialog>

      {/* Force send single confirm */}
      <ConfirmDialog
        open={!!confirmForceSendItem}
        onClose={() => setConfirmForceSendItem(null)}
        onConfirm={() => confirmForceSendItem && handleForceSendSingle(confirmForceSendItem)}
        title={t('waves.confirmForceSendTitle')}
        confirmLabel={t('waves.confirmForceSendLabel')}
        loading={forceSend.isPending}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5 }}>
            {t('waves.confirmForceSendDesc')} SEQ{confirmForceSendItem?.sequence_number} {t('waves.confirmForceSendSuffix')}{' '}
            <strong style={{ color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace' }}>
              {confirmForceSendItem?.email_address}
            </strong>?
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {t('waves.confirmForceSendNote')}
          </div>
        </div>
      </ConfirmDialog>

      {/* Force send bulk confirm */}
      <ConfirmDialog
        open={confirmForceSendAll}
        onClose={() => setConfirmForceSendAll(false)}
        onConfirm={handleForceSendAll}
        title={t('waves.confirmForceSendAllTitle')}
        confirmLabel={t('waves.confirmForceSendAllLabel')}
        loading={forceSend.isPending}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5 }}>
            {t('waves.confirmForceSendAllDesc')}{' '}
            <strong style={{ color: '#fbbf24' }}>{forceSendEligibleItems.length}</strong> {t('waves.confirmForceSendAllSuffix')}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {t('waves.confirmForceSendAllNote')}
          </div>
        </div>
      </ConfirmDialog>

      {/* Missing variables warning */}
      <GlassModal
        open={!!missingVarsWarning}
        onClose={() => setMissingVarsWarning(null)}
        title={t('waves.missingVarsTitle')}
        width={520}
        footer={
          <>
            <GlassButton variant="secondary" onClick={() => setMissingVarsWarning(null)}>{t('common.cancel')}</GlassButton>
            <GlassButton variant="primary" onClick={() => { setMissingVarsWarning(null); setConfirmSchedule(true); }}>
              {t('waves.continueAnyway')}
            </GlassButton>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5 }}>
            {t('waves.missingVarsDesc').split('<code>')[0]}<code style={{ color: '#fbbf24' }}>{`{{nazev}}`}</code>.
          </div>
          <div style={{
            maxHeight: 250, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6,
            padding: '8px 12px', background: 'rgba(251,191,36,0.06)',
            border: '1px solid rgba(251,191,36,0.2)', borderRadius: 8,
          }}>
            {(missingVarsWarning ?? []).map((w, i) => (
              <div key={i} style={{ fontSize: 12, color: 'var(--text)' }}>
                <strong>{w.lead}</strong>
                <span style={{ color: 'var(--text-muted)' }}>{t('waves.missingVarsMissing')}</span>
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
        title={t('waves.emailPreview')}
        width={640}
        footer={
          <GlassButton variant="secondary" onClick={() => setShowPreview(false)}>{t('common.close')}</GlassButton>
        }
      >
        {(() => {
          const ts = templateSets?.find(t => t.id === wave.template_set_id);
          const templates = ts?.email_templates ?? [];
          const sampleWl = waveLeads[0];
          const sampleLead = sampleWl?.leads ?? sampleWl?.lead ?? {};
          const contacts = sampleLead?.contacts ?? [];
          const contact = contacts[0] ?? null;
          const ctx = buildTemplateContext(sampleLead, contact);
          const seqNums = Array.from(new Set<number>(templates.map((t: EmailTemplate) => t.sequence_number))).sort((a: number, b: number) => a - b);

          if (!templates.length) {
            return <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('waves.noTemplatesToShow')}</p>;
          }

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 12px', background: 'var(--bg-subtle)', borderRadius: 6, border: '1px solid var(--border)' }}>
                {t('waves.previewWithLead')} <strong style={{ color: 'var(--text)' }}>{sampleLead?.company_name ?? '—'}</strong>
                {contact && <span> · {contact.full_name}</span>}
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
                      <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{renderedSubject || t('waves.noSubject')}</span>
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
