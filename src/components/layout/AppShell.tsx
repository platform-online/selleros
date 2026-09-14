import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useI18n } from '../../i18n';
import { useWorkspace } from '../../state/workspace';
import { useInsights } from '../../state/insights';
import { APP_VERSION } from '../../domain/defaults';
import { NAV_ITEMS, type NavItem } from './nav';
import { CommandPalette, type PaletteIntent } from './CommandPalette';
import { Button, Chip, Drawer } from '../ui/primitives';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import {
  IconBell,
  IconBox,
  IconCart,
  IconChart,
  IconClose,
  IconFile,
  IconGlobe,
  IconHandshake,
  IconHome,
  IconMegaphone,
  IconMenu,
  IconPlus,
  IconReport,
  IconSearch,
  IconSettings,
  IconSpark,
  IconTruck,
  IconUsers,
  IconWallet,
  IconWarehouse,
} from '../ui/icons';
import { db } from '../../db';

const ICONS: Record<NavItem['icon'], typeof IconHome> = {
  home: IconHome,
  chart: IconChart,
  cart: IconCart,
  box: IconBox,
  warehouse: IconWarehouse,
  users: IconUsers,
  truck: IconTruck,
  handshake: IconHandshake,
  megaphone: IconMegaphone,
  wallet: IconWallet,
  spark: IconSpark,
  report: IconReport,
  file: IconFile,
  settings: IconSettings,
};

const INTENT_ROUTE: Record<string, string> = {
  newProduct: '/products?new=1',
  newOrder: '/orders?new=1',
  newExpense: '/finance/expenses?new=1',
  newPurchase: '/inventory?newPurchase=1',
  newCustomer: '/customers?new=1',
  newSupplier: '/suppliers?new=1',
  newReturn: '/orders?newReturn=1',
  export: '/settings/export',
  backup: '/settings/data',
  import: '/settings/import',
};

