import { useState } from 'react';
import GlassCard from '@/components/glass/GlassCard';
import GlassButton from '@/components/glass/GlassButton';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import { useVerifyCandidate, useUnverifyCandidate } from '@/hooks/useLeads';
import { toast } from 'sonner';
import type { EmailCandidate } from '@/types/database';

interface EmailCandidatesTableProps {
  candidates: EmailCandidate[];
  leadId: string;
  leadStatus?: string;
  leadDomain?: string | null;
}

const SEZNAM_BADGE: Record<string, { label: string; color: string }> = {
  likely_valid: { label: 'pravděp. platný', color: '#3ecf8e' },
  bounced:      { label: 'vráceno',         color: '#f87171' },
  sent:         { label: 'odesláno test',   color: '#fb923c' },
  pending:      { label: 'čeká',            color: '#71717a' },
};

function sortCandidates(cs: EmailCandidate[]): EmailCandidate[] {
  return [...cs].sort((a, b) => {
    // Verified first
    if (a.is_verified && !b.is_verified) return -1;
    if (!a.is_verified && b.is_verified) return 1;
    // Then catch-all sorted by confidence rank
    if (a.is_catch_all && b.is_catch_all) {
      const ra = parseInt(a.catch_all_confidence ?? '99', 10);
      const rb = parseInt(b.catch_all_confidence ?? '99', 10);
      return ra - rb;
    }
    if (a.is_catch_all && !b.is_catch_all) return -1;
    if (!a.is_catch_all && b.is_catch_all) return 1;
    return 0;
  });
}

