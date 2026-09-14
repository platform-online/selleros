import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useWorkspace } from '../state/workspace';
import { useFmt } from '../state/format';
import { useInsights } from '../state/insights';
import { PageHeader } from '../components/layout/PageHeader';
import { PeriodPicker } from '../components/layout/PeriodPicker';
import { Bar, Button, Card, Chip, EmptyState, Field, KeyValue, Modal, SelectInput, Switch, TextInput, useToast } from '../components/ui/primitives';
import { DataTable } from '../components/ui/DataTable';
import { TrendChart, toChartMoney } from '../components/charts/Charts';
import { emptyGoal, saveGoal } from '../state/mutations';
import { NEUTRAL_SCENARIO, whatIf, type WhatIfInput } from '../domain/intelligence';
import type { Goal, GoalMetric } from '../domain/types';
import { IconPlus, IconSpark } from '../components/ui/icons';

type TabId = 'health' | 'actions' | 'opportunities' | 'goals' | 'whatif' | 'forecast' | 'concentration';

const TABS: TabId[] = ['health', 'actions', 'opportunities', 'goals', 'whatif', 'forecast', 'concentration'];

const PRIORITY_TONE: Record<string, 'danger' | 'warning' | 'info' | 'neutral'> = {
  critical: 'danger',
  important: 'warning',
  opportunity: 'info',
  monitor: 'neutral',
};

