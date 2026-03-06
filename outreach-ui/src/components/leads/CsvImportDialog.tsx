import { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import GlassModal from '@/components/glass/GlassModal';
import GlassButton from '@/components/glass/GlassButton';
import GlassProgress from '@/components/glass/GlassProgress';
import { useTeams } from '@/hooks/useLeads';
import { supabase } from '@/lib/supabase';
import { parseCsv, autoDetect } from '@/lib/csv-utils';

interface CsvImportDialogProps {
  open: boolean;
  onClose: () => void;
}

type Step = 'upload' | 'map' | 'importing' | 'done';

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
  const [teamId, setTeamId] = useState('');
  const [progress, setProgress] = useState<Progress>({ done: 0, errors: 0, duplicates: 0, total: 0 });
  const [mapError, setMapError] = useState('');

  function resetState() {
    setStep('upload');
    setFileName('');
    setHeaders([]);
    setRows([]);
    setMapping({ company_name: '', ico: '', website: '', contact_name: '', email: '' });
    setTeamId('');
    setProgress({ done: 0, errors: 0, duplicates: 0, total: 0 });
    setMapError('');
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
      setTeamId(teams?.[0]?.id ?? '');
    };
    reader.readAsText(file, 'UTF-8');
  }

  function handleMapNext() {
    if (!mapping.company_name && !mapping.ico && !mapping.contact_name) {
      setMapError('Musíte namapovat alespoň Název firmy, IČO nebo Jméno kontaktu.');
      return;
    }
    setMapError('');
    runImport();
  }

  async function runImport() {
    setStep('importing');
    const total = rows.length;
    let done = 0, errors = 0, duplicates = 0;
    setProgress({ done: 0, errors: 0, duplicates: 0, total });

    const effectiveTeamId = teamId || teams?.[0]?.id || '';

    // Determine unmapped columns for custom_fields
    const mappedCols = new Set(Object.values(mapping).filter(Boolean));
    const extraCols = headers.filter(h => !mappedCols.has(h));

    for (const row of rows) {
      const company_name = mapping.company_name ? (row[headers.indexOf(mapping.company_name)] ?? '').trim() : '';
      const ico          = mapping.ico          ? (row[headers.indexOf(mapping.ico)]          ?? '').trim() : '';
      const website      = mapping.website      ? (row[headers.indexOf(mapping.website)]      ?? '').trim() : '';
      const contact_name = mapping.contact_name ? (row[headers.indexOf(mapping.contact_name)] ?? '').trim() : '';
      const email        = mapping.email        ? (row[headers.indexOf(mapping.email)]        ?? '').trim() : '';

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
              team_id: effectiveTeamId || null,
              status: 'ready',
              lead_type: 'company',
              custom_fields: Object.keys(custom_fields).length > 0 ? custom_fields : {},
            })
            .select()
            .single();

          if (le) {
            if (le.code === '23505') { duplicates++; }
            else { errors++; }
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
        } else {
          // Lead-only insert: status='new'
          const { error: le } = await supabase
            .from('leads')
            .insert({
              company_name: company_name || null,
              ico: ico || null,
              website: website || null,
              team_id: effectiveTeamId || null,
              status: 'new',
              lead_type: 'company',
              custom_fields: Object.keys(custom_fields).length > 0 ? custom_fields : {},
            });
          if (le) {
            if (le.code === '23505') { duplicates++; }
            else { errors++; }
          }
        }
      } catch {
        errors++;
      }

      done++;
      setProgress({ done, errors, duplicates, total });
    }

    qc.invalidateQueries({ queryKey: ['leads'] });
    setStep('done');
  }

  const modalWidth = (step === 'upload' || step === 'done') ? 520 : 600;

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

      {/* Note about email column */}
      <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '8px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 6 }}>
        Řádky s e-mailem → stav <strong style={{ color: 'var(--green)' }}>Připraven</strong>. Řádky bez e-mailu → stav <strong>Nový</strong> (lze doplnit přes Email Finder).
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
          <GlassButton variant="primary" onClick={handleMapNext}>
            Spustit import {rows.length}×
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
      {step === 'importing' && stepImporting}
      {step === 'done'      && stepDone}
    </GlassModal>
  );
}
