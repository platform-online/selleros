import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useWorkspace } from '../state/workspace';
import { useFmt } from '../state/format';
import { PageHeader } from '../components/layout/PageHeader';
import { PeriodPicker } from '../components/layout/PeriodPicker';
import {
  Bar,
  Button,
  Card,
  Chip,
  EmptyState,
  KeyValue,
  Metric,
  Modal,
  SelectInput,
  Switch,
  TextInput,
  useToast,
} from '../components/ui/primitives';
import { DataTable } from '../components/ui/DataTable';
import { DonutChart, HorizontalBarChart, TrendChart, toChartMoney } from '../components/charts/Charts';
import { emptyExpense, emptyRecurring, payRecurring, saveExpense, saveRecurring, addManualLedger } from '../state/mutations';
import { money, percentChange, roundMinor, toMajor, type Money } from '../lib/money';
import { breakEvenSummary, positionsSummary, profitLeaks } from '../domain/intelligence';
import { useInsights } from '../state/insights';
import type { Expense, RecurringExpense } from '../domain/types';
import { IconPlus } from '../components/ui/icons';

type TabId =
  | 'overview'
  | 'pnl'
  | 'cash'
  | 'ledger'
  | 'expenses'
  | 'receivables'
  | 'payables'
  | 'products'
  | 'categories'
  | 'channels'
  | 'analysis';

const TABS: TabId[] = ['overview', 'pnl', 'cash', 'ledger', 'expenses', 'receivables', 'payables', 'products', 'categories', 'channels', 'analysis'];

export function FinancePage() {
  const { t } = useI18n();
  const fmt = useFmt();
  const { analytics, loading } = useWorkspace();
  const [tab, setTab] = useState<TabId>('overview');

  if (loading || !analytics) return <Card><p className="muted small">{t('common.loading')}</p></Card>;

  const { pl, cash, positions, breakEven: be } = analytics.metrics;
  const prev = analytics.previous;

  return (
    <>
      <PageHeader title={t('finance.title')} subtitle={t('finance.subtitle')}>
        <div className="mt-4">
          <PeriodPicker />
        </div>
      </PageHeader>

      <div className="grid grid--kpi mb-5">
        <Metric label={t('kpi.netRevenue')} value={fmt.money(pl.netRevenue)} delta={percentChange(prev?.pl.netRevenue ?? 0, pl.netRevenue)} />
        <Metric label={t('kpi.grossProfit')} value={fmt.money(pl.grossProfit)} tone={pl.grossProfit >= 0 ? 'positive' : 'negative'} />
        <Metric label={t('kpi.contributionProfit')} value={fmt.money(pl.contributionProfit)} tone={pl.contributionProfit >= 0 ? 'positive' : 'negative'} />
        <Metric label={t('kpi.netProfit')} value={fmt.money(pl.netOperatingProfit)} tone={pl.netOperatingProfit >= 0 ? 'positive' : 'negative'} delta={percentChange(prev?.pl.netOperatingProfit ?? 0, pl.netOperatingProfit)} />
        <Metric label={t('kpi.netMargin')} value={fmt.pct(pl.netMarginPct)} />
        <Metric label={t('kpi.cashBalance')} value={fmt.money(cash.closingCash)} hint={t('finance.profitIsNotCash')} />
        <Metric label={t('kpi.receivables')} value={fmt.money(positions.receivables)} />
        <Metric label={t('kpi.payables')} value={fmt.money(positions.payables)} />
        <Metric label={t('kpi.pendingCod')} value={fmt.money(positions.pendingCod)} />
        <Metric label={t('kpi.pendingSettlement')} value={fmt.money(positions.pendingSettlement)} />
        <Metric label={t('kpi.inventoryValue')} value={fmt.money(positions.inventoryValue)} />
        <Metric label={t('finance.cashRunway')} value={analytics.metrics.cashRunwayDays === null ? '—' : `${fmt.num(analytics.metrics.cashRunwayDays, 0)} ${t('common.days')}`} tone={(analytics.metrics.cashRunwayDays ?? 999) < 15 ? 'negative' : 'neutral'} />
        <Metric label={t('kpi.breakEven')} value={be.breakEvenRevenue === null ? t('finance.breakEvenUnavailable.title') : fmt.money(be.breakEvenRevenue)} />
        <Metric label={t('kpi.mer')} value={fmt.multiple(analytics.metrics.mer)} />
      </div>

      <Card flush className="mb-5">
        <div className="card__body" style={{ paddingBottom: 0 }}>
          <div className="tabs tabs--scroll" role="tablist" aria-label={t('finance.title')}>
            {TABS.map((id) => (
              <button key={id} type="button" role="tab" className="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
                {t(`finance.tab.${id}`)}
              </button>
            ))}
          </div>
        </div>

        {tab === 'overview' && <div role="tabpanel" tabIndex={-1}><OverviewTab /></div>}
        {tab === 'pnl' && <div role="tabpanel" tabIndex={-1}><PnlTab /></div>}
        {tab === 'cash' && <div role="tabpanel" tabIndex={-1}><CashTab /></div>}
        {tab === 'ledger' && <div role="tabpanel" tabIndex={-1}><LedgerTab /></div>}
        {tab === 'expenses' && <div role="tabpanel" tabIndex={-1}><ExpensesTab /></div>}
        {tab === 'receivables' && <div role="tabpanel" tabIndex={-1}><ReceivablesTab /></div>}
        {tab === 'payables' && <div role="tabpanel" tabIndex={-1}><PayablesTab /></div>}
        {tab === 'products' && <div role="tabpanel" tabIndex={-1}><ProductCostTab /></div>}
        {tab === 'categories' && <div role="tabpanel" tabIndex={-1}><CategoryTab /></div>}
        {tab === 'channels' && <div role="tabpanel" tabIndex={-1}><ChannelTab /></div>}
        {tab === 'analysis' && <div role="tabpanel" tabIndex={-1}><AnalysisTab /></div>}
      </Card>

    </>
  );
}

/* ------------------------------------------------------------------ *
 * Overview
 * ------------------------------------------------------------------ */

