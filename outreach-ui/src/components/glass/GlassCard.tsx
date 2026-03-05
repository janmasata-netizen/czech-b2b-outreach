import { type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
  hoverable?: boolean;
  padding?: number | string;
}

export default function GlassCard({ children, className, style, onClick, hoverable = false, padding = 20 }: GlassCardProps) {
  return (
    <div
      className={cn(hoverable ? 'glass-card' : undefined, className)}
      onClick={onClick}
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding,
        cursor: onClick ? 'pointer' : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
