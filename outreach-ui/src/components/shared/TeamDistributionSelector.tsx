import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { Team } from '@/types/database';
import { distributeEvenly, type TeamAllocation } from '@/lib/team-distribution';

interface TeamDistributionSelectorProps {
  teams: Team[];
  allocations: TeamAllocation[];
  onChange: (allocs: TeamAllocation[]) => void;
}

export default function TeamDistributionSelector({
  teams,
  allocations,
  onChange,
}: TeamDistributionSelectorProps) {
  const { t } = useTranslation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [dropdownOpen]);

  // Don't render if 0 or 1 team
  if (!teams || teams.length <= 1) return null;

  const selectedIds = new Set(allocations.map((a) => a.teamId));
  const sum = allocations.reduce((s, a) => s + a.percentage, 0);
  const sumValid = sum === 100;

  function toggleTeam(team: Team) {
    if (selectedIds.has(team.id)) {
      // Remove team
      const next = allocations.filter((a) => a.teamId !== team.id);
      if (next.length > 0) {
        onChange(distributeEvenly(next.map((a) => ({ id: a.teamId, name: a.teamName }))));
      } else {
        onChange([]);
      }
    } else {
      // Add team
      const newTeams = [
        ...allocations.map((a) => ({ id: a.teamId, name: a.teamName })),
        { id: team.id, name: team.name },
      ];
      onChange(distributeEvenly(newTeams));
    }
  }

  function setPercentage(teamId: string, pct: number) {
    onChange(allocations.map((a) => (a.teamId === teamId ? { ...a, percentage: pct } : a)));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-dim)' }}>
        {t('teamDistribution.label')}
      </label>

      {/* Dropdown trigger */}
      <div ref={wrapperRef} style={{ position: 'relative' }}>
        <div
          className="glass-input"
          onClick={() => setDropdownOpen((o) => !o)}
          style={{
            cursor: 'pointer',
            minHeight: 34,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 4,
            alignItems: 'center',
            padding: '4px 8px',
            fontSize: 13,
          }}
        >
          {allocations.length === 0 ? (
            <span style={{ color: 'var(--text-muted)' }}>{t('teamDistribution.selectTeams')}</span>
          ) : (
            allocations.map((a) => (
              <span
                key={a.teamId}
                style={{
                  background: 'rgba(99,102,241,0.15)',
                  color: 'var(--text)',
                  borderRadius: 4,
                  padding: '2px 8px',
                  fontSize: 12,
                  whiteSpace: 'nowrap',
                }}
              >
                {a.teamName}
              </span>
            ))
          )}
        </div>

        {/* Dropdown list */}
        {dropdownOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              zIndex: 50,
              marginTop: 4,
              background: 'var(--glass-bg, rgba(20,20,30,0.95))',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 4,
              maxHeight: 200,
              overflowY: 'auto',
            }}
          >
            {teams.map((team) => (
              <label
                key={team.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  cursor: 'pointer',
                  borderRadius: 4,
                  fontSize: 13,
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(team.id)}
                  onChange={() => toggleTeam(team)}
                  style={{ width: 14, height: 14, accentColor: 'var(--accent)' }}
                />
                <span style={{ color: 'var(--text)' }}>{team.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Percentage inputs — shown only when 2+ teams selected */}
      {allocations.length > 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {allocations.map((a) => (
            <div key={a.teamId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  fontSize: 12,
                  color: 'var(--text-dim)',
                  minWidth: 100,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {a.teamName}
              </span>
              <input
                type="number"
                className="glass-input"
                min={0}
                max={100}
                value={a.percentage}
                onChange={(e) => setPercentage(a.teamId, Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                style={{
                  width: 64,
                  height: 30,
                  fontSize: 12,
                  textAlign: 'center',
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              />
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>%</span>
            </div>
          ))}

          {/* Sum warning */}
          {!sumValid && (
            <div
              style={{
                fontSize: 12,
                color: '#fb923c',
                padding: '6px 10px',
                background: 'rgba(251,146,60,0.08)',
                border: '1px solid rgba(251,146,60,0.25)',
                borderRadius: 6,
              }}
            >
              {t('teamDistribution.sumWarning')} ({sum}%)
            </div>
          )}
        </div>
      )}
    </div>
  );
}
