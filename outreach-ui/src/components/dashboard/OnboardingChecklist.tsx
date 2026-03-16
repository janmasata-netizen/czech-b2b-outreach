import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import GlassCard from '@/components/glass/GlassCard';
import GlassButton from '@/components/glass/GlassButton';
import { Check, ArrowRight } from 'lucide-react';
import { useDemoMode } from '@/contexts/DemoModeContext';
import { DEMO_ONBOARDING_STATUS } from '@/lib/demo-data';

function useOnboardingStatus() {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ['onboarding-status'],
    queryFn: async () => {
      const [teams, templateSets, leads, waves] = await Promise.all([
        supabase.from('teams').select('id', { count: 'exact', head: true }),
        supabase.from('template_sets').select('id', { count: 'exact', head: true }),
        supabase.from('leads').select('id', { count: 'exact', head: true }),
        supabase.from('waves').select('id', { count: 'exact', head: true }),
      ]);
      return {
        hasTeam: (teams.count ?? 0) > 0,
        hasTemplateSet: (templateSets.count ?? 0) > 0,
        hasLeads: (leads.count ?? 0) > 0,
        hasWave: (waves.count ?? 0) > 0,
      };
    },
    enabled: !isDemoMode,
    ...(isDemoMode && { initialData: DEMO_ONBOARDING_STATUS }),
    staleTime: 60_000,
  });
}

const STEPS: { key: string; label: string; description: string; href: string }[] = [
  { key: 'hasTeam', label: 'Vytvořit tým', description: 'Nastavte tým pro organizaci leadů a obchodníků', href: '/nastaveni/tymy' },
  { key: 'hasTemplateSet', label: 'Vytvořit sadu šablon', description: 'Připravte e-mailové šablony pro vaše kampaně', href: '/nastaveni/sablony' },
  { key: 'hasLeads', label: 'Importovat leady', description: 'Přidejte leady ručně, z CSV nebo Google Sheets', href: '/leady' },
  { key: 'hasWave', label: 'Vytvořit první vlnu', description: 'Naplánujte a spusťte svou první outreach kampaň', href: '/vlny' },
];

export default function OnboardingChecklist() {
  const navigate = useNavigate();
  const { data: status, isLoading } = useOnboardingStatus();

  if (isLoading || !status) return null;

  const completedCount = STEPS.filter(s => status[s.key as keyof typeof status]).length;

  // All steps done — don't show
  if (completedCount === STEPS.length) return null;

  return (
    <GlassCard padding={20}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Nastavení systemu</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            Dokončete {STEPS.length - completedCount} z {STEPS.length} kroků pro spuštění kampaně
          </div>
        </div>
        <div style={{
          fontSize: 13, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace',
          color: 'var(--green)', background: 'rgba(62,207,142,0.1)',
          padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(62,207,142,0.25)',
        }}>
          {completedCount}/{STEPS.length}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 4, background: 'var(--bg-subtle)', borderRadius: 2, marginBottom: 16, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${(completedCount / STEPS.length) * 100}%`,
          background: 'var(--green)', borderRadius: 2, transition: 'width 0.3s ease',
        }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {STEPS.map(step => {
          const done = status[step.key as keyof typeof status];
          return (
            <div
              key={step.key}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px', borderRadius: 8,
                background: done ? 'rgba(62,207,142,0.04)' : 'var(--bg-subtle)',
                border: `1px solid ${done ? 'rgba(62,207,142,0.15)' : 'var(--border)'}`,
                opacity: done ? 0.7 : 1,
              }}
            >
              <div style={{
                width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: done ? 'rgba(62,207,142,0.15)' : 'var(--bg-surface)',
                border: `1px solid ${done ? 'rgba(62,207,142,0.3)' : 'var(--border)'}`,
                color: done ? 'var(--green)' : 'var(--text-muted)',
              }}>
                {done ? <Check size={14} strokeWidth={2.5} /> : <span style={{ fontSize: 11, fontWeight: 600 }}>{STEPS.indexOf(step) + 1}</span>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: 500,
                  color: done ? 'var(--text-muted)' : 'var(--text)',
                  textDecoration: done ? 'line-through' : 'none',
                }}>
                  {step.label}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{step.description}</div>
              </div>
              {!done && (
                <GlassButton size="sm" variant="secondary" onClick={() => navigate(step.href)}
                  style={{ flexShrink: 0, gap: 4, display: 'flex', alignItems: 'center' }}>
                  Nastavit <ArrowRight size={12} />
                </GlassButton>
              )}
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}