export function InsightsPage() {
  const { t } = useI18n();
  const { analytics, loading } = useWorkspace();
  const insights = useInsights();
  const [tab, setTab] = useState<TabId>('health');

  if (loading || !analytics) return <Card><p className="muted small">{t('common.loading')}</p></Card>;

  return (
    <>
      <PageHeader title={t('insights.title')} subtitle={t('insights.subtitle')}>
        <div className="mt-4">
          <PeriodPicker />
        </div>
      </PageHeader>

      {insights === null ? (
        <Card><p className="muted small">{t('common.loading')}</p></Card>
      ) : (
        <Card flush>
          <div className="card__body" style={{ paddingBottom: 0 }}>
            <div className="tabs tabs--scroll" role="tablist" aria-label={t('insights.title')}>
              {TABS.map((id) => (
                <button key={id} type="button" role="tab" className="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
                  {t(`insights.tab.${id}`)}
                </button>
              ))}
            </div>
          </div>

          {tab === 'health' && <div role="tabpanel" tabIndex={-1}><HealthTab /></div>}
          {tab === 'actions' && <div role="tabpanel" tabIndex={-1}><ActionsTab /></div>}
          {tab === 'opportunities' && <div role="tabpanel" tabIndex={-1}><OpportunitiesTab /></div>}
          {tab === 'goals' && <div role="tabpanel" tabIndex={-1}><GoalsTab /></div>}
          {tab === 'whatif' && <div role="tabpanel" tabIndex={-1}><WhatIfTab /></div>}
          {tab === 'forecast' && <div role="tabpanel" tabIndex={-1}><ForecastTab /></div>}
          {tab === 'concentration' && <div role="tabpanel" tabIndex={-1}><ConcentrationTab /></div>}
        </Card>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Health
 * ------------------------------------------------------------------ */

function HealthTab() {
  const { t } = useI18n();
  const fmt = useFmt();
  const insights = useInsights();
  if (!insights) return null;
  const { health, leaks } = insights;

  return (
    <div className="card__body">
      <div className="row gap-4 mb-5">
        <div
          className="health-ring"
          role="img"
          aria-label={`${t('insights.health.title')}: ${health.score === null ? t('common.noData') : fmt.num(health.score, 0)}`}
          style={{ ['--p' as string]: `${health.score ?? 0}%` }}
        >
          <span className="health-ring__value">{health.score === null ? '—' : fmt.num(health.score, 0)}</span>
        </div>
        <div>
          <h3>{t(`insights.health.band.${health.band}`)}</h3>
          <p className="small muted">
            {t('insights.health.dimensions')}: {fmt.num(health.includedCount)} · {t('insights.health.excluded')}: {fmt.num(health.excludedCount)}
          </p>
          <p className="tiny muted mt-2">{t('insights.health.explain')}</p>
        </div>
      </div>

      <div className="stack">
        {health.dimensions.map((d) => (
          <Card key={d.key} className="panel">
            <div className="row--between row">
              <strong>{t(`insights.dimension.${d.key}`)}</strong>
              <span className="num small">{d.score === null ? t('common.noData') : fmt.num(d.score, 0)}</span>
            </div>
            {d.score !== null && (
              <div className="mt-2">
                <Bar value={d.score} tone={d.score >= 70 ? 'success' : d.score >= 40 ? 'warning' : 'danger'} />
              </div>
            )}
            <p className="small mt-2">{d.reason}</p>
            <p className="tiny muted mt-2">{t('common.evidence')}: {d.evidence}</p>
            {d.positive && <p className="tiny mt-2 money-positive">{d.positive}</p>}
            {d.negative && <p className="tiny mt-2 money-negative">{d.negative}</p>}
            <p className="tiny mt-2"><strong>{t('common.recommendation')}:</strong> {d.recommendation}</p>
          </Card>
        ))}
      </div>

      {leaks.length > 0 && (
        <Card title={t('finance.profitLeaks')} className="mt-5">
          <KeyValue
            rows={leaks.slice(0, 8).map((l) => ({
              label: t(`finance.line.${l.key}`),
              value: `${fmt.money(l.amount)} · ${fmt.money(l.profitImpact)}`,
              tone: l.profitImpact < 0 ? ('negative' as const) : ('positive' as const),
            }))}
          />
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Action center
 * ------------------------------------------------------------------ */

function ActionsTab() {
  const { t } = useI18n();
  const fmt = useFmt();
  const insights = useInsights();
  const [filter, setFilter] = useState('all');
  if (!insights) return null;

  const rows = insights.actions.filter((a) => (filter === 'all' ? true : a.priority === filter));

  return (
    <div className="card__body">
      <div className="row gap-2 mb-4">
        {['all', 'critical', 'important', 'opportunity', 'monitor'].map((p) => (
          <Button key={p} size="sm" variant={filter === p ? 'primary' : 'secondary'} onClick={() => setFilter(p)}>
            {p === 'all' ? t('common.all') : t(`insights.priority.${p}`)}
          </Button>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<IconSpark size={20} />} title={t('insights.noActions')} body={t('insights.noActionsBody')} />
      ) : (
        <DataTable
          columns={[
            { key: 'priority', label: t('common.priority'), render: (a: (typeof rows)[number]) => <Chip tone={PRIORITY_TONE[a.priority]}>{t(`insights.priority.${a.priority}`)}</Chip>, sortValue: (a) => a.priority },
            { key: 'title', label: t('common.title'), render: (a) => a.title, sortValue: (a) => a.title },
            { key: 'metric', label: t('common.metric'), render: (a) => a.metric, sortValue: (a) => a.metric, hideOnMobile: true },
            { key: 'reason', label: t('common.why'), render: (a) => a.reason, sortValue: (a) => a.reason },
            { key: 'impact', label: t('common.impact'), numeric: true, render: (a) => (a.impact === null ? t('common.estimateUnavailable') : fmt.money(a.impact)), sortValue: (a) => a.impact },
            { key: 'action', label: t('common.actions'), render: (a) => <Link to={a.to} className="btn btn--sm btn--primary">{a.action}</Link>, sortValue: (a) => a.action },
          ]}
          rows={rows}
          rowKey={(a) => a.id}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Opportunities
 * ------------------------------------------------------------------ */

function OpportunitiesTab() {
  const { t } = useI18n();
  const fmt = useFmt();
  const insights = useInsights();
  if (!insights) return null;

  return (
    <div className="card__body">
      {insights.opportunities.length === 0 ? (
        <EmptyState icon={<IconSpark size={20} />} title={t('insights.noOpportunities')} body={t('insights.noOpportunitiesBody')} />
      ) : (
        <div className="stack">
          {insights.opportunities.map((o) => (
            <Card key={o.id} className="panel">
              <div className="row--between row">
                <strong>{o.title}</strong>
                <Chip tone={o.confidence === 'high' ? 'success' : o.confidence === 'medium' ? 'info' : 'neutral'}>
                  {t(`insights.confidence.${o.confidence}`)}
                </Chip>
              </div>
              <p className="small mt-2">{o.reason}</p>
              <p className="tiny muted mt-2">
                {t('common.impact')}: {o.impact === null ? t('common.estimateUnavailable') : fmt.money(o.impact)}
              </p>
              <div className="mt-4">
                <Link to={o.to} className="btn btn--sm btn--secondary">
                  {o.action}
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Goals
 * ------------------------------------------------------------------ */

function GoalsTab() {
  const { t } = useI18n();
  const fmt = useFmt();
  const insights = useInsights();
  const { data, run } = useWorkspace();
  const toast = useToast();
  const [editing, setEditing] = useState<Goal | null>(null);
  if (!insights || !data) return null;

  const rows = insights.goals;

  return (
    <div className="card__body">
      <div className="row--between row mb-4">
        <p className="tiny muted">{t('insights.goals.explain')}</p>
        <Button variant="primary" icon={<IconPlus size={15} />} onClick={() => setEditing(emptyGoal())}>
          {t('insights.goals.new')}
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState title={t('insights.goals.empty')} body={t('insights.goals.emptyBody')} action={<Button variant="primary" onClick={() => setEditing(emptyGoal())}>{t('insights.goals.new')}</Button>} />
      ) : (
        <div className="stack">
          {rows.map((g) => (
            <Card key={g.id} className="panel">
              <div className="row--between row">
                <strong>{t(`insights.goal.metric.${g.metric}`)}</strong>
                <Chip tone={g.onTrack ? 'success' : 'warning'}>{g.onTrack ? t('insights.goals.onTrack') : t('insights.goals.behind')}</Chip>
              </div>
              <div className="mt-2">
                <Bar value={Math.max(0, Math.min(100, g.achievedPct ?? 0))} tone={g.onTrack ? 'success' : 'warning'} />
              </div>
              <KeyValue
                className="mt-4"
                tight
                rows={[
                  { label: t('insights.goals.actual'), value: formatByUnit(g.unit, g.actual, fmt) },
                  { label: t('insights.goals.target'), value: formatByUnit(g.unit, g.target, fmt) },
                  { label: t('insights.goals.remaining'), value: formatByUnit(g.unit, g.remaining, fmt) },
                  { label: t('insights.goals.requiredPace'), value: formatByUnit(g.unit, g.requiredPace, fmt) },
                  { label: t('insights.goals.projected'), value: formatByUnit(g.unit, g.projected, fmt), divider: true },
                  { label: t('insights.goals.achieved'), value: fmt.pct(g.achievedPct) },
                ]}
              />
              <div className="mt-4">
                <Button size="sm" variant="ghost" onClick={() => setEditing(data.goals.find((x) => x.id === g.id) ?? emptyGoal())}>
                  {t('action.edit')}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <GoalForm
          goal={editing}
          onClose={() => setEditing(null)}
          onSave={async (g) => {
            await run(() => saveGoal(g));
            setEditing(null);
            toast.push(t('app.saved'), 'success');
          }}
        />
      )}
    </div>
  );
}

function formatByUnit(unit: 'money' | 'count' | 'percent' | 'multiple', value: number, fmt: ReturnType<typeof useFmt>): string {
  switch (unit) {
    case 'money':
      return fmt.money(Math.round(value * 100));
    case 'percent':
      return fmt.pct(value);
    case 'multiple':
      return fmt.multiple(value);
    default:
      return fmt.num(value, 1);
  }
}

function GoalForm({ goal, onClose, onSave }: { goal: Goal; onClose: () => void; onSave: (g: Goal) => Promise<void> }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<Goal>(goal);

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t('insights.goals.new')}
      footer={
        <>
          <Button onClick={onClose}>{t('action.cancel')}</Button>
          <Button variant="primary" onClick={() => onSave(draft)}>{t('action.save')}</Button>
        </>
      }
    >
      <div className="stack">
        <SelectInput
          label={t('insights.goals.metric')}
          value={draft.metric}
          onChange={(e) => setDraft({ ...draft, metric: e.target.value as GoalMetric })}
          options={['revenue', 'profit', 'orders', 'netMarginPct', 'roas', 'cac', 'aov', 'customers'].map((m) => ({ value: m, label: t(`insights.goal.metric.${m}`) }))}
        />
        <TextInput
          label={t('insights.goals.target')}
          value={String(draft.target)}
          help={['revenue', 'profit', 'aov', 'cac'].includes(draft.metric) ? t('insights.goals.targetMoneyHelp') : undefined}
          onChange={(e) => setDraft({ ...draft, target: Number(e.target.value) || 0 })}
        />
        <SelectInput label={t('insights.goals.period')} value={draft.period} onChange={(e) => setDraft({ ...draft, period: e.target.value as Goal['period'] })} options={[{ value: 'monthly', label: t('period.thisMonth') }, { value: 'quarterly', label: t('period.quarter') }, { value: 'yearly', label: t('period.year') }]} />
        <TextInput label={t('common.notes')} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
        <Switch label={t('status.active')} checked={draft.active} onChange={(v) => setDraft({ ...draft, active: v })} />
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ *
 * What-if
 * ------------------------------------------------------------------ */

function WhatIfTab() {
  const { t } = useI18n();
  const fmt = useFmt();
  const { analytics } = useWorkspace();
  const [scenario, setScenario] = useState<WhatIfInput>({ ...NEUTRAL_SCENARIO });
  const [elasticity, setElasticity] = useState(-1.2);
  if (!analytics) return null;

  const pl = analytics.metrics.pl;
  const result = whatIf(pl, analytics.metrics.ad.spend, scenario, elasticity);
  const baseline = whatIf(pl, analytics.metrics.ad.spend, NEUTRAL_SCENARIO, elasticity);

  const sliders: { key: keyof WhatIfInput; label: string; min: number; max: number }[] = [
    { key: 'pricePct', label: t('insights.whatIf.price'), min: -30, max: 30 },
    { key: 'discountPct', label: t('insights.whatIf.discount'), min: 0, max: 30 },
    { key: 'adSpendPct', label: t('kpi.adSpend'), min: -50, max: 100 },
    { key: 'roasPct', label: t('ads.roas'), min: -40, max: 40 },
    { key: 'cogsPct', label: t('kpi.cogs'), min: -30, max: 30 },
    { key: 'courierPct', label: t('finance.courier'), min: -30, max: 30 },
    { key: 'packagingPct', label: t('finance.packaging'), min: -30, max: 30 },
    { key: 'returnRatePct', label: t('kpi.returnRate'), min: -10, max: 10 },
    { key: 'paymentFeePct', label: t('finance.paymentFees'), min: -5, max: 5 },
    { key: 'volumePct', label: t('insights.whatIf.volume'), min: -50, max: 100 },
  ];

  return (
    <div className="card__body">
      <div className="grid grid--2">
        <Card title={t('insights.whatIf.title')}>
          <div className="stack">
            {sliders.map((s) => (
              <Field key={s.key} label={`${s.label}: ${scenario[s.key] > 0 ? '+' : ''}${fmt.num(scenario[s.key], 0)}%`}>
                <input
                  className="range"
                  type="range"
                  min={s.min}
                  max={s.max}
                  step={1}
                  value={scenario[s.key]}
                  aria-label={s.label}
                  onChange={(e) => setScenario({ ...scenario, [s.key]: Number(e.target.value) })}
                />
              </Field>
            ))}
            <Field label={`${t('insights.whatIf.elasticity')}: ${fmt.num(elasticity, 2)}`}>
              <input className="range" type="range" min={-3} max={0} step={0.1} value={elasticity} aria-label={t('insights.whatIf.elasticity')} onChange={(e) => setElasticity(Number(e.target.value))} />
            </Field>
            <Button size="sm" variant="secondary" onClick={() => setScenario({ ...NEUTRAL_SCENARIO })}>
              {t('insights.whatIf.reset')}
            </Button>
          </div>
        </Card>

        <Card title={t('insights.whatIf.result')}>
          <KeyValue
            rows={[
              { label: t('finance.netRevenue'), value: fmt.money(result.revenue) },
              { label: t('kpi.orders'), value: fmt.num(result.orders) },
              { label: t('kpi.grossProfit'), value: fmt.money(result.grossProfit) },
              { label: t('kpi.contributionProfit'), value: fmt.money(result.contributionProfit), tone: result.contributionProfit >= 0 ? 'positive' : 'negative' },
              { label: t('kpi.netProfit'), value: fmt.money(result.netProfit), tone: result.netProfit >= 0 ? 'positive' : 'negative' },
              { label: t('common.margin'), value: fmt.pct(result.marginPct), divider: true },
              { label: t('insights.whatIf.baselineProfit'), value: fmt.money(baseline.netProfit) },
              { label: t('insights.whatIf.deltaProfit'), value: fmt.money(result.netProfit - baseline.netProfit), tone: result.netProfit >= baseline.netProfit ? 'positive' : 'negative' },
              { label: t('insights.whatIf.cashImpact'), value: fmt.money(result.cashImpact) },
            ]}
          />
          <p className="field__help mt-4">{t('insights.whatIf.disclaimer')}</p>
          <p className="tiny muted">{t('insights.whatIf.elasticityAssumption', { value: fmt.num(elasticity, 2) })}</p>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Forecast
 * ------------------------------------------------------------------ */

function ForecastTab() {
  const { t } = useI18n();
  const fmt = useFmt();
  const insights = useInsights();
  const { analytics } = useWorkspace();
  const [metric, setMetric] = useState<'revenue' | 'profit' | 'orders'>('revenue');
  if (!insights || !analytics) return null;

  const f = insights.forecast ? insights.forecast[metric] : null;
  if (!f) return null;
  const history = analytics.trend.map((p) => ({
    label: fmt.shortDate(p.date),
    actual: metric === 'revenue' ? toChartMoney(p.netRevenue) : metric === 'profit' ? toChartMoney(p.contributionProfit) : p.orders,
  }));
  const projected = f.points.map((p) => ({ label: fmt.shortDate(p.date), actual: null as number | null, projected: metric === 'orders' ? Math.round(p.value) : Math.round(p.value * 100) / 100 }));
  const data = [...history, ...projected].map((p) => ({ label: p.label, actual: 'actual' in p ? p.actual ?? null : null, projected: 'projected' in p ? p.projected : null }));

  return (
    <div className="card__body">
      <div className="row gap-3 mb-4" style={{ maxWidth: 300 }}>
        <SelectInput
          aria-label={t('insights.forecast.metric')}
          value={metric}
          onChange={(e) => setMetric(e.target.value as 'revenue' | 'profit' | 'orders')}
          options={[
            { value: 'revenue', label: t('finance.netRevenue') },
            { value: 'profit', label: t('kpi.contributionProfit') },
            { value: 'orders', label: t('kpi.orders') },
          ]}
        />
      </div>

      {!f.sufficient ? (
        <EmptyState title={t('insights.forecast.notEnough')} body={t('common.notEnoughData')} />
      ) : (
        <>
          <TrendChart
            data={data}
            series={[
              { key: 'actual', name: t('common.actual'), format: metric === 'orders' ? 'number' : 'money' },
              { key: 'projected', name: t('common.forecast'), format: metric === 'orders' ? 'number' : 'money', color: 'var(--chart-4)' },
            ]}
            lang={fmt.lang}
            currency={fmt.currency}
            height={300}
            emptyLabel={t('insights.forecast.notEnough')}
            emptyBody={t('common.notEnoughData')}
          />

          <div className="grid grid--3 mt-5">
            <Card title={t('common.confidence')}>
              <KeyValue
                tight
                rows={[
                  { label: t('common.confidence'), value: fmt.pct(f.confidence) },
                  { label: t('insights.forecast.historyUsed'), value: fmt.num(f.historyUsed) },
                  { label: t('insights.forecast.mape'), value: f.mape === null ? '—' : fmt.pct(f.mape) },
                ]}
              />
            </Card>
            <Card title={t('insights.forecast.assumptions')}>
              <ul>
                {f.assumptions.map((a) => (
                  <li key={a} className="tiny">{a}</li>
                ))}
              </ul>
            </Card>
            <Card title={t('insights.forecast.limitations')}>
              <ul>
                {f.limitations.map((l) => (
                  <li key={l} className="tiny">{l}</li>
                ))}
              </ul>
            </Card>
          </div>

          <p className="tiny muted mt-4">{t('insights.forecast.disclaimer')}</p>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Concentration
 * ------------------------------------------------------------------ */

function ConcentrationTab() {
  const { t } = useI18n();
  const fmt = useFmt();
  const insights = useInsights();
  if (!insights) return null;

  return (
    <div className="card__body">
      <p className="tiny muted mb-4">{t('insights.concentration.explain')}</p>
      {insights.concentration.length === 0 ? (
        <EmptyState title={t('insights.concentration.empty')} body={t('common.noData')} />
      ) : (
        <DataTable
          columns={[
            { key: 'key', label: t('insights.concentration.dimension'), render: (r: (typeof insights.concentration)[number]) => t(`insights.concentration.dim.${r.key}`), sortValue: (r) => r.key },
            { key: 'top', label: t('insights.concentration.top'), render: (r) => r.topName ?? '—', sortValue: (r) => r.topName },
            { key: 'topShare', label: t('insights.concentration.topShare'), numeric: true, render: (r) => fmt.pct(r.topSharePct), sortValue: (r) => r.topSharePct },
            { key: 'top3', label: t('insights.concentration.top3Share'), numeric: true, render: (r) => fmt.pct(r.top3SharePct), sortValue: (r) => r.top3SharePct },
            { key: 'flag', label: t('insights.concentration.status'), render: (r) => (r.concentrated ? <Chip tone="warning">{t('insights.concentration.concentrated')}</Chip> : <Chip tone="success">{t('insights.concentration.diversified')}</Chip>), sortValue: (r) => (r.concentrated ? 1 : 0) },
          ]}
          rows={insights.concentration}
          rowKey={(r) => r.key}
        />
      )}
      {insights.concentration.some((r) => r.concentrated) && (
        <Card className="mt-5">
          <p className="small">{t('insights.concentration.warning')}</p>
        </Card>
      )}
    </div>
  );
}
