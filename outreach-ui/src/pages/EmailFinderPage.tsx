import { useState, useEffect, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '@/components/layout/PageHeader';
import GlassCard from '@/components/glass/GlassCard';
import GlassButton from '@/components/glass/GlassButton';
import GlassInput from '@/components/glass/GlassInput';
import { toast } from 'sonner';
import { n8nWebhookUrl, n8nHeaders } from '@/lib/n8n';
import { exportCsv } from '@/lib/export';
import { cleanDomainInput } from '@/lib/dedup';
import useMobile from '@/hooks/useMobile';

type Tab = 'find' | 'verify';

interface Candidate {
  email: string;
  status: string;
  confidence: string;
  method?: string;
}

interface ContactResult {
  contact_id: string;
  full_name: string;
  candidates: Candidate[];
}

interface V3Result {
  company_id: string;
  company_name: string;
  domain: string;
  ico?: string;
  contacts: ContactResult[];
  backup_emails: Array<{ email: string; source: string }>;
  total_found: number;
  steps_completed: string[];
  error?: string;
}

interface VerifyResult {
  candidates: Array<{ email: string; status: string; confidence: string; smtp_result: string | null; method?: string }>;
  domain: string;
  total: number;
  method?: string;
  error?: string;
}

interface HistoryEntry {
  title: string;
  timestamp: number;
  result: V3Result | VerifyResult;
  tab: Tab;
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

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

type DetectedType = 'ico' | 'domain' | 'company_name' | '';

function detectInputType(input: string): { type: DetectedType; label: string } {
  const trimmed = input.trim();
  if (!trimmed) return { type: '', label: '' };
  if (/^\d{8}$/.test(trimmed)) return { type: 'ico', label: 'IČO' };
  if (trimmed.includes('@')) return { type: 'domain', label: 'Doména (z e-mailu)' };
  if (/[a-z0-9]\.[a-z]{2,}/i.test(trimmed) && !trimmed.includes(' ')) return { type: 'domain', label: 'Doména' };
  return { type: 'company_name', label: 'Název firmy' };
}

export default function EmailFinderPage() {
  const isMobile = useMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab: Tab = searchParams.get('tab') === 'verify' ? 'verify' : 'find';

  // Find tab state
  const [findInput, setFindInput] = useState('');
  const [detectedType, setDetectedType] = useState<{ type: DetectedType; label: string }>({ type: '', label: '' });
  const [cleanedDomain, setCleanedDomain] = useState('');
  const [loading, setLoading] = useState(false);
  const [v3Result, setV3Result] = useState<V3Result | null>(null);

  // Verify tab state
  const [verifyEmail, setVerifyEmail] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);

  // Shared state
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem('email-finder-history') || '[]'); }
    catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem('email-finder-history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    if (!startTime) { setElapsed(0); return; }
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(id);
  }, [startTime]);

  // Auto-detect input type and clean domain preview
  useEffect(() => {
    const detected = detectInputType(findInput);
    setDetectedType(detected);
    if (detected.type === 'domain') {
      const result = cleanDomainInput(findInput);
      setCleanedDomain(result.domain);
    } else {
      setCleanedDomain('');
    }
  }, [findInput]);

  function addToHistory(title: string, result: V3Result | VerifyResult, tab: Tab) {
    setHistory(prev => {
      const entry: HistoryEntry = { title, timestamp: Date.now(), result, tab };
      return [entry, ...prev].slice(0, 10);
    });
  }

  function switchTab(tab: Tab) {
    setSearchParams({ tab });
  }

  async function handleFind(e: FormEvent) {
    e.preventDefault();
    // Read live DOM value to avoid React 18 batching race on fast typing
    const form = e.target as HTMLFormElement;
    const inputEl = form.querySelector('input');
    const input = (inputEl?.value ?? findInput).trim();
    if (!input) { toast.error('Zadejte firmu, IČO, nebo doménu'); return; }

    setLoading(true);
    setV3Result(null);
    setStartTime(Date.now());

    const payload: Record<string, string> = { input };
    // Also send typed fields for explicit cases
    const detected = detectInputType(input);
    if (detected.type === 'ico') payload.ico = input;
    else if (detected.type === 'domain') payload.domain = input;
    else if (detected.type === 'company_name') payload.company_name = input;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 300_000);

    try {
      const res = await fetch(n8nWebhookUrl('wf-email-finder-v3'), {
        method: 'POST',
        headers: n8nHeaders(),
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: V3Result = await res.json();
      setV3Result(data);
      if (!data.error) {
        addToHistory(data.company_name || data.domain || input, data, 'find');
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        toast.error('Vypršel časový limit požadavku');
      } else {
        toast.error('Chyba při hledání e-mailů');
      }
    } finally {
      clearTimeout(timeout);
      setLoading(false);
      setStartTime(null);
    }
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    // Read live DOM value to avoid React 18 batching race on fast typing
    const form = e.target as HTMLFormElement;
    const inputEl = form.querySelector('input');
    const email = (inputEl?.value ?? verifyEmail).trim();
    if (!email) { toast.error('Zadejte e-mailovou adresu'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      toast.error('Neplatná e-mailová adresa');
      return;
    }

    setVerifyLoading(true);
    setVerifyResult(null);
    setStartTime(Date.now());

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 240_000);

    try {
      const res = await fetch(n8nWebhookUrl('wf-email-finder-v2'), {
        method: 'POST',
        headers: n8nHeaders(),
        body: JSON.stringify({ mode: 'verify', email }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: VerifyResult = await res.json();
      setVerifyResult(data);
      addToHistory(`Ověření — ${email}`, data, 'verify');
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        toast.error('Vypršel časový limit');
      } else {
        toast.error('Chyba při ověřování');
      }
    } finally {
      clearTimeout(timeout);
      setVerifyLoading(false);
      setStartTime(null);
    }
  }

  function copyAllV3Emails() {
    if (!v3Result) return;
    const emails: string[] = [];
    v3Result.contacts.forEach(c => c.candidates.forEach(cand => {
      if (cand.status === 'valid' || cand.status === 'likely_valid') emails.push(cand.email);
    }));
    v3Result.backup_emails?.forEach(be => emails.push(be.email));
    navigator.clipboard.writeText(emails.join('\n'));
    toast.success(`${emails.length} e-mailů zkopírováno`);
  }

  function exportV3Csv() {
    if (!v3Result) return;
    const headers = ['contact', 'email', 'status', 'confidence', 'method', 'source'];
    const rows: Record<string, unknown>[] = [];
    v3Result.contacts.forEach(c => {
      c.candidates.forEach(cand => {
        rows.push({
          contact: c.full_name,
          email: cand.email,
          status: cand.status,
          confidence: cand.confidence,
          method: cand.method || '',
          source: 'combo_generation',
        });
      });
    });
    v3Result.backup_emails?.forEach(be => {
      rows.push({ contact: '', email: be.email, status: 'unknown', confidence: '', method: '', source: be.source });
    });
    exportCsv(`email-finder-${v3Result.domain || 'results'}.csv`, headers, rows);
  }

  const isLoading = loading || verifyLoading;

  return (
    <div style={{ padding: isMobile ? '16px 0' : '24px 32px' }} className="email-finder-page">
      <PageHeader title="Email Finder" />
      {/* Tab: Find Emails */}
      {activeTab === 'find' && (
        <>
          <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: '0 0 16px 2px', lineHeight: 1.4 }}>
            Zadejte firmu, IČO, nebo doménu — systém najde všechny kontakty a jejich e-maily.
          </p>

          <form onSubmit={handleFind} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <GlassInput
                label="Firma, IČO, nebo doména"
                placeholder="Meisat s.r.o. / 12345678 / firma.cz"
                value={findInput}
                onChange={e => setFindInput(e.target.value)}
                style={{ fontFamily: detectedType.type === 'ico' ? 'JetBrains Mono, monospace' : undefined }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 6, minHeight: 0 }}>
                {detectedType.label && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center',
                    padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 600,
                    color: '#60a5fa', background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.3)',
                  }}>
                    {detectedType.label}
                  </span>
                )}
                {cleanedDomain && (
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'JetBrains Mono, monospace' }}>
                    {cleanedDomain}
                  </span>
                )}
              </div>
            </div>

            <GlassButton variant="primary" type="submit" disabled={loading} style={{ marginTop: 4 }}>
              {loading ? 'Hledám e-maily…' : 'Hledat →'}
            </GlassButton>
          </form>

          {/* Loading spinner */}
          {loading && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
              marginTop: 24, padding: '20px 0', color: 'var(--text-dim)', fontSize: 13,
            }}>
              <div style={{
                width: 20, height: 20, border: '2px solid var(--border)',
                borderTopColor: 'var(--green)', borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
              <span>Hledám e-maily…</span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, opacity: 0.5 }}>
                {formatElapsed(elapsed)}
              </span>
            </div>
          )}

          {/* V3 Results */}
          {v3Result && (
            <GlassCard style={{ marginTop: 24, padding: isMobile ? 16 : 24 }}>
              {v3Result.error ? (
                <div style={{ fontSize: 13, color: '#f87171', padding: '12px 0' }}>
                  {v3Result.error}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Company header */}
                  <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
                        {v3Result.company_name || v3Result.domain}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        {v3Result.ico && <span>IČO: {v3Result.ico}</span>}
                        <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{v3Result.domain}</span>
                        <span>{v3Result.total_found} nalezených e-mailů</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {v3Result.total_found > 0 && (
                        <>
                          <GlassButton variant="secondary" onClick={copyAllV3Emails} style={{ fontSize: 12 }}>
                            Kopírovat vše
                          </GlassButton>
                          <GlassButton variant="secondary" onClick={exportV3Csv} style={{ fontSize: 12 }}>
                            Export CSV
                          </GlassButton>
                        </>
                      )}
                      <GlassButton variant="secondary" onClick={() => setV3Result(null)} style={{ fontSize: 12 }}>
                        Zavřít
                      </GlassButton>
                    </div>
                  </div>

                  {/* Per-contact sections */}
                  {v3Result.contacts.map((contact, ci) => (
                    <div key={ci} style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
                        {contact.full_name}
                      </div>
                      {contact.candidates.length === 0 ? (
                        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Žádné e-maily nenalezeny</div>
                      ) : (
                        <div style={{ overflowX: 'auto', borderRadius: 6, border: '1px solid var(--border)' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                              <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                                <th style={TH}>E-mail</th>
                                <th style={TH}>Status</th>
                                {!isMobile && <th style={TH}>Spolehlivost</th>}
                                <th style={TH}>Metoda</th>
                              </tr>
                            </thead>
                            <tbody>
                              {contact.candidates.map((c, i) => (
                                <tr key={i} style={{ borderBottom: i < contact.candidates.length - 1 ? '1px solid var(--border)' : 'none' }}>
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
                                  <td style={{ padding: '9px 12px' }}><StatusBadge status={c.status} /></td>
                                  {!isMobile && (
                                    <td style={{ padding: '9px 12px', fontSize: 12, color: 'var(--text-dim)', textTransform: 'capitalize' }}>
                                      {c.confidence}
                                    </td>
                                  )}
                                  <td style={{ padding: '9px 12px' }}>
                                    {c.method && <MethodBadge method={c.method} />}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Backup emails from website */}
                  {v3Result.backup_emails && v3Result.backup_emails.length > 0 && (
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#fbbf24', marginBottom: 8 }}>
                        Záložní emaily z webu
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {v3Result.backup_emails.map((be, i) => (
                          <div key={i} style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '6px 12px', borderRadius: 6,
                            background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.15)',
                          }}>
                            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--text)', flex: 1 }}>
                              {be.email}
                            </span>
                            <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{be.source}</span>
                            <button
                              onClick={() => { navigator.clipboard.writeText(be.email); toast.success('Zkopírováno'); }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.4, padding: 0, fontSize: 13, lineHeight: 1 }}
                              title="Kopírovat"
                              type="button"
                            >
                              📋
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Steps completed */}
                  {v3Result.steps_completed && v3Result.steps_completed.length > 0 && (
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', opacity: 0.6, marginTop: 4 }}>
                      Kroky: {v3Result.steps_completed.join(' → ')}
                    </div>
                  )}
                </div>
              )}
            </GlassCard>
          )}
        </>
      )}

      {/* Tab: Verify Email */}
      {activeTab === 'verify' && (
        <>
          <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: '0 0 16px 2px', lineHeight: 1.4 }}>
            Ověří, zda konkrétní e-mailová adresa existuje (SMTP + MX check).
          </p>

          <form onSubmit={handleVerify} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <GlassInput
              label="E-mailová adresa"
              placeholder="jan.novak@firma.cz"
              value={verifyEmail}
              onChange={e => setVerifyEmail(e.target.value)}
              type="email"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
            />
            <GlassButton variant="primary" type="submit" disabled={verifyLoading} style={{ marginTop: 4 }}>
              {verifyLoading ? 'Ověřuji…' : 'Ověřit →'}
            </GlassButton>
          </form>

          {verifyLoading && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
              marginTop: 24, padding: '20px 0', color: 'var(--text-dim)', fontSize: 13,
            }}>
              <div style={{
                width: 20, height: 20, border: '2px solid var(--border)',
                borderTopColor: 'var(--green)', borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
              <span>Ověřuji…</span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, opacity: 0.5 }}>
                {formatElapsed(elapsed)}
              </span>
            </div>
          )}

          {verifyResult && (
            <GlassCard style={{ marginTop: 24, padding: isMobile ? 16 : 24 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                    Výsledek ověření
                  </div>
                  <GlassButton variant="secondary" onClick={() => setVerifyResult(null)} style={{ fontSize: 12 }}>
                    Zavřít
                  </GlassButton>
                </div>
                {verifyResult.candidates.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                    {verifyResult.error === 'no_mx'
                      ? 'Doména nemá MX záznamy — e-maily na této doméně nelze doručit.'
                      : 'E-mailová adresa nebyla ověřena.'}
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto', borderRadius: 6, border: '1px solid var(--border)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                          <th style={TH}>E-mail</th>
                          <th style={TH}>Status</th>
                          {!isMobile && <th style={TH}>SMTP</th>}
                          <th style={TH}>Metoda</th>
                        </tr>
                      </thead>
                      <tbody>
                        {verifyResult.candidates.map((c, i) => (
                          <tr key={i}>
                            <td style={{ padding: '9px 12px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--text)' }}>
                              {c.email}
                            </td>
                            <td style={{ padding: '9px 12px' }}><StatusBadge status={c.status} /></td>
                            {!isMobile && (
                              <td style={{ padding: '9px 12px', fontSize: 11, color: 'var(--text-dim)', fontFamily: 'JetBrains Mono, monospace' }}>
                                {c.smtp_result || '—'}
                              </td>
                            )}
                            <td style={{ padding: '9px 12px' }}>
                              {(c.method || verifyResult.method) && <MethodBadge method={c.method || verifyResult.method!} />}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </GlassCard>
          )}
        </>
      )}

      {/* History */}
      {history.length > 0 && !isLoading && (
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
                  if (entry.tab === 'find') {
                    switchTab('find');
                    setV3Result(entry.result as V3Result);
                  } else {
                    switchTab('verify');
                    setVerifyResult(entry.result as VerifyResult);
                  }
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
                <span style={{
                  padding: '1px 6px', borderRadius: 8, fontSize: 9, fontWeight: 600,
                  color: entry.tab === 'find' ? '#60a5fa' : '#c084fc',
                  background: entry.tab === 'find' ? 'rgba(96,165,250,0.1)' : 'rgba(192,132,252,0.1)',
                  border: `1px solid ${entry.tab === 'find' ? 'rgba(96,165,250,0.3)' : 'rgba(192,132,252,0.3)'}`,
                }}>
                  {entry.tab === 'find' ? 'FIND' : 'VERIFY'}
                </span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entry.title}
                </span>
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
