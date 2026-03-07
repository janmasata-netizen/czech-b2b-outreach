import { useState, type FormEvent } from 'react';
import PageHeader from '@/components/layout/PageHeader';
import GlassCard from '@/components/glass/GlassCard';
import GlassButton from '@/components/glass/GlassButton';
import GlassInput from '@/components/glass/GlassInput';
import GlassModal from '@/components/glass/GlassModal';
import { toast } from 'sonner';
import { n8nWebhookUrl, n8nHeaders } from '@/lib/n8n';

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

export default function EmailFinderPage() {
  const [mode, setMode] = useState<Mode>('ico');
  const [loading, setLoading] = useState(false);
  const [probeActive, setProbeActive] = useState(false);
  const [recheckLoading, setRecheckLoading] = useState(false);
  const [results, setResults] = useState<FinderResult | null>(null);
  const [modalTitle, setModalTitle] = useState('');

  // ICO mode
  const [ico, setIco]               = useState('');
  const [websiteIco, setWebsiteIco] = useState('');

  // Name mode
  const [fullName, setFullName]       = useState('');
  const [websiteName, setWebsiteName] = useState('');

  // Verify mode
  const [verifyEmail, setVerifyEmail] = useState('');

  function switchMode(m: Mode) {
    setMode(m);
    setResults(null);
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
      setResults({ ...data, probe_start: results.probe_start });
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
    const fetchTimeout = setTimeout(() => controller.abort(), mode === 'probe' ? 320_000 : 240_000);
    let probeTimer: ReturnType<typeof setTimeout> | null = null;

    if (mode === 'ico') {
      // ICO tab — use original v1 endpoint
      const website = websiteIco.trim();
      if (!website) { toast.error('Zadejte webovou adresu firmy'); return; }
      if (!ico.trim()) { toast.error('Zadejte IČO — potřebujeme ho pro vyhledání jednatele v ARES'); return; }
      if (!/^\d{8}$/.test(ico.trim())) { toast.error('IČO musí mít přesně 8 číslic'); return; }

      setLoading(true);
      setResults(null);
      try {
        const payload: Record<string, string> = { mode, website };
        if (ico) payload.ico = ico;
        setModalTitle('');
        const res = await fetch(n8nWebhookUrl('wf-email-finder'), {
          method: 'POST',
          headers: n8nHeaders(),
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: FinderResult = await res.json();
        setResults(data);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          toast.error('Vypršel časový limit požadavku');
        } else {
          toast.error('Chyba při hledání e-mailů');
        }
      } finally {
        clearTimeout(fetchTimeout);
        setLoading(false);
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
      setModalTitle(`Ověření — ${verifyEmail.trim()}`);
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
      setModalTitle('');
    }

    setLoading(true);
    setProbeActive(false);
    setResults(null);

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
      setResults(data);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        toast.error('Vypršel časový limit požadavku (4 min)');
      } else {
        toast.error(mode === 'verify' ? 'Chyba při ověřování e-mailu' : 'Chyba při hledání e-mailů');
      }
    } finally {
      clearTimeout(fetchTimeout);
      if (probeTimer) clearTimeout(probeTimer);
      setProbeActive(false);
      setLoading(false);
    }
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '8px 0',
    fontSize: 13,
    fontWeight: 600,
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    transition: 'background 0.15s, color 0.15s',
    background: active ? 'rgba(62,207,142,0.15)' : 'transparent',
    color: active ? 'var(--green)' : 'var(--text-dim)',
  });

  const loadingText = probeActive && mode !== 'probe'
    ? 'Catch-all doména — ověřuji sondovacím e-mailem…'
    : mode === 'probe' ? 'Odesílám sondovací e-maily…'
    : mode === 'verify' ? 'Ověřuji…' : 'Hledám e-maily…';

  const derivedTitle = results
    ? (modalTitle || `Nalezené e-maily${results.domain ? ` — ${results.domain}` : ''}`)
    : '';

  const isProbeResult = results?.method === 'probe';

  return (
    <div style={{ padding: '24px 32px', maxWidth: 640 }} className="email-finder-page">
      <PageHeader title="Email Finder" />
      <p style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: -8, marginBottom: 24 }}>
        Najděte e-mailové adresy pro firmu nebo ověřte konkrétní adresu
      </p>

      <GlassCard style={{ padding: 24 }}>
        {/* Mode tabs */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4, padding: 4, marginBottom: 20,
          background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 8,
        }}>
          <button type="button" style={tabStyle(mode === 'ico')}    onClick={() => switchMode('ico')}>Podle IČO</button>
          <button type="button" style={tabStyle(mode === 'name')}   onClick={() => switchMode('name')}>Podle jména</button>
          <button type="button" style={tabStyle(mode === 'verify')} onClick={() => switchMode('verify')}>Ověřit e-mail</button>
          <button type="button" style={{...tabStyle(mode === 'probe'), color: mode === 'probe' ? '#c084fc' : 'var(--text-dim)', background: mode === 'probe' ? 'rgba(192,132,252,0.15)' : 'transparent'}} onClick={() => switchMode('probe')}>Přímá sonda</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {mode === 'ico' && (
            <>
              <div>
                <GlassInput label="IČO *" placeholder="12345678" value={ico}
                  onChange={e => setIco(e.target.value)} style={{ fontFamily: 'JetBrains Mono, monospace' }} />
                <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: '4px 0 0 2px' }}>
                  Povinné — IČO slouží k vyhledání jednatele v ARES (obchodní rejstřík)
                </p>
              </div>
              <GlassInput label="Web" placeholder="firma.cz" value={websiteIco}
                onChange={e => setWebsiteIco(e.target.value)} />
            </>
          )}

          {mode === 'name' && (
            <>
              <GlassInput label="Celé jméno" placeholder="Jan Novák" value={fullName}
                onChange={e => setFullName(e.target.value)} />
              <GlassInput label="Doména nebo URL" placeholder="firma.cz nebo https://firma.cz" value={websiteName}
                onChange={e => setWebsiteName(e.target.value)} />
            </>
          )}

          {mode === 'verify' && (
            <GlassInput
              label="E-mailová adresa"
              placeholder="jan.novak@firma.cz"
              value={verifyEmail}
              onChange={e => setVerifyEmail(e.target.value)}
              type="email"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
            />
          )}

          {mode === 'probe' && (
            <>
              <GlassInput label="Celé jméno" placeholder="Jan Novák" value={fullName}
                onChange={e => setFullName(e.target.value)} />
              <GlassInput label="Doména nebo URL" placeholder="firma.cz nebo https://firma.cz" value={websiteName}
                onChange={e => setWebsiteName(e.target.value)} />
              <p style={{ fontSize: 11, color: 'rgba(192,132,252,0.7)', margin: '0' }}>
                Přeskočí SMTP — přímo odešle sondovací e-mail a čeká na odraz (4 min)
              </p>
            </>
          )}

          <GlassButton variant="primary" type="submit" disabled={loading} style={{ marginTop: 4 }}>
            {loading
              ? loadingText
              : (mode === 'probe' ? 'Sondovat →' : mode === 'verify' ? 'Ověřit →' : 'Hledat →')}
          </GlassButton>
        </form>

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 20, color: (probeActive || mode === 'probe') ? '#c084fc' : 'var(--text-dim)', fontSize: 13 }}>
            <div style={{
              width: 16, height: 16, border: '2px solid var(--border)',
              borderTopColor: (probeActive || mode === 'probe') ? '#c084fc' : 'var(--green)', borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              flexShrink: 0,
            }} />
            {loadingText}
          </div>
        )}
      </GlassCard>

      {/* Results modal */}
      <GlassModal
        open={!!results}
        onClose={() => setResults(null)}
        title={derivedTitle}
        width={720}
        footer={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%' }}>
            {isProbeResult && (
              <GlassButton
                variant="secondary"
                onClick={handleRecheck}
                disabled={recheckLoading}
                style={{ fontSize: 12 }}
              >
                {recheckLoading ? 'Rechecking…' : 'Recheck odrazů'}
              </GlassButton>
            )}
            <div style={{ flex: 1 }} />
            <GlassButton variant="secondary" onClick={() => setResults(null)}>Zavřít</GlassButton>
          </div>
        }
      >
        {results && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {results.total === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: '12px 0' }}>
                {results.error === 'no_mx'
                  ? 'Doména nemá MX záznamy — e-maily na této doméně nelze doručit.'
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
                        <th style={TH}>Spolehlivost</th>
                        <th style={TH}>SMTP</th>
                        <th style={TH}>Metoda</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.candidates.map((c, i) => (
                        <tr key={i} style={{ borderBottom: i < results.candidates.length - 1 ? '1px solid var(--border)' : 'none' }}>
                          <td style={{ padding: '9px 12px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--text)' }}>
                            {c.email}
                          </td>
                          <td style={{ padding: '9px 12px' }}>
                            <StatusBadge status={c.status} />
                          </td>
                          <td style={{ padding: '9px 12px', fontSize: 12, color: 'var(--text-dim)', textTransform: 'capitalize' }}>
                            {c.confidence}
                          </td>
                          <td style={{ padding: '9px 12px', fontSize: 11, color: 'var(--text-dim)', fontFamily: 'JetBrains Mono, monospace' }}>
                            {c.smtp_result || '—'}
                          </td>
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
        )}
      </GlassModal>
    </div>
  );
}

const TH: React.CSSProperties = {
  padding: '9px 12px', textAlign: 'left',
  color: 'var(--text-dim)', fontWeight: 500,
  borderBottom: '1px solid var(--border)',
};
