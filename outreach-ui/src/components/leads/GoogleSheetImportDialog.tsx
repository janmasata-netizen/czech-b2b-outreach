import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import GlassModal from '@/components/glass/GlassModal';
import GlassButton from '@/components/glass/GlassButton';
import GlassInput from '@/components/glass/GlassInput';
import GlassProgress from '@/components/glass/GlassProgress';
import { useTeams } from '@/hooks/useLeads';
import { supabase } from '@/lib/supabase';
import { parseCsv, autoDetect, isLikelyCompanyName } from '@/lib/csv-utils';
import { toast } from 'sonner';
import { n8nWebhookUrl, n8nHeaders } from '@/lib/n8n';
import { checkDuplicates, extractDomain, type DedupResult, type DuplicateMatch } from '@/lib/dedup';
import { LEAD_LANGUAGE_MAP } from '@/lib/constants';
import { percentagesToCounts, assignTeamToRowsByCount, type TeamAllocation } from '@/lib/team-distribution';
import TeamDistributionSelector from '@/components/shared/TeamDistributionSelector';
import type { LeadLanguage } from '@/types/database';

interface GoogleSheetImportDialogProps {
  open: boolean;
  onClose: () => void;
}

type Step = 'url' | 'map' | 'review' | 'importing' | 'done';
type EnrichmentLevel = 'import_only' | 'find_emails' | 'full_pipeline';

interface Progress {
  done: number;
  errors: number;
  duplicates: number;
  total: number;
  icosFound: number;
  phase: string;
}

