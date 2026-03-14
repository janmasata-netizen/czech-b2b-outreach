import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import GlassModal from '@/components/glass/GlassModal';
import GlassButton from '@/components/glass/GlassButton';
import GlassInput from '@/components/glass/GlassInput';
import GlassProgress from '@/components/glass/GlassProgress';
import { useTeams } from '@/hooks/useLeads';
import { supabase } from '@/lib/supabase';
import { n8nWebhookUrl, n8nHeaders } from '@/lib/n8n';
import { parseCsv, autoDetect } from '@/lib/csv-utils';
import { toast } from 'sonner';
import { checkDuplicates, extractDomain, type DedupResult, type DuplicateMatch } from '@/lib/dedup';
import { LEAD_LANGUAGE_MAP } from '@/lib/constants';
import { assignTeamToRows, distributeEvenly, type TeamAllocation } from '@/lib/team-distribution';
import TeamDistributionSelector from '@/components/shared/TeamDistributionSelector';
import type { LeadLanguage } from '@/types/database';

interface CsvImportDialogProps {
  open: boolean;
  onClose: () => void;
}

type Step = 'upload' | 'map' | 'review' | 'importing' | 'done';
type EnrichmentLevel = 'import_only' | 'find_emails' | 'full_pipeline';

interface Progress {
  done: number;
  errors: number;
  duplicates: number;
  total: number;
}

