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

type Tab = 'ico' | 'name' | 'verify' | 'probe' | 'bulk' | 'discover';

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
  probe_start?: string;
}

interface DiscoverResult {
  found: boolean;
  domain: string;
  source: string;
  lead_id?: string;
  company_id?: string;
  company_name?: string;
  ico?: string;
}

interface HistoryEntry {
  title: string;
  timestamp: number;
  result: V3Result | VerifyResult | DiscoverResult;
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

const SOURCE_COLORS: Record<string, { color: string; bg: string; border: string; label: string }> = {
  ares:  { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.3)',  label: 'ARES' },
  firmy: { color: '#c084fc', bg: 'rgba(192,132,252,0.1)', border: 'rgba(192,132,252,0.3)', label: 'Firmy.cz' },
  dns:   { color: '#4ade80', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.3)',  label: 'DNS' },
  ddg:   { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.3)',  label: 'DuckDuckGo' },
};

function SourceBadge({ source }: { source: string }) {
  const s = SOURCE_COLORS[source] || { color: 'var(--text-dim)', bg: 'rgba(255,255,255,0.05)', border: 'var(--border)', label: source };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600,
      color: s.color, background: s.bg, border: `1px solid ${s.border}`,
      whiteSpace: 'nowrap',
    }}>
      {s.label}
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

