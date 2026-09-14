import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../../i18n';
import { useWorkspace } from '../../state/workspace';
import { COMMAND_ACTIONS, NAV_ITEMS, type ActionDef } from './nav';
import { formatMoney } from '../../lib/format';
import { IconBox, IconCart, IconSearch, IconSpark, IconUsers, IconHandshake, IconWallet } from '../ui/icons';

export interface PaletteIntent {
  intent: NonNullable<ActionDef['intent']>;
}

/**
 * Global search + command palette (spec §16 / §17).
 * Searches products, orders, customers, suppliers, expenses, pages and actions.
 * Keyboard-first: ⌘K / Ctrl+K to open, ↑↓ to move, Enter to run, Esc to close.
 */
export function CommandPalette({
  open,
  onClose,
  onIntent,
}: {
  open: boolean;
  onClose: () => void;
  onIntent: (intent: PaletteIntent['intent']) => void;
}) {
  const { t, lang } = useI18n();
  const { data, currency } = useWorkspace();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      try {
        const raw = window.localStorage.getItem('selleros.recentSearches');
        setRecent(raw ? (JSON.parse(raw) as string[]) : []);
      } catch {
        setRecent([]);
      }
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  const remember = (term: string) => {
    if (!term.trim()) return;
    const next = [term.trim(), ...recent.filter((r) => r !== term.trim())].slice(0, 6);
    setRecent(next);
    try {
      window.localStorage.setItem('selleros.recentSearches', JSON.stringify(next));
    } catch {
      /* storage may be unavailable in private mode — recent list is optional */
    }
  };

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pages = NAV_ITEMS.map((item) => ({
      group: 'pages' as const,
      id: `page:${item.path}`,
      label: t(item.labelKey),
      sub: item.path,
      run: () => navigate(item.path),
    })).filter((p) => !q || p.label.toLowerCase().includes(q) || p.sub.includes(q));

    const actions = COMMAND_ACTIONS.map((a) => ({
      group: 'actions' as const,
      id: `action:${a.id}`,
      label: t(a.labelKey),
      sub: '',
      run: () => (a.intent ? onIntent(a.intent) : a.to && navigate(a.to)),
    })).filter((a) => !q || a.label.toLowerCase().includes(q));

    if (!q) return { pages: pages.slice(0, 6), actions: actions.slice(0, 6), records: [] };

    const records: { group: 'records'; id: string; label: string; sub: string; run: () => void }[] = [];

    for (const p of data?.products ?? []) {
      if (records.length > 40) break;
      if (p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)) {
        records.push({
          group: 'records',
          id: `product:${p.id}`,
          label: p.name,
          sub: `${p.sku} · ${formatMoney(p.sellingPrice, { currency, lang })}`,
          run: () => navigate(`/products/${p.id}`),
        });
      }
    }
    for (const o of data?.orders ?? []) {
      if (records.length > 60) break;
      if (o.orderNo.toLowerCase().includes(q) || o.trackingId.toLowerCase().includes(q)) {
        records.push({
          group: 'records',
          id: `order:${o.id}`,
          label: o.orderNo,
          sub: `${t('nav.orders')} · ${o.date}`,
          run: () => navigate(`/orders/${o.id}`),
        });
      }
    }
    for (const c of data?.customers ?? []) {
      if (records.length > 75) break;
      if (c.name.toLowerCase().includes(q) || c.phone.includes(q)) {
        records.push({
          group: 'records',
          id: `customer:${c.id}`,
          label: c.name,
          sub: `${t('nav.customers')} · ${c.phone}`,
          run: () => navigate(`/customers/${c.id}`),
        });
      }
    }
    for (const s of data?.suppliers ?? []) {
      if (records.length > 85) break;
      if (s.name.toLowerCase().includes(q)) {
        records.push({
          group: 'records',
          id: `supplier:${s.id}`,
          label: s.name,
          sub: t('nav.suppliers'),
          run: () => navigate('/suppliers'),
        });
      }
    }
    for (const e of data?.expenses ?? []) {
      if (records.length > 95) break;
      const hay = `${e.category} ${e.vendor} ${e.note}`.toLowerCase();
      if (hay.includes(q)) {
        records.push({
          group: 'records',
          id: `expense:${e.id}`,
          label: e.vendor || e.category,
          sub: `${t('nav.finance')} · ${formatMoney(e.amount, { currency, lang })}`,
          run: () => navigate('/finance/expenses'),
        });
      }
    }

    return { pages: pages.slice(0, 5), actions: actions.slice(0, 5), records: records.slice(0, 12) };
  }, [query, data, t, lang, currency, navigate, onIntent]);

  const flat = [...results.pages, ...results.actions, ...results.records];

  useEffect(() => {
    if (active > flat.length - 1) setActive(Math.max(0, flat.length - 1));
  }, [flat.length, active]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(flat.length - 1, a + 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const item = flat[active];
      if (item) {
        remember(query);
        item.run();
        onClose();
      }
    }
  };

  const renderGroup = (
    label: string,
    items: { id: string; label: string; sub: string; run: () => void }[],
    icon?: React.ReactNode,
  ) =>
    items.length === 0 ? null : (
      <div key={label}>
        <div className="palette__group">{label}</div>
        {items.map((item) => {
          const index = flat.findIndex((f) => f.id === item.id);
          return (
            <button
              key={item.id}
              type="button"
              className="palette__item"
              data-active={index === active}
              onMouseEnter={() => setActive(index)}
              onClick={() => {
                remember(query);
                item.run();
                onClose();
              }}
            >
              {icon}
              <span className="ellipsis">{item.label}</span>
              {item.sub && <span className="palette__item-sub ellipsis">{item.sub}</span>}
            </button>
          );
        })}
      </div>
    );

  return (
    <div
      className="overlay"
      style={{ alignItems: 'flex-start', paddingTop: '10dvh' }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="palette" role="dialog" aria-modal="true" aria-label={t('palette.title')}>
        <div className="palette__input">
          <IconSearch size={18} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder={t('palette.placeholder')}
            aria-label={t('palette.placeholder')}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="palette__results" ref={listRef}>
          {query.trim() === '' && recent.length > 0 && (
            <div className="palette__group">{t('palette.recent')}</div>
          )}
          {query.trim() === '' &&
            recent.map((r) => (
              <button key={r} type="button" className="palette__item" onClick={() => setQuery(r)}>
                <IconSearch size={14} />
                <span>{r}</span>
              </button>
            ))}
          {renderGroup(t('palette.results'), results.records, <IconBox size={14} />)}
          {renderGroup(t('palette.pages'), results.pages, <IconSpark size={14} />)}
          {renderGroup(t('palette.actions'), results.actions, <IconCart size={14} />)}
          {flat.length === 0 && <div className="palette__group">{t('palette.noResults')}</div>}
        </div>
        <div className="palette__foot">
          <span>↑↓</span>
          <span>↵</span>
          <span>esc</span>
          <span className="spacer" />
          <span className="muted">{t('search.hint')}</span>
        </div>
      </div>
    </div>
  );
}

export const PALETTE_ICONS = { IconUsers, IconHandshake, IconWallet };
