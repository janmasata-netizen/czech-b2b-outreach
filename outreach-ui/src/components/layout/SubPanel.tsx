import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Users, LayoutList, Zap, Archive, AlertTriangle, Plus, Search, CircleCheck, Database, Ban, Upload,
  Hash, UserSearch, MailCheck, Radar,
} from 'lucide-react';
import { TOP_H } from './TopBar';

export const ICON_W = 44;
export const SUB_W  = 220;

type SubItem = {
  label: string;
  to: string;
  tabParam?: string;
  defaultTab?: true;
  Icon: React.ElementType;
};

type SubGroup = { items: SubItem[] };

type ActionDef = { label: string; href: string; Icon?: React.ElementType };

type Section = {
  title: string;
  groups: SubGroup[];
  actions?: ActionDef[];
};

const SECTIONS: Record<string, Section> = {
  '/leady': {
    title: 'Leady',
    groups: [
      {
        items: [
          { label: 'Všechny',          to: '/leady', defaultTab: true,        Icon: Users         },
          { label: 'Hledání e-mailů',  to: '/leady', tabParam: 'discovery',   Icon: Search        },
          { label: 'Připraveni',       to: '/leady', tabParam: 'ready',        Icon: CircleCheck   },
          { label: 'Problémové',       to: '/leady', tabParam: 'problematic',  Icon: AlertTriangle },
        ],
      },
    ],
    actions: [
      { label: 'Přidat lead', href: '/leady?new=1' },
      { label: 'Importovat', href: '/leady?action=import', Icon: Upload },
    ],
  },

  '/vlny': {
    title: 'Vlny',
    groups: [
      {
        items: [
          { label: 'Manager', to: '/vlny', defaultTab: true,    Icon: LayoutList },
          { label: 'Live',    to: '/vlny', tabParam: 'live',    Icon: Zap        },
          { label: 'Archiv',  to: '/vlny', tabParam: 'archive', Icon: Archive    },
        ],
      },
    ],
    actions: [{ label: 'Nová vlna', href: '/vlny?new=1' }],
  },

  '/databaze': {
    title: 'Databáze',
    groups: [
      {
        items: [
          { label: 'Všechny',     to: '/databaze', defaultTab: true,       Icon: Database    },
          { label: 'Aktivní',     to: '/databaze', tabParam: 'active',     Icon: CircleCheck },
          { label: 'Blacklist',   to: '/databaze', tabParam: 'blacklist',  Icon: Ban         },
          { label: 'Archivováno', to: '/databaze', tabParam: 'archived',   Icon: Archive     },
        ],
      },
    ],
    actions: [{ label: 'Přidat záznam', href: '/databaze?new=1' }],
  },

  '/email-finder': {
    title: 'Email Finder',
    groups: [
      {
        items: [
          { label: 'Podle IČO',    to: '/email-finder', defaultTab: true,      Icon: Hash       },
          { label: 'Podle jména',   to: '/email-finder', tabParam: 'name',      Icon: UserSearch },
          { label: 'Ověřit e-mail', to: '/email-finder', tabParam: 'verify',    Icon: MailCheck  },
          { label: 'Přímá sonda',   to: '/email-finder', tabParam: 'probe',     Icon: Radar      },
        ],
      },
    ],
  },
};

function getSection(pathname: string): [string, Section] | null {
  for (const prefix of ['/leady', '/vlny', '/databaze', '/email-finder']) {
    if (pathname.startsWith(prefix)) return [prefix, SECTIONS[prefix]];
  }
  return null;
}

export function useHasSubPanel() {
  const location = useLocation();
  return getSection(location.pathname) !== null;
}

export default function SubPanel() {
  const location = useLocation();
  const [sp]     = useSearchParams();
  const navigate = useNavigate();
  const match    = getSection(location.pathname);

  if (!match) return null;
  const [, section] = match;

  const allItems = section.groups.flatMap(g => g.items);

  function isActive(item: SubItem): boolean {
    const tabVal = sp.get('tab');
    if (item.tabParam) {
      return location.pathname === item.to && tabVal === item.tabParam;
    }
    if (item.defaultTab) {
      if (location.pathname !== item.to && !location.pathname.startsWith(item.to + '/')) return false;
      if (location.pathname === item.to) {
        const siblings = allItems.filter(x => x.tabParam);
        return !siblings.some(s => sp.get('tab') === s.tabParam);
      }
      return false;
    }
    return location.pathname === item.to || location.pathname.startsWith(item.to + '/');
  }

  function itemHref(item: SubItem) {
    return item.tabParam ? `${item.to}?tab=${item.tabParam}` : item.to;
  }

  return (
    <aside
      style={{
        position: 'fixed',
        left: ICON_W,
        top: TOP_H,
        width: SUB_W,
        height: `calc(100vh - ${TOP_H}px)`,
        background: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 100,
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '16px 14px 10px',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        {section.title}
      </div>

      {/* Action buttons — sit right below the header */}
      {section.actions && section.actions.length > 0 && (
        <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {section.actions.map(act => {
            const BtnIcon = act.Icon ?? Plus;
            return (
              <button
                key={act.label}
                onClick={() => navigate(act.href)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  width: '100%', padding: '6px 10px', borderRadius: 6,
                  border: '1px solid var(--border)', background: 'var(--bg-surface)',
                  color: 'var(--text-dim)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                  transition: 'background 0.12s, color 0.12s, border-color 0.12s',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.style.background = 'var(--bg-muted)';
                  el.style.color = 'var(--text)';
                  el.style.borderColor = 'var(--border-strong)';
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.style.background = 'var(--bg-surface)';
                  el.style.color = 'var(--text-dim)';
                  el.style.borderColor = 'var(--border)';
                }}
                onFocus={e => {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.style.background = 'var(--bg-muted)';
                  el.style.color = 'var(--text)';
                  el.style.borderColor = 'var(--border-strong)';
                }}
                onBlur={e => {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.style.background = 'var(--bg-surface)';
                  el.style.color = 'var(--text-dim)';
                  el.style.borderColor = 'var(--border)';
                }}
              >
                <BtnIcon size={13} strokeWidth={2} />
                {act.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Nav */}
      <nav style={{ padding: '6px 0', flex: 1 }}>
        {section.groups.map((group, gi) => (
          <div key={gi}>
            {gi > 0 && <div style={{ height: 1, background: 'var(--border)', margin: '4px 14px' }} />}
            {group.items.map(item => {
              const active = isActive(item);
              const { Icon } = item;
              return (
                <Link
                  key={item.label}
                  to={itemHref(item)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    padding: '7px 14px',
                    fontSize: 13,
                    fontWeight: active ? 500 : 400,
                    color: active ? 'var(--text)' : 'var(--text-dim)',
                    textDecoration: 'none',
                    background: active ? 'rgba(62,207,142,0.06)' : 'transparent',
                    borderLeft: active ? '2px solid var(--green)' : '2px solid transparent',
                    transition: 'background 0.12s, color 0.12s',
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface)'; }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <Icon size={13} strokeWidth={active ? 2.2 : 1.7} style={{ flexShrink: 0, color: active ? 'var(--green)' : 'inherit' }} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

    </aside>
  );
}
