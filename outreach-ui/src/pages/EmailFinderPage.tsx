import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '@/components/layout/PageHeader';
import GlassCard from '@/components/glass/GlassCard';
import GlassButton from '@/components/glass/GlassButton';
import GlassInput from '@/components/glass/GlassInput';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { n8nWebhookUrl, n8nHeaders } from '@/lib/n8n';
import { exportCsv } from '@/lib/export';
import useMobile from '@/hooks/useMobile';

type Mode = 'ico' | 'name' | 'verify' | 'probe';

interface Candidate {
  email: string;
  status: string;
  confidence: string;
  smtp_result: string | null;
  method?: string;
}

interface FinderResult {
  candidates: Candidate[];
  domain: string;
  total: number;
  method?: string;
  error?: string;
  probe_start?: string;
}

interface HistoryEntry {
  result: FinderResult;
  title: string;
  timestamp: number;
}

const MODE_DESC: Record<Mode, string> = {
  ico: 'Vyhledá jednatele v ARES podle IČO, odhadne e-mail z domény a ověří přes SMTP.',
  name: 'Vygeneruje možné e-mailové adresy ze jména a domény, ověří přes SMTP.',
  verify: 'Ověří, zda konkrétní e-mailová adresa existuje (SMTP + MX check).',
  probe: 'Odešle sondovací e-mail a čeká na odraz (~3 min). Spolehlivější pro catch-all domény.',
};

function StatusBadge({ status }: { status: string }) {
  const isGood    = status === 'valid' || status === 'likely_valid';
  const isUnknown = status === 'unknown';
  const color  = isGood ? 'var(--green)' : isUnknown ? '#fbbf24' : '#f87171';
  const bg     = isGood ? 'rgba(74,222,128,0.1)' : isUnknown ? 'rgba(251,191,36,0.1)' : 'rgba(248,113,113,0.1)';
  const border = isGood ? 'rgba(74,222,128,0.3)'  : isUnknown ? 'rgba(251,191,36,0.3)'  : 'rgba(248,113,113,0.3)';
  const symbol = isGood ? '✓' : isUnknown ? '?' : '✗';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
      color, background: bg, border: `1px solid ${border}`,
    }}>
      {symbol} {status.replace(/_/g, ' ')}
    </span>
  );
}

