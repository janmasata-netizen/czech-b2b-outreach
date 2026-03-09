import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import GlassModal from '@/components/glass/GlassModal';
import GlassButton from '@/components/glass/GlassButton';
import GlassInput from '@/components/glass/GlassInput';
import GlassProgress from '@/components/glass/GlassProgress';
import { useTeams } from '@/hooks/useLeads';
import { supabase } from '@/lib/supabase';
import { parseCsv, autoDetect } from '@/lib/csv-utils';
import { toast } from 'sonner';
import { n8nWebhookUrl, n8nHeaders } from '@/lib/n8n';
import { checkDuplicates, extractDomain, type DedupResult, type DuplicateMatch } from '@/lib/dedup';

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
  const { data: teams } = useTeams();
  const qc = useQueryClient();

  const [step, setStep] = useState<Step>('url');
  const [sheetUrl, setSheetUrl] = useState('');
  const [fetching, setFetching] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState({ company_name: '', ico: '', website: '', contact_name: '', email: '' });
  const [teamId, setTeamId] = useState('');
  const [enrichmentLevel, setEnrichmentLevel] = useState<EnrichmentLevel>('full_pipeline');
  const [progress, setProgress] = useState<Progress>({ done: 0, errors: 0, duplicates: 0, total: 0, icosFound: 0, phase: '' });
  const [mapError, setMapError] = useState('');
  const [dedupResult, setDedupResult] = useState<DedupResult | null>(null);
  const [dedupChecking, setDedupChecking] = useState(false);

  function resetState() {
    setStep('url');
    setSheetUrl('');
    setFetching(false);
    setHeaders([]);
    setRows([]);
    setMapping({ company_name: '', ico: '', website: '', contact_name: '', email: '' });
    setTeamId('');
    setEnrichmentLevel('full_pipeline');
    setProgress({ done: 0, errors: 0, duplicates: 0, total: 0, icosFound: 0, phase: '' });
    setMapError('');
    setDedupResult(null);
    setDedupChecking(false);
  }

  function handleClose() {
    resetState();
    onClose();
  }

  function isValidSheetUrl(url: string) {
    try {
      const parsed = new URL(url);
      return parsed.hostname === 'docs.google.com' && parsed.pathname.startsWith('/spreadsheets/');
    } catch {
      return false;
    }
  }

  async function handleFetchSheet() {
    if (!isValidSheetUrl(sheetUrl)) {
      toast.error('Neplatná URL Google Sheetu');
      return;
    }

    setFetching(true);
    try {
      const res = await fetch(n8nWebhookUrl('gsheet-proxy'), {
        method: 'POST',
        headers: n8nHeaders(),
        body: JSON.stringify({ url: sheetUrl }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (!data.success || !data.csv) {
        toast.error('Sheet musí být veřejný (Anyone with the link)');
        return;
      }

      const parsed = parseCsv(data.csv);
      if (parsed.length < 2) {
        toast.error('Sheet je prázdný nebo obsahuje jen hlavičku');
        return;
      }

      const [headerRow, ...dataRows] = parsed;
      setHeaders(headerRow);
      setRows(dataRows);
      setMapping(autoDetect(headerRow));
      setTeamId(teams?.[0]?.id ?? '');
      setStep('map');
    } catch {
      toast.error('Nepodařilo se načíst sheet — zkontrolujte URL a zkuste znovu');
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
      setMapError('Musíte namapovat alespoň Název firmy, Web nebo Jméno kontaktu.');
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
    let done = 0, errors = 0, duplicates = 0, icosFound = 0;
    setProgress({ done: 0, errors: 0, duplicates: 0, total, icosFound: 0, phase: '' });

    const effectiveTeamId = teamId || teams?.[0]?.id || '';
    const mappedCols = new Set(Object.values(mapping).filter(Boolean));
    const extraCols = headers.filter(h => !mappedCols.has(h));

    // For full pipeline: Phase 1 — scrape ICOs from websites
    const rowIcos: (string | null)[] = new Array(rows.length).fill(null);

    if (enrichmentLevel === 'full_pipeline') {
      const rowsNeedingIco = rows
        .map((row, i) => ({ i, website: getRowValue(row, 'website'), ico: getRowValue(row, 'ico') }))
        .filter(r => r.website && !r.ico && !skipIndices.has(r.i));

      if (rowsNeedingIco.length > 0) {
        setProgress(p => ({ ...p, phase: `Hledám IČO na webech... 0/${rowsNeedingIco.length}` }));

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
              rowIcos[r.i] = data.ico;
              icosFound++;
            }
          } catch { /* ignore scrape failures */ }
          setProgress(p => ({
            ...p,
            icosFound,
            phase: `Hledám IČO na webech... ${idx + 1}/${rowsNeedingIco.length}`,
          }));
          if (idx < rowsNeedingIco.length - 1) await delay(200);
        }
      }
    }

    // Phase 2: Import leads
    setProgress(p => ({ ...p, phase: `Importuji leady... 0/${total}` }));

    for (let i = 0; i < rows.length; i++) {
      // Skip duplicates identified in review step
      if (skipIndices.has(i)) {
        duplicates++;
        done++;
        setProgress(p => ({ ...p, done, duplicates, phase: `Importuji leady... ${done}/${total}` }));
        continue;
      }

      const row = rows[i];
      const company_name = getRowValue(row, 'company_name');
      const ico = getRowValue(row, 'ico') || rowIcos[i] || '';
      const website = getRowValue(row, 'website');
      const contact_name = getRowValue(row, 'contact_name');
      const email = getRowValue(row, 'email');

      const custom_fields: Record<string, string> = {};
      for (const col of extraCols) {
        const val = (row[headers.indexOf(col)] ?? '').trim();
        if (val) custom_fields[col.toLowerCase().replace(/[^a-z0-9_]/g, '_')] = val;
      }

      if (!company_name && !ico && !contact_name && !website) {
        done++;
        setProgress(p => ({ ...p, done, phase: `Importuji leady... ${done}/${total}` }));
        continue;
      }

      try {
        if (enrichmentLevel === 'import_only') {
          // Direct DB insert (same as CSV import)
          if (email) {
            const { data: lead, error: le } = await supabase
              .from('leads')
              .insert({
                company_name: company_name || null,
                ico: ico || null,
                website: website || null,
                domain: extractDomain(website) || null,
                team_id: effectiveTeamId || null,
                status: 'ready',
                lead_type: 'company',
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
                    email_address: email,
                    is_verified: true,
                    qev_status: 'manually_verified',
                    seznam_status: 'likely_valid',
                  });
                if (ee) errors++;
              }
            }
          } else {
            const { error: le } = await supabase
              .from('leads')
              .insert({
                company_name: company_name || null,
                ico: ico || null,
                website: website || null,
                domain: extractDomain(website) || null,
                team_id: effectiveTeamId || null,
                status: 'new',
                lead_type: 'company',
                custom_fields: Object.keys(custom_fields).length > 0 ? custom_fields : {},
              });
            if (le) errors++;
          }
        } else {
          // find_emails or full_pipeline → call lead-ingest webhook
          const payload: Record<string, string | null | Record<string, string>> = {
            company_name: company_name || contact_name || null,
            ico: ico || null,
            website: website || null,
            team_id: effectiveTeamId || null,
          };
          if (contact_name) payload.contact_name = contact_name;
          if (Object.keys(custom_fields).length > 0) payload.custom_fields = custom_fields;

          const res = await fetch(n8nWebhookUrl('lead-ingest'), {
            method: 'POST',
            headers: n8nHeaders(),
            body: JSON.stringify(payload),
          });

          if (res.status === 409) {
            duplicates++;
          } else if (!res.ok) {
            errors++;
          }
        }
      } catch {
        errors++;
      }

      done++;
      setProgress(p => ({
        ...p,
        done,
        errors,
        duplicates,
        phase: `Importuji leady... ${done}/${total}`,
      }));

      if (i < rows.length - 1) await delay(200);
    }

    setProgress({ done, errors, duplicates, total, icosFound, phase: '' });
    qc.invalidateQueries({ queryKey: ['leads'] });
    setStep('done');
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

  const modalWidth = (step === 'url' || step === 'done') ? 520 : step === 'review' ? 700 : 620;
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const imported = Math.max(0, progress.done - progress.errors - progress.duplicates);
  const previewRows = rows.slice(0, 3);

  // ---- STEP: url ----
  const stepUrl = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <GlassInput
        label="URL Google Sheetu"
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
        { label: 'Název firmy',    field: 'company_name' as const },
        { label: 'IČO',           field: 'ico' as const },
        { label: 'Web',           field: 'website' as const },
        { label: 'Jméno kontaktu', field: 'contact_name' as const },
        { label: 'E-mail',        field: 'email' as const },
      ]).map(({ label, field }) => (
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

      {/* Team selector */}
      {teams && teams.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: 'var(--text-dim)', minWidth: 110 }}>Tým</span>
          <select
            className="glass-input"
            style={{ flex: 1, height: 34, fontSize: 13 }}
            value={teamId}
            onChange={e => setTeamId(e.target.value)}
          >
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      )}

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
  const stepImporting = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>
        {progress.phase || `Importuji ${progress.total} leadů…`}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <GlassProgress value={pct} height={8} />
        <div style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
          {progress.done} / {progress.total}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 13, color: 'var(--green)' }}>
          ✓ {imported} importováno
        </div>
        <div style={{ fontSize: 13, color: '#fb923c' }}>
          ⚠ {progress.duplicates} duplicitní
        </div>
        <div style={{ fontSize: 13, color: '#f87171' }}>
          ✗ {progress.errors} chyb
        </div>
        {enrichmentLevel === 'full_pipeline' && progress.icosFound > 0 && (
          <div style={{ fontSize: 13, color: 'var(--cyan)' }}>
            🔍 {progress.icosFound} IČO nalezeno na webech
          </div>
        )}
      </div>
    </div>
  );

  // ---- STEP: done ----
  const stepDone = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Import dokončen</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13, color: 'var(--green)' }}>✓ {imported} leadů importováno</div>
        <div style={{ fontSize: 13, color: '#fb923c' }}>⚠ {progress.duplicates} duplicitních (přeskočeno)</div>
        <div style={{ fontSize: 13, color: '#f87171' }}>✗ {progress.errors} chyb</div>
        {enrichmentLevel === 'full_pipeline' && (
          <div style={{ fontSize: 13, color: 'var(--cyan)' }}>🔍 {progress.icosFound} IČO nalezeno na webech</div>
        )}
      </div>
      {enrichmentLevel !== 'import_only' && (
        <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '8px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 6 }}>
          Pipeline běží na pozadí — e-maily budou generovány a ověřovány automaticky.
        </div>
      )}
    </div>
  );

  const footer = (
    <>
      {step === 'url' && (
        <>
          <GlassButton variant="secondary" onClick={handleClose}>Zrušit</GlassButton>
          <GlassButton
            variant="primary"
            disabled={!sheetUrl || fetching || !isValidSheetUrl(sheetUrl)}
            onClick={handleFetchSheet}
          >
            {fetching ? 'Načítám…' : 'Načíst'}
          </GlassButton>
        </>
      )}
      {step === 'map' && (
        <>
          <GlassButton variant="secondary" onClick={() => setStep('url')}>← Zpět</GlassButton>
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
    url:       'Import z Google Sheetu',
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
