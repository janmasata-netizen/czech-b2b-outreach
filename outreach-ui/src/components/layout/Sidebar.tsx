import { useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import {
  LayoutDashboard, Users, Send, Search, Database, RefreshCcw,
  Building2, UserCheck, UserCog, Mail,
  Key, FileText, X, Activity,
  LayoutList, Zap, Archive, AlertTriangle, CircleCheck, Plus, Ban, Upload,
  Hash, UserSearch, MailCheck, Radar, Globe,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TOP_H } from './TopBar';
import { useMobileNav } from '@/hooks/useMobileNav';
import { useAuthContext } from '@/components/AuthProvider';

type SubItem = { label: string; to: string; tabParam?: string; defaultTab?: true; Icon: React.ElementType };

const W_COLLAPSED = 44;
const W_EXPANDED  = 216;
const MOBILE_W    = 280;
const DURATION    = '0.44s';
const EASE        = 'cubic-bezier(0.4,0,0.2,1)';

export default function Sidebar() {
  const location = useLocation();
  const [sp]     = useSearchParams();
  const [hover, setHover] = useState(false);
  const { isMobile, sidebarOpen, closeSidebar } = useMobileNav();
  const { profile } = useAuthContext();
  const { t } = useTranslation();
  const isAdmin = profile?.is_admin === true;

  const DATA_ITEMS = [
    { to: '/prehled',      label: t('nav.dashboard'),  Icon: LayoutDashboard, exact: true  },
    { to: '/databaze',     label: t('nav.database'),   Icon: Database,        exact: false },
    { to: '/leady',        label: t('nav.leads'),      Icon: Users,           exact: false },
  ];

  const ACTION_ITEMS = [
    { to: '/vlny',         label: t('nav.waves'),      Icon: Send,            exact: false },
    { to: '/sablony',     label: t('nav.templates'),  Icon: FileText,        exact: true  },
    { to: '/retarget',     label: t('nav.retarget'),   Icon: RefreshCcw,      exact: true  },
  ];

  const PEOPLE_ITEMS = [
    { to: '/nastaveni/tymy',       label: t('nav.teams'),             Icon: Building2, exact: true },
    { to: '/nastaveni/obchodnici', label: t('nav.salesmen'),          Icon: UserCheck, exact: true },
    { to: '/nastaveni/ucty',       label: t('nav.outreachAccounts'), Icon: Mail,      exact: true },
    { to: '/nastaveni/uzivatele',  label: t('nav.users'),             Icon: UserCog,   exact: true },
  ];

  const CONFIG_ITEMS = [
    { to: '/nastaveni/api-klice', label: t('nav.apiKeys'),     Icon: Key,      exact: true },
    { to: '/email-finder',        label: t('nav.emailFinder'), Icon: Search,   exact: false },
    { to: '/system',              label: t('nav.system'),      Icon: Activity,  exact: true  },
  ];

  const LEAD_SUBS: SubItem[] = [
    { label: t('sub.all'),            to: '/leady', defaultTab: true,        Icon: Users         },
    { label: t('sub.emailDiscovery'), to: '/leady', tabParam: 'discovery',   Icon: Search        },
    { label: t('sub.ready'),          to: '/leady', tabParam: 'ready',        Icon: CircleCheck   },
    { label: t('sub.problematic'),    to: '/leady', tabParam: 'problematic',  Icon: AlertTriangle },
  ];
  const WAVE_SUBS: SubItem[] = [
    { label: t('sub.manager'), to: '/vlny', defaultTab: true,    Icon: LayoutList },
    { label: t('sub.live'),    to: '/vlny', tabParam: 'live',    Icon: Zap        },
    { label: t('sub.archive'), to: '/vlny', tabParam: 'archive', Icon: Archive    },
  ];
  const DB_SUBS: SubItem[] = [
    { label: t('sub.all'),        to: '/databaze', defaultTab: true,       Icon: Database      },
    { label: t('sub.active'),     to: '/databaze', tabParam: 'active',     Icon: CircleCheck   },
    { label: t('sub.blacklist'),  to: '/databaze', tabParam: 'blacklist',  Icon: Ban           },
    { label: t('sub.archived'),   to: '/databaze', tabParam: 'archived',   Icon: Archive       },
  ];
  const FINDER_SUBS: SubItem[] = [
    { label: t('sub.byIco'),       to: '/email-finder', defaultTab: true,      Icon: Hash       },
    { label: t('sub.byName'),      to: '/email-finder', tabParam: 'name',      Icon: UserSearch },
    { label: t('sub.verifyEmail'), to: '/email-finder', tabParam: 'verify',    Icon: MailCheck  },
    { label: t('sub.directProbe'), to: '/email-finder', tabParam: 'probe',     Icon: Radar      },
    { label: t('sub.bulk'),        to: '/email-finder', tabParam: 'bulk',      Icon: Upload      },
    { label: t('sub.discoverDomain'), to: '/email-finder', tabParam: 'discover', Icon: Globe     },
  ];

  const open = isMobile ? sidebarOpen : hover;

  const textStyle = (): React.CSSProperties => ({
    whiteSpace: 'nowrap',
    maxWidth: open ? 200 : 0,
    overflow: 'hidden',
    opacity: open ? 1 : 0,
    transition: `max-width ${DURATION} ${EASE}, opacity 0.2s ease ${open ? '0.05s' : '0s'}`,
    pointerEvents: 'none',
  });

  const handleNav = () => {
    if (isMobile) closeSidebar();
  };

  const navLink = ({ to, label, Icon, exact }: { to: string; label: string; Icon: React.ElementType; exact: boolean }) => {
    const active = exact ? location.pathname === to : location.pathname.startsWith(to);
    return (
      <Link
        key={to}
        to={to}
        onClick={handleNav}
        title={!open ? label : undefined}
        className={`nav-item${active ? ' active' : ''}`}
        style={{
          justifyContent: 'flex-start',
          padding: isMobile ? '10px 12px 10px 14px' : '5px 8px 5px 9px',
          gap: open ? 8 : 0,
          transition: `gap ${DURATION} ${EASE}`,
        }}
      >
        <Icon size={isMobile ? 16 : 13} strokeWidth={active ? 2.2 : 1.8} style={{ flexShrink: 0 }} />
        <span style={isMobile ? { whiteSpace: 'nowrap' } : textStyle()}>{label}</span>
      </Link>
    );
  };

  const divider = (
    <div style={{ height: 1, background: 'var(--border-strong)', margin: isMobile ? '8px 14px' : '6px 14px', flexShrink: 0 }} />
  );

  /* Mobile: check if we're on a page that has sub-items */
  const onLeads  = location.pathname.startsWith('/leady');
  const onWaves  = location.pathname.startsWith('/vlny');
  const onDb     = location.pathname.startsWith('/databaze');
  const onFinder = location.pathname.startsWith('/email-finder');
  const showLeadSubs   = isMobile && onLeads;
  const showWaveSubs   = isMobile && onWaves;
  const showDbSubs     = isMobile && onDb;
  const showFinderSubs = isMobile && onFinder;

  function isSubActive(item: SubItem): boolean {
    const tabVal = sp.get('tab');
    const allItems = onLeads ? LEAD_SUBS : onWaves ? WAVE_SUBS : onFinder ? FINDER_SUBS : DB_SUBS;
    const isSubRoute = location.pathname.startsWith(item.to + '/');
    // Sub-routes (e.g. /leady/skupiny/:id) belong to discovery tab
    if (isSubRoute && item.tabParam === 'discovery' && location.pathname.startsWith(item.to + '/skupiny/')) {
      return true;
    }
    if (item.tabParam) return location.pathname === item.to && tabVal === item.tabParam;
    if (item.defaultTab) {
      if (location.pathname !== item.to && !isSubRoute) return false;
      if (location.pathname === item.to) {
        const siblings = allItems.filter(x => x.tabParam);
        return !siblings.some(s => sp.get('tab') === s.tabParam);
      }
      return false;
    }
    return location.pathname === item.to;
  }

  function subItemHref(item: SubItem) {
    return item.tabParam ? `${item.to}?tab=${item.tabParam}` : item.to;
  }

  type ActionBtn = { label: string; href: string; Icon?: React.ElementType };

  const renderSubItems = (items: SubItem[], title: string, actions?: ActionBtn[]) => (
    <div style={{ paddingLeft: 16, paddingRight: 8, paddingBottom: 4 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'var(--text-muted)', padding: '8px 0 4px 14px',
      }}>
        {title}
      </div>
      {actions && actions.map(act => {
        const BtnIcon = act.Icon ?? Plus;
        return (
          <Link
            key={act.label}
            to={act.href}
            onClick={handleNav}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 14px', margin: '0 0 4px', borderRadius: 6,
              border: '1px solid var(--border)', background: 'var(--bg-surface)',
              color: 'var(--text-dim)', fontSize: 12, fontWeight: 500, textDecoration: 'none',
            }}
          >
            <BtnIcon size={12} strokeWidth={2} /> {act.label}
          </Link>
        );
      })}
      {items.map(item => {
        const active = isSubActive(item);
        const { Icon } = item;
        return (
          <Link
            key={item.label}
            to={subItemHref(item)}
            onClick={handleNav}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 14px', fontSize: 12, fontWeight: active ? 500 : 400,
              color: active ? 'var(--text)' : 'var(--text-dim)',
              textDecoration: 'none', borderRadius: 5,
              background: active ? 'rgba(62,207,142,0.06)' : 'transparent',
              borderLeft: active ? '2px solid var(--green)' : '2px solid transparent',
            }}
          >
            <Icon size={12} strokeWidth={active ? 2.2 : 1.7} style={{ flexShrink: 0, color: active ? 'var(--green)' : 'inherit' }} />
            {item.label}
          </Link>
        );
      })}
    </div>
  );

  /* ── Mobile drawer ─────────────────────────────────────────── */
  if (isMobile) {
    return (
      <>
        {/* Backdrop */}
        {sidebarOpen && (
          <div
            onClick={closeSidebar}
            style={{
              position: 'fixed', inset: 0,
              top: TOP_H,
              background: 'rgba(0,0,0,0.6)',
              zIndex: 199,
              WebkitTapHighlightColor: 'transparent',
            }}
          />
        )}

        {/* Drawer */}
        <aside
          style={{
            position: 'fixed',
            left: 0,
            top: TOP_H,
            height: `calc(100vh - ${TOP_H}px)`,
            width: MOBILE_W,
            background: 'var(--bg-sidebar)',
            borderRight: '1px solid var(--border)',
            zIndex: 200,
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            overflowX: 'hidden',
            transform: sidebarOpen ? 'translateX(0)' : `translateX(-${MOBILE_W + 1}px)`,
            transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {/* Close button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 10px 0' }}>
            <button
              onClick={closeSidebar}
              aria-label="Close menu"
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 6,
                borderRadius: 6, color: 'var(--text-dim)', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <X size={18} />
            </button>
          </div>

          <nav style={{ flex: 1, padding: '4px 0 20px', display: 'flex', flexDirection: 'column', gap: 1 }}>
            {DATA_ITEMS.map(item => (
              <div key={item.to}>
                {navLink(item)}
                {item.to === '/databaze' && showDbSubs && renderSubItems(DB_SUBS, t('sub.status'), [{ label: t('subActions.addRecord'), href: '/databaze?new=1' }])}
                {item.to === '/leady' && showLeadSubs && renderSubItems(LEAD_SUBS, t('sub.filters'), [
                  { label: t('subActions.addLead'), href: '/leady?new=1' },
                  { label: t('subActions.import'), href: '/leady?action=import', Icon: Upload },
                ])}
              </div>
            ))}
            {divider}
            {ACTION_ITEMS.map(item => (
              <div key={item.to}>
                {navLink(item)}
                {item.to === '/vlny' && showWaveSubs && renderSubItems(WAVE_SUBS, t('sub.display'), [{ label: t('subActions.newWave'), href: '/vlny?new=1' }])}
              </div>
            ))}
            {isAdmin && (
              <>
                {divider}
                {PEOPLE_ITEMS.map(item => navLink(item))}
                {divider}
                {CONFIG_ITEMS.map(item => (
                  <div key={item.to}>
                    {navLink(item)}
                    {item.to === '/email-finder' && showFinderSubs && renderSubItems(FINDER_SUBS, t('sub.mode'))}
                  </div>
                ))}
              </>
            )}
          </nav>
        </aside>
      </>
    );
  }

  /* ── Desktop sidebar (unchanged behavior) ──────────────────── */
  return (
    <aside
      className="glass-sidebar"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'fixed',
        left: 0,
        top: TOP_H,
        height: `calc(100vh - ${TOP_H}px)`,
        width: open ? W_EXPANDED : W_COLLAPSED,
        transition: `width ${DURATION} ${EASE}, box-shadow ${DURATION} ease`,
        boxShadow: open ? '4px 0 32px rgba(0,0,0,0.55)' : 'none',
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <nav style={{ flex: 1, padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 1, overflow: 'hidden' }}>
        {DATA_ITEMS.map(item => navLink(item))}
        {divider}
        {ACTION_ITEMS.map(item => navLink(item))}
        {isAdmin && (
          <>
            {divider}
            {PEOPLE_ITEMS.map(item => navLink(item))}
            {divider}
            {CONFIG_ITEMS.map(item => navLink(item))}
          </>
        )}
      </nav>
    </aside>
  );
}