export default function EmailCandidatesTable({ candidates, leadId, leadStatus, leadDomain }: EmailCandidatesTableProps) {
  const [confirmUnverify, setConfirmUnverify] = useState<string | null>(null);
  const [confirmForce, setConfirmForce]       = useState<string | null>(null);
  const verifyCand   = useVerifyCandidate();
  const unverifyCand = useUnverifyCandidate();

  const sorted = sortCandidates(candidates);
  const isNeedsReview = leadStatus === 'needs_review';
  const domain = leadDomain ?? (candidates[0]?.email_address?.split('@')[1] ?? null);

  async function handleVerify(c: EmailCandidate) {
    try {
      await verifyCand.mutateAsync({ id: c.id, leadId });
      toast.success(`${c.email_address} ověřen, lead přesunut do Připraven`);
    } catch {
      toast.error('Chyba při ověřování', { duration: 8000 });
    }
  }

  async function handleUnverify(id: string) {
    try {
      await unverifyCand.mutateAsync({ id, leadId });
      toast.success('Ověření zrušeno');
    } catch {
      toast.error('Chyba při rušení ověření', { duration: 8000 });
    }
    setConfirmUnverify(null);
  }

  async function handleForceVerify(c: EmailCandidate) {
    try {
      await verifyCand.mutateAsync({ id: c.id, leadId });
      toast.success(`${c.email_address} ručně ověřen`);
    } catch {
      toast.error('Chyba při ověřování', { duration: 8000 });
    }
    setConfirmForce(null);
  }

  return (
    <>
      <GlassCard padding={20}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>
          E-mailové kandidáty ({candidates.length})
        </h3>

        {isNeedsReview && domain && (
          <div style={{
            marginBottom: 16,
            padding: '12px 14px',
            background: 'rgba(251,146,60,0.08)',
            border: '1px solid rgba(251,146,60,0.25)',
            borderRadius: 8,
            fontSize: 13,
            color: '#fb923c',
            lineHeight: 1.5,
          }}>
            Doména <strong>{domain}</strong> přijímá všechny emaily (catch-all). Nelze automaticky ověřit,
            která schránka skutečně existuje. Emaily jsou seřazeny podle pravděpodobnosti — vyberte jeden
            a klikněte &ldquo;Ověřit&rdquo;.
          </div>
        )}

        {!candidates.length ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>Žádné e-mailové adresy</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Email', 'Typ', 'Jistota', 'Seznam', 'Ověřeno', 'Vzor', 'Akce'].map(h => (
                    <th key={h} style={{
                      padding: '7px 10px', textAlign: 'left', fontSize: 10,
                      fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase',
                      color: 'var(--text-muted)', whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map(c => {
                  const sz  = SEZNAM_BADGE[c.seznam_status ?? 'pending'] ?? SEZNAM_BADGE.pending;
                  const isCatchAll = c.is_catch_all === true;
                  const isVerified = c.is_verified === true;

                  return (
                    <tr
                      key={c.id}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: isVerified
                          ? 'rgba(62,207,142,0.04)'
                          : isCatchAll
                            ? 'rgba(251,146,60,0.03)'
                            : undefined,
                        borderLeft: isVerified
                          ? '3px solid rgba(62,207,142,0.5)'
                          : isCatchAll
                            ? '3px solid rgba(251,146,60,0.4)'
                            : '3px solid transparent',
                      }}
                    >
                      {/* Email */}
                      <td style={{ padding: '10px 10px', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text)', whiteSpace: 'nowrap' }}>
                        {c.email_address}
                      </td>

                      {/* Typ */}
                      <td style={{ padding: '10px 10px', whiteSpace: 'nowrap' }}>
                        {c.type ? (
                          <span style={{
                            display: 'inline-block',
                            padding: '1px 7px',
                            borderRadius: 4,
                            fontSize: 10,
                            fontWeight: 600,
                            background: c.type === 'jednatel' ? 'rgba(62,207,142,0.1)' : c.type === 'generic' ? 'rgba(34,211,238,0.1)' : 'rgba(168,85,247,0.1)',
                            color: c.type === 'jednatel' ? '#3ecf8e' : c.type === 'generic' ? '#22d3ee' : '#a855f7',
                            border: `1px solid ${c.type === 'jednatel' ? 'rgba(62,207,142,0.25)' : c.type === 'generic' ? 'rgba(34,211,238,0.25)' : 'rgba(168,85,247,0.25)'}`,
                          }}>
                            {c.type === 'jednatel' ? 'jednatel' : c.type === 'generic' ? 'generic' : 'staff'}
                          </span>
                        ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>

                      {/* Jistota */}
                      <td style={{ padding: '10px 10px', fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {c.confidence === 'direct_hit' ? '★ přímý' :
                         c.confidence === 'name_match' ? '◆ jméno' :
                         c.confidence === 'pattern_match' ? '◇ vzor' :
                         c.confidence === 'combo' ? '· combo' :
                         c.confidence === 'unknown_person' ? '? osoba' :
                         '—'}
                      </td>

                      {/* Seznam */}
                      <td style={{ padding: '10px 10px', whiteSpace: 'nowrap', color: sz.color, fontSize: 11 }}>
                        {sz.label}
                      </td>

                      {/* Ověřeno */}
                      <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                        {isVerified
                          ? <span style={{ color: '#3ecf8e', fontWeight: 700 }}>✓</span>
                          : <span style={{ color: '#f87171' }}>✗</span>}
                      </td>

                      {/* Vzor (catch-all confidence) */}
                      <td style={{ padding: '10px 10px', fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {c.catch_all_confidence ?? '—'}
                      </td>

                      {/* Akce */}
                      <td style={{ padding: '10px 10px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          {/* Ověřit — for catch_all candidates */}
                          {isCatchAll && !isVerified && (
                            <GlassButton
                              size="sm"
                              variant="primary"
                              style={{ background: 'rgba(251,146,60,0.15)', borderColor: 'rgba(251,146,60,0.35)', color: '#fb923c', fontSize: 11 }}
                              onClick={() => handleVerify(c)}
                              disabled={verifyCand.isPending}
                            >
                              Ověřit
                            </GlassButton>
                          )}

                          {/* Zrušit — for verified candidates */}
                          {isVerified && (
                            <GlassButton
                              size="sm"
                              variant="secondary"
                              style={{ fontSize: 11 }}
                              onClick={() => setConfirmUnverify(c.id)}
                              disabled={unverifyCand.isPending}
                            >
                              Zrušit
                            </GlassButton>
                          )}

                          {/* Přesto ověřit — for unverified non-catch-all candidates */}
                          {!isCatchAll && !isVerified && (
                            <GlassButton
                              size="sm"
                              variant="secondary"
                              style={{ fontSize: 11, color: '#f87171' }}
                              onClick={() => setConfirmForce(c.id)}
                              disabled={verifyCand.isPending}
                            >
                              Přesto ověřit
                            </GlassButton>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {/* Confirm unverify dialog */}
      <ConfirmDialog
        open={!!confirmUnverify}
        title="Zrušit ověření?"
        message="Email bude označen jako neověřený. Lead může být přesunut zpět do stavu 'čeká na kontrolu' nebo 'selhalo'."
        confirmLabel="Zrušit ověření"
        variant="danger"
        onConfirm={() => confirmUnverify && handleUnverify(confirmUnverify)}
        onClose={() => setConfirmUnverify(null)}
      />

      {/* Confirm force-verify dialog */}
      <ConfirmDialog
        open={!!confirmForce}
        title="Ověřit neplatný email?"
        message="Tento email byl označen jako neplatný. Opravdu ho chcete ručně ověřit a použít pro oslovení?"
        confirmLabel="Ručně ověřit"
        variant="danger"
        onConfirm={() => {
          const c = candidates.find(x => x.id === confirmForce);
          if (c) handleForceVerify(c);
        }}
        onClose={() => setConfirmForce(null)}
      />
    </>
  );
}