function OverviewTab() {
  const { t } = useI18n();
  const fmt = useFmt();
  const { analytics } = useWorkspace();
  const insights = useInsights();
  if (!analytics) return null;

  const { pl, cash, positions, breakEven: be } = analytics.metrics;
  const leaks = profitLeaks(pl, analytics.previous?.pl ?? null);

  return (
    <div className="card__body">
      <div className="grid grid--3 mb-5">
        <Card title={t('finance.positions')}>
          <KeyValue rows={positionsSummary(positions).map((p) => ({ label: t(`finance.position.${p.label}`), value: fmt.money(p.value) }))} />
          <p className="field__help mt-4">{t('finance.profitIsNotCash')}</p>
        </Card>
        <Card title={t('finance.cashSummary')}>
          <KeyValue
            rows={[
              { label: t('finance.openingCash'), value: fmt.money(cash.openingCash) },
              { label: t('finance.operatingIn'), value: fmt.money(cash.operatingIn) },
              { label: t('finance.operatingOut'), value: fmt.money(cash.operatingOut) },
              { label: t('finance.investingOut'), value: fmt.money(cash.investingOut) },
              { label: t('finance.financingNet'), value: fmt.money(cash.financingNet) },
              { label: t('finance.netChange'), value: fmt.money(cash.netChange), tone: cash.netChange >= 0 ? 'positive' : 'negative', divider: true },
              { label: t('kpi.cashBalance'), value: fmt.money(cash.closingCash), total: true },
            ]}
          />
        </Card>
        <Card title={t('finance.breakEven')}>
          <KeyValue
            rows={[
              { label: t('finance.fixedCosts'), value: fmt.money(be.fixedCosts) },
              { label: t('finance.variableCosts'), value: fmt.money(be.variableCosts) },
              { label: t('kpi.contributionMargin'), value: fmt.pct(be.contributionMarginPct) },
              { label: t('finance.currentRevenue'), value: fmt.money(be.currentRevenue) },
              { label: t('kpi.breakEven'), value: be.breakEvenRevenue === null ? '—' : fmt.money(be.breakEvenRevenue), divider: true },
              { label: t('finance.revenueGap'), value: be.revenueGap === null ? '—' : fmt.money(be.revenueGap) },
              { label: t('finance.coverage'), value: fmt.pct(be.coveragePct) },
            ]}
          />
          {be.breakEvenRevenue === null && (
            <Card className="panel mt-4">
              <p className="small">{t(`finance.breakEvenUnavailable.${be.unavailableReason === 'no-contribution' ? 'contribution' : 'revenue'}`)}</p>
            </Card>
          )}
        </Card>
      </div>

      <Card title={t('finance.profitLeaks')} className="mb-5">
        {leaks.length === 0 ? (
          <p className="muted small">{t('common.noData')}</p>
        ) : (
          <>
            <DataTable
              columns={[
                { key: 'line', label: t('finance.costLine'), render: (l: (typeof leaks)[number]) => t(`finance.line.${l.key}`), sortValue: (l) => l.key },
                { key: 'amount', label: t('common.amount'), numeric: true, render: (l) => fmt.money(l.amount), sortValue: (l) => l.amount },
                { key: 'share', label: t('finance.shareOfRevenue'), numeric: true, render: (l) => fmt.pct(l.shareOfRevenuePct), sortValue: (l) => l.shareOfRevenuePct },
                { key: 'change', label: t('common.change'), numeric: true, render: (l) => fmt.money(l.change), sortValue: (l) => l.change },
                { key: 'impact', label: t('common.impact'), numeric: true, render: (l) => <span style={{ color: l.profitImpact < 0 ? 'var(--fin-loss)' : 'var(--fin-profit)' }}>{fmt.money(l.profitImpact)}</span>, sortValue: (l) => l.profitImpact },
                { key: 'sev', label: t('common.severity'), render: (l) => <Chip tone={l.severity === 'high' ? 'danger' : l.severity === 'medium' ? 'warning' : 'neutral'}>{t(`finance.severity.${l.severity}`)}</Chip>, sortValue: (l) => l.severity },
              ]}
              rows={leaks}
              rowKey={(l) => l.key}
              pageSize={10}
            />
          </>
        )}
      </Card>

      {insights && insights.goals.length > 0 && (
        <Card title={t('insights.goals.title')}>
          <div className="stack">
            {insights.goals.map((g) => (
              <div key={g.id}>
                <div className="row--between row" style={{ marginBottom: 4 }}>
                  <span className="small">{t(`insights.goal.metric.${g.metric}`)}</span>
                  <span className="num small">{fmt.pct(g.achievedPct)} · {t('insights.goals.onTrack')}: {g.onTrack ? t('ads.yes') : t('ads.no')}</span>
                </div>
                <Bar value={Math.max(0, Math.min(100, g.achievedPct ?? 0))} tone={g.onTrack ? 'success' : 'warning'} />
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * P&L
 * ------------------------------------------------------------------ */

function PnlTab() {
  const { t } = useI18n();
  const fmt = useFmt();
  const { analytics } = useWorkspace();
  if (!analytics) return null;
  const { pl } = analytics.metrics;
  const prev = analytics.previous?.pl;

  const rows = [
    { label: t('finance.grossRevenue'), value: fmt.money(pl.grossRevenue), prv: prev?.grossRevenue },
    { label: t('finance.discounts'), value: fmt.money(-pl.discounts), prv: prev ? -prev.discounts : undefined },
    { label: t('finance.shippingIncome'), value: fmt.money(pl.shippingIncome), prv: prev?.shippingIncome },
    { label: t('finance.netRevenue'), value: fmt.money(pl.netRevenue), total: true, divider: true, prv: prev?.netRevenue },
    { label: t('kpi.cogs'), value: fmt.money(-pl.cogs), prv: prev ? -prev.cogs : undefined },
    { label: t('kpi.grossProfit'), value: fmt.money(pl.grossProfit), total: true, divider: true, prv: prev?.grossProfit },
    { label: t('finance.advertising'), value: fmt.money(-pl.variable.advertising), prv: prev ? -prev.variable.advertising : undefined },
    { label: t('finance.courier'), value: fmt.money(-pl.variable.courier), prv: prev ? -prev.variable.courier : undefined },
    { label: t('finance.packaging'), value: fmt.money(-pl.variable.packaging), prv: prev ? -prev.variable.packaging : undefined },
    { label: t('finance.paymentFees'), value: fmt.money(-pl.variable.paymentFees), prv: prev ? -prev.variable.paymentFees : undefined },
    { label: t('finance.returnsCost'), value: fmt.money(-pl.variable.returns), prv: prev ? -prev.variable.returns : undefined },
    { label: t('finance.damage'), value: fmt.money(-pl.variable.damage), prv: prev ? -prev.variable.damage : undefined },
    { label: t('finance.otherVariable'), value: fmt.money(-pl.variable.otherVariable), prv: prev ? -prev.variable.otherVariable : undefined },
    { label: t('kpi.contributionProfit'), value: fmt.money(pl.contributionProfit), total: true, divider: true, prv: prev?.contributionProfit },
    { label: t('finance.operatingExpenses'), value: fmt.money(-pl.operatingExpenses), prv: prev ? -prev.operatingExpenses : undefined },
    { label: t('kpi.netProfit'), value: fmt.money(pl.netOperatingProfit), total: true, divider: true, prv: prev?.netOperatingProfit },
  ];

  return (
    <div className="card__body">
      <div className="grid grid--2">
        <Card title={t('finance.statement')}>
          <KeyValue
            rows={rows.map((r) => ({
              label: r.label,
              value: r.value,
              total: r.total,
              divider: r.divider,
              tone: typeof r.prv === 'number' ? undefined : undefined,
            }))}
          />
        </Card>
        <div className="stack">
          <Card title={t('finance.margins')}>
            <div className="stack">
              {[
                { label: t('kpi.grossMargin'), value: pl.grossMarginPct },
                { label: t('kpi.contributionMargin'), value: pl.contributionMarginPct },
                { label: t('kpi.netMargin'), value: pl.netMarginPct },
              ].map((m) => (
                <div key={m.label}>
                  <div className="row--between row" style={{ marginBottom: 4 }}>
                    <span className="small">{m.label}</span>
                    <span className="num small">{fmt.pct(m.value)}</span>
                  </div>
                  <Bar value={Math.max(0, Math.min(100, m.value ?? 0))} tone={(m.value ?? 0) >= 20 ? 'success' : (m.value ?? 0) >= 0 ? 'warning' : 'danger'} />
                </div>
              ))}
            </div>
          </Card>
          <Card title={t('finance.opexByCategory')}>
            {pl.operatingExpenseByCategory.length === 0 ? (
              <p className="muted small">{t('empty.expenses.title')}</p>
            ) : (
              <DonutChart
                data={pl.operatingExpenseByCategory.map((c) => ({ label: c.category, value: toChartMoney(c.amount) }))}
                lang={fmt.lang}
                currency={fmt.currency}
                height={220}
              />
            )}
          </Card>
        </div>
      </div>

      {pl.reclassifiedExpenses.length > 0 && (
        <Card className="mt-5">
          <h4 className="mb-4">{t('finance.reclassified')}</h4>
          <KeyValue
            rows={pl.reclassifiedExpenses.map((r) => ({
              label: `${r.category} → ${t(`finance.line.${r.line}`)}`,
              value: fmt.money(r.amount),
            }))}
          />
          <p className="field__help mt-4">{t('finance.reclassifiedHelp')}</p>
        </Card>
      )}

      <Card title={t('finance.compare')} className="mt-5">
        <KeyValue
          rows={[
            { label: t('finance.netRevenue'), value: `${fmt.money(pl.netRevenue)} vs ${prev ? fmt.money(prev.netRevenue) : '—'}` },
            { label: t('kpi.contributionProfit'), value: `${fmt.money(pl.contributionProfit)} vs ${prev ? fmt.money(prev.contributionProfit) : '—'}` },
            { label: t('kpi.netProfit'), value: `${fmt.money(pl.netOperatingProfit)} vs ${prev ? fmt.money(prev.netOperatingProfit) : '—'}` },
            { label: t('kpi.netMargin'), value: `${fmt.pct(pl.netMarginPct)} vs ${prev ? fmt.pct(prev.netMarginPct) : '—'}` },
          ]}
        />
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Cash flow
 * ------------------------------------------------------------------ */

function CashTab() {
  const { t } = useI18n();
  const fmt = useFmt();
  const { analytics } = useWorkspace();
  if (!analytics) return null;
  const { cash } = analytics.metrics;

  const groups = ['operating', 'investing', 'financing'] as const;

  return (
    <div className="card__body">
      <div className="grid grid--2 mb-5">
        <div>
          <h4 className="mb-4">{t('finance.cashTrend')}</h4>
          <TrendChart
            data={analytics.trend.map((p) => ({ label: fmt.shortDate(p.date), cash: toChartMoney(p.cash) }))}
            series={[{ key: 'cash', name: t('kpi.cashBalance'), format: 'money', color: 'var(--fin-cash)' }]}
            lang={fmt.lang}
            currency={fmt.currency}
            emptyLabel={t('finance.noCash')}
            emptyBody={t('finance.recordCash')}
          />
        </div>
        <KeyValue
          rows={[
            { label: t('finance.openingCash'), value: fmt.money(cash.openingCash) },
            { label: t('finance.operatingIn'), value: fmt.money(cash.operatingIn) },
            { label: t('finance.operatingOut'), value: fmt.money(cash.operatingOut) },
            { label: t('finance.investingOut'), value: fmt.money(cash.investingOut) },
            { label: t('finance.financingNet'), value: fmt.money(cash.financingNet) },
            { label: t('finance.netChange'), value: fmt.money(cash.netChange), tone: cash.netChange >= 0 ? 'positive' : 'negative', divider: true },
            { label: t('kpi.cashBalance'), value: fmt.money(cash.closingCash), total: true },
            { label: t('finance.cashRunway'), value: analytics.metrics.cashRunwayDays === null ? '—' : `${fmt.num(analytics.metrics.cashRunwayDays, 0)} ${t('common.days')}` },
            { label: t('finance.cashConversion'), value: fmt.pct(analytics.metrics.pl.netOperatingProfit > 0 ? (cash.netChange / analytics.metrics.pl.netOperatingProfit) * 100 : null) },
          ]}
        />
      </div>

      <DataTable
        columns={[
          { key: 'group', label: t('finance.group'), render: (l: (typeof cash.lines)[number]) => t(`finance.group.${l.group}`), sortValue: (l) => l.group },
          { key: 'label', label: t('common.description'), render: (l) => l.label, sortValue: (l) => l.label },
          { key: 'dir', label: t('finance.direction'), render: (l) => <Chip tone={l.direction === 'in' ? 'success' : 'danger'}>{l.direction === 'in' ? t('finance.in') : t('finance.out')}</Chip>, sortValue: (l) => l.direction },
          { key: 'amount', label: t('common.amount'), numeric: true, render: (l) => fmt.money(l.amount), sortValue: (l) => l.amount },
        ]}
        rows={cash.lines}
        rowKey={(l) => `${l.group}-${l.label}-${l.amount}`}
        empty={<EmptyState title={t('finance.noCash')} body={t('finance.recordCash')} />}
      />

      <div className="grid grid--3 mt-5">
        {groups.map((g) => (
          <Card key={g} title={t(`finance.group.${g}`)}>
            <KeyValue
              rows={cash.lines
                .filter((l) => l.group === g)
                .map((l) => ({ label: l.label, value: fmt.money(l.amount), tone: l.direction === 'in' ? ('positive' as const) : ('negative' as const) }))}
            />
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Ledger
 * ------------------------------------------------------------------ */

function LedgerTab() {
  const { t } = useI18n();
  const fmt = useFmt();
  const { data, analytics, run } = useWorkspace();
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [entry, setEntry] = useState({ date: analytics?.range.end ?? '', direction: 'out' as 'in' | 'out', category: 'Other', amount: '0', note: '' });

  if (!analytics || !data) return null;

  const entries = data.ledger
    .filter((e) => e.date >= analytics.range.start && e.date <= analytics.range.end)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <>
      <div className="card__body">
        <div className="row--between row mb-4">
          <p className="tiny muted">{t('finance.ledgerExplain')}</p>
          <Button variant="primary" icon={<IconPlus size={15} />} onClick={() => setAddOpen(true)}>
            {t('finance.addManual')}
          </Button>
        </div>
        <DataTable
          columns={[
            { key: 'date', label: t('common.date'), render: (e: (typeof entries)[number]) => fmt.date(e.date), sortValue: (e) => e.date },
            { key: 'cat', label: t('common.category'), render: (e) => e.category, sortValue: (e) => e.category },
            { key: 'label', label: t('common.description'), render: (e) => e.label, sortValue: (e) => e.label },
            { key: 'dir', label: t('finance.direction'), render: (e) => <Chip tone={e.direction === 'in' ? 'success' : 'danger'}>{e.direction === 'in' ? t('finance.in') : t('finance.out')}</Chip>, sortValue: (e) => e.direction },
            { key: 'amount', label: t('common.amount'), numeric: true, render: (e) => fmt.money(e.amount), sortValue: (e) => e.amount },
            { key: 'src', label: t('finance.source'), render: (e) => t(`finance.sourceType.${e.refType}`), sortValue: (e) => e.refType, hideOnMobile: true },
          ]}
          rows={entries}
          rowKey={(e) => e.id}
          empty={<EmptyState title={t('empty.ledger.title')} body={t('empty.ledger.body')} />}
        />
      </div>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        size="sm"
        title={t('finance.addManual')}
        footer={
          <>
            <Button onClick={() => setAddOpen(false)}>{t('action.cancel')}</Button>
            <Button
              variant="primary"
              onClick={async () => {
                const amount = money(entry.amount);
                if (amount <= 0) {
                  toast.push(t('error.validation'), 'danger');
                  return;
                }
                await run(() => addManualLedger({ date: entry.date, direction: entry.direction, category: entry.category, amount, note: entry.note }));
                setAddOpen(false);
                toast.push(t('app.saved'), 'success');
              }}
            >
              {t('action.save')}
            </Button>
          </>
        }
      >
        <div className="stack">
          <TextInput label={t('common.date')} type="date" value={entry.date} onChange={(e) => setEntry({ ...entry, date: e.target.value })} />
          <SelectInput label={t('finance.direction')} value={entry.direction} onChange={(e) => setEntry({ ...entry, direction: e.target.value as 'in' | 'out' })} options={[{ value: 'out', label: t('finance.out') }, { value: 'in', label: t('finance.in') }]} />
          <SelectInput label={t('common.category')} value={entry.category} onChange={(e) => setEntry({ ...entry, category: e.target.value })} options={(data.settings.expenseCategories ?? []).map((c) => ({ value: c, label: c }))} />
          <TextInput label={t('common.amount')} money value={entry.amount} onChange={(e) => setEntry({ ...entry, amount: e.target.value })} />
          <TextInput label={t('common.description')} value={entry.note} onChange={(e) => setEntry({ ...entry, note: e.target.value })} />
        </div>
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Expenses
 * ------------------------------------------------------------------ */

function ExpensesTab() {
  const { t } = useI18n();
  const fmt = useFmt();
  const { data, analytics, run } = useWorkspace();
  const toast = useToast();
  const [tab, setTab] = useState<'all' | 'recurring'>('all');
  const [editing, setEditing] = useState<Expense | null>(null);
  const [editingRecurring, setEditingRecurring] = useState<RecurringExpense | null>(null);
  const [paying, setPaying] = useState<RecurringExpense | null>(null);
  const [payDate, setPayDate] = useState('');
  const [payMethod, setPayMethod] = useState('');

  if (!analytics || !data) return null;

  const expenses = data.expenses
    .filter((e) => e.date >= analytics.range.start && e.date <= analytics.range.end)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const recurring = [...data.recurring].sort((a, b) => (a.nextDue < b.nextDue ? -1 : 1));

  const byCategory = (() => {
    const map = new Map<string, Money>();
    for (const e of expenses) map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  })();

  return (
    <>
      <div className="card__body">
        <div className="row--between row mb-4">
          <div className="row gap-2">
            <Button size="sm" variant={tab === 'all' ? 'primary' : 'secondary'} onClick={() => setTab('all')}>
              {t('expenses.title')}
            </Button>
            <Button size="sm" variant={tab === 'recurring' ? 'primary' : 'secondary'} onClick={() => setTab('recurring')}>
              {t('expenses.recurring')}
            </Button>
          </div>
          <Button variant="primary" icon={<IconPlus size={15} />} onClick={() => (tab === 'recurring' ? setEditingRecurring(emptyRecurring()) : setEditing(emptyExpense()))}>
            {tab === 'recurring' ? t('expenses.newRecurring') : t('expenses.new')}
          </Button>
        </div>

        <div className="grid grid--2 mb-5">
          <DonutChart data={byCategory.map(([label, value]) => ({ label, value: toChartMoney(value) }))} lang={fmt.lang} currency={fmt.currency} height={220} />
          <HorizontalBarChart data={byCategory.slice(0, 8).map(([label, value]) => ({ id: label, label, value: toChartMoney(value) }))} lang={fmt.lang} currency={fmt.currency} />
        </div>

        <DataTable
          columns={[
            { key: 'category', label: t('common.category'), render: (e: (typeof analytics.expenses)[number]) => e.category, sortValue: (e) => e.category },
            { key: 'current', label: t('expenses.current'), numeric: true, render: (e) => fmt.money(e.current), sortValue: (e) => e.current },
            { key: 'previous', label: t('expenses.previous'), numeric: true, render: (e) => fmt.money(e.previous), sortValue: (e) => e.previous },
            { key: 'change', label: t('common.change'), numeric: true, render: (e) => <span style={{ color: e.change > 0 ? 'var(--fin-loss)' : 'var(--fin-profit)' }}>{fmt.money(e.change)}</span>, sortValue: (e) => e.change },
            { key: 'changePct', label: t('common.changePct'), numeric: true, render: (e) => fmt.pct(e.changePct), sortValue: (e) => e.changePct },
            { key: 'share', label: t('finance.shareOfRevenue'), numeric: true, render: (e) => fmt.pct(e.shareOfRevenuePct), sortValue: (e) => e.shareOfRevenuePct, hideOnMobile: true },
            { key: 'flag', label: t('expenses.unusual'), render: (e) => (e.unusual ? <Chip tone="warning">{t('expenses.unusual')}</Chip> : '—'), sortValue: (e) => (e.unusual ? 1 : 0) },
          ]}
          rows={analytics.expenses}
          rowKey={(e) => e.category}
          empty={<EmptyState title={t('empty.expenses.title')} body={t('empty.expenses.body')} />}
        />

        {tab === 'all' ? (
          <div className="mt-5">
            <h4 className="mb-4">{t('expenses.all')}</h4>
            <DataTable
              columns={[
                { key: 'date', label: t('common.date'), render: (e: (typeof expenses)[number]) => fmt.date(e.date), sortValue: (e) => e.date },
                { key: 'cat', label: t('common.category'), render: (e) => e.category, sortValue: (e) => e.category },
                { key: 'vendor', label: t('expenses.vendor'), render: (e) => e.vendor || '—', sortValue: (e) => e.vendor, hideOnMobile: true },
                { key: 'method', label: t('expenses.method'), render: (e) => e.method || '—', sortValue: (e) => e.method, hideOnMobile: true },
                { key: 'amount', label: t('common.amount'), numeric: true, render: (e) => fmt.money(e.amount), sortValue: (e) => e.amount },
                { key: 'note', label: t('common.notes'), render: (e) => e.note || '—', sortValue: (e) => e.note, hideOnMobile: true },
              ]}
              rows={expenses}
              rowKey={(e) => e.id}
              onRowClick={(e) => setEditing(e)}
              empty={<EmptyState title={t('empty.expenses.title')} body={t('empty.expenses.body')} action={<Button variant="primary" onClick={() => setEditing(emptyExpense())}>{t('empty.expenses.cta')}</Button>} />}
            />
          </div>
        ) : (
          <div className="mt-5">
            <h4 className="mb-4">{t('expenses.recurring')}</h4>
            <p className="tiny muted mb-4">{t('expenses.recurringExplain')}</p>
            <DataTable
              columns={[
                { key: 'name', label: t('common.name'), render: (r: (typeof recurring)[number]) => r.name, sortValue: (r) => r.name },
                { key: 'cat', label: t('common.category'), render: (r) => r.category, sortValue: (r) => r.category },
                { key: 'amount', label: t('common.amount'), numeric: true, render: (r) => fmt.money(r.amount), sortValue: (r) => r.amount },
                { key: 'cycle', label: t('expenses.cycle'), render: (r) => t(`expenses.cycle.${r.cycle}`), sortValue: (r) => r.cycle, hideOnMobile: true },
                { key: 'due', label: t('expenses.nextDue'), render: (r) => fmt.date(r.nextDue), sortValue: (r) => r.nextDue },
                { key: 'act', label: t('common.actions'), render: (r) => (
                  <div className="row gap-2">
                    <Button size="sm" variant="primary" onClick={(e) => { e.stopPropagation(); setPaying(r); setPayDate(analytics.range.end); setPayMethod(data.settings.paymentMethods[0] ?? 'Cash'); }}>
                      {t('expenses.recordPayment')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setEditingRecurring(r); }}>
                      {t('action.edit')}
                    </Button>
                  </div>
                ), sortValue: (r) => r.id },
              ]}
              rows={recurring}
              rowKey={(r) => r.id}
              empty={<EmptyState title={t('empty.expenses.recurring')} body={t('expenses.recurringExplain')} action={<Button variant="primary" onClick={() => setEditingRecurring(emptyRecurring())}>{t('expenses.newRecurring')}</Button>} />}
            />
          </div>
        )}
      </div>

      {editing && (
        <ExpenseForm
          expense={editing}
          onClose={() => setEditing(null)}
          onSave={async (e) => {
            await run(() => saveExpense(e));
            setEditing(null);
            toast.push(t('app.saved'), 'success');
          }}
        />
      )}

      {editingRecurring && (
        <RecurringForm
          item={editingRecurring}
          onClose={() => setEditingRecurring(null)}
          onSave={async (r) => {
            await run(() => saveRecurring(r));
            setEditingRecurring(null);
            toast.push(t('app.saved'), 'success');
          }}
        />
      )}

      {paying && (
        <Modal
          open
          onClose={() => setPaying(null)}
          size="sm"
          title={t('expenses.recordPayment')}
          subtitle={paying.name}
          footer={
            <>
              <Button onClick={() => setPaying(null)}>{t('action.cancel')}</Button>
              <Button
                variant="primary"
                onClick={async () => {
                  await run(() => payRecurring(paying, payDate, payMethod));
                  setPaying(null);
                  toast.push(t('expenses.paidRecorded'), 'success');
                }}
              >
                {t('expenses.recordPayment')}
              </Button>
            </>
          }
        >
          <div className="stack">
            <TextInput label={t('common.date')} type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            <SelectInput label={t('expenses.method')} value={payMethod} onChange={(e) => setPayMethod(e.target.value)} options={data.settings.paymentMethods.map((m) => ({ value: m, label: m }))} />
            <TextInput label={t('common.amount')} money value={String(toMajor(paying.amount))} readOnly />
            <p className="field__help">{t('expenses.recurringExplain')}</p>
          </div>
        </Modal>
      )}
    </>
  );
}

export function ExpenseForm({ expense, onClose, onSave }: { expense: Expense; onClose: () => void; onSave: (e: Expense) => Promise<void> }) {
  const { t } = useI18n();
  const { data } = useWorkspace();
  const toast = useToast();
  const [draft, setDraft] = useState<Expense>(expense);
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t('expenses.new')}
      footer={
        <>
          <Button onClick={onClose}>{t('action.cancel')}</Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={async () => {
              if (draft.amount <= 0) {
                toast.push(t('error.validation'), 'danger');
                return;
              }
              setBusy(true);
              try {
                await onSave(draft);
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('action.save')}
          </Button>
        </>
      }
    >
      <div className="stack">
        <TextInput label={t('common.date')} type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
        <SelectInput label={t('common.category')} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} options={(data?.settings.expenseCategories ?? []).map((c) => ({ value: c, label: c }))} />
        <TextInput label={t('common.amount')} money required value={String(toMajor(draft.amount))} onChange={(e) => setDraft({ ...draft, amount: money(e.target.value) })} />
        <TextInput label={t('expenses.vendor')} value={draft.vendor} onChange={(e) => setDraft({ ...draft, vendor: e.target.value })} />
        <SelectInput label={t('expenses.method')} value={draft.method} onChange={(e) => setDraft({ ...draft, method: e.target.value })} options={(data?.settings.paymentMethods ?? []).map((m) => ({ value: m, label: m }))} />
        <TextInput label={t('common.notes')} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
      </div>
    </Modal>
  );
}

export function RecurringForm({ item, onClose, onSave }: { item: RecurringExpense; onClose: () => void; onSave: (r: RecurringExpense) => Promise<void> }) {
  const { t } = useI18n();
  const { data } = useWorkspace();
  const [draft, setDraft] = useState<RecurringExpense>(item);

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t('expenses.newRecurring')}
      subtitle={draft.name}
      footer={
        <>
          <Button onClick={onClose}>{t('action.cancel')}</Button>
          <Button variant="primary" onClick={() => onSave(draft)}>{t('action.save')}</Button>
        </>
      }
    >
      <div className="stack">
        <TextInput label={t('common.name')} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <SelectInput label={t('common.category')} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} options={(data?.settings.expenseCategories ?? []).map((c) => ({ value: c, label: c }))} />
        <TextInput label={t('common.amount')} money value={String(toMajor(draft.amount))} onChange={(e) => setDraft({ ...draft, amount: money(e.target.value) })} />
        <SelectInput label={t('expenses.cycle')} value={draft.cycle} onChange={(e) => setDraft({ ...draft, cycle: e.target.value as RecurringExpense['cycle'] })} options={[{ value: 'monthly', label: t('expenses.cycle.monthly') }, { value: 'yearly', label: t('expenses.cycle.yearly') }, { value: 'custom', label: t('expenses.cycle.custom') }]} />
        {draft.cycle === 'custom' && <TextInput label={t('expenses.intervalDays')} value={String(draft.intervalDays)} onChange={(e) => setDraft({ ...draft, intervalDays: Number(e.target.value) || 0 })} />}
        <TextInput label={t('expenses.nextDue')} type="date" value={draft.nextDue} onChange={(e) => setDraft({ ...draft, nextDue: e.target.value })} />
        <TextInput label={t('expenses.renewalType')} value={draft.renewalType} onChange={(e) => setDraft({ ...draft, renewalType: e.target.value })} />
        <TextInput label={t('common.notes')} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
        <Switch label={t('status.active')} checked={draft.active} onChange={(v) => setDraft({ ...draft, active: v })} />
        <p className="field__help">{t('expenses.recurringExplain')}</p>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ *
 * Receivables / payables
 * ------------------------------------------------------------------ */

function ReceivablesTab() {
  const { t } = useI18n();
  const fmt = useFmt();
  const { analytics, data } = useWorkspace();
  if (!analytics || !data) return null;

  const rows = analytics.period.orders
    .map((o) => {
      const eco = analytics.metrics.orderEconomicsByOrder.get(o.id);
      const due = eco?.netRevenue ?? 0;
      const paid = data.payments.filter((p) => p.orderId === o.id).reduce((a, p) => a + (p.type === 'in' ? p.amount : -p.amount), 0);
      return { order: o, due, paid, outstanding: due - paid };
    })
    .filter((r) => r.outstanding > 0)
    .sort((a, b) => b.outstanding - a.outstanding);

  const total = rows.reduce((a, r) => a + r.outstanding, 0);

  return (
    <div className="card__body">
      <div className="grid grid--kpi mb-5">
        <div className="metric"><span className="metric__label">{t('kpi.receivables')}</span><span className="metric__value metric__value--sm">{fmt.money(analytics.metrics.positions.receivables)}</span></div>
        <div className="metric"><span className="metric__label">{t('kpi.pendingCod')}</span><span className="metric__value metric__value--sm">{fmt.money(analytics.metrics.positions.pendingCod)}</span></div>
        <div className="metric"><span className="metric__label">{t('finance.unpaidOrders')}</span><span className="metric__value metric__value--sm">{fmt.num(rows.length)}</span></div>
        <div className="metric"><span className="metric__label">{t('finance.outstandingTotal')}</span><span className="metric__value metric__value--sm">{fmt.money(total)}</span></div>
      </div>
      <p className="tiny muted mb-4">{t('finance.receivablesExplain')}</p>
      <DataTable
        columns={[
          { key: 'no', label: t('orders.orderNo'), render: (r: (typeof rows)[number]) => <Link to={`/orders/${r.order.id}`}>{r.order.orderNo}</Link>, sortValue: (r) => r.order.orderNo },
          { key: 'date', label: t('common.date'), render: (r) => fmt.date(r.order.date), sortValue: (r) => r.order.date },
          { key: 'customer', label: t('orders.customer'), render: (r) => data.customers.find((c) => c.id === r.order.customerId)?.name ?? '—', sortValue: (r) => r.order.customerId ?? '' },
          { key: 'due', label: t('finance.netRevenue'), numeric: true, render: (r) => fmt.money(r.due), sortValue: (r) => r.due },
          { key: 'paid', label: t('orders.paid'), numeric: true, render: (r) => fmt.money(r.paid), sortValue: (r) => r.paid },
          { key: 'out', label: t('finance.outstanding'), numeric: true, render: (r) => fmt.money(r.outstanding), sortValue: (r) => r.outstanding },
          { key: 'status', label: t('orders.deliveryStatus'), render: (r) => <Chip tone="outline">{t(`status.${r.order.status}`)}</Chip>, sortValue: (r) => r.order.status },
        ]}
        rows={rows}
        rowKey={(r) => r.order.id}
        empty={<EmptyState title={t('finance.noReceivables')} body={t('finance.noReceivablesBody')} />}
      />
    </div>
  );
}

function PayablesTab() {
  const { t } = useI18n();
  const fmt = useFmt();
  const { analytics, data } = useWorkspace();
  if (!analytics || !data) return null;

  const rows = data.purchases
    .map((p) => {
      const items = data.purchaseItems.filter((i) => i.purchaseId === p.id);
      const goods = items.reduce((a, i) => a + roundMinor(i.buyingPrice * i.receivedQty), 0);
      const paid = p.payments.reduce((a, x) => a + x.amount, 0);
      return { purchase: p, goods, paid, outstanding: goods - paid };
    })
    .filter((r) => r.outstanding > 0)
    .sort((a, b) => b.outstanding - a.outstanding);

  const total = rows.reduce((a, r) => a + r.outstanding, 0);

  return (
    <div className="card__body">
      <div className="grid grid--kpi mb-5">
        <div className="metric"><span className="metric__label">{t('kpi.payables')}</span><span className="metric__value metric__value--sm">{fmt.money(analytics.metrics.positions.payables)}</span></div>
        <div className="metric"><span className="metric__label">{t('finance.unpaidPurchases')}</span><span className="metric__value metric__value--sm">{fmt.num(rows.length)}</span></div>
        <div className="metric"><span className="metric__label">{t('finance.outstandingTotal')}</span><span className="metric__value metric__value--sm">{fmt.money(total)}</span></div>
      </div>
      <p className="tiny muted mb-4">{t('finance.payablesExplain')}</p>
      <DataTable
        columns={[
          { key: 'ref', label: t('purchases.ref'), render: (r: (typeof rows)[number]) => r.purchase.ref, sortValue: (r) => r.purchase.ref },
          { key: 'date', label: t('common.date'), render: (r) => fmt.date(r.purchase.date), sortValue: (r) => r.purchase.date },
          { key: 'supplier', label: t('nav.suppliers'), render: (r) => data.suppliers.find((s) => s.id === r.purchase.supplierId)?.name ?? '—', sortValue: (r) => r.purchase.supplierId ?? '' },
          { key: 'goods', label: t('purchases.totalValue'), numeric: true, render: (r) => fmt.money(r.goods), sortValue: (r) => r.goods },
          { key: 'paid', label: t('purchases.paid'), numeric: true, render: (r) => fmt.money(r.paid), sortValue: (r) => r.paid },
          { key: 'out', label: t('purchases.outstanding'), numeric: true, render: (r) => fmt.money(r.outstanding), sortValue: (r) => r.outstanding },
        ]}
        rows={rows}
        rowKey={(r) => r.purchase.id}
        empty={<EmptyState title={t('finance.noPayables')} body={t('finance.noPayablesBody')} />}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Product / category / channel cost analysis
 * ------------------------------------------------------------------ */

function ProductCostTab() {
  const { t } = useI18n();
  const fmt = useFmt();
  const { analytics } = useWorkspace();
  if (!analytics) return null;

  const rows = [...analytics.products].sort((a, b) => b.contributionProfit - a.contributionProfit);

  return (
    <div className="card__body">
      <DataTable
        columns={[
          { key: 'name', label: t('products.field.name'), render: (r: (typeof rows)[number]) => <Link to={`/products/${r.product.id}`}>{r.product.name}</Link>, sortValue: (r) => r.product.name },
          { key: 'units', label: t('common.units'), numeric: true, render: (r) => fmt.num(r.units), sortValue: (r) => r.units },
          { key: 'revenue', label: t('finance.netRevenue'), numeric: true, render: (r) => fmt.money(r.netRevenue), sortValue: (r) => r.netRevenue },
          { key: 'cogs', label: t('kpi.cogs'), numeric: true, render: (r) => fmt.money(r.cogs), sortValue: (r) => r.cogs },
          { key: 'gp', label: t('kpi.grossProfit'), numeric: true, render: (r) => fmt.money(r.grossProfit), sortValue: (r) => r.grossProfit },
          { key: 'ads', label: t('kpi.adSpend'), numeric: true, render: (r) => fmt.money(r.adSpend), sortValue: (r) => r.adSpend, hideOnMobile: true },
          { key: 'courier', label: t('finance.courier'), numeric: true, render: (r) => fmt.money(r.courier), sortValue: (r) => r.courier, hideOnMobile: true },
          { key: 'cp', label: t('kpi.contributionProfit'), numeric: true, render: (r) => <span style={{ color: r.contributionProfit < 0 ? 'var(--fin-loss)' : 'var(--fin-profit)' }}>{fmt.money(r.contributionProfit)}</span>, sortValue: (r) => r.contributionProfit },
          { key: 'margin', label: t('kpi.contributionMargin'), numeric: true, render: (r) => fmt.pct(r.netMarginPct), sortValue: (r) => r.netMarginPct },
          { key: 'perUnit', label: t('products.profitPerUnit'), numeric: true, render: (r) => fmt.money(r.profitPerUnit), sortValue: (r) => r.profitPerUnit, hideOnMobile: true },
        ]}
        rows={rows}
        rowKey={(r) => r.product.id}
        empty={<EmptyState title={t('empty.products.title')} body={t('empty.products.body')} />}
      />
    </div>
  );
}

function CategoryTab() {
  const { t } = useI18n();
  const fmt = useFmt();
  const { analytics } = useWorkspace();
  if (!analytics) return null;

  const rows = (() => {
    const map = new Map<string, { revenue: number; cogs: number; ads: number; profit: number; units: number }>();
    for (const p of analytics.products) {
      const key = p.product.category || '—';
      const cur = map.get(key) ?? { revenue: 0, cogs: 0, ads: 0, profit: 0, units: 0 };
      cur.revenue += p.netRevenue;
      cur.cogs += p.cogs;
      cur.ads += p.adSpend;
      cur.profit += p.contributionProfit;
      cur.units += p.units;
      map.set(key, cur);
    }
    return [...map.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.revenue - a.revenue);
  })();

  return (
    <div className="card__body">
      <div className="grid grid--2 mb-5">
        <DonutChart data={rows.slice(0, 6).map((r) => ({ label: r.key, value: toChartMoney(r.revenue) }))} lang={fmt.lang} currency={fmt.currency} height={220} />
        <HorizontalBarChart data={rows.slice(0, 8).map((r) => ({ id: r.key, label: r.key, value: toChartMoney(r.profit) }))} lang={fmt.lang} currency={fmt.currency} />
      </div>
      <DataTable
        columns={[
          { key: 'key', label: t('common.category'), render: (r: (typeof rows)[number]) => r.key, sortValue: (r) => r.key },
          { key: 'units', label: t('common.units'), numeric: true, render: (r) => fmt.num(r.units), sortValue: (r) => r.units },
          { key: 'revenue', label: t('finance.netRevenue'), numeric: true, render: (r) => fmt.money(r.revenue), sortValue: (r) => r.revenue },
          { key: 'cogs', label: t('kpi.cogs'), numeric: true, render: (r) => fmt.money(r.cogs), sortValue: (r) => r.cogs },
          { key: 'ads', label: t('kpi.adSpend'), numeric: true, render: (r) => fmt.money(r.ads), sortValue: (r) => r.ads, hideOnMobile: true },
          { key: 'profit', label: t('kpi.contributionProfit'), numeric: true, render: (r) => <span style={{ color: r.profit < 0 ? 'var(--fin-loss)' : 'var(--fin-profit)' }}>{fmt.money(r.profit)}</span>, sortValue: (r) => r.profit },
          { key: 'margin', label: t('kpi.contributionMargin'), numeric: true, render: (r) => fmt.pct(r.revenue > 0 ? (r.profit / r.revenue) * 100 : null), sortValue: (r) => (r.revenue > 0 ? r.profit / r.revenue : 0) },
        ]}
        rows={rows}
        rowKey={(r) => r.key}
        empty={<EmptyState title={t('empty.products.title')} body={t('empty.products.body')} />}
      />
    </div>
  );
}

function ChannelTab() {
  const { t } = useI18n();
  const fmt = useFmt();
  const { analytics } = useWorkspace();
  if (!analytics) return null;

  const rows = (() => {
    const map = new Map<string, { revenue: number; orders: number; cogs: number; ads: number; profit: number }>();
    for (const o of analytics.period.orders) {
      const eco = analytics.metrics.orderEconomicsByOrder.get(o.id);
      const key = o.channel || '—';
      const cur = map.get(key) ?? { revenue: 0, orders: 0, cogs: 0, ads: 0, profit: 0 };
      cur.revenue += eco?.netRevenue ?? 0;
      cur.orders += 1;
      cur.cogs += eco?.cogs ?? 0;
      cur.ads += eco?.adSpend ?? 0;
      cur.profit += eco?.contributionProfit ?? 0;
      map.set(key, cur);
    }
    return [...map.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.revenue - a.revenue);
  })();

  return (
    <div className="card__body">
      <div className="grid grid--2 mb-5">
        <DonutChart data={rows.slice(0, 6).map((r) => ({ label: r.key, value: toChartMoney(r.revenue) }))} lang={fmt.lang} currency={fmt.currency} height={220} />
        <HorizontalBarChart data={rows.slice(0, 8).map((r) => ({ id: r.key, label: r.key, value: toChartMoney(r.profit) }))} lang={fmt.lang} currency={fmt.currency} />
      </div>
      <DataTable
        columns={[
          { key: 'key', label: t('orders.channel'), render: (r: (typeof rows)[number]) => r.key, sortValue: (r) => r.key },
          { key: 'orders', label: t('kpi.orders'), numeric: true, render: (r) => fmt.num(r.orders), sortValue: (r) => r.orders },
          { key: 'revenue', label: t('finance.netRevenue'), numeric: true, render: (r) => fmt.money(r.revenue), sortValue: (r) => r.revenue },
          { key: 'cogs', label: t('kpi.cogs'), numeric: true, render: (r) => fmt.money(r.cogs), sortValue: (r) => r.cogs, hideOnMobile: true },
          { key: 'ads', label: t('kpi.adSpend'), numeric: true, render: (r) => fmt.money(r.ads), sortValue: (r) => r.ads, hideOnMobile: true },
          { key: 'profit', label: t('kpi.contributionProfit'), numeric: true, render: (r) => <span style={{ color: r.profit < 0 ? 'var(--fin-loss)' : 'var(--fin-profit)' }}>{fmt.money(r.profit)}</span>, sortValue: (r) => r.profit },
          { key: 'margin', label: t('kpi.contributionMargin'), numeric: true, render: (r) => fmt.pct(r.revenue > 0 ? (r.profit / r.revenue) * 100 : null), sortValue: (r) => (r.revenue > 0 ? r.profit / r.revenue : 0) },
          { key: 'aov', label: t('kpi.aov'), numeric: true, render: (r) => (r.orders > 0 ? fmt.money(Math.round(r.revenue / r.orders)) : '—'), sortValue: (r) => (r.orders > 0 ? r.revenue / r.orders : 0), hideOnMobile: true },
        ]}
        rows={rows}
        rowKey={(r) => r.key}
        empty={<EmptyState title={t('empty.orders.title')} body={t('empty.orders.body')} />}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Analysis: unit economics + break-even detail
 * ------------------------------------------------------------------ */

function AnalysisTab() {
  const { t } = useI18n();
  const fmt = useFmt();
  const { analytics } = useWorkspace();
  if (!analytics) return null;

  const { pl, breakEven: be, positions, ad } = analytics.metrics;
  const perOrder = pl.orders > 0 ? pl.netRevenue / pl.orders : null;
  const cogsPerOrder = pl.orders > 0 ? pl.cogs / pl.orders : null;
  const variablePerOrder = pl.orders > 0 ? pl.variableTotal / pl.orders : null;
  const contributionPerOrder = pl.orders > 0 ? pl.contributionProfit / pl.orders : null;
  const opexPerOrder = pl.orders > 0 ? pl.operatingExpenses / pl.orders : null;
  const fixedPerDay = analytics.range.days > 0 ? pl.operatingExpenses / analytics.range.days : 0;

  return (
    <div className="card__body">
      <div className="grid grid--2 mb-5">
        <Card title={t('finance.unitEconomics')}>
          <KeyValue
            rows={[
              { label: t('finance.revenuePerOrder'), value: perOrder === null ? '—' : fmt.money(Math.round(perOrder)) },
              { label: t('finance.cogsPerOrder'), value: cogsPerOrder === null ? '—' : fmt.money(Math.round(cogsPerOrder)) },
              { label: t('finance.variablePerOrder'), value: variablePerOrder === null ? '—' : fmt.money(Math.round(variablePerOrder)) },
              { label: t('kpi.contributionProfit'), value: contributionPerOrder === null ? '—' : fmt.money(Math.round(contributionPerOrder)), divider: true },
              { label: t('finance.opexPerOrder'), value: opexPerOrder === null ? '—' : fmt.money(Math.round(opexPerOrder)) },
              { label: t('finance.fixedPerDay'), value: fmt.money(Math.round(fixedPerDay)) },
              { label: t('finance.ordersPerDay'), value: analytics.range.days > 0 ? fmt.num(pl.orders / analytics.range.days, 1) : '—' },
            ]}
          />
        </Card>
        <Card title={t('finance.breakEvenDetail')}>
          <KeyValue rows={breakEvenSummary(be).map((r) => ({ label: t(`finance.breakEvenSummary.${r.label}`), value: r.value === null ? '—' : fmt.money(r.value) }))} />
          {be.breakEvenRevenue === null ? (
            <Card className="panel mt-4">
              <p className="small">{t(`finance.breakEvenUnavailable.${be.unavailableReason === 'no-contribution' ? 'contribution' : 'revenue'}`)}</p>
            </Card>
          ) : (
            <div className="mt-4">
              <div className="row--between row" style={{ marginBottom: 4 }}>
                <span className="small">{t('finance.coverage')}</span>
                <span className="num small">{fmt.pct(be.coveragePct)}</span>
              </div>
              <Bar value={Math.max(0, Math.min(100, be.coveragePct ?? 0))} tone={(be.coveragePct ?? 0) >= 100 ? 'success' : 'warning'} />
            </div>
          )}
        </Card>
      </div>

      <Card title={t('finance.costStructure')} className="mb-5">
        <HorizontalBarChart
          data={[
            { id: 'cogs', label: t('kpi.cogs'), value: toChartMoney(pl.cogs) },
            { id: 'ads', label: t('finance.advertising'), value: toChartMoney(pl.variable.advertising) },
            { id: 'courier', label: t('finance.courier'), value: toChartMoney(pl.variable.courier) },
            { id: 'packaging', label: t('finance.packaging'), value: toChartMoney(pl.variable.packaging) },
            { id: 'payment', label: t('finance.paymentFees'), value: toChartMoney(pl.variable.paymentFees) },
            { id: 'returns', label: t('finance.returnsCost'), value: toChartMoney(pl.variable.returns) },
            { id: 'damage', label: t('finance.damage'), value: toChartMoney(pl.variable.damage) },
            { id: 'opex', label: t('finance.operatingExpenses'), value: toChartMoney(pl.operatingExpenses) },
          ].filter((r) => r.value > 0)}
          lang={fmt.lang}
          currency={fmt.currency}
        />
      </Card>

      <Card title={t('finance.reconciliation')}>
        <KeyValue
          rows={[
            { label: t('kpi.netProfit'), value: fmt.money(pl.netOperatingProfit) },
            { label: t('kpi.cashBalance'), value: fmt.money(positions.cash) },
            { label: t('kpi.receivables'), value: fmt.money(positions.receivables) },
            { label: t('kpi.payables'), value: fmt.money(-positions.payables) },
            { label: t('kpi.inventoryValue'), value: fmt.money(positions.inventoryValue) },
            { label: t('kpi.pendingCod'), value: fmt.money(positions.pendingCod) },
            { label: t('kpi.pendingSettlement'), value: fmt.money(positions.pendingSettlement), divider: true },
            { label: t('kpi.adSpend'), value: fmt.money(ad.spend) },
            { label: t('finance.unallocatedAdSpend'), value: fmt.money(analytics.metrics.unallocatedAdSpend) },
            { label: t('finance.adAllocationEstimated'), value: analytics.metrics.adAllocationEstimated ? t('common.estimate') : t('ads.actual') },
          ]}
        />
        <p className="field__help mt-4">{t('finance.reconciliationHelp')}</p>
      </Card>
    </div>
  );
}
