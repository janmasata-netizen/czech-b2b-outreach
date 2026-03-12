import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useLead, useUpdateLead } from '@/hooks/useLeads';
import PageHeader from '@/components/layout/PageHeader';
import GlassButton from '@/components/glass/GlassButton';
import GlassModal from '@/components/glass/GlassModal';
import GlassInput from '@/components/glass/GlassInput';
import LoadingSkeleton from '@/components/shared/LoadingSkeleton';
import EmptyState from '@/components/shared/EmptyState';
import LeadInfoCard from '@/components/leads/LeadInfoCard';
import ContactsCard from '@/components/leads/ContactsCard';
import EmailCandidatesTable from '@/components/leads/EmailCandidatesTable';
import EnrichmentTimeline from '@/components/leads/EnrichmentTimeline';
import CampaignHistory from '@/components/leads/CampaignHistory';
import LeadTagsCard from '@/components/database/LeadTagsCard';
import ContactMethodsCard from '@/components/database/ContactMethodsCard';
import Breadcrumb from '@/components/shared/Breadcrumb';
import { Building2 } from 'lucide-react';
import { toast } from 'sonner';

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: lead, isLoading, error } = useLead(id);
  const updateLead = useUpdateLead();
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ company_name: '', ico: '', website: '', domain: '' });

  if (isLoading) return <LoadingSkeleton />;
  if (error || !lead) return <EmptyState icon="◈" title="Lead nenalezen" action={<GlassButton onClick={() => navigate('/leady')}>← Zpět na leady</GlassButton>} />;

  function openEdit() {
    setEditForm({
      company_name: lead!.company_name ?? '',
      ico: lead!.ico ?? '',
      website: lead!.website ?? '',
      domain: lead!.domain ?? '',
    });
    setEditing(true);
  }

  async function handleSaveEdit() {
    if (!editForm.company_name) { toast.error('Zadejte název firmy', { duration: 8000 }); return; }
    try {
      await updateLead.mutateAsync({
        id: lead!.id,
        updates: {
          company_name: editForm.company_name || undefined,
          ico: editForm.ico || undefined,
          website: editForm.website || undefined,
          domain: editForm.domain || undefined,
        },
      });
      toast.success('Lead aktualizován');
      setEditing(false);
    } catch {
      toast.error('Chyba při ukládání', { duration: 8000 });
    }
  }

  const enrichmentError = lead.enrichment_error;
  const companyId = (lead as { company_id?: string }).company_id;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Breadcrumb items={[
        { label: 'Leady', to: '/leady' },
        { label: lead.company_name ?? 'Lead' },
      ]} />
      <PageHeader
        title={lead.company_name ?? 'Lead'}
        subtitle={lead.ico ? `IČO: ${lead.ico}` : undefined}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            {companyId && (
              <Link to={`/databaze/${companyId}`} style={{ textDecoration: 'none' }}>
                <GlassButton size="sm" variant="secondary">
                  <Building2 size={13} /> Firma
                </GlassButton>
              </Link>
            )}
            <GlassButton size="sm" variant="secondary" onClick={openEdit}>Upravit</GlassButton>
            <GlassButton variant="secondary" onClick={() => navigate('/leady')}>← Zpět</GlassButton>
          </div>
        }
      />

      {enrichmentError && (
        <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, fontSize: 13, color: '#ef4444' }}>
          <strong>Chyba obohacení:</strong> {enrichmentError}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <LeadInfoCard lead={lead} />
          <LeadTagsCard leadId={lead.id} />
          <ContactMethodsCard jednatels={lead.jednatels ?? []} />
          <ContactsCard contacts={lead.jednatels ?? []} />
          <EmailCandidatesTable
            candidates={lead.email_candidates ?? []}
            leadId={lead.id}
            leadStatus={lead.status}
            leadDomain={lead.domain ?? undefined}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <EnrichmentTimeline
            leadCreatedAt={lead.created_at ?? ''}
            companyName={lead.company_name ?? null}
            teamName={lead.team?.name ?? null}
            emailCandidates={lead.email_candidates ?? []}
            jednatels={lead.jednatels ?? []}
            waveLeads={lead.wave_leads ?? []}
            leadReplies={lead.lead_replies ?? []}
            enrichmentLog={lead.enrichment_log ?? []}
          />
          <CampaignHistory waveLeads={lead.wave_leads ?? []} />
        </div>
      </div>

      <GlassModal
        open={editing}
        onClose={() => setEditing(false)}
        title="Upravit lead"
        width={480}
        footer={
          <>
            <GlassButton variant="secondary" onClick={() => setEditing(false)}>Zrušit</GlassButton>
            <GlassButton variant="primary" onClick={handleSaveEdit} disabled={updateLead.isPending}>
              {updateLead.isPending ? 'Ukládám…' : 'Uložit'}
            </GlassButton>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <GlassInput
            label="Název firmy"
            value={editForm.company_name}
            onChange={e => setEditForm(f => ({ ...f, company_name: e.target.value }))}
            required
          />
          <GlassInput
            label="IČO"
            value={editForm.ico}
            onChange={e => setEditForm(f => ({ ...f, ico: e.target.value }))}
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          />
          <GlassInput
            label="Web"
            placeholder="www.firma.cz"
            value={editForm.website}
            onChange={e => setEditForm(f => ({ ...f, website: e.target.value }))}
          />
          <GlassInput
            label="Doména (pro email gen)"
            placeholder="firma.cz"
            value={editForm.domain}
            onChange={e => setEditForm(f => ({ ...f, domain: e.target.value }))}
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          />
        </div>
      </GlassModal>
    </div>
  );
}
