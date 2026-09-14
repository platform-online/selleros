/**
 * UI primitives — the only place base markup is defined.
 * Everything is keyboard accessible, labelled, and touch-sized where it is a
 * control. No component here contains business logic.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { uid } from '../../lib/id';
import { IconAlert, IconArrowDown, IconArrowUp, IconCheck, IconClose, IconInfo } from './icons';

/* ------------------------------------------------------------------ *
 * Button
 * ------------------------------------------------------------------ */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-quiet';
type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  block?: boolean;
  iconOnly?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  block,
  iconOnly,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [
    'btn',
    `btn--${variant}`,
    size !== 'md' ? `btn--${size}` : '',
    block ? 'btn--block' : '',
    iconOnly ? 'btn--icon' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button type={type} className={classes} {...rest}>
      {icon}
      {iconOnly ? <span className="sr-only">{rest['aria-label'] ?? ''}</span> : children}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Card
 * ------------------------------------------------------------------ */

export function Card({
  title,
  subtitle,
  actions,
  children,
  footer,
  flush,
  className = '',
  as: Tag = 'section',
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  flush?: boolean;
  className?: string;
  as?: 'section' | 'article' | 'div';
}) {
  return (
    <Tag className={`card ${flush ? 'card--flush' : ''} ${className}`}>
      {(title || actions) && (
        <div className="card__head">
          <div className="card__title">
            {title && <h3>{title}</h3>}
            {subtitle && <span className="card__hint">{subtitle}</span>}
          </div>
          {actions && <div className="row gap-2">{actions}</div>}
        </div>
      )}
      <div className={`card__body ${flush ? 'card__body--flush' : ''}`}>{children}</div>
      {footer && <div className="card__foot">{footer}</div>}
    </Tag>
  );
}

/* ------------------------------------------------------------------ *
 * Chip
 * ------------------------------------------------------------------ */

type ChipTone = 'neutral' | 'success' | 'danger' | 'warning' | 'info' | 'primary' | 'outline';

export function Chip({
  tone = 'neutral',
  dot,
  children,
  title,
}: {
  tone?: ChipTone;
  dot?: boolean;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span className={`chip chip--${tone}`} title={title}>
      {dot && <span className="chip__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Metric tile
 * ------------------------------------------------------------------ */

export interface MetricProps {
  label: ReactNode;
  value: ReactNode;
  /** percentage change vs previous period, or null when not computable */
  delta?: number | null;
  /** secondary text under the value */
  hint?: ReactNode;
  previous?: ReactNode;
  tone?: 'neutral' | 'positive' | 'negative';
  onClick?: () => void;
  title?: string;
  compact?: boolean;
}

export function Metric({
  label,
  value,
  delta,
  hint,
  previous,
  tone = 'neutral',
  onClick,
  title,
  compact,
}: MetricProps) {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      className={`metric ${onClick ? 'metric--clickable' : ''}`}
      onClick={onClick}
      title={title}
      {...(onClick ? { type: 'button' as const } : {})}
    >
      <span className="metric__label">{label}</span>
      <span
        className={`metric__value ${compact ? 'metric__value--sm' : ''} ${
          tone === 'positive' ? 'money-positive' : tone === 'negative' ? 'money-negative' : ''
        }`}
      >
        {value}
      </span>
      <span className="metric__foot">
        <Delta value={delta} />
        {previous !== undefined && <span className="muted tiny">{previous}</span>}
        {hint && <span className="muted tiny">{hint}</span>}
      </span>
    </Wrapper>
  );
}

/** Directional change indicator with a non-colour cue (arrow + sign). */
export function Delta({ value, suffix }: { value?: number | null; suffix?: string }) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return <span className="delta delta--neutral">—</span>;
  }
  const flat = Math.abs(value) < 0.05;
  const dir = flat ? 'flat' : value > 0 ? 'up' : 'down';
  return (
    <span className={`delta delta--${dir}`}>
      {!flat && (dir === 'up' ? <IconArrowUp size={11} /> : <IconArrowDown size={11} />)}
      <span>
        {flat ? '' : value > 0 ? '+' : '−'}
        {Math.abs(value).toFixed(1)}%{suffix ?? ''}
      </span>
      <span className="sr-only">{flat ? 'unchanged' : dir === 'up' ? 'up' : 'down'}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Form controls
 * ------------------------------------------------------------------ */

export function Field({
  label,
  htmlFor,
  help,
  error,
  required,
  children,
  className = '',
}: {
  label?: ReactNode;
  htmlFor?: string;
  help?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const describedBy = useId();
  return (
    <div className={`field ${className}`}>
      {label && (
        <label className="field__label" htmlFor={htmlFor}>
          {label}
          {required && (
            <span className="req" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
      {children}
      {help && !error && (
        <span className="field__help" id={describedBy}>
          {help}
        </span>
      )}
      {error && (
        <span className="field__error" role="alert">
          <IconAlert size={13} /> {error}
        </span>
      )}
    </div>
  );
}

export function TextInput({
  label,
  help,
  error,
  money,
  className = '',
  id,
  required,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  label?: ReactNode;
  help?: ReactNode;
  error?: string | null;
  money?: boolean;
}) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const control = (
    <input
      id={inputId}
      className={`input ${money ? 'input--money' : ''} ${className}`}
      aria-invalid={error ? true : undefined}
      required={required}
      {...rest}
    />
  );
  if (!label) return control;
  return (
    <Field label={label} htmlFor={inputId} help={help} error={error} required={required}>
      {control}
    </Field>
  );
}

export function SelectInput({
  label,
  help,
  error,
  options,
  className = '',
  id,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label?: ReactNode;
  help?: ReactNode;
  error?: string | null;
  options: { value: string; label: string }[];
}) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const control = (
    <select id={selectId} className={`select ${className}`} aria-invalid={error ? true : undefined} {...rest}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
  if (!label) return control;
  return (
    <Field label={label} htmlFor={selectId} help={help} error={error}>
      {control}
    </Field>
  );
}

export function TextArea({
  label,
  help,
  error,
  id,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: ReactNode;
  help?: ReactNode;
  error?: string | null;
}) {
  const autoId = useId();
  const areaId = id ?? autoId;
  const control = <textarea id={areaId} className="textarea" aria-invalid={error ? true : undefined} {...rest} />;
  if (!label) return control;
  return (
    <Field label={label} htmlFor={areaId} help={help} error={error}>
      {control}
    </Field>
  );
}

export function Switch({
  label,
  checked,
  onChange,
  help,
  disabled,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
  help?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="field">
      <label className="switch" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="switch__track" aria-hidden="true">
          <span className="switch__thumb" />
        </span>
        <span>{label}</span>
      </label>
      {help && <span className="field__help">{help}</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Tabs & segmented control
 * ------------------------------------------------------------------ */

export interface TabItem {
  id: string;
  label: ReactNode;
  count?: number;
}

export function Tabs({
  items,
  active,
  onChange,
  ariaLabel,
}: {
  items: TabItem[];
  active: string;
  onChange: (id: string) => void;
  ariaLabel: string;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          id={`tab-${item.id}`}
          aria-selected={active === item.id}
          aria-controls={`panel-${item.id}`}
          className="tab"
          onClick={() => onChange(item.id)}
        >
          {item.label}
          {item.count !== undefined && <span className="muted tiny"> ({item.count})</span>}
        </button>
      ))}
    </div>
  );
}

export function TabPanel({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} tabIndex={-1}>
      {children}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * States
 * ------------------------------------------------------------------ */

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  body: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      {icon && <div className="empty__icon">{icon}</div>}
      <div className="empty__title">{title}</div>
      <div className="empty__body">{body}</div>
      {action}
    </div>
  );
}

export function ErrorState({
  title,
  body,
  onRetry,
  onHome,
  detail,
  retryLabel = 'Try again',
  homeLabel = 'Go to dashboard',
  detailLabel = 'Technical details',
}: {
  title: ReactNode;
  body: ReactNode;
  onRetry?: () => void;
  onHome?: () => void;
  detail?: string;
  retryLabel?: string;
  homeLabel?: string;
  detailLabel?: string;
}) {
  return (
    <div className="error-state" role="alert">
      <div className="empty__icon">
        <IconAlert size={20} />
      </div>
      <div className="error-state__title">{title}</div>
      <div className="error-state__body">{body}</div>
      <div className="row gap-3">
        {onRetry && (
          <Button variant="primary" onClick={onRetry}>
            {retryLabel}
          </Button>
        )}
        {onHome && <Button onClick={onHome}>{homeLabel}</Button>}
      </div>
      {detail && (
        <details>
          <summary>{detailLabel}</summary>
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{detail}</pre>
        </details>
      )}
    </div>
  );
}

export function Skeleton({ className = '', height }: { className?: string; height?: number }) {
  return <div className={`skeleton ${className}`} style={height ? { height } : undefined} aria-hidden="true" />;
}

export function SkeletonMetricRow({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid--kpi" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="skeleton--metric" />
      ))}
    </div>
  );
}

export function SkeletonCard({ title = true }: { title?: boolean }) {
  return (
    <section className="card" aria-hidden="true">
      <div className="card__body stack">
        {title && <Skeleton className="skeleton--title" />}
        <Skeleton className="skeleton--chart" />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Tooltip
 * ------------------------------------------------------------------ */

export function Tooltip({ label, children }: { label: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="tip"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span className="tip__bubble" role="tooltip">
          {label}
        </span>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Progress bar
 * ------------------------------------------------------------------ */

export function Bar({
  value,
  tone = 'default',
  label,
}: {
  /** 0..100 */
  value: number;
  tone?: 'default' | 'success' | 'danger' | 'warning';
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div
      className="bar"
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className={`bar__fill ${tone !== 'default' ? `bar__fill--${tone}` : ''}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Modal (focus trapped, ESC closes, scroll locked)
 * ------------------------------------------------------------------ */

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  closeLabel = 'Close',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  closeLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const first = node?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !node) return;
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = prevOverflow;
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={`modal modal--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={ref}
      >
        <div className="modal__head">
          <div>
            <div className="modal__title" id={titleId}>
              {title}
            </div>
            {subtitle && <div className="modal__subtitle">{subtitle}</div>}
          </div>
          <Button variant="ghost" size="sm" iconOnly aria-label={closeLabel} onClick={onClose} icon={<IconClose />} />
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  closeLabel = 'Close',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  closeLabel?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="overlay" style={{ justifyContent: 'flex-end', padding: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        <div className="modal__head">
          <div className="modal__title">{title}</div>
          <Button variant="ghost" size="sm" iconOnly aria-label={closeLabel} onClick={onClose} icon={<IconClose />} />
        </div>
        <div className="modal__body">{children}</div>
      </aside>
    </div>
  );
}

/** Destructive-action confirmation requiring a typed phrase. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel,
  cancelLabel,
  typedPhrase,
  typePrompt,
  busy,
  danger = true,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  body: ReactNode;
  confirmLabel: ReactNode;
  cancelLabel: ReactNode;
  typedPhrase?: string;
  typePrompt?: ReactNode;
  busy?: boolean;
  danger?: boolean;
}) {
  const [typed, setTyped] = useState('');
  useEffect(() => {
    if (open) setTyped('');
  }, [open]);

  const requiresPhrase = Boolean(typedPhrase);
  const canConfirm = !requiresPhrase || typed.trim().toUpperCase() === (typedPhrase ?? '').toUpperCase();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={!canConfirm || busy}>
            {busy ? '…' : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="stack">
        <div>{body}</div>
        {requiresPhrase && (
          <Field label={typePrompt}>
            <TextInput
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ *
 * Toasts
 * ------------------------------------------------------------------ */

export interface Toast {
  id: string;
  message: ReactNode;
  tone: 'default' | 'success' | 'danger';
}

interface ToastContextValue {
  push: (message: ReactNode, tone?: Toast['tone']) => void;
}

const ToastContext = createContext<ToastContextValue>({ push: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Record<string, number>>({});

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    window.clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  const push = useCallback(
    (message: ReactNode, tone: Toast['tone'] = 'default') => {
      const id = uid('toast');
      setToasts((prev) => [...prev.slice(-3), { id, message, tone }]);
      timers.current[id] = window.setTimeout(() => remove(id), 4200);
    },
    [remove],
  );

  useEffect(() => {
    const store = timers.current;
    return () => {
      Object.values(store).forEach((t) => window.clearTimeout(t));
    };
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone !== 'default' ? `toast--${t.tone}` : ''}`}>
            {t.tone === 'success' ? <IconCheck size={16} /> : t.tone === 'danger' ? <IconAlert size={16} /> : <IconInfo size={16} />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

/* ------------------------------------------------------------------ *
 * Key/value list
 * ------------------------------------------------------------------ */

export function KeyValue({
  rows,
  tight,
  className,
}: {
  rows: { label: ReactNode; value: ReactNode; tone?: 'positive' | 'negative'; total?: boolean; divider?: boolean }[];
  tight?: boolean;
  className?: string;
}) {
  return (
    <dl className={`kv ${tight ? 'kv--tight' : ''} ${className ?? ''}`}>
      {rows.map((row, i) =>
        row.divider ? (
          <div key={`d${i}`} className="kv__divider" />
        ) : (
          <div key={i} style={{ display: 'contents' }}>
            <dt>{row.label}</dt>
            <dd
              className={`${row.total ? 'kv__total' : ''} ${
                row.tone === 'positive' ? 'money-positive' : row.tone === 'negative' ? 'money-negative' : ''
              }`}
            >
              {row.value}
            </dd>
          </div>
        ),
      )}
    </dl>
  );
}