function MethodBadge({ method }: { method: string }) {
  const isProbe = method === 'probe';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 7px', borderRadius: 20, fontSize: 10, fontWeight: 600,
      color: isProbe ? '#c084fc' : '#60a5fa',
      background: isProbe ? 'rgba(192,132,252,0.1)' : 'rgba(96,165,250,0.1)',
      border: `1px solid ${isProbe ? 'rgba(192,132,252,0.3)' : 'rgba(96,165,250,0.3)'}`,
      whiteSpace: 'nowrap',
    }}>
      {isProbe ? 'E-mail sonda' : 'SMTP'}
    </span>
  );
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso;
  }
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function EmailFinderPage() {
  const isMobile = useMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const mode: Mode = (rawTab === 'name' || rawTab === 'verify' || rawTab === 'probe') ? rawTab : 'ico';
  const [loading, setLoading] = useState(false);
  const [probeActive, setProbeActive] = useState(false);
  const [recheckLoading, setRecheckLoading] = useState(false);
  const [results, setResults] = useState<FinderResult | null>(null);
  const [modalTitle, setModalTitle] = useState('');

  // Elapsed time counter
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // Results history (session-level)
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // Field errors for inline validation
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // ICO mode
  const [ico, setIco]               = useState('');
  const [websiteIco, setWebsiteIco] = useState('');

  // Name mode
  const [fullName, setFullName]       = useState('');
  const [websiteName, setWebsiteName] = useState('');

  // Verify mode
  const [verifyEmail, setVerifyEmail] = useState('');

  // Ref to track the latest results for history title
  const lastTitleRef = useRef('');

  // Elapsed time effect
  useEffect(() => {
    if (!startTime) { setElapsed(0); return; }
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(id);
  }, [startTime]);

  function switchMode(m: Mode) {
    if (m === 'ico') {
      setSearchParams({});
    } else {
      setSearchParams({ tab: m });
    }
    setResults(null);
    setFieldErrors({});
  }

  function validateField(field: string, value: string) {
    const errs = { ...fieldErrors };
    switch (field) {
      case 'ico':
        if (value && !/^\d{0,8}$/.test(value)) errs.ico = 'IČO může obsahovat pouze číslice';
        else if (value && value.length > 0 && value.length < 8) errs.ico = 'IČO musí mít přesně 8 číslic';
        else delete errs.ico;
        break;
      case 'verifyEmail':
        if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) errs.verifyEmail = 'Neplatná e-mailová adresa';
        else delete errs.verifyEmail;
        break;
      case 'fullName':
        if (value && value.trim().split(/\s+/).length < 2) errs.fullName = 'Zadejte jméno a příjmení';
        else delete errs.fullName;
        break;
      case 'websiteIco':
      case 'websiteName':
        if (value && !/[a-z0-9]/.test(value.toLowerCase())) errs[field] = 'Neplatná doména';
        else delete errs[field];
        break;
      default:
        break;
    }
    setFieldErrors(errs);
  }

  function addToHistory(result: FinderResult, title: string) {
    setHistory(prev => {
      const entry: HistoryEntry = { result, title, timestamp: Date.now() };
      const next = [entry, ...prev];
      return next.slice(0, 10);
    });
  }

  function copyAllEmails() {
    if (!results) return;
    const emails = results.candidates.map(c => c.email).join('\n');
    navigator.clipboard.writeText(emails);
    toast.success('Všechny e-maily zkopírovány');
  }

  function handleExportCsv() {
    if (!results) return;
    const headers = ['email', 'status', 'confidence', 'smtp_result', 'method'];
    const rows = results.candidates.map(c => ({
      email: c.email,
      status: c.status,
      confidence: c.confidence,
      smtp_result: c.smtp_result || '',
      method: c.method || results.method || '',
    }));
    exportCsv(`email-finder-${results.domain || 'results'}.csv`, headers, rows);
  }

  async function handleRecheck() {
    if (!results) return;
    const recheckPayload = {
      mode: 'recheck',
      candidates: results.candidates.map(c => c.email),
      domain: results.domain,
    };
    setRecheckLoading(true);
    try {
      const res = await fetch(n8nWebhookUrl('wf-email-finder-v2'), {
        method: 'POST',
        headers: n8nHeaders(),
        body: JSON.stringify(recheckPayload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: FinderResult = await res.json();
      // preserve original probe_start so timestamp stays accurate
      const updated = { ...data, probe_start: results.probe_start };
      setResults(updated);
      const newInvalid = data.candidates.filter(c => c.status === 'invalid').length;
      const prevInvalid = results.candidates.filter(c => c.status === 'invalid').length;
      if (newInvalid > prevInvalid) {
        toast.success(`Recheck: +${newInvalid - prevInvalid} nových odrazených e-mailů`);
      } else {
        toast.success('Recheck dokončen — žádné nové odražené e-maily');
      }
    } catch {
      toast.error('Chyba při opakované kontrole');
    } finally {
      setRecheckLoading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const controller = new AbortController();
    const fetchTimeout = setTimeout(() => controller.abort(), mode === 'probe' ? 380_000 : 240_000);
    let probeTimer: ReturnType<typeof setTimeout> | null = null;

    if (mode === 'ico') {
      // ICO tab — use original v1 endpoint
      const website = websiteIco.trim();
      if (!website) { toast.error('Zadejte webovou adresu firmy'); return; }
      if (!ico.trim()) { toast.error('Zadejte IČO — potřebujeme ho pro vyhledání jednatele v ARES'); return; }
      if (!/^\d{8}$/.test(ico.trim())) { toast.error('IČO musí mít přesně 8 číslic'); return; }

      setLoading(true);
      setResults(null);
      setStartTime(Date.now());
      try {
        const payload: Record<string, string> = { mode, website };
        if (ico) payload.ico = ico;
        const title = `IČO ${ico} — ${website}`;
        setModalTitle(title);
        lastTitleRef.current = title;
        const res = await fetch(n8nWebhookUrl('wf-email-finder'), {
          method: 'POST',
          headers: n8nHeaders(),
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: FinderResult = await res.json();
        setResults(data);
        addToHistory(data, lastTitleRef.current);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          toast.error('Vypršel časový limit požadavku');
        } else {
          toast.error('Chyba při hledání e-mailů');
        }
      } finally {
        clearTimeout(fetchTimeout);
        setLoading(false);
        setStartTime(null);
      }
      return;
    }

    // Name & Verify modes — use v2 endpoint
    const payload: Record<string, string> = { mode };

    if (mode === 'verify') {
      if (!verifyEmail.trim()) { toast.error('Zadejte e-mailovou adresu'); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(verifyEmail.trim())) {
        toast.error('Neplatná e-mailová adresa');
        return;
      }
      payload.email = verifyEmail.trim();
      const title = `Ověření — ${verifyEmail.trim()}`;
      setModalTitle(title);
      lastTitleRef.current = title;
    } else {
      // name or probe mode — same input parsing
      if (!websiteName.trim()) { toast.error('Zadejte doménu nebo URL firmy'); return; }
      if (!fullName.trim()) { toast.error('Zadejte celé jméno osoby'); return; }
      const nameParts = fullName.trim().split(/\s+/);
      const firstName = nameParts.length >= 2 ? nameParts[0] : '';
      const lastName  = nameParts[nameParts.length - 1];
      payload.domain = websiteName.trim();
      if (firstName) payload.first_name = firstName;
      payload.last_name = lastName;
      const title = `${fullName.trim()} — ${websiteName.trim()}`;
      setModalTitle(title);
      lastTitleRef.current = title;
    }

    setLoading(true);
    setProbeActive(false);
    setResults(null);
    setStartTime(Date.now());

    probeTimer = setTimeout(() => setProbeActive(true), mode === 'probe' ? 5_000 : 20_000);

    try {
      const res = await fetch(n8nWebhookUrl('wf-email-finder-v2'), {
        method: 'POST',
        headers: n8nHeaders(),
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: FinderResult = await res.json();

      // A7: Handle probe timeout error
      if (data.error === 'probe_timeout') {
        toast.error('Sonda vypršela — zkuste znovu nebo použijte Recheck');
      }

      setResults(data);
      addToHistory(data, lastTitleRef.current);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        toast.error('Vypršel časový limit požadavku');
      } else {
        toast.error(mode === 'verify' ? 'Chyba při ověřování e-mailu' : 'Chyba při hledání e-mailů');
      }
    } finally {
      clearTimeout(fetchTimeout);
      if (probeTimer) clearTimeout(probeTimer);
      setProbeActive(false);
      setLoading(false);
      setStartTime(null);
    }
  }

  const loadingText = probeActive && mode !== 'probe'
    ? 'Catch-all doména — ověřuji sondovacím e-mailem…'
    : mode === 'probe' ? 'Odesílám sondovací e-maily…'
    : mode === 'verify' ? 'Ověřuji…' : 'Hledám e-maily…';

  const derivedTitle = results
    ? (modalTitle || `Nalezené e-maily${results.domain ? ` — ${results.domain}` : ''}`)
    : '';

  const isProbeResult = results?.method === 'probe';

  return (
    <div style={{ padding: isMobile ? '16px 0' : '24px 32px' }} className="email-finder-page">
      <PageHeader title="Email Finder" />
      <p style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: -8, marginBottom: 24 }}>
        Najděte e-mailové adresy pro firmu nebo ověřte konkrétní adresu
      </p>

      {/* Mode description */}
      <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: '0 0 16px 2px', lineHeight: 1.4 }}>
        {MODE_DESC[mode]}
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {mode === 'ico' && (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
            <div>
              <GlassInput label="IČO *" placeholder="12345678" value={ico}
                onChange={e => setIco(e.target.value)}
                onBlur={() => validateField('ico', ico)}
                error={fieldErrors.ico}
                style={{ fontFamily: 'JetBrains Mono, monospace' }} />
              <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: '4px 0 0 2px' }}>
                Povinné — IČO slouží k vyhledání jednatele v ARES
              </p>
            </div>
            <GlassInput label="Web" placeholder="firma.cz" value={websiteIco}
              onChange={e => setWebsiteIco(e.target.value)}
              onBlur={() => validateField('websiteIco', websiteIco)}
              error={fieldErrors.websiteIco} />
          </div>
        )}

        {mode === 'name' && (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
            <GlassInput label="Celé jméno" placeholder="Jan Novák" value={fullName}
              onChange={e => setFullName(e.target.value)}
              onBlur={() => validateField('fullName', fullName)}
              error={fieldErrors.fullName} />
            <GlassInput label="Doména nebo URL" placeholder="firma.cz nebo https://firma.cz" value={websiteName}
              onChange={e => setWebsiteName(e.target.value)}
              onBlur={() => validateField('websiteName', websiteName)}
              error={fieldErrors.websiteName} />
          </div>
        )}

        {mode === 'verify' && (
          <GlassInput
            label="E-mailová adresa"
            placeholder="jan.novak@firma.cz"
            value={verifyEmail}
            onChange={e => setVerifyEmail(e.target.value)}
            onBlur={() => validateField('verifyEmail', verifyEmail)}
            error={fieldErrors.verifyEmail}
            type="email"
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          />
        )}

        {mode === 'probe' && (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
            <GlassInput label="Celé jméno" placeholder="Jan Novák" value={fullName}
              onChange={e => setFullName(e.target.value)}
              onBlur={() => validateField('fullName', fullName)}
              error={fieldErrors.fullName} />
            <GlassInput label="Doména nebo URL" placeholder="firma.cz nebo https://firma.cz" value={websiteName}
              onChange={e => setWebsiteName(e.target.value)}
              onBlur={() => validateField('websiteName', websiteName)}
              error={fieldErrors.websiteName} />
          </div>
        )}

        <GlassButton variant="primary" type="submit" disabled={loading} style={{ marginTop: 4 }}>
          {loading
            ? loadingText
            : (mode === 'probe' ? 'Sondovat →' : mode === 'verify' ? 'Ověřit →' : 'Hledat →')}
        </GlassButton>
      </form>

      {/* Loading with elapsed timer */}
      {loading && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          marginTop: 24, padding: '20px 0',
          color: (probeActive || mode === 'probe') ? '#c084fc' : 'var(--text-dim)', fontSize: 13,
        }}>
          <div style={{
            width: 20, height: 20, border: '2px solid var(--border)',
            borderTopColor: (probeActive || mode === 'probe') ? '#c084fc' : 'var(--green)', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
          <span>{loadingText}</span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, opacity: 0.5 }}>
            {formatElapsed(elapsed)}
          </span>
        </div>
      )}

      {/* Inline results */}
      {results && (
        <GlassCard style={{ marginTop: 24, padding: isMobile ? 16 : 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Header row: title + action buttons */}
            <div style={{
              display: 'flex', flexDirection: isMobile ? 'column' : 'row',
              alignItems: isMobile ? 'flex-start' : 'center', gap: 8,
            }}>
              <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                {derivedTitle}
              </div>
              <div style={{
                display: 'flex', flexDirection: isMobile ? 'column' : 'row',
                gap: 6, alignItems: isMobile ? 'stretch' : 'center',
              }}>
                {isProbeResult && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <GlassButton
                            variant="secondary"
                            onClick={handleRecheck}
                            disabled={recheckLoading}
                            style={{ fontSize: 12, width: isMobile ? '100%' : undefined }}
                          >
                            {recheckLoading ? 'Rechecking…' : 'Recheck odrazů'}
                          </GlassButton>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Zkontroluje nové odražené e-maily od odeslání sondy</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {results.total > 0 && (
                  <>
                    <GlassButton variant="secondary" onClick={copyAllEmails} style={{ fontSize: 12 }}>
                      Kopírovat vše
                    </GlassButton>
                    <GlassButton variant="secondary" onClick={handleExportCsv} style={{ fontSize: 12 }}>
                      Export CSV
                    </GlassButton>
                  </>
                )}
                <GlassButton variant="secondary" onClick={() => setResults(null)} style={{ fontSize: 12 }}>
                  Zavřít
                </GlassButton>
              </div>
            </div>

            {results.total === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: '12px 0' }}>
                {results.error === 'no_mx'
                  ? 'Doména nemá MX záznamy — e-maily na této doméně nelze doručit.'
                  : results.error === 'probe_timeout'
                    ? 'Sonda vypršela — zkuste znovu nebo použijte Recheck pro kontrolu odrazů.'
                  : mode === 'probe' ? 'Přímá sonda nezjistila žádné e-maily.'
                  : mode === 'verify'
                    ? 'E-mailová adresa nebyla ověřena.'
                    : 'Nebyla nalezena žádná e-mailová adresa pro tuto doménu.'}
              </div>
            ) : (
              <>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span>{results.total === 1 ? '1 výsledek' : `${results.total} výsledků`}</span>
                  {results.method && <MethodBadge method={results.method} />}
                  {isProbeResult && results.probe_start && (
                    <span style={{ color: 'rgba(192,132,252,0.7)', fontSize: 11 }}>
                      Sonda odeslána v {formatTime(results.probe_start)} — recheck doporučen po 5+ min
                    </span>
                  )}
                </div>
                <div style={{ overflowX: 'auto', borderRadius: 6, border: '1px solid var(--border)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                        <th style={TH}>E-mail</th>
                        <th style={TH}>Status</th>
                        {!isMobile && <th style={TH}>Spolehlivost</th>}
                        {!isProbeResult && !isMobile && <th style={TH}>SMTP</th>}
                        <th style={TH}>Metoda</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.candidates.map((c, i) => (
                        <tr key={i} style={{ borderBottom: i < results.candidates.length - 1 ? '1px solid var(--border)' : 'none' }}>
                          <td style={{ padding: '9px 12px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--text)', wordBreak: isMobile ? 'break-all' : undefined }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              {c.email}
                              <button
                                onClick={() => { navigator.clipboard.writeText(c.email); toast.success('Zkopírováno'); }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.4, padding: 0, fontSize: 13, lineHeight: 1 }}
                                title="Kopírovat"
                                type="button"
                              >
                                📋
                              </button>
                            </span>
                          </td>
                          <td style={{ padding: '9px 12px' }}>
                            <StatusBadge status={c.status} />
                          </td>
                          {!isMobile && (
                            <td style={{ padding: '9px 12px', fontSize: 12, color: 'var(--text-dim)', textTransform: 'capitalize' }}>
                              {c.confidence}
                            </td>
                          )}
                          {!isProbeResult && !isMobile && (
                            <td style={{ padding: '9px 12px', fontSize: 11, color: 'var(--text-dim)', fontFamily: 'JetBrains Mono, monospace' }}>
                              {c.smtp_result || '—'}
                            </td>
                          )}
                          <td style={{ padding: '9px 12px' }}>
                            {(c.method || results.method) && (
                              <MethodBadge method={c.method || results.method!} />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </GlassCard>
      )}

      {/* Results history */}
      {history.length > 0 && (
        <GlassCard style={{ padding: isMobile ? 12 : 16, marginTop: 16 }}>
          <div style={{ fontSize: isMobile ? 11 : 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 8 }}>
            Historie hledání
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {history.map((entry, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setResults(entry.result);
                  setModalTitle(entry.title);
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 10px', borderRadius: 6,
                  background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
                  cursor: 'pointer', fontSize: 12, color: 'var(--text)', textAlign: 'left',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
              >
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entry.title || entry.result.domain}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                  {entry.result.total} výsl.
                </span>
                {entry.result.method && <MethodBadge method={entry.result.method} />}
                <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'JetBrains Mono, monospace' }}>
                  {formatTime(new Date(entry.timestamp).toISOString())}
                </span>
              </button>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  );
}

const TH: React.CSSProperties = {
  padding: '9px 12px', textAlign: 'left',
  color: 'var(--text-dim)', fontWeight: 500,
  borderBottom: '1px solid var(--border)',
};