export function AppShell() {
  const { t, lang } = useI18n();
  const { business, settings, data, run } = useWorkspace();
  const insights = useInsights();
  const navigate = useNavigate();
  const location = useLocation();

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    setNotifOpen(false);
  }, [location.pathname]);

  const onIntent = useCallback(
    (intent: PaletteIntent['intent']) => {
      const target = INTENT_ROUTE[intent];
      if (target) navigate(target);
    },
    [navigate],
  );

  const setNotificationState = useCallback(
    async (id: string, action: 'dismissed' | 'done' | 'snoozed') => {
      await run(async () => {
        await db.notificationStates.put({
          id,
          action,
          updatedAt: new Date().toISOString(),
          snoozedUntil: action === 'snoozed' ? addDaysISO(todayISO(), 3) : null,
        });
      });
    },
    [run],
  );

  const toggleLanguage = useCallback(async () => {
    if (!settings) return;
    await run(async () => {
      await db.settings.put({ ...settings, language: settings.language === 'en' ? 'bn' : 'en' });
    });
  }, [run, settings]);

  const notifications = (insights?.notifications ?? []).filter((n) => {
    const state = insights?.notificationStates.get(n.id);
    if (!state) return true;
    if (state.action === 'dismissed' || state.action === 'done') return false;
    if (state.action === 'snoozed' && state.snoozedUntil && state.snoozedUntil > todayISO()) return false;
    return true;
  });

  const mobileItems = NAV_ITEMS.filter((i) => i.mobile);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        {t('a11y.skipToContent')}
      </a>

      <aside className="app-sidebar" aria-label={t('a11y.sidebar')}>
        <div className="app-sidebar__brand">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <span>
            <span className="brand-name">SellerOS</span>
            <span className="brand-tag">{t('app.tagline')}</span>
          </span>
        </div>
        <nav className="app-sidebar__nav">
          {NAV_ITEMS.map((item) => {
            const Icon = ICONS[item.icon];
            return (
              <NavLink key={item.path} to={item.path} className="nav-link" end={item.path === '/'}>
                <span className="nav-link__icon">
                  <Icon size={17} />
                </span>
                {t(item.labelKey)}
              </NavLink>
            );
          })}
        </nav>
        <div className="app-sidebar__foot">
          <Link to="/settings" className="workspace-card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <span className="brand-mark" aria-hidden="true">
              {(business?.name ?? 'B').slice(0, 1).toUpperCase()}
            </span>
            <span style={{ minWidth: 0 }}>
              <span className="workspace-card__name">{business?.name ?? '—'}</span>
              <span className="workspace-card__meta">
                {settings?.currency} · v{APP_VERSION}
              </span>
            </span>
          </Link>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <button
            type="button"
            className="icon-btn only-mobile"
            aria-label={t('a11y.openMenu')}
            onClick={() => setMenuOpen(true)}
          >
            <IconMenu size={20} />
          </button>

          <div className="app-topbar__search">
            <button type="button" className="search-trigger" onClick={() => setPaletteOpen(true)}>
              <IconSearch size={15} />
              <span className="search-trigger__label">{t('search.placeholder')}</span>
              <span className="kbd hide-mobile">⌘K</span>
            </button>
          </div>

          <div className="topbar-actions">
            <span className={`offline-chip ${online ? 'offline-chip--online' : ''} hide-mobile`}>
              <span className="offline-chip__dot" aria-hidden="true" />
              {online ? t('app.online') : t('app.offline')}
            </span>
            <button
              type="button"
              className="icon-btn"
              aria-label={t('settings.language')}
              onClick={toggleLanguage}
              title={t('settings.language')}
            >
              <IconGlobe size={18} />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={t('notifications.title')}
              onClick={() => setNotifOpen(true)}
            >
              <IconBell size={18} />
              {notifications.length > 0 && (
                <span className="icon-btn__badge" aria-hidden="true">
                  {notifications.length > 9 ? '9+' : notifications.length}
                </span>
              )}
            </button>
          </div>
        </header>

        <main className="app-content" id="main">
          <ErrorBoundary
            title={t('error.title')}
            body={t('error.body')}
            retryLabel={t('error.retry')}
            homeLabel={t('error.dashboard')}
            detailLabel={t('error.details')}
            onHome={() => navigate('/')}
          >
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      <nav className="bottom-nav" aria-label={t('a11y.bottomNav')}>
        {mobileItems.map((item) => {
          const Icon = ICONS[item.icon];
          return (
            <NavLink key={item.path} to={item.path} className="bottom-nav__item" end={item.path === '/'}>
              <Icon size={19} />
              <span className="bottom-nav__label">{t(item.labelKey)}</span>
            </NavLink>
          );
        })}
        <button type="button" className="bottom-nav__item" onClick={() => setMenuOpen(true)}>
          <IconMenu size={19} />
          <span className="bottom-nav__label">{t('nav.more')}</span>
        </button>
      </nav>

      <button type="button" className="fab" onClick={() => navigate('/orders?new=1')}>
        <IconPlus size={18} />
        <span className="hide-mobile">{t('orders.new')}</span>
        <span className="sr-only">{t('orders.new')}</span>
      </button>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onIntent={onIntent} />

      <Drawer open={notifOpen} onClose={() => setNotifOpen(false)} title={t('notifications.title')}>
        {notifications.length === 0 ? (
          <div className="empty">
            <div className="empty__icon">
              <IconBell size={20} />
            </div>
            <div className="empty__title">{t('empty.notifications.title')}</div>
            <div className="empty__body">{t('empty.notifications.body')}</div>
          </div>
        ) : (
          notifications.map((n) => {
            const state = insights?.notificationStates.get(n.id);
            return (
              <article className={`notif ${state?.action === 'done' ? 'notif--done' : ''}`} key={n.id}>
                <div className="notif__head">
                  <Chip
                    tone={
                      n.priority === 'critical'
                        ? 'danger'
                        : n.priority === 'important'
                          ? 'warning'
                          : n.priority === 'opportunity'
                            ? 'success'
                            : 'info'
                    }
                  >
                    {t(`priority.${n.priority}`)}
                  </Chip>
                  <Chip tone="outline">{t(`notifications.category.${n.category}`)}</Chip>
                </div>
                <div className="notif__title">{n.title}</div>
                <p className="notif__body">{n.body}</p>
                <div className="notif__actions">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      navigate(n.to);
                      setNotifOpen(false);
                    }}
                  >
                    {t('common.viewAll')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setNotificationState(n.id, 'done')}>
                    {t('action.markDone')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setNotificationState(n.id, 'snoozed')}>
                    {t('action.snooze')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<IconClose size={13} />}
                    iconOnly
                    aria-label={t('action.dismiss')}
                    onClick={() => setNotificationState(n.id, 'dismissed')}
                  />
                </div>
              </article>
            );
          })
        )}
      </Drawer>

      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} title={t('nav.menu')}>
        <div className="sheet-menu">
          {NAV_ITEMS.map((item) => {
            const Icon = ICONS[item.icon];
            return (
              <Link key={item.path} to={item.path} className="sheet-menu__item">
                <Icon size={17} />
                {t(item.labelKey)}
              </Link>
            );
          })}
        </div>
        <hr className="divider" />
        <div className="row gap-2">
          <Chip tone="outline">{t('app.version')} {APP_VERSION}</Chip>
          <Chip tone={online ? 'success' : 'warning'} dot>
            {online ? t('app.online') : t('app.offline')}
          </Chip>
          <Chip tone="outline">{data ? `${data.orders.length} ${t('nav.orders').toLowerCase()}` : '—'}</Chip>
        </div>
        <p className="tiny muted mt-4">{t('data.ownershipNote')}</p>
        <p className="tiny muted mt-2" lang={lang === 'bn' ? 'bn' : 'en'}>
          {lang === 'bn' ? 'সব তথ্য এই ডিভাইসেই সংরক্ষিত।' : 'All data stays on this device.'}
        </p>
      </Drawer>
    </div>
  );
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(Date.parse(`${iso}T00:00:00Z`));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
