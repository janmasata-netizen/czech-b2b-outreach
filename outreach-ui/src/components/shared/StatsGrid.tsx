import { type ReactNode } from 'react';

interface StatsGridProps {
  children: ReactNode;
  cols?: number;
}

export default function StatsGrid({ children }: StatsGridProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
      {children}
    </div>
  );
}
