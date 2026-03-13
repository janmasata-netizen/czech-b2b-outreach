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
import { cleanDomainInput } from '@/lib/dedup';
import { supabase } from '@/lib/supabase';
import useMobile from '@/hooks/useMobile';

type Mode = 'ico' | 'name' | 'verify' | 'probe' | 'bulk';

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

interface ContactResult {
  contact_id: string;
  full_name: string;
  candidates: Array<{ email: string; status: string; confidence: string; method?: string }>;
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

interface HistoryEntry {
  result: FinderResult | V3Result;
  title: string;
  timestamp: number;
  isV3?: boolean;
}

const MODE_DESC: Record<Mode, string> = {
  ico: 'Vyhledá jednatele v ARES podle IČO, odhadne e-mail z domény a ověří přes SMTP.',
  name: 'Vygeneruje možné e-mailové adresy ze jména a domény, ověří přes SMTP.',
  verify: 'Ověří, zda konkrétní e-mailová adresa existuje (SMTP + MX check).',
  probe: 'Odešle sondovací e-mail a čeká na odraz (~3 min). Spolehlivější pro catch-all domény.',
  bulk: 'Hromadné vyhledávání e-mailů — nahrajte CSV se jmény a doménami.',
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
  const [searchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const mode: Mode = (rawTab === 'name' || rawTab === 'verify' || rawTab === 'probe' || rawTab === 'bulk') ? rawTab : 'ico';
  const [loading, setLoading] = useState(false);
  const [probeActive, setProbeActive] = useState(false);
  const [recheckLoading, setRecheckLoading] = useState(false);
  const [results, setResults] = useState<FinderResult | null>(null);
  const [v3Result, setV3Result] = useState<V3Result | null>(null);
  const [modalTitle, setModalTitle] = useState('');

  // Elapsed time counter
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // Results history (persisted to localStorage)
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem('email-finder-history') || '[]'); }
    catch { return []; }
  });

  // Field errors for inline validation
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Cleaned domain previews
  const [cleanedIcoDomain, setCleanedIcoDomain] = useState('');
  const [cleanedNameDomain, setCleanedNameDomain] = useState('');

  // Persist history to localStorage
  useEffect(() => {
    localStorage.setItem('email-finder-history', JSON.stringify(history));
  }, [history]);

  // Bulk mode state
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkRows, setBulkRows] = useState<Array<{ first_name: string; last_name: string; domain: string }>>([]);
  const [bulkResults, setBulkResults] = useState<Array<{ row: { first_name: string; last_name: string; domain: string }; result: FinderResult | null; error?: string }>>([]);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });

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

  // Domain preview effects
  useEffect(() => {
    if (websiteIco.trim()) {
      const { domain, error } = cleanDomainInput(websiteIco);
      setCleanedIcoDomain(error ? '' : domain);
    } else {
      setCleanedIcoDomain('');
    }
  }, [websiteIco]);

  useEffect(() => {
    if (websiteName.trim()) {
      const { domain, error } = cleanDomainInput(websiteName);
      setCleanedNameDomain(error ? '' : domain);
    } else {
      setCleanedNameDomain('');
    }
  }, [websiteName]);

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
        if (value) {
          const { error } = cleanDomainInput(value);
          if (error) errs[field] = error;
          else delete errs[field];
        } else delete errs[field];
        break;
      default:
        break;
    }
    setFieldErrors(errs);
  }

  function addToHistory(result: FinderResult | V3Result, title: string, isV3 = false) {
    setHistory(prev => {
      const entry: HistoryEntry = { result, title, timestamp: Date.now(), isV3 };
      const next = [entry, ...prev];
      return next.slice(0, 10);
    });
  }

  function handleBulkFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) { toast.error('CSV musí mít hlavičku a alespoň 1 řádek'); return; }
      const header = lines[0].split(/[,;\t]/).map(h => h.trim().toLowerCase());
      const fnIdx = header.findIndex(h => h.includes('first') || h === 'jmeno' || h === 'jméno');
      const lnIdx = header.findIndex(h => h.includes('last') || h === 'prijmeni' || h === 'příjmení');
      const domIdx = header.findIndex(h => h.includes('domain') || h.includes('domen') || h.includes('doména') || h === 'web' || h === 'website');
      const nameIdx = header.findIndex(h => h === 'name' || h === 'full_name' || h === 'celé_jméno' || h === 'cele_jmeno');

      const rows = lines.slice(1).map(line => {
        const cols = line.split(/[,;\t]/).map(c => c.trim());
        let firstName = fnIdx >= 0 ? cols[fnIdx] : '';
        let lastName = lnIdx >= 0 ? cols[lnIdx] : '';
        if (!firstName && !lastName && nameIdx >= 0) {
          const parts = (cols[nameIdx] || '').split(/\s+/);
          firstName = parts[0] || '';
          lastName = parts.slice(1).join(' ') || '';
        }
        const domain = domIdx >= 0 ? cols[domIdx]?.replace(/^https?:\/\//, '').replace(/\/.*$/, '') : '';
        return { first_name: firstName, last_name: lastName, domain };
      }).filter(r => r.domain && (r.first_name || r.last_name));

      setBulkRows(rows);
      setBulkResults([]);
      toast.success(`Načteno ${rows.length} řádků`);
    };
    reader.readAsText(file, 'UTF-8');
  }

  async function handleBulkRun() {
    if (bulkRows.length === 0) return;
    setBulkRunning(true);
    setBulkProgress({ done: 0, total: bulkRows.length });
    const results: typeof bulkResults = [];

    for (let i = 0; i < bulkRows.length; i++) {
      const row = bulkRows[i];
      try {
        const res = await fetch(n8nWebhookUrl('wf-email-finder-v2'), {
          method: 'POST',
          headers: n8nHeaders(),
          body: JSON.stringify({
            mode: 'name',
            first_name: row.first_name,
            last_name: row.last_name,
            domain: row.domain,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: FinderResult = await res.json();
        results.push({ row, result: data });
      } catch (err) {
        results.push({ row, result: null, error: (err as Error).message });
      }
      setBulkProgress({ done: i + 1, total: bulkRows.length });
      setBulkResults([...results]);
      if (i < bulkRows.length - 1) await new Promise(r => setTimeout(r, 500));
    }

    setBulkRunning(false);
    toast.success(`Hromadné hledání dokončeno: ${results.filter(r => r.result && r.result.total > 0).length}/${results.length} nalezeno`);
  }

  async function handleBulkSave(onlyWithEmail: boolean) {
    let saved = 0, errors = 0;
    for (const entry of bulkResults) {
      if (!entry.result) continue;
      const bestCandidate = entry.result.candidates.find(c => c.status === 'valid' || c.status === 'likely_valid');
      if (onlyWithEmail && !bestCandidate) continue;

      try {
        // Use ingest_lead RPC to create/find company + lead
        const { data: rpc, error: rpcErr } = await supabase.rpc('ingest_lead', {
          p_company_name: entry.row.domain,
          p_ico: null,
          p_website: null,
          p_domain: entry.row.domain,
          p_team_id: null,
          p_status: bestCandidate ? 'ready' : 'new',
          p_lead_type: 'company',
        });
        if (rpcErr || !rpc?.company_id) { errors++; continue; }

        const { data: contact, error: ce } = await supabase.from('contacts').insert({
          company_id: rpc.company_id,
          full_name: `${entry.row.first_name} ${entry.row.last_name}`.trim(),
        }).select().single();
        if (ce) { errors++; continue; }

        if (bestCandidate) {
          await supabase.from('email_candidates').insert({
            contact_id: contact.id,
            email_address: bestCandidate.email,
            is_verified: bestCandidate.status === 'valid',
            qev_status: bestCandidate.status === 'valid' ? 'valid' : 'unknown',
            seznam_status: bestCandidate.status === 'likely_valid' ? 'likely_valid' : 'pending',
          });
        }
        saved++;
      } catch { errors++; }
    }
    toast.success(`Uloženo ${saved} leadů` + (errors > 0 ? `, ${errors} chyb` : ''));
  }

  function copyAllEmails() {
    if (!results) return;
    const emails = results.candidates.map(c => c.email).join('\n');
    navigator.clipboard.writeText(emails);
    toast.success('Všechny e-maily zkopírovány');
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
    const fetchTimeout = setTimeout(() => controller.abort(), mode === 'probe' ? 330_000 : 300_000);
    let probeTimer: ReturnType<typeof setTimeout> | null = null;

    if (mode === 'ico') {
      // ICO tab — use v3 endpoint with domain cleaning
      const rawDomain = websiteIco.trim();
      if (!rawDomain) { toast.error('Zadejte webovou adresu firmy'); clearTimeout(fetchTimeout); return; }
      if (!ico.trim()) { toast.error('Zadejte IČO — potřebujeme ho pro vyhledání jednatele v ARES'); clearTimeout(fetchTimeout); return; }
      if (!/^\d{8}$/.test(ico.trim())) { toast.error('IČO musí mít přesně 8 číslic'); clearTimeout(fetchTimeout); return; }

      const { domain: cleanedDomain, error: domainError } = cleanDomainInput(rawDomain);
      if (domainError) { toast.error(domainError); clearTimeout(fetchTimeout); return; }

      setLoading(true);
      setResults(null);
      setV3Result(null);
      setStartTime(Date.now());
      try {
        const payload = { ico: ico.trim(), domain: cleanedDomain };
        const title = `IČO ${ico} — ${cleanedDomain}`;
        setModalTitle(title);
        lastTitleRef.current = title;
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
          addToHistory(data, lastTitleRef.current, true);
        }
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

    // Name, Probe & Verify modes — use v2 endpoint
    const payload: Record<string, string> = { mode };

    if (mode === 'verify') {
      if (!verifyEmail.trim()) { toast.error('Zadejte e-mailovou adresu'); clearTimeout(fetchTimeout); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(verifyEmail.trim())) {
        toast.error('Neplatná e-mailová adresa');
        clearTimeout(fetchTimeout);
        return;
      }
      payload.email = verifyEmail.trim();
      const title = `Ověření — ${verifyEmail.trim()}`;
      setModalTitle(title);
      lastTitleRef.current = title;
    } else {
      // name or probe mode — clean domain before sending
      if (!websiteName.trim()) { toast.error('Zadejte doménu nebo URL firmy'); clearTimeout(fetchTimeout); return; }
      if (!fullName.trim()) { toast.error('Zadejte celé jméno osoby'); clearTimeout(fetchTimeout); return; }

      const { domain: cleanedDomain, error: domainError } = cleanDomainInput(websiteName);
      if (domainError) { toast.error(domainError); clearTimeout(fetchTimeout); return; }

      const nameParts = fullName.trim().split(/\s+/);
      const firstName = nameParts.length >= 2 ? nameParts[0] : '';
      const lastName  = nameParts[nameParts.length - 1];
      payload.domain = cleanedDomain;
      if (firstName) payload.first_name = firstName;
      payload.last_name = lastName;
      const title = `${fullName.trim()} — ${cleanedDomain}`;
      setModalTitle(title);
      lastTitleRef.current = title;
    }

    setLoading(true);
    setProbeActive(false);
    setResults(null);
    setV3Result(null);
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

      // Handle probe timeout error
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

  // Helper to show cleaned domain preview
  function DomainPreview({ raw, cleaned }: { raw: string; cleaned: string }) {
    if (!cleaned || !raw.trim() || cleaned === raw.trim().toLowerCase()) return null;
    return (
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4, marginLeft: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--green)' }}>{cleaned}</span>
      </div>
    );
  }

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
                onBlur={e => validateField('ico', e.target.value)}
                error={fieldErrors.ico}
                style={{ fontFamily: 'JetBrains Mono, monospace' }} />
              <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: '4px 0 0 2px' }}>
                Povinné — IČO slouží k vyhledání jednatele v ARES
              </p>
            </div>
            <div>
              <GlassInput label="Web" placeholder="firma.cz nebo https://www.firma.cz/kontakt" value={websiteIco}
                onChange={e => setWebsiteIco(e.target.value)}
                onBlur={e => validateField('websiteIco', e.target.value)}
                error={fieldErrors.websiteIco} />
              <DomainPreview raw={websiteIco} cleaned={cleanedIcoDomain} />
            </div>
          </div>
        )}

        {mode === 'name' && (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
            <GlassInput label="Celé jméno" placeholder="Jan Novák" value={fullName}
              onChange={e => setFullName(e.target.value)}
              onBlur={e => validateField('fullName', e.target.value)}
              error={fieldErrors.fullName} />
            <div>
              <GlassInput label="Doména nebo URL" placeholder="firma.cz nebo https://firma.cz" value={websiteName}
                onChange={e => setWebsiteName(e.target.value)}
                onBlur={e => validateField('websiteName', e.target.value)}
                error={fieldErrors.websiteName} />
              <DomainPreview raw={websiteName} cleaned={cleanedNameDomain} />
            </div>
          </div>
        )}

        {mode === 'verify' && (
          <GlassInput
            label="E-mailová adresa"
            placeholder="jan.novak@firma.cz"
            value={verifyEmail}
            onChange={e => setVerifyEmail(e.target.value)}
            onBlur={e => validateField('verifyEmail', e.target.value)}
            error={fieldErrors.verifyEmail}
            type="email"
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          />
        )}

        {mode === 'probe' && (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
            <GlassInput label="Celé jméno" placeholder="Jan Novák" value={fullName}
              onChange={e => setFullName(e.target.value)}
              onBlur={e => validateField('fullName', e.target.value)}
              error={fieldErrors.fullName} />
            <div>
              <GlassInput label="Doména nebo URL" placeholder="firma.cz nebo https://firma.cz" value={websiteName}
                onChange={e => setWebsiteName(e.target.value)}
                onBlur={e => validateField('websiteName', e.target.value)}
                error={fieldErrors.websiteName} />
              <DomainPreview raw={websiteName} cleaned={cleanedNameDomain} />
            </div>
          </div>
        )}

        {mode === 'bulk' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '8px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 6 }}>
              CSV formát: <code>first_name, last_name, domain</code> (nebo <code>name, domain</code>)
            </div>
            <input type="file" accept=".csv,text/csv" onChange={handleBulkFile} style={{ fontSize: 13 }} />
            {bulkRows.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--green)' }}>
                Připraveno {bulkRows.length} řádků ke zpracování
              </div>
            )}
          </div>
        )}

        {mode !== 'bulk' ? (
          <GlassButton variant="primary" type="submit" disabled={loading} style={{ marginTop: 4 }}>
            {loading
              ? loadingText
              : (mode === 'probe' ? 'Sondovat →' : mode === 'verify' ? 'Ověřit →' : 'Hledat →')}
          </GlassButton>
        ) : (
          <GlassButton variant="primary" type="button" onClick={handleBulkRun} disabled={bulkRunning || bulkRows.length === 0} style={{ marginTop: 4 }}>
            {bulkRunning ? `Hledám... ${bulkProgress.done}/${bulkProgress.total}` : `Spustit hromadné hledání (${bulkRows.length})`}
          </GlassButton>
        )}
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

      {/* V3 Results (ICO mode) */}
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

      {/* Inline results (v2 — name/verify/probe modes) */}
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
                  if (entry.isV3) {
                    setV3Result(entry.result as V3Result);
                    setResults(null);
                  } else {
                    setResults(entry.result as FinderResult);
                    setV3Result(null);
                  }
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
                  {entry.title || (entry.isV3 ? (entry.result as V3Result).domain : (entry.result as FinderResult).domain)}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                  {entry.isV3 ? `${(entry.result as V3Result).total_found} výsl.` : `${(entry.result as FinderResult).total} výsl.`}
                </span>
                {!entry.isV3 && (entry.result as FinderResult).method && <MethodBadge method={(entry.result as FinderResult).method!} />}
                <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'JetBrains Mono, monospace' }}>
                  {formatTime(new Date(entry.timestamp).toISOString())}
                </span>
              </button>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Bulk results */}
      {bulkResults.length > 0 && (
        <GlassCard style={{ marginTop: 16, padding: isMobile ? 12 : 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                Hromadné výsledky ({bulkResults.filter(r => r.result && r.result.total > 0).length}/{bulkResults.length} nalezeno)
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <GlassButton variant="primary" onClick={() => handleBulkSave(true)} style={{ fontSize: 12 }}>
                  Uložit jen s e-mailem
                </GlassButton>
                <GlassButton variant="secondary" onClick={() => handleBulkSave(false)} style={{ fontSize: 12 }}>
                  Uložit vše
                </GlassButton>
              </div>
            </div>
            <div style={{ overflowX: 'auto', borderRadius: 6, border: '1px solid var(--border)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <th style={TH}>Jméno</th>
                    <th style={TH}>Doména</th>
                    <th style={TH}>Nalezený e-mail</th>
                    <th style={TH}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bulkResults.map((entry, i) => {
                    const best = entry.result?.candidates?.find(c => c.status === 'valid' || c.status === 'likely_valid')
                      || entry.result?.candidates?.[0];
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 12px', color: 'var(--text)' }}>{entry.row.first_name} {entry.row.last_name}</td>
                        <td style={{ padding: '8px 12px', color: 'var(--text-dim)', fontFamily: 'JetBrains Mono, monospace' }}>{entry.row.domain}</td>
                        <td style={{ padding: '8px 12px', fontFamily: 'JetBrains Mono, monospace', color: best ? 'var(--text)' : 'var(--text-muted)' }}>
                          {best?.email || (entry.error ? 'Chyba' : '—')}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          {best ? <StatusBadge status={best.status} /> : entry.error ? (
                            <span style={{ color: '#f87171', fontSize: 11 }}>{entry.error}</span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Nenalezeno</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
