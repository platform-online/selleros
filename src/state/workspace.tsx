/**
 * Workspace state.
 * One place owns the data, the settings, the active period and every derived
 * metric. Pages subscribe — they never query Dexie directly, which keeps the
 * numbers on screen identical to the numbers in tests.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ensureWorkspace, loadWorkspace, rebuildLedger, type WorkspaceData } from '../db';
import { resolvePeriod, todayISO, type DateRange, type PeriodKey } from '../lib/dates';
import {
  computeCourierAnalytics,
  computeCustomerAnalytics,
  computeExpenseInsights,
  computeInventoryAnalytics,
  computeProductProfitability,
  computePeriodMetrics,
  computeRenewals,
  computeSupplierAnalytics,
  computeDailyTrend,
  selectPeriod,
  type CourierRow,
  type CustomerRow,
  type ExpenseInsight,
  type InventoryAnalytics,
  type PeriodData,
  type PeriodMetrics,
  type ProductProfitRow,
  type RenewalRow,
  type SupplierRow,
  type TrendPoint,
} from '../domain/context';
import type { Language } from '../lib/format';
import type { Business, Settings } from '../domain/types';

export interface CustomRange {
  start: string;
  end: string;
}

export interface Analytics {
  range: DateRange;
  metrics: PeriodMetrics;
  previous: PeriodMetrics | null;
  inventory: InventoryAnalytics;
  products: ProductProfitRow[];
  customers: CustomerRow[];
  couriers: CourierRow[];
  suppliers: SupplierRow[];
  expenses: ExpenseInsight[];
  renewals: RenewalRow[];
  trend: TrendPoint[];
  period: PeriodData;
  prevPeriod: PeriodData | null;
}

interface WorkspaceContextValue {
  data: WorkspaceData | null;
  business: Business | null;
  settings: Settings | null;
  loading: boolean;
  error: string | null;
  today: string;
  period: PeriodKey;
  setPeriod: (p: PeriodKey) => void;
  custom: CustomRange | null;
  setCustom: (r: CustomRange | null) => void;
  range: DateRange;
  analytics: Analytics | null;
  refresh: () => Promise<void>;
  /** run a mutation then reload + rebuild projections */
  run: (fn: () => Promise<unknown>) => Promise<void>;
  currency: string;
  lang: Language;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodKey>('thisMonth');
  const [custom, setCustom] = useState<CustomRange | null>(null);
  const [tick, setTick] = useState(0);

  const today = useMemo(() => todayISO(data?.settings.timezone ?? 'Asia/Dhaka'), [data?.settings.timezone]);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const loaded = await loadWorkspace();
      setData(loaded);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureWorkspace();
        await rebuildLedger();
        const loaded = await loadWorkspace();
        if (!cancelled) setData(loaded);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      await fn();
      await rebuildLedger();
      setTick((t) => t + 1);
    },
    [],
  );

  const range = useMemo(
    () => resolvePeriod(period, today, custom ?? undefined),
    [period, today, custom],
  );

  const analytics = useMemo<Analytics | null>(() => {
    if (!data) return null;
    const periodData = selectPeriod(data, range);
    const prevData = selectPeriod(data, {
      ...range,
      start: range.prev.start,
      end: range.prev.end,
    });
    const metrics = computePeriodMetrics({ data, period: periodData, range, settings: data.settings });
    const prevRange: DateRange = { ...range, start: range.prev.start, end: range.prev.end, prev: range.prev };
    const previous = computePeriodMetrics({ data, period: prevData, range: prevRange, settings: data.settings });

    return {
      range,
      metrics,
      previous,
      period: periodData,
      prevPeriod: prevData,
      inventory: computeInventoryAnalytics(data, range, data.settings),
      products: computeProductProfitability(data, periodData),
      customers: computeCustomerAnalytics(data, range),
      couriers: computeCourierAnalytics(data, range),
      suppliers: computeSupplierAnalytics(data, range),
      expenses: computeExpenseInsights(data, range, metrics.pl.netRevenue),
      renewals: computeRenewals(data.recurring, today),
      trend: computeDailyTrend(data, range, data.settings),
    };
  }, [data, range, today]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      data,
      business: data?.business ?? null,
      settings: data?.settings ?? null,
      loading,
      error,
      today,
      period,
      setPeriod,
      custom,
      setCustom,
      range,
      analytics,
      refresh,
      run,
      currency: data?.settings.currency ?? 'BDT',
      lang: data?.settings.language ?? 'en',
    }),
    [data, loading, error, today, period, custom, range, analytics, refresh, run],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used inside <WorkspaceProvider>');
  return ctx;
}

/** Analytics guaranteed non-null — for pages rendered inside the app shell. */
export function useAnalytics(): Analytics {
  const { analytics } = useWorkspace();
  if (!analytics) throw new Error('Analytics are not ready yet');
  return analytics;
}
