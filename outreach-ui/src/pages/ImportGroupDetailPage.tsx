import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useImportGroup } from '@/hooks/useImportGroups';
import ImportGroupDetail from '@/components/leads/ImportGroupDetail';
import StackedStatusBar from '@/components/shared/StackedStatusBar';
import Breadcrumb from '@/components/shared/Breadcrumb';
import PageHeader from '@/components/layout/PageHeader';
import LoadingSkeleton from '@/components/shared/LoadingSkeleton';

export default function ImportGroupDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: group, isLoading } = useImportGroup(id);

  if (isLoading) return <LoadingSkeleton />;

  if (!group) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>
        Import group not found.
      </div>
    );
  }

  return (
    <div>
      <Breadcrumb items={[
        { label: t('nav.leads'), to: '/leady' },
        { label: t('sub.emailDiscovery'), to: '/leady?tab=discovery' },
        { label: group.name },
      ]} />
      <PageHeader
        title={group.name}
        subtitle={`${group.total_leads} ${t('importGroups.leads')}`}
      />
      <StackedStatusBar group={group} height={14} showLegend showCounts />
      <div style={{ marginTop: 16 }}>
        <ImportGroupDetail group={group} onClose={() => navigate('/leady?tab=discovery')} />
      </div>
    </div>
  );
}