const TAB_DESC: Record<Tab, string> = {
  ico: 'Vyhledá jednatele v ARES podle IČO, odhadne e-mail z domény a ověří přes SMTP.',
  name: 'Zadejte firmu, IČO, nebo doménu — systém najde všechny kontakty a jejich e-maily.',
  verify: 'Ověří, zda konkrétní e-mailová adresa existuje (SMTP + MX check).',
  probe: 'Odešle sondovací e-mail a čeká na odraz (~3 min). Spolehlivější pro catch-all domény.',
  bulk: 'Hromadné hledání e-mailů — nahrajte CSV se jmény a doménami.',
  discover: 'Zadejte název firmy nebo IČO — systém zkusí najít doménu přes ARES, Firmy.cz, DNS a DuckDuckGo.',
};

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
  const tabParam = searchParams.get('tab');
  const activeTab: Tab = tabParam === 'name' ? 'name'
    : tabParam === 'verify' ? 'verify'
    : tabParam === 'probe' ? 'probe'
    : tabParam === 'bulk' ? 'bulk'
    : tabParam === 'discover' ? 'discover'
    : 'ico';

  // ICO tab state
  const [ico, setIco] = useState('');
  const [websiteIco, setWebsiteIco] = useState('');

  // Name tab state (generic v3 input)
  const [findInput, setFindInput] = useState('');
  const [detectedType, setDetectedType] = useState<{ type: DetectedType; label: string }>({ type: '', label: '' });
  const [cleanedDomain, setCleanedDomain] = useState('');

  // Verify tab state
  const [verifyEmail, setVerifyEmail] = useState('');

  // Probe tab state
  const [probeName, setProbeName] = useState('');
  const [probeDomain, setProbeDomain] = useState('');

  // Bulk tab state
  const [bulkCsv, setBulkCsv] = useState('');
  const [bulkRows, setBulkRows] = useState<Array<{ name: string; domain: string }>>([]);
  const [bulkDone, setBulkDone] = useState(0);
  const [bulkResults, setBulkResults] = useState<Array<{ name: string; domain: string; email?: string; status?: string }>>([]);

  // Discover tab state
  const [discoverName, setDiscoverName] = useState('');
  const [discoverIco, setDiscoverIco] = useState('');

  // Shared loading/result state
  const [loading, setLoading] = useState(false);
  const [v3Result, setV3Result] = useState<V3Result | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [discoverResult, setDiscoverResult] = useState<DiscoverResult | null>(null);

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

  // Auto-detect input type for name tab
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

  function addToHistory(title: string, result: V3Result | VerifyResult | DiscoverResult, tab: Tab) {
    setHistory(prev => {
      const entry: HistoryEntry = { title, timestamp: Date.now(), result, tab };
      return [entry, ...prev].slice(0, 10);
    });
  }

  function switchTab(tab: Tab) {
    setSearchParams(tab === 'ico' ? {} : { tab });
  }

  // ICO tab submit → v3
  async function handleIcoSubmit(e: FormEvent) {
    e.preventDefault();
    const icoVal = ico.trim();
    const web = websiteIco.trim();
    if (!icoVal) { toast.error('Zadejte IČO'); return; }
    if (!/^\d{8}$/.test(icoVal)) { toast.error('IČO musí mít přesně 8 číslic'); return; }

    setLoading(true);
    setV3Result(null);
    setStartTime(Date.now());

    const payload: Record<string, string> = { ico: icoVal, input: icoVal };
    if (web) payload.website = web;

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
        addToHistory(`IČO ${icoVal}${web ? ` — ${web}` : ''}`, data, 'ico');
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

  // Name tab submit → v3
  async function handleNameSubmit(e: FormEvent) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const inputEl = form.querySelector('input');
    const input = (inputEl?.value ?? findInput).trim();
    if (!input) { toast.error('Zadejte firmu, IČO, nebo doménu'); return; }

    setLoading(true);
    setV3Result(null);
    setStartTime(Date.now());

    const payload: Record<string, string> = { input };
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
        addToHistory(data.company_name || data.domain || input, data, 'name');
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

  // Verify tab submit → v2
  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const inputEl = form.querySelector('input');
    const email = (inputEl?.value ?? verifyEmail).trim();
    if (!email) { toast.error('Zadejte e-mailovou adresu'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      toast.error('Neplatná e-mailová adresa');
      return;
    }

    setLoading(true);
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
      setLoading(false);
      setStartTime(null);
    }
  }

  // Probe tab submit → v2 probe mode
  async function handleProbe(e: FormEvent) {
    e.preventDefault();
    const name = probeName.trim();
    const domain = probeDomain.trim();
    if (!name) { toast.error('Zadejte celé jméno osoby'); return; }
    if (name.split(/\s+/).length < 2) { toast.error('Zadejte jméno a příjmení'); return; }
    if (!domain) { toast.error('Zadejte doménu nebo URL firmy'); return; }

    setLoading(true);
    setVerifyResult(null);
    setStartTime(Date.now());

    const nameParts = name.split(/\s+/);
    const firstName = nameParts[0];
    const lastName = nameParts[nameParts.length - 1];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 380_000);

    try {
      const res = await fetch(n8nWebhookUrl('wf-email-finder-v2'), {
        method: 'POST',
        headers: n8nHeaders(),
        body: JSON.stringify({ mode: 'probe', domain, first_name: firstName, last_name: lastName }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: VerifyResult = await res.json();
      if (data.error === 'probe_timeout') {
        toast.error('Sonda vypršela — zkuste znovu nebo použijte Recheck');
      }
      setVerifyResult(data);
      addToHistory(`${name} — ${domain}`, data, 'probe');
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        toast.error('Vypršel časový limit');
      } else {
        toast.error('Chyba při sondování');
      }
    } finally {
      clearTimeout(timeout);
      setLoading(false);
      setStartTime(null);
    }
  }

  // Bulk tab — parse CSV and run searches
  function handleBulkParse() {
    const lines = bulkCsv.trim().split('\n').filter(l => l.trim());
    if (lines.length < 2) { toast.error('CSV musí mít hlavičku a alespoň 1 řádek'); return; }
    const rows = lines.slice(1).map(line => {
      const parts = line.split(/[,;\t]/).map(p => p.trim());
      if (parts.length >= 3) return { name: `${parts[0]} ${parts[1]}`, domain: parts[2] };
      if (parts.length === 2) return { name: parts[0], domain: parts[1] };
      return null;
    }).filter((r): r is { name: string; domain: string } => r !== null && !!r.name && !!r.domain);
    setBulkRows(rows);
    if (rows.length > 0) toast.success(`${rows.length} řádků načteno`);
  }

  async function handleBulkRun() {
    if (bulkRows.length === 0) return;
    setLoading(true);
    setBulkDone(0);
    setBulkResults([]);
    setStartTime(Date.now());

    const results: typeof bulkResults = [];
    for (const row of bulkRows) {
      const nameParts = row.name.split(/\s+/);
      const firstName = nameParts[0];
      const lastName = nameParts[nameParts.length - 1];
      try {
        const res = await fetch(n8nWebhookUrl('wf-email-finder-v2'), {
          method: 'POST',
          headers: n8nHeaders(),
          body: JSON.stringify({ mode: 'name', domain: row.domain, first_name: firstName, last_name: lastName }),
        });
        if (res.ok) {
          const data: VerifyResult = await res.json();
          const best = data.candidates.find(c => c.status === 'valid' || c.status === 'likely_valid');
          results.push({ name: row.name, domain: row.domain, email: best?.email, status: best?.status });
        } else {
          results.push({ name: row.name, domain: row.domain });
        }
      } catch {
        results.push({ name: row.name, domain: row.domain });
      }
      setBulkDone(prev => prev + 1);
      setBulkResults([...results]);
    }

    const found = results.filter(r => r.email).length;
    addToHistory(`Hromadné — ${found}/${results.length}`, { candidates: [], domain: '', total: found } as VerifyResult, 'bulk');
    setLoading(false);
    setStartTime(null);
  }

  // Discover tab submit
  async function handleDiscover(e: FormEvent) {
    e.preventDefault();
    const name = discoverName.trim();
    const icoVal = discoverIco.trim();
    if (!name && !icoVal) { toast.error('Zadejte název firmy nebo IČO'); return; }
    if (icoVal && !/^\d{8}$/.test(icoVal)) { toast.error('IČO musí mít přesně 8 číslic'); return; }

    setLoading(true);
    setDiscoverResult(null);
    setStartTime(Date.now());

    const payload: Record<string, string> = {
      company_name: name,
      ico: icoVal,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);

    try {
      const res = await fetch(n8nWebhookUrl('wf-domain-discovery-test'), {
        method: 'POST',
        headers: n8nHeaders(),
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: DiscoverResult = await res.json();
      setDiscoverResult(data);
      const label = name || `IČO ${icoVal}`;
      const title = label + (data.found ? ` → ${data.domain}` : '');
      addToHistory(title, data, 'discover');
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        toast.error('Vypršel časový limit');
      } else {
        toast.error('Chyba při hledání domény');
      }
    } finally {
      clearTimeout(timeout);
      setLoading(false);
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

  const loadingText = activeTab === 'probe' ? 'Odesílám sondovací e-maily…'
    : activeTab === 'verify' ? 'Ověřuji…'
    : activeTab === 'discover' ? 'Hledám doménu…'
    : activeTab === 'bulk' ? `Hledám… ${bulkDone}/${bulkRows.length}`
    : 'Hledám e-maily…';

  return (
    <div style={{ padding: isMobile ? '16px 0' : '24px 32px' }} className="email-finder-page">
      <PageHeader title="Email Finder" />

      {/* Tab description */}
      <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: '0 0 16px 2px', lineHeight: 1.4 }}>
        {TAB_DESC[activeTab]}
      </p>

      {/* ── ICO tab: IČO + Website fields ── */}
      {activeTab === 'ico' && (
        <>
          <form onSubmit={handleIcoSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
              <div>
                <GlassInput
                  label="IČO *"
                  placeholder="12345678"
                  value={ico}
                  onChange={e => setIco(e.target.value)}
                  style={{ fontFamily: 'JetBrains Mono, monospace' }}
                />
                <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: '4px 0 0 2px' }}>
                  Povinné — IČO slouží k vyhledání jednatele v ARES
                </p>
              </div>
              <GlassInput
                label="Web"
                placeholder="firma.cz"
                value={websiteIco}
                onChange={e => setWebsiteIco(e.target.value)}
              />
            </div>
            <GlassButton variant="primary" type="submit" disabled={loading} style={{ marginTop: 4 }}>
              {loading ? 'Hledám e-maily…' : 'Hledat →'}
            </GlassButton>
          </form>
          {renderLoading()}
          {renderV3Result()}
        </>
      )}

      {/* ── Name tab: generic input (auto-detect) ── */}
      {activeTab === 'name' && (
        <>
          <form onSubmit={handleNameSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
          {renderLoading()}
          {renderV3Result()}
        </>
      )}

      {/* ── Verify tab: email field ── */}
      {activeTab === 'verify' && (
        <>
          <form onSubmit={handleVerify} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <GlassInput
              label="E-mailová adresa"
              placeholder="jan.novak@firma.cz"
              value={verifyEmail}
              onChange={e => setVerifyEmail(e.target.value)}
              type="email"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
            />
            <GlassButton variant="primary" type="submit" disabled={loading} style={{ marginTop: 4 }}>
              {loading ? 'Ověřuji…' : 'Ověřit →'}
            </GlassButton>
          </form>
          {renderLoading()}
          {renderVerifyResult()}
        </>
      )}

      {/* ── Probe tab: name + domain fields ── */}
      {activeTab === 'probe' && (
        <>
          <form onSubmit={handleProbe} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
              <GlassInput
                label="Celé jméno"
                placeholder="Jan Novák"
                value={probeName}
                onChange={e => setProbeName(e.target.value)}
              />
              <GlassInput
                label="Doména nebo URL"
                placeholder="firma.cz nebo https://firma.cz"
                value={probeDomain}
                onChange={e => setProbeDomain(e.target.value)}
              />
            </div>
            <GlassButton variant="primary" type="submit" disabled={loading} style={{ marginTop: 4 }}>
              {loading ? 'Odesílám sondu…' : 'Sondovat →'}
            </GlassButton>
          </form>
          {renderLoading()}
          {renderVerifyResult()}
        </>
      )}

      {/* ── Bulk tab: CSV input ── */}
      {activeTab === 'bulk' && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: 0 }}>
              CSV formát: <code style={{ color: '#60a5fa' }}>first_name, last_name, domain</code> (nebo <code style={{ color: '#60a5fa' }}>name, domain</code>)
            </p>
            <textarea
              value={bulkCsv}
              onChange={e => setBulkCsv(e.target.value)}
              placeholder={'name,domain\nJan Novák,firma.cz\nPetr Svoboda,jina-firma.cz'}
              rows={6}
              style={{
                width: '100%', padding: 12, borderRadius: 8,
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                color: 'var(--text)', fontSize: 12, fontFamily: 'JetBrains Mono, monospace',
                resize: 'vertical',
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <GlassButton variant="secondary" onClick={handleBulkParse} disabled={!bulkCsv.trim()}>
                Načíst CSV
              </GlassButton>
              {bulkRows.length > 0 && (
                <GlassButton variant="primary" onClick={handleBulkRun} disabled={loading}>
                  {loading ? `Hledám… ${bulkDone}/${bulkRows.length}` : `Spustit hledání (${bulkRows.length})`}
                </GlassButton>
              )}
            </div>
            {bulkRows.length > 0 && !loading && (
              <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: 0 }}>
                {bulkRows.length} řádků připraveno ke zpracování
              </p>
            )}
          </div>
          {renderLoading()}
          {bulkResults.length > 0 && (
            <GlassCard style={{ marginTop: 24, padding: isMobile ? 16 : 24 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>
                Výsledky ({bulkResults.filter(r => r.email).length}/{bulkResults.length} nalezeno)
              </div>
              <div style={{ overflowX: 'auto', borderRadius: 6, border: '1px solid var(--border)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <th style={TH}>Jméno</th>
                      <th style={TH}>Doména</th>
                      <th style={TH}>E-mail</th>
                      <th style={TH}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkResults.map((r, i) => (
                      <tr key={i} style={{ borderBottom: i < bulkResults.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <td style={{ padding: '9px 12px', color: 'var(--text)' }}>{r.name}</td>
                        <td style={{ padding: '9px 12px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--text-dim)' }}>{r.domain}</td>
                        <td style={{ padding: '9px 12px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--text)' }}>
                          {r.email || '—'}
                        </td>
                        <td style={{ padding: '9px 12px' }}>
                          {r.status ? <StatusBadge status={r.status} /> : <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          )}
        </>
      )}

      {/* ── Discover tab: company name or IČO ── */}
      {activeTab === 'discover' && (
        <>
          <form onSubmit={handleDiscover} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
              <GlassInput
                label="Název firmy"
                placeholder="Alza.cz s.r.o."
                value={discoverName}
                onChange={e => setDiscoverName(e.target.value)}
              />
              <div>
                <GlassInput
                  label="IČO"
                  placeholder="27082440"
                  value={discoverIco}
                  onChange={e => setDiscoverIco(e.target.value)}
                  style={{ fontFamily: 'JetBrains Mono, monospace' }}
                />
                <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: '4px 0 0 2px' }}>
                  Alespoň jedno pole je povinné
                </p>
              </div>
            </div>
            <GlassButton variant="primary" type="submit" disabled={loading} style={{ marginTop: 4 }}>
              {loading ? 'Hledám doménu…' : 'Hledat doménu →'}
            </GlassButton>
          </form>
          {renderLoading()}
          {renderDiscoverResult()}
        </>
      )}

      {/* ── History ── */}
      {history.length > 0 && !loading && (
        <GlassCard style={{ padding: isMobile ? 12 : 16, marginTop: 16 }}>
          <div style={{ fontSize: isMobile ? 11 : 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 8 }}>
            Historie hledání
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {history.map((entry, i) => {
              const isFind = entry.tab === 'ico' || entry.tab === 'name' || entry.tab === 'bulk';
              const isDiscover = entry.tab === 'discover';
              const badgeColor = isFind ? '#60a5fa' : isDiscover ? '#4ade80' : '#c084fc';
              const badgeBg = isFind ? 'rgba(96,165,250,0.1)' : isDiscover ? 'rgba(74,222,128,0.1)' : 'rgba(192,132,252,0.1)';
              const badgeBorder = isFind ? 'rgba(96,165,250,0.3)' : isDiscover ? 'rgba(74,222,128,0.3)' : 'rgba(192,132,252,0.3)';
              const badgeLabel = entry.tab === 'ico' ? 'IČO'
                : entry.tab === 'name' ? 'FIND'
                : entry.tab === 'verify' ? 'VERIFY'
                : entry.tab === 'probe' ? 'PROBE'
                : entry.tab === 'bulk' ? 'BULK'
                : 'DOMAIN';
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    if (entry.tab === 'ico' || entry.tab === 'name') {
                      switchTab(entry.tab);
                      setV3Result(entry.result as V3Result);
                    } else if (entry.tab === 'verify' || entry.tab === 'probe') {
                      switchTab(entry.tab);
                      setVerifyResult(entry.result as VerifyResult);
                    } else if (entry.tab === 'discover') {
                      switchTab('discover');
                      setDiscoverResult(entry.result as DiscoverResult);
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
                    color: badgeColor, background: badgeBg,
                    border: `1px solid ${badgeBorder}`,
                  }}>
                    {badgeLabel}
                  </span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.title}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'JetBrains Mono, monospace' }}>
                    {formatTime(new Date(entry.timestamp).toISOString())}
                  </span>
                </button>
              );
            })}
          </div>
        </GlassCard>
      )}
    </div>
  );

  // ── Shared render helpers ──

  function renderLoading() {
    if (!loading) return null;
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
        marginTop: 24, padding: '20px 0',
        color: activeTab === 'probe' ? '#c084fc' : 'var(--text-dim)', fontSize: 13,
      }}>
        <div style={{
          width: 20, height: 20, border: '2px solid var(--border)',
          borderTopColor: activeTab === 'probe' ? '#c084fc' : 'var(--green)', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <span>{loadingText}</span>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, opacity: 0.5 }}>
          {formatElapsed(elapsed)}
        </span>
      </div>
    );
  }

  function renderV3Result() {
    if (!v3Result) return null;
    return (
      <GlassCard style={{ marginTop: 24, padding: isMobile ? 16 : 24 }}>
        {v3Result.error ? (
          <div style={{ fontSize: 13, color: '#f87171', padding: '12px 0' }}>
            {v3Result.error}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
                                >📋</button>
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
                      >📋</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {v3Result.steps_completed && v3Result.steps_completed.length > 0 && (
              <div style={{ fontSize: 10, color: 'var(--text-dim)', opacity: 0.6, marginTop: 4 }}>
                Kroky: {v3Result.steps_completed.join(' → ')}
              </div>
            )}
          </div>
        )}
      </GlassCard>
    );
  }

  function renderVerifyResult() {
    if (!verifyResult) return null;
    return (
      <GlassCard style={{ marginTop: 24, padding: isMobile ? 16 : 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
              {activeTab === 'probe' ? 'Výsledek sondy' : 'Výsledek ověření'}
            </div>
            <GlassButton variant="secondary" onClick={() => setVerifyResult(null)} style={{ fontSize: 12 }}>
              Zavřít
            </GlassButton>
          </div>
          {verifyResult.candidates.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
              {verifyResult.error === 'no_mx'
                ? 'Doména nemá MX záznamy — e-maily na této doméně nelze doručit.'
                : verifyResult.error === 'probe_timeout'
                ? 'Sonda vypršela — zkuste znovu.'
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
    );
  }

  function renderDiscoverResult() {
    if (!discoverResult) return null;
    return (
      <GlassCard style={{ marginTop: 24, padding: isMobile ? 16 : 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
              Výsledek hledání domény
            </div>
            <GlassButton variant="secondary" onClick={() => setDiscoverResult(null)} style={{ fontSize: 12 }}>
              Zavřít
            </GlassButton>
          </div>
          {discoverResult.found ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 16px', borderRadius: 8,
              background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.2)',
            }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                color: 'var(--green)', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)',
              }}>
                ✓ Nalezeno
              </span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, color: 'var(--text)', fontWeight: 600 }}>
                {discoverResult.domain}
              </span>
              <SourceBadge source={discoverResult.source} />
              <button
                onClick={() => { navigator.clipboard.writeText(discoverResult.domain); toast.success('Doména zkopírována'); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.4, padding: 0, fontSize: 13, lineHeight: 1, marginLeft: 'auto' }}
                title="Kopírovat"
                type="button"
              >📋</button>
            </div>
          ) : (
            <div style={{
              padding: '12px 16px', borderRadius: 8,
              background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.2)',
              fontSize: 13, color: '#f87171',
            }}>
              ✗ Doména nenalezena
            </div>
          )}
        </div>
      </GlassCard>
    );
  }
}

const TH: React.CSSProperties = {
  padding: '9px 12px', textAlign: 'left',
  color: 'var(--text-dim)', fontWeight: 500,
  borderBottom: '1px solid var(--border)',
};
