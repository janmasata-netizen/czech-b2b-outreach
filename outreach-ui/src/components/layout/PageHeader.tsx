import { type ReactNode } from 'react';
import useMobile from '@/hooks/useMobile';

interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

export default function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  const isMobile = useMobile();

  return (
    <div style={{
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      alignItems: isMobile ? 'flex-start' : 'flex-start',
      justifyContent: 'space-between',
      gap: isMobile ? 12 : 0,
      paddingBottom: isMobile ? 14 : 20,
      marginBottom: isMobile ? 14 : 20,
      borderBottom: '1px solid var(--border)',
    }}>
      <div>
        <h1 style={{ fontSize: isMobile ? 16 : 18, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: subtitle ? 3 : 0 }}>
          {title}
        </h1>
        {subtitle && (
          <div style={{ fontSize: isMobile ? 12 : 13, color: 'var(--text-dim)', marginTop: 2 }}>
            {subtitle}
          </div>
        )}
      </div>
      {actions && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {actions}
        </div>
      )}
    </div>
  );
}