export default function CsvImportDialog({ open, onClose }: CsvImportDialogProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: teams } = useTeams();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState({ company_name: '', ico: '', website: '', contact_name: '', email: '' });
  const [teamAllocations, setTeamAllocations] = useState<TeamAllocation[]>([]);
  const [progress, setProgress] = useState<Progress>({ done: 0, errors: 0, duplicates: 0, total: 0 });
  const [mapError, setMapError] = useState('');
  const [language, setLanguage] = useState<LeadLanguage>('cs');
  const [enrichmentLevel, setEnrichmentLevel] = useState<EnrichmentLevel>('import_only');
  const [importName, setImportName] = useState('');
  const [dedupResult, setDedupResult] = useState<DedupResult | null>(null);
  const [dedupChecking, setDedupChecking] = useState(false);
  const [createdGroupId, setCreatedGroupId] = useState<string | null>(null);

  function resetState() {
    setStep('upload');
    setFileName('');
    setHeaders([]);
    setRows([]);
    setMapping({ company_name: '', ico: '', website: '', contact_name: '', email: '' });
    setTeamAllocations([]);
    setProgress({ done: 0, errors: 0, duplicates: 0, total: 0 });
    setMapError('');
    setLanguage('cs');
    setEnrichmentLevel('import_only');
    setImportName('');
    setDedupResult(null);
    setDedupChecking(false);
    setCreatedGroupId(null);
  }

  function handleClose() {
    resetState();
    onClose();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const parsed = parseCsv(text);
      if (parsed.length < 2) return;
      const [headerRow, ...dataRows] = parsed;
      setHeaders(headerRow);
      setRows(dataRows);
      setFileName(file.name);
      setMapping(autoDetect(headerRow));
      setTeamAllocations(teams && teams.length > 0 ? [{ teamId: teams[0].id, teamName: teams[0].name, percentage: 100 }] : []);
    };
    reader.onerror = () => {
      toast.error(t('csvImport.failedToRead'));
    };
    reader.readAsText(file, 'UTF-8');
  }

  function getRowValue(row: string[], field: keyof typeof mapping): string {
    const col = mapping[field];
    return col ? (row[headers.indexOf(col)] ?? '').trim() : '';
  }

  async function handleMapNext() {
    if (!mapping.company_name && !mapping.ico && !mapping.contact_name) {
      setMapError(t('csvImport.mustMapColumn'));
      return;
    }
    setMapError('');

    // Build candidates for dedup check
    setDedupChecking(true);
    try {
      const candidates = rows.map(row => ({
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
        runImport(new Set());
      }
    } catch (err) {
      console.error('Dedup check failed:', err);
      toast.error(t('csvImport.dedupFailed'));
    } finally {
      setDedupChecking(false);
    }
  }

  async function runImport(skipIndices: Set<number>) {
    setStep('importing');
    const total = rows.length;
    let done = 0, errors = 0, duplicates = 0;
    setProgress({ done: 0, errors: 0, duplicates: 0, total });

    const effectiveAllocations = teamAllocations.length > 0
      ? teamAllocations
      : teams && teams.length > 0
        ? [{ teamId: teams[0].id, teamName: teams[0].name, percentage: 100 }]
        : [];

    // Create import group
    const primaryTeamId = effectiveAllocations[0]?.teamId || null;
    const { data: group, error: groupErr } = await supabase
      .from('import_groups')
      .insert({ name: importName || fileName, source: 'csv' as const, enrichment_level: enrichmentLevel, team_id: primaryTeamId })
      .select()
      .single();
    if (groupErr || !group) {
      console.error('Failed to create import group:', groupErr);
      toast.error('Failed to create import group');
      setStep('upload');
      return;
    }
    const groupId = group.id;
    setCreatedGroupId(groupId);

    // Count non-skipped rows for team distribution
    const activeCount = rows.filter((_, i) => !skipIndices.has(i)).length;
    const teamForRow = assignTeamToRows(activeCount, effectiveAllocations);
    let activeIdx = 0;

    // Determine unmapped columns for custom_fields
    const mappedCols = new Set(Object.values(mapping).filter(Boolean));
    const extraCols = headers.filter(h => !mappedCols.has(h));

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // Skip duplicates identified in review step
      if (skipIndices.has(i)) {
        duplicates++;
        done++;
        setProgress({ done, errors, duplicates, total });
        continue;
      }

      const rowTeamId = teamForRow[activeIdx++] || effectiveAllocations[0]?.teamId || '';

      const company_name = getRowValue(row, 'company_name');
      const ico          = getRowValue(row, 'ico');
      const website      = getRowValue(row, 'website');
      const contact_name = getRowValue(row, 'contact_name');
      const email        = getRowValue(row, 'email');

      // Build custom_fields from unmapped columns
      const custom_fields: Record<string, string> = {};
      for (const col of extraCols) {
        const val = (row[headers.indexOf(col)] ?? '').trim();
        if (val) custom_fields[col.toLowerCase().replace(/[^a-z0-9_]/g, '_')] = val;
      }

      // Skip rows with no usable data
      if (!company_name && !ico && !contact_name) {
        done++;
        setProgress({ done, errors, duplicates, total });
        continue;
      }

      const validEmail = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';

      try {
        if (validEmail) {
          // Full insert: ingest_lead RPC → contact + email_candidate → status='ready'
          const { data: rpcData, error: le } = await supabase
            .rpc('ingest_lead', {
              p_company_name: company_name || null,
              p_ico: ico || null,
              p_website: website || null,
              p_domain: extractDomain(website) || null,
              p_team_id: rowTeamId || null,
              p_status: 'ready',
              p_lead_type: 'company',
              p_language: language,
              p_custom_fields: Object.keys(custom_fields).length > 0 ? custom_fields : {},
              p_import_group_id: groupId,
            });

          if (le) {
            errors++;
          } else {
            const companyId = rpcData?.company_id ?? rpcData?.[0]?.company_id;
            const { data: contact, error: ce } = await supabase
              .from('contacts')
              .insert({ company_id: companyId, full_name: contact_name || null })
              .select()
              .single();
            if (ce) { errors++; }
            else {
              const { error: ee } = await supabase
                .from('email_candidates')
                .insert({
                  contact_id: contact.id,
                  email_address: validEmail,
                  is_verified: true,
                  qev_status: 'manually_verified',
                  seznam_status: 'likely_valid',
                });
              if (ee) errors++;
            }
          }
        } else if (enrichmentLevel !== 'import_only' && (website || ico)) {
          // Enrichment mode: call WF1 webhook for leads without email
          const payload: Record<string, string | null | Record<string, string>> = {
            company_name: company_name || contact_name || null,
            ico: ico || null,
            website: website || null,
            team_id: rowTeamId || null,
            language,
          };
          if (contact_name) payload.contact_name = contact_name;
          if (Object.keys(custom_fields).length > 0) payload.custom_fields = custom_fields;
          if (groupId) payload.import_group_id = groupId;

          try {
            const res = await fetch(n8nWebhookUrl('lead-ingest'), {
              method: 'POST',
              headers: n8nHeaders(),
              body: JSON.stringify(payload),
            });
            if (res.status === 409) duplicates++;
            else if (!res.ok) errors++;
          } catch { errors++; }
        } else {
          // Import only: ingest_lead RPC, status='new'
          const { data: rpcResult, error: le } = await supabase
            .rpc('ingest_lead', {
              p_company_name: company_name || null,
              p_ico: ico || null,
              p_website: website || null,
              p_domain: extractDomain(website) || null,
              p_team_id: rowTeamId || null,
              p_status: 'new',
              p_lead_type: 'company',
              p_language: language,
              p_custom_fields: Object.keys(custom_fields).length > 0 ? custom_fields : {},
              p_import_group_id: groupId,
            });
          if (le) {
            errors++;
          }
        }
      } catch {
        errors++;
      }

      done++;
      setProgress({ done, errors, duplicates, total });
    }

    qc.invalidateQueries({ queryKey: ['leads'] });
    qc.invalidateQueries({ queryKey: ['import-groups'] });
    setStep('done');
    if (enrichmentLevel !== 'import_only') {
      toast.info(t('csvImport.pipelineRunning'));
    }
  }

  // ---- STEP: review (dedup) ----
  const dupCount = dedupResult?.duplicateIndices.size ?? 0;
  const cleanCount = rows.length - dupCount;
  const matchFieldLabels: Record<string, string> = { ico: t('csvImport.matchFields.ico'), domain: t('csvImport.matchFields.domain'), email: t('csvImport.matchFields.email'), company_name: t('csvImport.matchFields.company_name') };

  const stepReview = dedupResult && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ padding: '12px 16px', background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.25)', borderRadius: 8, fontSize: 13, color: '#fb923c' }}>
        {t('csvImport.duplicatesFound')}: <strong>{dupCount}</strong> / {rows.length}
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

  const modalWidth = (step === 'upload' || step === 'done') ? 520 : step === 'review' ? 700 : 600;

  // ---- STEP: upload ----
  const stepUpload = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      {!fileName ? (
        <div
          style={{
            border: '2px dashed var(--border)',
            borderRadius: 10,
            padding: '40px 20px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
            cursor: 'pointer',
            color: 'var(--text-dim)',
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          <span style={{ fontSize: 32 }}>📁</span>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{t('csvImport.clickToSelect')}</span>
          <span style={{ fontSize: 12 }}>{t('csvImport.orDrag')}</span>
        </div>
      ) : (
        <div style={{ background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 8, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--green)' }}>✓</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{fileName}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            {rows.length} {t('csvImport.rows')}, {headers.length} {t('csvImport.columns')}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            {t('csvImport.detectedColumns')}: {headers.join(', ')}
          </div>
          <button
            onClick={() => { fileInputRef.current?.click(); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 12, textAlign: 'left', padding: 0, marginTop: 4 }}
          >
            {t('csvImport.changeFile')}
          </button>
        </div>
      )}
    </div>
  );

  // ---- STEP: map ----
  const previewRows = rows.slice(0, 3);
  const stepMap = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Mapping selects */}
      {[
        { label: t('csvImport.companyName'),  field: 'company_name' as const },
        { label: t('csvImport.ico'),         field: 'ico' as const },
        { label: t('csvImport.web'),         field: 'website' as const },
        { label: t('csvImport.contactName'), field: 'contact_name' as const },
        { label: t('csvImport.email'),       field: 'email' as const },
      ].map(({ label, field }) => (
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
              name="csv-enrichment"
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

      {/* Note about email column */}
      <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '8px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 6 }}>
        {enrichmentLevel === 'import_only'
          ? t('csvImport.importOnlyNote', { returnObjects: false }).toString().replace(/<\/?[0-9]+>/g, '')
          : enrichmentLevel === 'find_emails'
          ? t('csvImport.findEmailsNote', { returnObjects: false }).toString().replace(/<\/?[0-9]+>/g, '')
          : t('csvImport.fullPipelineNote', { returnObjects: false }).toString().replace(/<\/?[0-9]+>/g, '')
        }
      </div>

      {/* Custom fields info */}
      {(() => {
        const mappedCols = new Set(Object.values(mapping).filter(Boolean));
        const extraCols = headers.filter(h => !mappedCols.has(h));
        if (extraCols.length === 0) return null;
        return (
          <div style={{ fontSize: 12, color: 'var(--cyan)', padding: '8px 12px', background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.2)', borderRadius: 6 }}>
            {t('csvImport.extraColumnsNote', { columns: '' }).replace(/<\/?[0-9]+>/g, '')} <strong>{extraCols.join(', ')}</strong>
          </div>
        );
      })()}

      {/* Validation error */}
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
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const stepImporting = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>
        {t('csvImport.importingLeads', { count: progress.total })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <GlassProgress value={pct} height={8} />
        <div style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
          {progress.done} / {progress.total}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 13, color: 'var(--green)' }}>
          ✓ {Math.max(0, progress.done - progress.errors - progress.duplicates)} {t('csvImport.imported')}
        </div>
        <div style={{ fontSize: 13, color: '#fb923c' }}>
          ⚠ {progress.duplicates} {t('csvImport.duplicate')}
        </div>
        <div style={{ fontSize: 13, color: '#f87171' }}>
          ✗ {progress.errors} {t('csvImport.errors')}
        </div>
      </div>
    </div>
  );

  // ---- STEP: done ----
  const imported = Math.max(0, progress.done - progress.errors - progress.duplicates);
  const stepDone = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{t('csvImport.done')}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13, color: 'var(--green)' }}>✓ {t('csvImport.leadsImported', { count: imported })}</div>
        <div style={{ fontSize: 13, color: '#fb923c' }}>⚠ {t('csvImport.duplicatesSkipped', { count: progress.duplicates })}</div>
        <div style={{ fontSize: 13, color: '#f87171' }}>✗ {t('csvImport.errorsCount', { count: progress.errors })}</div>
      </div>
      {enrichmentLevel !== 'import_only' && (
        <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '8px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 6 }}>
          {t('csvImport.pipelineRunning')}
        </div>
      )}
    </div>
  );

  const canProceedToMap = !!fileName;

  const footer = (
    <>
      {step === 'upload' && (
        <>
          <GlassButton variant="secondary" onClick={handleClose}>{t('common.cancel')}</GlassButton>
          <GlassButton variant="primary" disabled={!canProceedToMap} onClick={() => setStep('map')}>
            {t('csvImport.map')}
          </GlassButton>
        </>
      )}
      {step === 'map' && (
        <>
          <GlassButton variant="secondary" onClick={() => setStep('upload')}>{t('common.back')}</GlassButton>
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
    upload:    t('csvImport.title'),
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
      {step === 'upload'    && stepUpload}
      {step === 'map'       && stepMap}
      {step === 'review'    && stepReview}
      {step === 'importing' && stepImporting}
      {step === 'done'      && stepDone}
    </GlassModal>
  );
}