export default function GoogleSheetImportDialog({ open, onClose }: GoogleSheetImportDialogProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: teams } = useTeams();
  const qc = useQueryClient();

  const [step, setStep] = useState<Step>('url');
  const [sheetUrl, setSheetUrl] = useState('');
  const [fetching, setFetching] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState({ company_name: '', ico: '', website: '', contact_name: '', email: '' });
  const [teamAllocations, setTeamAllocations] = useState<TeamAllocation[]>([]);
  const [language, setLanguage] = useState<LeadLanguage>('cs');
  const [enrichmentLevel, setEnrichmentLevel] = useState<EnrichmentLevel>('full_pipeline');
  const [importName, setImportName] = useState('');
  const [progress, setProgress] = useState<Progress>({ done: 0, errors: 0, duplicates: 0, total: 0, icosFound: 0, phase: '' });
  const [mapError, setMapError] = useState('');
  const [dedupResult, setDedupResult] = useState<DedupResult | null>(null);
  const [dedupChecking, setDedupChecking] = useState(false);
  const [createdGroupId, setCreatedGroupId] = useState<string | null>(null);

  function resetState() {
    setStep('url');
    setSheetUrl('');
    setFetching(false);
    setHeaders([]);
    setRows([]);
    setMapping({ company_name: '', ico: '', website: '', contact_name: '', email: '' });
    setTeamAllocations([]);
    setLanguage('cs');
    setEnrichmentLevel('full_pipeline');
    setImportName('');
    setProgress({ done: 0, errors: 0, duplicates: 0, total: 0, icosFound: 0, phase: '' });
    setMapError('');
    setDedupResult(null);
    setDedupChecking(false);
    setCreatedGroupId(null);
  }

  function handleClose() {
    resetState();
    onClose();
  }

  function normalizeSheetUrl(url: string): string {
    let u = url.trim();
    if (u && !u.startsWith('http://') && !u.startsWith('https://')) {
      u = 'https://' + u;
    }
    return u;
  }

  function isValidSheetUrl(url: string) {
    try {
      const parsed = new URL(normalizeSheetUrl(url));
      return parsed.hostname.endsWith('google.com') && parsed.pathname.includes('/spreadsheets/');
    } catch {
      return false;
    }
  }

  async function handleFetchSheet() {
    if (!isValidSheetUrl(sheetUrl)) {
      toast.error(t('gsheetImport.invalidUrl'), { duration: 8000 });
      return;
    }

    setFetching(true);
    try {
      const normalizedUrl = normalizeSheetUrl(sheetUrl);
      const res = await fetch(n8nWebhookUrl('gsheet-proxy'), {
        method: 'POST',
        headers: n8nHeaders(),
        body: JSON.stringify({ url: normalizedUrl }),
      });

      const text = await res.text();
      let data: { success?: boolean; csv?: string; error?: string };
      try {
        data = JSON.parse(text);
      } catch {
        console.error('n8n returned non-JSON:', text.slice(0, 500));
        toast.error(t('gsheetImport.serverError', { status: res.status }), { duration: Infinity, closeButton: true });
        return;
      }

      if (!res.ok) {
        toast.error(data.error || t('gsheetImport.serverError', { status: res.status }), { duration: Infinity, closeButton: true });
        return;
      }

      if (!data.success || !data.csv) {
        toast.error(data.error || t('gsheetImport.sheetMustBePublicError'), { duration: 8000 });
        return;
      }

      const parsed = parseCsv(data.csv);
      if (parsed.length < 2) {
        toast.error(t('gsheetImport.emptySheet'), { duration: 8000 });
        return;
      }

      const [headerRow, ...dataRows] = parsed;
      setHeaders(headerRow);
      setRows(dataRows);
      setMapping(autoDetect(headerRow));
      setTeamAllocations(teams && teams.length > 0 ? [{ teamId: teams[0].id, teamName: teams[0].name, percentage: 100 }] : []);
      setStep('map');
    } catch (err) {
      console.error('Fetch sheet failed:', err);
      toast.error(t('gsheetImport.connectionError'), { duration: 8000 });
    } finally {
      setFetching(false);
    }
  }

  function getRowValue(row: string[], field: keyof typeof mapping): string {
    const col = mapping[field];
    return col ? (row[headers.indexOf(col)] ?? '').trim() : '';
  }

  async function handleMapNext() {
    if (!mapping.company_name && !mapping.website && !mapping.contact_name) {
      setMapError(t('gsheetImport.mustMapColumn'));
      return;
    }
    setMapError('');

    // Filter empty rows (all mapped fields empty)
    const mappedFields = (Object.keys(mapping) as (keyof typeof mapping)[]).filter(k => mapping[k]);
    const filteredRows = rows.filter(row => mappedFields.some(f => getRowValue(row, f)));
    const emptyCount = rows.length - filteredRows.length;
    if (emptyCount > 0) {
      toast.info(`${emptyCount} prázdných řádků přeskočeno`);
      setRows(filteredRows);
    }

    // Build candidates for dedup check
    setDedupChecking(true);
    try {
      const candidates = filteredRows.map(row => ({
        ico: getRowValue(row, 'ico') || undefined,
        domain: extractDomain(getRowValue(row, 'website')) || undefined,
        email: getRowValue(row, 'email') || undefined,
        company_name: getRowValue(row, 'company_name') || undefined,
      }));

      const result = await checkDuplicates(candidates);

      if (result.duplicates.length > 0) {
        setDedupResult(result);
        setStep('review');
      } else {
        runImport(new Set(), filteredRows);
      }
    } catch (err) {
      console.error('Dedup check failed:', err);
      toast.error(t('csvImport.dedupFailed'), { duration: 8000 });
    } finally {
      setDedupChecking(false);
    }
  }

  async function runImport(skipIndices: Set<number>, effectiveRows?: string[][]) {
    const importRows = effectiveRows ?? rows;
    setStep('importing');

    const effectiveAllocations = teamAllocations.length > 0
      ? teamAllocations
      : teams && teams.length > 0
        ? [{ teamId: teams[0].id, teamName: teams[0].name, percentage: 100 }]
        : [];

    // Create import group
    const primaryTeamId = effectiveAllocations[0]?.teamId || null;
    const { data: group, error: groupErr } = await supabase
      .from('import_groups')
      .insert({ name: importName || 'Google Sheet import', source: 'gsheet' as const, enrichment_level: enrichmentLevel, team_id: primaryTeamId })
      .select()
      .single();
    if (groupErr || !group) {
      console.error('Failed to create import group:', groupErr);
      toast.error('Failed to create import group');
      setStep('url');
      return;
    }
    const groupId = group.id;
    setCreatedGroupId(groupId);

    const mappedCols = new Set(Object.values(mapping).filter(Boolean));
    const extraCols = headers.filter(h => !mappedCols.has(h));

    // Build active rows (skip duplicates)
    const skippedDups = skipIndices.size;
    const activeRows: string[][] = [];
    const activeOrigIndices: number[] = [];
    for (let i = 0; i < importRows.length; i++) {
      if (!skipIndices.has(i)) {
        activeRows.push(importRows[i]);
        activeOrigIndices.push(i);
      }
    }

    // Assign teams by exact count (no percentage rounding)
    const teamCounts = percentagesToCounts(activeRows.length, effectiveAllocations);
    const teamForRow = assignTeamToRowsByCount(teamCounts);

    const total = importRows.length;
    let done = skippedDups;
    let errors = 0;
    const duplicates = skippedDups;
    let icosFound = 0;
    setProgress({ done, errors, duplicates, total, icosFound: 0, phase: '' });

    // For full pipeline: Phase 1 — scrape ICOs from websites (sequential, throttled)
    const rowIcos: Map<number, string> = new Map();

    if (enrichmentLevel === 'full_pipeline') {
      const rowsNeedingIco = activeRows
        .map((row, i) => ({ i, website: getRowValue(row, 'website'), ico: getRowValue(row, 'ico') }))
        .filter(r => r.website && !r.ico);

      if (rowsNeedingIco.length > 0) {
        setProgress(p => ({ ...p, phase: t('gsheetImport.searchingIco', { done: 0, total: rowsNeedingIco.length }) }));

        for (let idx = 0; idx < rowsNeedingIco.length; idx++) {
          const r = rowsNeedingIco[idx];
          try {
            const res = await fetch(n8nWebhookUrl('wf12-ico-scrape'), {
              method: 'POST',
              headers: n8nHeaders(),
              body: JSON.stringify({ website: r.website }),
            });
            const data = await res.json();
            if (data.ico) {
              rowIcos.set(r.i, data.ico);
              icosFound++;
            }
          } catch { /* ignore scrape failures */ }
          setProgress(p => ({
            ...p,
            icosFound,
            phase: t('gsheetImport.searchingIco', { done: idx + 1, total: rowsNeedingIco.length }),
          }));
          if (idx < rowsNeedingIco.length - 1) await delay(200);
        }
      }
    }

    // Phase 2: Import leads in batches
    setProgress(p => ({ ...p, phase: t('gsheetImport.importingLeads', { done: 0, total }) }));

    async function importSingleRow(row: string[], teamId: string, activeIdx: number): Promise<'ok' | 'error'> {
      const company_name = getRowValue(row, 'company_name');
      const ico = getRowValue(row, 'ico') || rowIcos.get(activeIdx) || '';
      const website = getRowValue(row, 'website');
      const contact_name = getRowValue(row, 'contact_name');
      const email = getRowValue(row, 'email');

      const custom_fields: Record<string, string> = {};
      for (const col of extraCols) {
        const val = (row[headers.indexOf(col)] ?? '').trim();
        if (val) custom_fields[col.toLowerCase().replace(/[^a-z0-9_]/g, '_')] = val;
      }

      const validEmail = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';

      try {
        const { data: rpcResult, error: rpcErr } = await supabase.rpc('ingest_lead', {
          p_company_name: company_name || contact_name || null,
          p_ico: ico || null,
          p_website: website || null,
          p_domain: extractDomain(website) || null,
          p_team_id: teamId || null,
          p_status: validEmail ? 'ready' : 'new',
          p_lead_type: 'company',
          p_language: language,
          p_custom_fields: Object.keys(custom_fields).length > 0 ? custom_fields : {},
          p_import_group_id: groupId,
        });

        if (rpcErr) return 'error';

        const companyId = rpcResult?.company_id;

        if (validEmail && companyId) {
          const { data: contact, error: ce } = await supabase
            .from('contacts')
            .insert({ company_id: companyId, full_name: contact_name || null })
            .select()
            .single();
          if (ce) return 'error';
          const { error: ee } = await supabase
            .from('email_candidates')
            .insert({
              contact_id: contact.id,
              email_address: validEmail,
              is_verified: true,
              qev_status: 'manually_verified',
              seznam_status: 'likely_valid',
            });
          if (ee) return 'error';
        } else if (contact_name && companyId) {
          await supabase
            .from('contacts')
            .insert({ company_id: companyId, full_name: contact_name });
        }
        return 'ok';
      } catch {
        return 'error';
      }
    }

    // Process in batches of 5 for ~5x speedup
    const BATCH_SIZE = 5;
    for (let batchStart = 0; batchStart < activeRows.length; batchStart += BATCH_SIZE) {
      const batch = activeRows.slice(batchStart, batchStart + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((row, i) => importSingleRow(row, teamForRow[batchStart + i] || effectiveAllocations[0]?.teamId || '', batchStart + i))
      );
      for (const r of results) {
        done++;
        if (r.status === 'rejected' || (r.status === 'fulfilled' && r.value === 'error')) {
          errors++;
        }
      }
      setProgress(p => ({
        ...p,
        done,
        errors,
        duplicates,
        phase: t('gsheetImport.importingLeads', { done, total }),
      }));
    }

    setProgress({ done, errors, duplicates, total, icosFound, phase: '' });
    qc.invalidateQueries({ queryKey: ['leads'] });
    qc.invalidateQueries({ queryKey: ['import-groups'] });
    setStep('done');
  }

  // ---- STEP: review (dedup) ----
  const dupCount = dedupResult?.duplicateIndices.size ?? 0;
  const cleanCount = rows.length - dupCount;
  const matchFieldLabels: Record<string, string> = {
    ico: t('csvImport.matchFields.ico'),
    domain: t('csvImport.matchFields.domain'),
    email: t('csvImport.matchFields.email'),
    company_name: t('csvImport.matchFields.company_name'),
  };

  const stepReview = dedupResult && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ padding: '12px 16px', background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.25)', borderRadius: 8, fontSize: 13, color: '#fb923c' }}>
        Nalezeno <strong>{dupCount}</strong> duplicitních leadů z {rows.length}. Tyto řádky budou přeskočeny.
      </div>
      <div style={{ maxHeight: 300, overflowY: 'auto', borderRadius: 6, border: '1px solid var(--border)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)', position: 'sticky', top: 0 }}>
              <th style={{ padding: '7px 10px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>{t('csvImport.row')}</th>
              <th style={{ padding: '7px 10px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>{t('csvImport.company')}</th>
              <th style={{ padding: '7px 10px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>{t('csvImport.match')}</th>
              <th style={{ padding: '7px 10px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>{t('csvImport.matchValue')}</th>
              <th style={{ padding: '7px 10px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>{t('csvImport.existingCompany')}</th>
            </tr>
          </thead>
          <tbody>
            {Array.from(dedupResult.duplicateIndices).sort((a, b) => a - b).map(idx => {
              const matches = dedupResult.candidateMatches.get(idx) ?? [];
              const row = rows[idx];
              const companyName = getRowValue(row, 'company_name');
              return matches.map((m: DuplicateMatch, mi: number) => (
                <tr key={`${idx}-${mi}`} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '7px 10px', color: 'var(--text-dim)', fontFamily: 'JetBrains Mono, monospace' }}>{idx + 1}</td>
                  <td style={{ padding: '7px 10px', color: 'var(--text)' }}>{companyName || '—'}</td>
                  <td style={{ padding: '7px 10px', color: '#fb923c' }}>{matchFieldLabels[m.match_field] ?? m.match_field}</td>
                  <td style={{ padding: '7px 10px', color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace' }}>{m.match_value}</td>
                  <td style={{ padding: '7px 10px', color: 'var(--text-dim)' }}>{m.existing_company ?? '—'}</td>
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  const modalWidth = (step === 'url' || step === 'done') ? 520 : step === 'review' ? 700 : 620;
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const imported = Math.max(0, progress.done - progress.errors - progress.duplicates);
  const previewRows = rows.slice(0, 3);

  // ---- STEP: url ----
  const stepUrl = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <GlassInput
        label={t('gsheetImport.urlLabel')}
        placeholder="https://docs.google.com/spreadsheets/d/..."
        value={sheetUrl}
        onChange={e => setSheetUrl(e.target.value)}
      />
      <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '8px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 6 }}>
        Sheet musí být veřejný — <strong>Sdílet → Kdokoli s odkazem</strong>
      </div>
    </div>
  );

  // ---- STEP: map ----
  const stepMap = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Column mapping */}
      {([
        { label: t('csvImport.companyName'), field: 'company_name' as const },
        { label: t('csvImport.ico'),         field: 'ico' as const },
        { label: t('csvImport.web'),         field: 'website' as const },
        { label: t('csvImport.contactName'), field: 'contact_name' as const },
        { label: t('csvImport.email'),       field: 'email' as const },
      ]).map(({ label, field }) => (
        <div key={field} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: 'var(--text-dim)', minWidth: 110 }}>{label}</span>
          <select
            className="glass-input"
            style={{ flex: 1, height: 34, fontSize: 13 }}
            value={mapping[field]}
            onChange={e => setMapping(m => ({ ...m, [field]: e.target.value }))}
          >
            <option value="">{t('csvImport.notMapped')}</option>
            {headers.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>
      ))}

      {/* Team distribution selector */}
      {teams && teams.length > 1 && (
        <TeamDistributionSelector
          teams={teams}
          allocations={teamAllocations}
          onChange={setTeamAllocations}
          totalCount={rows.length}
        />
      )}

      {/* Language selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 13, color: 'var(--text-dim)', minWidth: 110 }}>Jazyk leadů</span>
        <select
          className="glass-input"
          style={{ flex: 1, height: 34, fontSize: 13 }}
          value={language}
          onChange={e => setLanguage(e.target.value as LeadLanguage)}
        >
          {Object.entries(LEAD_LANGUAGE_MAP).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
      </div>

      {/* Import name */}
      <GlassInput
        label={t('importGroups.importName')}
        placeholder={t('importGroups.importNamePlaceholder')}
        value={importName}
        onChange={e => setImportName(e.target.value)}
      />

      {/* Enrichment level */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-dim)' }}>{t('csvImport.enrichmentLevel')}</span>
        {([
          { value: 'import_only' as const, label: t('csvImport.importOnly'), desc: t('csvImport.importOnlyDesc') },
          { value: 'find_emails' as const, label: t('csvImport.findEmails'), desc: t('csvImport.findEmailsDesc') },
          { value: 'full_pipeline' as const, label: t('csvImport.fullPipeline'), desc: t('csvImport.fullPipelineDesc') },
        ]).map(opt => (
          <label
            key={opt.value}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
              padding: '8px 12px', borderRadius: 6,
              background: enrichmentLevel === opt.value ? 'rgba(99,102,241,0.08)' : 'transparent',
              border: `1px solid ${enrichmentLevel === opt.value ? 'rgba(99,102,241,0.3)' : 'var(--border)'}`,
            }}
          >
            <input
              type="radio"
              name="enrichment"
              checked={enrichmentLevel === opt.value}
              onChange={() => setEnrichmentLevel(opt.value)}
              style={{ marginTop: 2 }}
            />
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{opt.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{opt.desc}</div>
            </div>
          </label>
        ))}
      </div>

      {/* Custom fields info */}
      {(() => {
        const mappedCols = new Set(Object.values(mapping).filter(Boolean));
        const extra = headers.filter(h => !mappedCols.has(h));
        if (extra.length === 0) return null;
        return (
          <div style={{ fontSize: 12, color: 'var(--cyan)', padding: '8px 12px', background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.2)', borderRadius: 6 }}>
            Zbývající sloupce budou uloženy jako vlastní pole: <strong>{extra.join(', ')}</strong>
          </div>
        );
      })()}

      {/* Company name in contact_name warning */}
      {(() => {
        if (!mapping.contact_name) return null;
        const companyRows = rows.filter(row => isLikelyCompanyName(getRowValue(row, 'contact_name')));
        if (companyRows.length === 0) return null;
        const examples = companyRows.slice(0, 5).map(row => getRowValue(row, 'contact_name'));
        return (
          <div style={{ fontSize: 12, color: '#fb923c', padding: '8px 12px', background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.25)', borderRadius: 6 }}>
            <div style={{ fontWeight: 500, marginBottom: 4 }}>
              {t('csvImport.companyNameInContact', { count: companyRows.length })}
            </div>
            <div style={{ color: 'var(--text-dim)', marginBottom: 4 }}>
              {t('csvImport.companyNameInContactNote')}
            </div>
            <div style={{ color: 'var(--text-dim)' }}>
              {t('csvImport.companyNameInContactExamples')} {examples.join(', ')}
            </div>
          </div>
        );
      })()}

      {mapError && (
        <div style={{ fontSize: 12, color: '#f87171', padding: '8px 12px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 6 }}>
          {mapError}
        </div>
      )}

      {/* Preview table */}
      {previewRows.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8, fontWeight: 500 }}>{t('csvImport.preview')}</div>
          <div style={{ overflowX: 'auto', borderRadius: 6, border: '1px solid var(--border)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                  {(['company_name', 'ico', 'website', 'contact_name', 'email'] as const).map(f => (
                    <th key={f} style={{ padding: '7px 10px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 500, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                      {f === 'company_name' ? t('csvImport.company') : f === 'ico' ? t('csvImport.ico') : f === 'website' ? t('csvImport.web') : f === 'contact_name' ? t('csvImport.contact') : t('csvImport.email')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, i) => (
                  <tr key={i} style={{ borderBottom: i < previewRows.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    {(['company_name', 'ico', 'website', 'contact_name', 'email'] as const).map(f => {
                      const col = mapping[f];
                      const val = col ? (row[headers.indexOf(col)] ?? '') : '';
                      return (
                        <td key={f} style={{ padding: '7px 10px', color: val ? 'var(--text)' : 'var(--text-muted)' }}>
                          {val || '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );

  // ---- STEP: importing ----
  const stepImporting = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>
        {progress.phase || t('csvImport.importingLeads', { count: progress.total })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <GlassProgress value={pct} height={8} />
        <div style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
          {progress.done} / {progress.total}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 13, color: 'var(--green)' }}>
          ✓ {imported} {t('csvImport.imported')}
        </div>
        <div style={{ fontSize: 13, color: '#fb923c' }}>
          ⚠ {progress.duplicates} {t('csvImport.duplicate')}
        </div>
        <div style={{ fontSize: 13, color: '#f87171' }}>
          ✗ {progress.errors} {t('csvImport.errors')}
        </div>
        {enrichmentLevel === 'full_pipeline' && progress.icosFound > 0 && (
          <div style={{ fontSize: 13, color: 'var(--cyan)' }}>
            {t('gsheetImport.icosFoundOnWeb', { count: progress.icosFound })}
          </div>
        )}
      </div>
    </div>
  );

  // ---- STEP: done ----
  const stepDone = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{t('csvImport.done')}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13, color: 'var(--green)' }}>✓ {t('csvImport.leadsImported', { count: imported })}</div>
        <div style={{ fontSize: 13, color: '#fb923c' }}>⚠ {t('csvImport.duplicatesSkipped', { count: progress.duplicates })}</div>
        <div style={{ fontSize: 13, color: '#f87171' }}>✗ {t('csvImport.errorsCount', { count: progress.errors })}</div>
        {enrichmentLevel === 'full_pipeline' && (
          <div style={{ fontSize: 13, color: 'var(--cyan)' }}>{t('gsheetImport.icosFoundOnWeb', { count: progress.icosFound })}</div>
        )}
      </div>
      {enrichmentLevel !== 'import_only' && (
        <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '8px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 6 }}>
          {t('importGroups.enrichmentPending')}
        </div>
      )}
    </div>
  );

  const footer = (
    <>
      {step === 'url' && (
        <>
          <GlassButton variant="secondary" onClick={handleClose}>{t('common.cancel')}</GlassButton>
          <GlassButton
            variant="primary"
            disabled={!sheetUrl || fetching || !isValidSheetUrl(sheetUrl)}
            onClick={handleFetchSheet}
          >
            {fetching ? t('gsheetImport.fetching') : t('gsheetImport.fetch')}
          </GlassButton>
        </>
      )}
      {step === 'map' && (
        <>
          <GlassButton variant="secondary" onClick={() => setStep('url')}>{t('common.back')}</GlassButton>
          <GlassButton variant="primary" onClick={handleMapNext} disabled={dedupChecking || !importName.trim()}>
            {dedupChecking ? t('csvImport.checkingDuplicates') : t('csvImport.startImport', { count: rows.length })}
          </GlassButton>
        </>
      )}
      {step === 'review' && dedupResult && (
        <>
          <GlassButton variant="secondary" onClick={() => { setDedupResult(null); setStep('map'); }}>{t('common.back')}</GlassButton>
          <GlassButton variant="primary" onClick={() => runImport(dedupResult.duplicateIndices)}>
            {t('csvImport.skipAndImport', { skip: dupCount, clean: cleanCount })}
          </GlassButton>
        </>
      )}
      {step === 'done' && (
        <>
          <GlassButton variant="secondary" onClick={handleClose}>{t('common.close')}</GlassButton>
          {createdGroupId && (
            <GlassButton variant="primary" onClick={() => { handleClose(); navigate(`/leady/skupiny/${createdGroupId}`); }}>
              {t('importGroups.viewGroup')}
            </GlassButton>
          )}
        </>
      )}
    </>
  );

  const titles: Record<Step, string> = {
    url:       t('gsheetImport.title'),
    map:       t('csvImport.mapColumns'),
    review:    t('csvImport.duplicatesFound'),
    importing: t('csvImport.importing'),
    done:      t('csvImport.done'),
  };

  return (
    <GlassModal
      open={open}
      onClose={step === 'importing' ? () => {} : handleClose}
      title={titles[step]}
      width={modalWidth}
      footer={step !== 'importing' ? footer : undefined}
    >
      {step === 'url'       && stepUrl}
      {step === 'map'       && stepMap}
      {step === 'review'    && stepReview}
      {step === 'importing' && stepImporting}
      {step === 'done'      && stepDone}
    </GlassModal>
  );
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
