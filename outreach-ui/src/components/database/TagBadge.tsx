interface TagBadgeProps {
  name: string;
  color: string;
  onRemove?: () => void;
}

export default function TagBadge({ name, color, onRemove }: TagBadgeProps) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 500,
        background: `${color}22`, border: `1px solid ${color}55`, color,
        whiteSpace: 'nowrap', lineHeight: '18px',
      }}
    >
      {name}
      {onRemove && (
        <button
          onClick={e => { e.stopPropagation(); onRemove(); }}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            color, fontSize: 13, lineHeight: 1, display: 'flex', alignItems: 'center',
          }}
        >
          &times;
        </button>
      )}
    </span>
  );
}
