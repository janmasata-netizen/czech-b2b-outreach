import { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import GlassModal from '@/components/glass/GlassModal';
import GlassButton from '@/components/glass/GlassButton';
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
  const [dedupResult, setDedupResult] = useState<DedupResult | null>(null);
  const [dedupChecking, setDedupChecking] = useState(false);

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
    setDedupResult(null);
    setDedupChecking(false);
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
      toast.error('Nepodařilo se přečíst soubor');
    };
    reader.readAsText(file, 'UTF-8');
  }

  function getRowValue(row: string[], field: keyof typeof mapping): string {
    const col = mapping[field];
    return col ? (row[headers.indexOf(col)] ?? '').trim() : '';
  }

  async function handleMapNext() {
    if (!mapping.company_name && !mapping.ico && !mapping.contact_name) {
      setMapError('Musíte namapovat alespoň Název firmy, IČO nebo Jméno kontaktu.');
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
      toast.error('Kontrola duplicit selhala — zkuste to znovu');
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
          // Full insert: lead + jednatel + email_candidate → status='ready'
          const { data: lead, error: le } = await supabase
            .from('leads')
            .insert({
              company_name: company_name || null,
              ico: ico || null,
              website: website || null,
              domain: extractDomain(website) || null,
              team_id: rowTeamId || null,
              status: 'ready',
              lead_type: 'company',
              language,
              custom_fields: Object.keys(custom_fields).length > 0 ? custom_fields : {},
            })
            .select()
            .single();

          if (le) {
            errors++;
          } else {
            const { data: jed, error: je } = await supabase
              .from('jednatels')
              .insert({ lead_id: lead.id, full_name: contact_name || null })
              .select()
              .single();
            if (je) { errors++; }
            else {
              const { error: ee } = await supabase
                .from('email_candidates')
                .insert({
                  jednatel_id: jed.id,
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
          // Import only: direct DB insert, status='new'
          const { error: le } = await supabase
            .from('leads')
            .insert({
              company_name: company_name || null,
              ico: ico || null,
              website: website || null,
              domain: extractDomain(website) || null,
              team_id: rowTeamId || null,
              status: 'new',
              lead_type: 'company',
              language,
              custom_fields: Object.keys(custom_fields).length > 0 ? custom_fields : {},
            });
          if (le) errors++;
        }
      } catch {
        errors++;
      }

      done++;
      setProgress({ done, errors, duplicates, total });
    }

    qc.invalidateQueries({ queryKey: ['leads'] });
    setStep('done');
    if (enrichmentLevel !== 'import_only') {
      toast.info('Pipeline běží na pozadí — e-maily budou generovány a ověřovány automaticky.');
    }
  }

  // ---- STEP: review (dedup) ----
  const dupCount = dedupResult?.duplicateIndices.size ?? 0;
  const cleanCount = rows.length - dupCount;
  const matchFieldLabels: Record<string, string> = { ico: 'IČO', domain: 'Doména', email: 'E-mail', company_name: 'Název firmy' };

  const stepReview = dedupResult && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ padding: '12px 16px', background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.25)', borderRadius: 8, fontSize: 13, color: '#fb923c' }}>
        Nalezeno <strong>{dupCount}</strong> duplicitních leadů z {rows.length}. Tyto řádky budou přeskočeny.
      </div>
      <div style={{ maxHeight: 300, overflowY: 'auto', borderRadius: 6, border: '1px solid var(--border)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)', position: 'sticky', top: 0 }}>
              <th style={{ padding: '7px 10px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>Řádek</th>
              <th style={{ padding: '7px 10px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>Firma</th>
              <th style={{ padding: '7px 10px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>Shoda</th>
              <th style={{ padding: '7px 10px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>Hodnota</th>
              <th style={{ padding: '7px 10px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>Existující firma</th>
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
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>Klikněte pro výběr CSV souboru</span>
          <span style={{ fontSize: 12 }}>nebo přetáhněte soubor sem</span>
        </div>
      ) : (
        <div style={{ background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 8, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--green)' }}>✓</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{fileName}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            {rows.length} řádků, {headers.length} sloupců
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            Detekované sloupce: {headers.join(', ')}
          </div>
          <button
            onClick={() => { fileInputRef.current?.click(); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 12, textAlign: 'left', padding: 0, marginTop: 4 }}
          >
            Změnit soubor
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
        { label: 'Název firmy',    field: 'company_name' as const },
        { label: 'IČO',           field: 'ico' as const },
        { label: 'Web',           field: 'website' as const },
        { label: 'Jméno kontaktu', field: 'contact_name' as const },
        { label: 'E-mail',        field: 'email' as const },
      ].map(({ label, field }) => (
        <div key={field} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: 'var(--text-dim)', minWidth: 110 }}>{label}</span>
          <select
            className="glass-input"
            style={{ flex: 1, height: 34, fontSize: 13 }}
            value={mapping[field]}
            onChange={e => setMapping(m => ({ ...m, [field]: e.target.value }))}
          >
            <option value="">— nenastaveno —</option>
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

      {/* Enrichment level */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-dim)' }}>Úroveň obohacení</span>
        {([
          { value: 'import_only' as const, label: 'Pouze import', desc: 'Uloží leady do DB bez obohacení' },
          { value: 'find_emails' as const, label: 'Najít e-maily', desc: 'Vygeneruje a ověří e-maily z jména + webu' },
          { value: 'full_pipeline' as const, label: 'Kompletní pipeline', desc: 'Hledá IČO na webu → ARES → e-maily → ověření' },
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
          ? <>Řádky s e-mailem → stav <strong style={{ color: 'var(--green)' }}>Připraven</strong>. Řádky bez e-mailu → stav <strong>Nový</strong>.</>
          : enrichmentLevel === 'find_emails'
          ? <>Řádky s e-mailem → <strong style={{ color: 'var(--green)' }}>Připraven</strong>. Řádky bez e-mailu → spustí se automatické vyhledávání e-mailů.</>
          : <>Řádky bez IČO → scrape z webu. Všechny bez e-mailu → plný enrichment pipeline.</>
        }
      </div>

      {/* Custom fields info */}
      {(() => {
        const mappedCols = new Set(Object.values(mapping).filter(Boolean));
        const extraCols = headers.filter(h => !mappedCols.has(h));
        if (extraCols.length === 0) return null;
        return (
          <div style={{ fontSize: 12, color: 'var(--cyan)', padding: '8px 12px', background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.2)', borderRadius: 6 }}>
            Zbývající sloupce budou uloženy jako vlastní pole: <strong>{extraCols.join(', ')}</strong>
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
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8, fontWeight: 500 }}>Náhled (první 3 řádky):</div>
          <div style={{ overflowX: 'auto', borderRadius: 6, border: '1px solid var(--border)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                  {(['company_name', 'ico', 'website', 'contact_name', 'email'] as const).map(f => (
                    <th key={f} style={{ padding: '7px 10px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 500, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                      {f === 'company_name' ? 'Firma' : f === 'ico' ? 'IČO' : f === 'website' ? 'Web' : f === 'contact_name' ? 'Kontakt' : 'E-mail'}
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
        Importuji {progress.total} leadů…
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <GlassProgress value={pct} height={8} />
        <div style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
          {progress.done} / {progress.total}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 13, color: 'var(--green)' }}>
          ✓ {Math.max(0, progress.done - progress.errors - progress.duplicates)} importováno
        </div>
        <div style={{ fontSize: 13, color: '#fb923c' }}>
          ⚠ {progress.duplicates} duplicitní
        </div>
        <div style={{ fontSize: 13, color: '#f87171' }}>
          ✗ {progress.errors} chyb
        </div>
      </div>
    </div>
  );

  // ---- STEP: done ----
  const imported = Math.max(0, progress.done - progress.errors - progress.duplicates);
  const stepDone = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Import dokončen</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13, color: 'var(--green)' }}>✓ {imported} leadů importováno</div>
        <div style={{ fontSize: 13, color: '#fb923c' }}>⚠ {progress.duplicates} duplicitních (přeskočeno)</div>
        <div style={{ fontSize: 13, color: '#f87171' }}>✗ {progress.errors} chyb</div>
      </div>
    </div>
  );

  const canProceedToMap = !!fileName;

  const footer = (
    <>
      {step === 'upload' && (
        <>
          <GlassButton variant="secondary" onClick={handleClose}>Zrušit</GlassButton>
          <GlassButton variant="primary" disabled={!canProceedToMap} onClick={() => setStep('map')}>
            Mapovat →
          </GlassButton>
        </>
      )}
      {step === 'map' && (
        <>
          <GlassButton variant="secondary" onClick={() => setStep('upload')}>← Zpět</GlassButton>
          <GlassButton variant="primary" onClick={handleMapNext} disabled={dedupChecking}>
            {dedupChecking ? 'Kontroluji duplicity…' : `Spustit import ${rows.length}×`}
          </GlassButton>
        </>
      )}
      {step === 'review' && dedupResult && (
        <>
          <GlassButton variant="secondary" onClick={() => { setDedupResult(null); setStep('map'); }}>← Zpět</GlassButton>
          <GlassButton variant="primary" onClick={() => runImport(dedupResult.duplicateIndices)}>
            Přeskočit {dupCount} duplikátů a importovat {cleanCount}
          </GlassButton>
        </>
      )}
      {step === 'done' && (
        <GlassButton variant="primary" onClick={handleClose}>Zavřít</GlassButton>
      )}
    </>
  );

  const titles: Record<Step, string> = {
    upload:    'Importovat leady z CSV',
    map:       'Mapování sloupců',
    review:    'Nalezeny duplicity',
    importing: 'Import probíhá…',
    done:      'Import dokončen',
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
