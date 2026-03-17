import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Users, LayoutList, Zap, Archive, AlertTriangle, Plus, Search, CircleCheck, Database, Ban, Upload,
  Hash, UserSearch, MailCheck, Radar, Globe, FileText, Layers, Activity, MessageSquare, ScrollText,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
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

function useSections(): Record<string, Section> {
  const { t } = useTranslation();
  return {
    '/leady': {
      title: t('nav.leads'),
      groups: [
        {
          items: [
            { label: t('sub.all'),            to: '/leady', defaultTab: true,        Icon: Users         },
            { label: t('sub.emailDiscovery'), to: '/leady', tabParam: 'discovery',   Icon: Search        },
            { label: t('sub.ready'),          to: '/leady', tabParam: 'ready',        Icon: CircleCheck   },
            { label: t('sub.problematic'),    to: '/leady', tabParam: 'problematic',  Icon: AlertTriangle },
          ],
        },
      ],
      actions: [
        { label: t('subActions.addLead'), href: '/leady?new=1' },
        { label: t('subActions.import'), href: '/leady?action=import', Icon: Upload },
      ],
    },

    '/vlny': {
      title: t('nav.waves'),
      groups: [
        {
          items: [
            { label: t('sub.manager'), to: '/vlny', defaultTab: true,    Icon: LayoutList },
            { label: t('sub.live'),    to: '/vlny', tabParam: 'live',    Icon: Zap        },
            { label: t('sub.archive'), to: '/vlny', tabParam: 'archive', Icon: Archive    },
          ],
        },
      ],
      actions: [{ label: t('subActions.newWave'), href: '/vlny?new=1' }],
    },

    '/databaze': {
      title: t('nav.database'),
      groups: [
        {
          items: [
            { label: t('sub.all'),       to: '/databaze', defaultTab: true,       Icon: Database    },
            { label: t('sub.active'),    to: '/databaze', tabParam: 'active',     Icon: CircleCheck },
            { label: t('sub.blacklist'), to: '/databaze', tabParam: 'blacklist',  Icon: Ban         },
            { label: t('sub.archived'),  to: '/databaze', tabParam: 'archived',   Icon: Archive     },
          ],
        },
      ],
      actions: [{ label: t('subActions.addRecord'), href: '/databaze?new=1' }],
    },

    '/sablony': {
      title: t('nav.templates'),
      groups: [
        {
          items: [
            { label: t('sub.emailTemplates'), to: '/sablony', defaultTab: true,       Icon: FileText },
            { label: t('sub.wavePresets'),    to: '/sablony', tabParam: 'presets',    Icon: Layers   },
          ],
        },
      ],
    },

    '/email-finder': {
      title: t('nav.emailFinder'),
      groups: [
        {
          items: [
            { label: t('sub.byIco'),       to: '/email-finder', defaultTab: true,      Icon: Hash       },
            { label: t('sub.byName'),      to: '/email-finder', tabParam: 'name',      Icon: UserSearch },
            { label: t('sub.verifyEmail'), to: '/email-finder', tabParam: 'verify',    Icon: MailCheck  },
            { label: t('sub.directProbe'), to: '/email-finder', tabParam: 'probe',     Icon: Radar      },
            { label: t('sub.discoverDomain'), to: '/email-finder', tabParam: 'discover', Icon: Globe      },
          ],
        },
      ],
    },

    '/system': {
      title: t('nav.system'),
      groups: [
        {
          items: [
            { label: t('systemSub.overview'),    to: '/system', defaultTab: true,          Icon: Activity       },
            { label: t('systemSub.monitoring'), to: '/system', tabParam: 'monitoring',   Icon: Zap            },
            { label: t('systemSub.reports'),    to: '/system', tabParam: 'reports',      Icon: MessageSquare  },
            { label: t('systemSub.logs'),       to: '/system', tabParam: 'logs',         Icon: ScrollText     },
          ],
        },
      ],
    },
  };
}

function getSectionFromMap(pathname: string, sections: Record<string, Section>): [string, Section] | null {
  for (const prefix of ['/leady', '/vlny', '/databaze', '/sablony', '/email-finder', '/system']) {
    if (pathname.startsWith(prefix)) return [prefix, sections[prefix]];
  }
  return null;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useHasSubPanel() {
  const location = useLocation();
  const sections = useSections();
  return getSectionFromMap(location.pathname, sections) !== null;
}

export default function SubPanel() {
  const location = useLocation();
  const [sp]     = useSearchParams();
  const navigate = useNavigate();
  const sections = useSections();
  const match    = getSectionFromMap(location.pathname, sections);

  if (!match) return null;
  const [, section] = match;

  const allItems = section.groups.flatMap(g => g.items);

  function isActive(item: SubItem): boolean {
    const tabVal = sp.get('tab');
    // Sub-routes (e.g. /leady/skupiny/:id) belong to a specific tab
    const isSubRoute = location.pathname.startsWith(item.to + '/');
    if (isSubRoute && item.tabParam === 'discovery' && location.pathname.startsWith(item.to + '/skupiny/')) {
      return true;
    }
    if (item.tabParam) {
      return location.pathname === item.to && tabVal === item.tabParam;
    }
    if (item.defaultTab) {
      if (location.pathname !== item.to && !isSubRoute) return false;
      if (location.pathname === item.to) {
        const siblings = allItems.filter(x => x.tabParam);
        return !siblings.some(s => sp.get('tab') === s.tabParam);
      }
      return false;
    }
    return location.pathname === item.to || isSubRoute;
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
