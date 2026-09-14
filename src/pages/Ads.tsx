import { useState } from 'react';
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
  Field,
  KeyValue,
  Metric,
  Modal,
  SelectInput,
  TextInput,
  useToast,
} from '../components/ui/primitives';
import { DataTable, type Column } from '../components/ui/DataTable';
import { DonutChart, FunnelChart, HorizontalBarChart, TrendChart, toChartMoney } from '../components/charts/Charts';
import {
  adDecision,
  adFunnel,
  adHealthScore,
  adMetrics,
  adProfitabilityForRows,
  aggregateAdRows,
  biggestFunnelLeak,
  breakEvenRoas,
  contributionMarginBeforeAds,
  creativeFatigue,
  groupAds,
  platformLabel,
  priceScenarios,
  simulateBudget,
  smartPlusCombinations,
  type AdDimension,
  type AdGroup,
  type DecisionResult,
} from '../domain/ads';
import { emptyAdRow, saveAdRows } from '../state/mutations';
import { money, roundMinor, toMajor, type Money } from '../lib/money';
import { unitCostLookup } from '../domain/context';
import { trueUnitCost } from '../domain/finance';
import type { AdPlatform, AdRow } from '../domain/types';
import { IconChart, IconPlus } from '../components/ui/icons';

type TabId = 'overview' | 'campaigns' | 'creatives' | 'funnel' | 'decision' | 'simulators' | 'rows';

const DECISION_TONE: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  SCALE: 'success',
  MAINTAIN: 'info',
  TEST: 'neutral',
  REDUCE: 'warning',
  PAUSE: 'danger',
  OBSERVE: 'neutral',
};

export function AdsPage() {
  const { t } = useI18n();
  const fmt = useFmt();
  const { analytics, data, loading, settings } = useWorkspace();
  const [tab, setTab] = useState<TabId>('overview');

  if (loading || !analytics) return <Card><p className="muted small">{t('common.loading')}</p></Card>;

  const rows = analytics.period.adRows;
  const totals = aggregateAdRows(rows);
  const metrics = adMetrics(totals, { days: analytics.range.days });
  const pl = analytics.metrics.pl;

  const adLookup = data ? unitCostLookup(data) : new Map<string, number>();
  const adProfit = adProfitabilityForRows({
    rows,
    totals,
    pl,
    unitCostOf: (key) => adLookup.get(key) ?? 0,
  });

  const cmBeforeAds = contributionMarginBeforeAds({
    netRevenue: pl.netRevenue,
    cogs: pl.cogs,
    courier: pl.variable.courier,
    packaging: pl.variable.packaging,
    paymentFees: pl.variable.paymentFees,
    returnCost: pl.variable.returns,
    otherVariable: pl.variable.otherVariable,
  });
  const beRoas = breakEvenRoas(cmBeforeAds);
  const g = settings?.guardrails;

  return (
    <>
      <PageHeader title={t('ads.title')} subtitle={t('ads.subtitle')}>
        <div className="mt-4">
          <PeriodPicker />
        </div>
      </PageHeader>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconChart size={20} />}
            title={t('empty.ads.title')}
            body={t('empty.ads.body')}
            action={<Button variant="primary" onClick={() => setTab('rows')}>{t('empty.ads.cta')}</Button>}
          />
        </Card>
      ) : (
        <>
          <div className="grid grid--kpi mb-5">
            <Metric label={t('ads.spend')} value={fmt.money(totals.spend)} hint={`${t('common.days')}: ${fmt.num(analytics.range.days)}`} />
            <Metric label={t('ads.revenue')} value={fmt.money(totals.revenue)} />
            <Metric label={t('ads.roas')} value={fmt.multiple(metrics.roas)} hint={t('ads.roasFormula')} />
            <Metric label={t('kpi.breakEvenRoas')} value={fmt.multiple(beRoas)} hint={t('ads.breakEvenFormula')} />
            <Metric label={t('ads.mer')} value={fmt.multiple(metrics.mer)} hint={t('ads.merExplain')} />
            <Metric label={t('ads.ctr')} value={fmt.pct(metrics.ctrPct)} hint={`CPM ${fmt.moneyPlain(metrics.cpm === null ? null : roundMinor(metrics.cpm * 100))}`} />
            <Metric label={t('ads.cpc')} value={fmt.moneyPlain(metrics.cpc)} />
            <Metric label={t('ads.cvr')} value={fmt.pct(metrics.cvrPct)} />
            <Metric label={t('ads.cpa')} value={fmt.moneyPlain(metrics.cpa)} />
            <Metric label={t('ads.cac')} value={fmt.moneyPlain(metrics.cac)} hint={g && g.maxCac > 0 ? `${t('ads.maxCac')} ${fmt.moneyPlain(g.maxCac)}` : undefined} />
            <Metric label={t('ads.frequency')} value={metrics.frequency === null ? '—' : fmt.num(metrics.frequency, 2)} />
            <Metric label={t('ads.purchases')} value={fmt.num(totals.purchases)} hint={`min ${g?.minPurchases ?? 20}`} />
            <Metric
              label={t('ads.contributionProfit')}
              value={fmt.money(adProfit.contributionProfit)}
              tone={adProfit.contributionProfit >= 0 ? 'positive' : 'negative'}
            />
            <Metric label={t('ads.netProfitAfterAds')} value={fmt.money(adProfit.netProfit)} tone={adProfit.netProfit >= 0 ? 'positive' : 'negative'} />
            <Metric label={t('ads.contributionMargin')} value={fmt.pct(adProfit.contributionMarginPct)} />
            <Metric label={t('ads.profitPerSpend')} value={adProfit.profitPerSpend === null ? '—' : fmt.moneyPlain(adProfit.profitPerSpend)} />
          </div>

          <Card flush className="mb-5">
            <div className="card__body" style={{ paddingBottom: 0 }}>
              <div className="tabs" role="tablist" aria-label={t('ads.title')}>
                {(['overview', 'campaigns', 'creatives', 'funnel', 'decision', 'simulators', 'rows'] as TabId[]).map((id) => (
                  <button key={id} type="button" role="tab" className="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
                    {t(`ads.tab.${id}`)}
                  </button>
                ))}
              </div>
            </div>

            {tab === 'overview' && (
              <div role="tabpanel" tabIndex={-1}>
                <OverviewTab rows={rows} metrics={metrics} totals={totals} beRoas={beRoas} adProfit={adProfit} />
              </div>
            )}
            {tab === 'campaigns' && <div role="tabpanel" tabIndex={-1}><CampaignsTab rows={rows} /></div>}
            {tab === 'creatives' && <div role="tabpanel" tabIndex={-1}><CreativesTab rows={rows} /></div>}
            {tab === 'funnel' && <div role="tabpanel" tabIndex={-1}><FunnelTab rows={rows} /></div>}
            {tab === 'decision' && <div role="tabpanel" tabIndex={-1}><DecisionTab rows={rows} beRoas={beRoas} /></div>}
            {tab === 'simulators' && <div role="tabpanel" tabIndex={-1}><SimulatorsTab beRoas={beRoas} cmBeforeAds={cmBeforeAds} /></div>}
            {tab === 'rows' && <div role="tabpanel" tabIndex={-1}><RowsTab /></div>}
          </Card>
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Overview
 * ------------------------------------------------------------------ */

function OverviewTab({
  rows,
  metrics,
  totals,
  beRoas,
  adProfit,
}: {
  rows: AdRow[];
  metrics: ReturnType<typeof adMetrics>;
  totals: ReturnType<typeof aggregateAdRows>;
  beRoas: number | null;
  adProfit: ReturnType<typeof adProfitabilityForRows>;
}) {
  const { t } = useI18n();
  const fmt = useFmt();
  const { analytics, settings } = useWorkspace();
  if (!analytics) return null;

  const byPlatform = groupAds(rows, 'platform', analytics.range.days);
  const daily = (() => {
    const map = new Map<string, Money>();
    for (const r of rows) map.set(r.date, (map.get(r.date) ?? 0) + r.spend);
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  })();

  const trendByDate = analytics.trend;
  const roasTarget = beRoas;

  const health = adHealthScore(metrics, {
    targetRoas: settings?.thresholds.targetRoas ?? 2,
    maxCac: settings?.thresholds.maxCac ?? 0,
    maxReturnRatePct: settings?.thresholds.returnRatePct ?? 10,
    returnRatePct: analytics.metrics.returnRatePct,
    minPurchases: settings?.thresholds.minPurchases ?? 20,
  });

  return (
    <>
      <div className="card__body">
        <div className="grid grid--2 mb-5">
          <div>
            <h4 className="mb-4">{t('ads.spendVsRevenue')}</h4>
            <TrendChart
              data={daily.map(([d, v]) => {
                const day = trendByDate.find((p) => p.date === d);
                return {
                  label: fmt.shortDate(d),
                  spend: toChartMoney(v),
                  revenue: day ? toChartMoney(day.revenue) : 0,
                };
              })}
              series={[
                { key: 'spend', name: t('ads.spend'), format: 'money', color: 'var(--chart-5)' },
                { key: 'revenue', name: t('ads.revenue'), format: 'money' },
              ]}
              lang={fmt.lang}
              currency={fmt.currency}
              height={280}
              emptyLabel={t('empty.ads.title')}
              emptyBody={t('empty.ads.body')}
            />
          </div>
          <div>
            <h4 className="mb-4">{t('ads.byPlatform')}</h4>
            <DonutChart
              data={byPlatform.map((p) => ({ label: platformLabel(p.key), value: toChartMoney(p.totals.spend) }))}
              lang={fmt.lang}
              currency={fmt.currency}
              height={280}
            />
          </div>
        </div>

        <Card className="mb-5">
          <div className="row--between row">
            <h4>{t('ads.health.title')}</h4>
            <Chip tone={health.band === 'strong' ? 'success' : health.band === 'healthy' ? 'info' : health.band === 'watch' ? 'warning' : health.band === 'weak' ? 'danger' : 'neutral'}>
              {t(`ads.health.${health.band}`)}{health.score === null ? '' : ` · ${fmt.num(health.score, 0)}`}
            </Chip>
          </div>
          <div className="mt-4 stack">
            {health.factors.map((f) => (
              <div key={f.key}>
                <div className="row--between row" style={{ marginBottom: 4 }}>
                  <span className="small">{t(`ads.healthFactor.${f.key}`)}</span>
                  <span className="tiny muted">{f.reason}</span>
                </div>
                <Bar value={f.score} tone={f.direction === 'positive' ? 'success' : f.direction === 'negative' ? 'danger' : 'default'} />
              </div>
            ))}
            {health.factors.length === 0 && <p className="muted small">{t('common.notEnoughData')}</p>}
            {!health.sampleSufficient && <p className="tiny muted">{t('ads.notEnoughPurchases')}</p>}
          </div>
        </Card>

        <div className="grid grid--2">
          <KeyValue
            rows={[
              { label: t('ads.spend'), value: fmt.money(totals.spend) },
              { label: t('ads.revenue'), value: fmt.money(totals.revenue) },
              { label: t('ads.roas'), value: fmt.multiple(metrics.roas) },
              { label: t('kpi.breakEvenRoas'), value: fmt.multiple(beRoas), divider: true },
              { label: t('kpi.cogs'), value: fmt.money(adProfit.cogs) },
              { label: t('finance.courier'), value: fmt.money(adProfit.courier) },
              { label: t('finance.packaging'), value: fmt.money(adProfit.packaging) },
              { label: t('finance.paymentFees'), value: fmt.money(adProfit.paymentFees) },
              { label: t('finance.returnsCost'), value: fmt.money(adProfit.returnCost) },
              { label: t('ads.contributionProfit'), value: fmt.money(adProfit.contributionProfit), tone: adProfit.contributionProfit >= 0 ? 'positive' : 'negative', divider: true },
              { label: t('ads.netProfitAfterAds'), value: fmt.money(adProfit.netProfit), total: true },
            ]}
          />
          <KeyValue
            rows={[
              { label: t('ads.impressions'), value: fmt.num(totals.impressions) },
              { label: t('ads.reach'), value: fmt.num(totals.reach) },
              { label: t('ads.clicks'), value: fmt.num(totals.clicks) },
              { label: t('ads.landingViews'), value: fmt.num(totals.landingViews) },
              { label: t('ads.addToCart'), value: fmt.num(totals.addToCart) },
              { label: t('ads.initiateCheckout'), value: fmt.num(totals.initiateCheckout) },
              { label: t('ads.purchases'), value: fmt.num(totals.purchases) },
              { label: t('ads.conversions'), value: fmt.num(totals.conversions), divider: true },
              { label: t('ads.roasTargetMet'), value: roasTarget !== null && metrics.roas !== null ? (metrics.roas >= roasTarget ? t('ads.yes') : t('ads.no')) : '—' },
              { label: t('ads.marginBeforeAds'), value: fmt.pct(adProfit.contributionMarginPct) },
            ]}
          />
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Campaigns / dimension table
 * ------------------------------------------------------------------ */

function CampaignsTab({ rows }: { rows: AdRow[] }) {
  const { t } = useI18n();
  const fmt = useFmt();
  const { analytics } = useWorkspace();
  const [dim, setDim] = useState<AdDimension>('campaign');
  if (!analytics) return null;

  const groups = groupAds(rows, dim, analytics.range.days);
  const bars = groups.slice(0, 10).map((gp) => ({ id: gp.key, label: clip(gp.key), value: toChartMoney(gp.totals.spend) }));

  const columns: Column<AdGroup>[] = [
    { key: 'key', label: t(`ads.${dim === 'campaignType' ? 'campaignType' : dim}`), render: (gp) => gp.key, sortValue: (gp) => gp.key },
    { key: 'spend', label: t('ads.spend'), numeric: true, render: (gp) => fmt.money(gp.totals.spend), sortValue: (gp) => gp.totals.spend },
    { key: 'revenue', label: t('ads.revenue'), numeric: true, render: (gp) => fmt.money(gp.totals.revenue), sortValue: (gp) => gp.totals.revenue },
    { key: 'roas', label: t('ads.roas'), numeric: true, render: (gp) => fmt.multiple(gp.metrics.roas), sortValue: (gp) => gp.metrics.roas },
    { key: 'purchases', label: t('ads.purchases'), numeric: true, render: (gp) => fmt.num(gp.totals.purchases), sortValue: (gp) => gp.totals.purchases },
    { key: 'ctr', label: t('ads.ctr'), numeric: true, render: (gp) => fmt.pct(gp.metrics.ctrPct), sortValue: (gp) => gp.metrics.ctrPct, hideOnMobile: true },
    { key: 'cpc', label: t('ads.cpc'), numeric: true, render: (gp) => fmt.moneyPlain(gp.metrics.cpc), sortValue: (gp) => gp.metrics.cpc, hideOnMobile: true },
    { key: 'cpm', label: t('ads.cpm'), numeric: true, render: (gp) => fmt.moneyPlain(gp.metrics.cpm), sortValue: (gp) => gp.metrics.cpm, hideOnMobile: true },
    { key: 'cvr', label: t('ads.cvr'), numeric: true, render: (gp) => fmt.pct(gp.metrics.cvrPct), sortValue: (gp) => gp.metrics.cvrPct, hideOnMobile: true },
    { key: 'cpa', label: t('ads.cpa'), numeric: true, render: (gp) => fmt.moneyPlain(gp.metrics.cpa), sortValue: (gp) => gp.metrics.cpa, hideOnMobile: true },
    { key: 'freq', label: t('ads.frequency'), numeric: true, render: (gp) => (gp.metrics.frequency === null ? '—' : fmt.num(gp.metrics.frequency, 2)), sortValue: (gp) => gp.metrics.frequency, hideOnMobile: true },
  ];

  return (
    <>
      <div className="card__body">
        <div className="row gap-3 mb-4" style={{ maxWidth: 320 }}>
          <SelectInput
            aria-label={t('ads.dimension')}
            value={dim}
            onChange={(e) => setDim(e.target.value as AdDimension)}
            options={[
              { value: 'platform', label: t('ads.platform') },
              { value: 'campaign', label: t('ads.campaign') },
              { value: 'campaignType', label: t('ads.campaignType') },
              { value: 'adset', label: t('ads.adset') },
              { value: 'ad', label: t('ads.ad') },
              { value: 'creative', label: t('ads.creative') },
              { value: 'placement', label: t('ads.placement') },
              { value: 'network', label: t('ads.network') },
              { value: 'product', label: t('ads.product') },
            ]}
          />
        </div>
        {bars.length > 0 && (
          <div className="mb-5">
            <h4 className="mb-4">{t('ads.spend')}</h4>
            <HorizontalBarChart data={bars} lang={fmt.lang} currency={fmt.currency} />
          </div>
        )}
        <p className="tiny muted mb-4">{t('ads.attributionNote')}</p>
      </div>
      <DataTable
        columns={columns}
        rows={groups}
        rowKey={(gp) => gp.key}
        empty={<EmptyState title={t('empty.ads.title')} body={t('empty.ads.body')} />}
      />
    </>
  );
}

function clip(label: string): string {
  return label.length > 22 ? `${label.slice(0, 21)}…` : label;
}

/* ------------------------------------------------------------------ *
 * Creatives / Smart+
 * ------------------------------------------------------------------ */

function CreativesTab({ rows }: { rows: AdRow[] }) {
  const { t } = useI18n();
  const fmt = useFmt();
  const { analytics } = useWorkspace();
  const [mode, setMode] = useState<'creative' | 'smartplus'>('creative');
  if (!analytics) return null;

  const groups =
    mode === 'creative' ? groupAds(rows, 'creative', analytics.range.days) : smartPlusCombinations(rows, ['creative', 'text', 'enhancement'], analytics.range.days);

  const columns: Column<AdGroup>[] = [
    { key: 'key', label: mode === 'creative' ? t('ads.creative') : t('ads.smartPlus.combination'), render: (gp) => gp.key, sortValue: (gp) => gp.key },
    { key: 'spend', label: t('ads.spend'), numeric: true, render: (gp) => fmt.money(gp.totals.spend), sortValue: (gp) => gp.totals.spend },
    { key: 'revenue', label: t('ads.revenue'), numeric: true, render: (gp) => fmt.money(gp.totals.revenue), sortValue: (gp) => gp.totals.revenue },
    { key: 'roas', label: t('ads.roas'), numeric: true, render: (gp) => fmt.multiple(gp.metrics.roas), sortValue: (gp) => gp.metrics.roas },
    { key: 'ctr', label: t('ads.ctr'), numeric: true, render: (gp) => fmt.pct(gp.metrics.ctrPct), sortValue: (gp) => gp.metrics.ctrPct },
    { key: 'freq', label: t('ads.frequency'), numeric: true, render: (gp) => (gp.metrics.frequency === null ? '—' : fmt.num(gp.metrics.frequency, 2)), sortValue: (gp) => gp.metrics.frequency, hideOnMobile: true },
    { key: 'purchases', label: t('ads.purchases'), numeric: true, render: (gp) => fmt.num(gp.totals.purchases), sortValue: (gp) => gp.totals.purchases, hideOnMobile: true },
    {
      key: 'fatigue',
      label: t('ads.fatigue'),
      render: (gp) => {
        const f = creativeFatigue({
          frequency: gp.metrics.frequency,
          ctrNowPct: gp.metrics.ctrPct,
          ctrBeforePct: gp.metrics.ctrPct,
          minImpressions: 1000,
          impressions: gp.totals.impressions,
        });
        return f.fatigued ? <Chip tone="warning" dot>{t('ads.fatigued')}</Chip> : <Chip tone="neutral">—</Chip>;
      },
      sortValue: (gp) => gp.metrics.frequency,
    },
  ];

  return (
    <>
      <div className="card__body">
        <div className="row gap-3 mb-4">
          <SelectInput
            aria-label={t('ads.creative')}
            value={mode}
            onChange={(e) => setMode(e.target.value as 'creative' | 'smartplus')}
            options={[
              { value: 'creative', label: t('ads.creative') },
              { value: 'smartplus', label: t('ads.smartPlus.title') },
            ]}
          />
        </div>
        <p className="tiny muted">{mode === 'smartplus' ? t('ads.smartPlus.explain') : t('ads.creativeExplain')}</p>
      </div>
      <DataTable
        columns={columns}
        rows={groups}
        rowKey={(gp) => gp.key}
        empty={<EmptyState title={t('empty.ads.creatives')} body={t('empty.ads.body')} />}
      />
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Funnel
 * ------------------------------------------------------------------ */

function FunnelTab({ rows }: { rows: AdRow[] }) {
  const { t } = useI18n();
  const fmt = useFmt();
  const totals = aggregateAdRows(rows);
  const funnel = adFunnel(totals);
  const leak = biggestFunnelLeak(funnel);

  return (
    <div className="card__body">
      {!funnel.reliable && (
        <Card className="mb-5">
          <p className="muted small">{t('ads.funnelNotReliable')}</p>
        </Card>
      )}
      {funnel.steps.length === 0 ? (
        <EmptyState title={t('empty.ads.title')} body={t('empty.ads.body')} />
      ) : (
        <div className="grid grid--2">
          <FunnelChart
            steps={funnel.steps.map((s) => ({ ...s, label: t(`ads.funnelStep.${s.key}`) }))}
            lang={fmt.lang}
            currency={fmt.currency}
          />
          <DataTable
            columns={[
              { key: 'step', label: t('ads.funnel'), render: (s: (typeof funnel.steps)[number]) => t(`ads.funnelStep.${s.key}`), sortValue: (s) => s.key },
              { key: 'value', label: t('common.count'), numeric: true, render: (s) => fmt.num(s.value), sortValue: (s) => s.value },
              { key: 'conv', label: t('ads.conversionFromPrev'), numeric: true, render: (s) => fmt.pct(s.conversionPct), sortValue: (s) => s.conversionPct },
              { key: 'drop', label: t('ads.dropOff'), numeric: true, render: (s) => fmt.pct(s.dropOffPct), sortValue: (s) => s.dropOffPct },
              { key: 'cpu', label: t('ads.costPerStep'), numeric: true, render: (s) => (s.costPerUnit === null ? '—' : fmt.moneyPlain(s.costPerUnit)), sortValue: (s) => s.costPerUnit },
            ]}
            rows={funnel.steps}
            rowKey={(s) => s.key}
          />
        </div>
      )}
      <div className="mt-5">
        {leak ? (
          <Card>
            <div className="row--between row">
              <strong>{t('ads.biggestLeak')}</strong>
              <span>{t(`ads.funnelStep.${leak.step}`)}</span>
            </div>
            <p className="tiny muted mt-2">{t('ads.biggestLeakHelp')}</p>
          </Card>
        ) : (
          <p className="muted small">{t('ads.noLeak')}</p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Decision engine
 * ------------------------------------------------------------------ */

function DecisionTab({ rows, beRoas }: { rows: AdRow[]; beRoas: number | null }) {
  const { t } = useI18n();
  const fmt = useFmt();
  const { analytics, data, settings } = useWorkspace();
  if (!analytics) return null;

  const groups = groupAds(rows, 'campaign', analytics.range.days);
  const guardrails = settings?.guardrails;
  if (!guardrails) return null;

  const lookup = data ? unitCostLookup(data) : new Map<string, number>();

  const evaluated = groups.map((gp) => {
    const profit = adProfitabilityForRows({
      rows: gp.rows,
      totals: gp.totals,
      pl: analytics.metrics.pl,
      unitCostOf: (key) => lookup.get(key) ?? 0,
    });
    const decision: DecisionResult = adDecision({
      metrics: gp.metrics,
      profit,
      returnRatePct: analytics.metrics.returnRatePct,
      guardrails,
    });
    return { group: gp, profit, decision };
  });

  const columns: Column<(typeof evaluated)[number]>[] = [
    { key: 'key', label: t('ads.campaign'), render: (e) => e.group.key, sortValue: (e) => e.group.key },
    { key: 'spend', label: t('ads.spend'), numeric: true, render: (e) => fmt.money(e.group.totals.spend), sortValue: (e) => e.group.totals.spend },
    { key: 'roas', label: t('ads.roas'), numeric: true, render: (e) => fmt.multiple(e.group.metrics.roas), sortValue: (e) => e.group.metrics.roas },
    { key: 'purchases', label: t('ads.purchases'), numeric: true, render: (e) => fmt.num(e.group.totals.purchases), sortValue: (e) => e.group.totals.purchases },
    {
      key: 'contribution',
      label: t('ads.contributionProfit'),
      numeric: true,
      render: (e) => <span style={{ color: e.profit.contributionProfit < 0 ? 'var(--fin-loss)' : 'var(--fin-profit)' }}>{fmt.money(e.profit.contributionProfit)}</span>,
      sortValue: (e) => e.profit.contributionProfit,
    },
    { key: 'decision', label: t('ads.decision.title'), render: (e) => <Chip tone={DECISION_TONE[e.decision.decision]}>{t(`ads.decision.${e.decision.decision}`)}</Chip>, sortValue: (e) => e.decision.decision },
    {
      key: 'step',
      label: t('ads.budgetChange'),
      numeric: true,
      render: (e) => (e.decision.suggestedBudgetChangePct === 0 ? '—' : `${e.decision.suggestedBudgetChangePct > 0 ? '+' : ''}${fmt.num(e.decision.suggestedBudgetChangePct, 0)}%`),
      sortValue: (e) => e.decision.suggestedBudgetChangePct,
    },
    { key: 'confidence', label: t('ads.confidence'), render: (e) => t(`ads.confidence.${e.decision.confidence}`), sortValue: (e) => e.decision.confidence, hideOnMobile: true },
  ];

  return (
    <>
      <div className="card__body">
        <div className="grid grid--kpi mb-5">
          <div className="metric"><span className="metric__label">{t('ads.guardrails.maxBudgetStepPct')}</span><span className="metric__value metric__value--sm">{fmt.num(guardrails.maxBudgetStepPct, 0)}%</span></div>
          <div className="metric"><span className="metric__label">{t('ads.guardrails.targetRoas')}</span><span className="metric__value metric__value--sm">{fmt.multiple(guardrails.targetRoas)}</span></div>
          <div className="metric"><span className="metric__label">{t('kpi.breakEvenRoas')}</span><span className="metric__value metric__value--sm">{fmt.multiple(beRoas)}</span></div>
          <div className="metric"><span className="metric__label">{t('ads.guardrails.minPurchases')}</span><span className="metric__value metric__value--sm">{fmt.num(guardrails.minPurchases)}</span></div>
          <div className="metric"><span className="metric__label">{t('ads.guardrails.minDays')}</span><span className="metric__value metric__value--sm">{fmt.num(guardrails.minDays)}</span></div>
        </div>
        <p className="tiny muted mb-4">{t('ads.decisionExplain')}</p>
        {beRoas === null && <p className="tiny muted mb-4">{t('ads.breakEvenRoasNone')}</p>}
      </div>
      <DataTable
        columns={columns}
        rows={evaluated}
        rowKey={(e) => e.group.key}
        empty={<EmptyState title={t('empty.ads.title')} body={t('empty.ads.body')} />}
      />
      <div className="card__body">
        <h4 className="mb-4">{t('ads.decisionDetail')}</h4>
        <div className="stack">
          {evaluated.slice(0, 6).map((e) => (
            <Card key={e.group.key} className="panel">
              <div className="row--between row">
                <strong>{e.group.key}</strong>
                <Chip tone={DECISION_TONE[e.decision.decision]}>{t(`ads.decision.${e.decision.decision}`)}</Chip>
              </div>
              {e.decision.diagnosis && <p className="small mt-2"><strong>{t('ads.diagnosis')}:</strong> {e.decision.diagnosis}</p>}
              {e.decision.cause && <p className="small mt-2"><strong>{t('ads.cause')}:</strong> {e.decision.cause}</p>}
              {e.decision.reasons.length > 0 && (
                <ul className="mt-2">
                  {e.decision.reasons.map((r) => (
                    <li key={r} className="tiny">{r}</li>
                  ))}
                </ul>
              )}
              {e.decision.guardrailsFailed.length > 0 && (
                <p className="tiny muted mt-2">{t('ads.guardrailsFailed')}: {e.decision.guardrailsFailed.join(', ')}</p>
              )}
              {e.decision.suggestedBudgetChangePct !== 0 && (
                <p className="small mt-2">
                  {t('ads.suggestedBudget')}: {e.decision.suggestedBudgetChangePct > 0 ? '+' : ''}{fmt.num(e.decision.suggestedBudgetChangePct, 0)}% →{' '}
                  {fmt.money(roundMinor(e.group.totals.spend * (1 + e.decision.suggestedBudgetChangePct / 100)))}
                </p>
              )}
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Simulators
 * ------------------------------------------------------------------ */

function SimulatorsTab({ beRoas, cmBeforeAds }: { beRoas: number | null; cmBeforeAds: number | null }) {
  const { t } = useI18n();
  const fmt = useFmt();
  const { analytics, data, settings } = useWorkspace();
  const [spendPct, setSpendPct] = useState(20);
  const [roasPct, setRoasPct] = useState(0);
  const [product, setProduct] = useState('');
  if (!analytics) return null;

  const pl = analytics.metrics.pl;
  const adSpend = analytics.metrics.ad.spend;
  const currentRoas = analytics.metrics.ad.roas ?? 0;
  const cpc = analytics.metrics.ad.cpc;
  const cvr = analytics.metrics.ad.cvrPct ?? 0;
  const courierPerOrder = pl.orders > 0 ? Math.round(pl.variable.courier / pl.orders) : 0;
  const returnRate = analytics.metrics.returnRatePct ?? 0;
  const paymentFeePct = pl.netRevenue > 0 ? (pl.variable.paymentFees / pl.netRevenue) * 100 : 0;

  const sim = simulateBudget({
    adSpend: roundMinor(adSpend * (1 + spendPct / 100)),
    expectedRoas: currentRoas * (1 + roasPct / 100),
    expectedConversionRatePct: cvr,
    cpc: cpc ?? 0,
    marginPct: cmBeforeAds ?? 0,
    returnRatePct: returnRate,
    courierCostPerOrder: courierPerOrder,
    paymentFeePct,
  });

  const products = data?.products ?? [];
  const selected = products.find((p) => p.id === product);
  const prices = selected
    ? priceScenarios({
        currentPrice: selected.sellingPrice,
        trueUnitCost: trueUnitCost(selected),
        courierPerOrder,
        packagingPerOrder: pl.orders > 0 ? Math.round(pl.variable.packaging / pl.orders) : 0,
        paymentFeePct,
        returnRatePct: returnRate,
      })
    : [];

  return (
    <div className="card__body">
      <div className="grid grid--2">
        <Card title={t('ads.simulator.budget')}>
          <div className="stack">
            <Field label={t('ads.simulator.spendChange')} help={t('ads.simulator.estimate')}>
              <input
                className="range"
                type="range"
                min={-50}
                max={100}
                step={5}
                value={spendPct}
                onChange={(e) => setSpendPct(Number(e.target.value))}
                aria-label={t('ads.simulator.spendChange')}
              />
              <span className="num small">{spendPct > 0 ? '+' : ''}{fmt.num(spendPct, 0)}% → {fmt.money(sim.spend)}</span>
            </Field>
            <Field label={t('ads.simulator.roasChange')}>
              <input className="range" type="range" min={-40} max={40} step={5} value={roasPct} onChange={(e) => setRoasPct(Number(e.target.value))} aria-label={t('ads.simulator.roasChange')} />
              <span className="num small">{roasPct > 0 ? '+' : ''}{fmt.num(roasPct, 0)}% → {fmt.multiple(currentRoas * (1 + roasPct / 100))}</span>
            </Field>
          </div>
          <KeyValue
            className="mt-4"
            rows={[
              { label: t('ads.spend'), value: fmt.money(sim.spend) },
              { label: t('ads.revenue'), value: fmt.money(sim.revenue) },
              { label: t('ads.orders'), value: fmt.num(sim.orders) },
              { label: t('kpi.cogs'), value: fmt.money(sim.cogs) },
              { label: t('ads.simulator.fulfilment'), value: fmt.money(sim.fulfillment) },
              { label: t('finance.returnsCost'), value: fmt.money(sim.returnCost) },
              { label: t('ads.contributionProfit'), value: fmt.money(sim.contributionProfit), tone: sim.contributionProfit >= 0 ? 'positive' : 'negative' },
              { label: t('ads.contributionMargin'), value: fmt.pct(sim.contributionMarginPct), divider: true },
              { label: t('kpi.breakEvenRoas'), value: fmt.multiple(sim.breakEvenRoas) },
              { label: t('ads.businessBreakEvenRoas'), value: fmt.multiple(beRoas) },
              { label: t('ads.profitable'), value: sim.profitable ? t('ads.yes') : t('ads.no'), tone: sim.profitable ? 'positive' : 'negative', total: true },
            ]}
          />
          <p className="tiny muted mt-4">{t('ads.simulator.disclaimer')}</p>
          <div className="mt-2">
            {settings?.guardrails && Math.abs(spendPct) > settings.guardrails.maxBudgetStepPct && (
              <Chip tone="warning">{t('ads.guardrailWarning', { pct: fmt.num(settings.guardrails.maxBudgetStepPct, 0) })}</Chip>
            )}
          </div>
        </Card>

        <Card title={t('ads.simulator.price')}>
          <div className="mb-4" style={{ maxWidth: 320 }}>
            <SelectInput
              aria-label={t('nav.products')}
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              options={[{ value: '', label: t('ads.simulator.selectProduct') }, ...products.map((p) => ({ value: p.id, label: p.name }))]}
            />
          </div>
          {prices.length === 0 ? (
            <p className="muted small">{t('ads.simulator.selectProduct')}</p>
          ) : (
            <>
              <DataTable
                columns={[
                  { key: 'delta', label: t('ads.simulator.priceChange'), render: (s: (typeof prices)[number]) => `${s.deltaPct > 0 ? '+' : ''}${fmt.num(s.deltaPct, 0)}%`, sortValue: (s) => s.deltaPct },
                  { key: 'price', label: t('products.field.sellingPrice'), numeric: true, render: (s) => fmt.money(s.price), sortValue: (s) => s.price },
                  { key: 'cp', label: t('ads.contributionProfit'), numeric: true, render: (s) => <span style={{ color: s.contributionProfit < 0 ? 'var(--fin-loss)' : 'var(--fin-profit)' }}>{fmt.money(s.contributionProfit)}</span>, sortValue: (s) => s.contributionProfit },
                  { key: 'margin', label: t('common.margin'), numeric: true, render: (s) => fmt.pct(s.marginPct), sortValue: (s) => s.marginPct },
                  { key: 'be', label: t('kpi.breakEvenRoas'), numeric: true, render: (s) => fmt.multiple(s.breakEvenRoas), sortValue: (s) => s.breakEvenRoas },
                ]}
                rows={prices}
                rowKey={(s) => String(s.deltaPct)}
                pageSize={8}
              />
              <p className="tiny muted mt-4">{t('ads.simulator.priceDisclaimer')}</p>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Raw rows + manual entry
 * ------------------------------------------------------------------ */

function RowsTab() {
  const { t } = useI18n();
  const fmt = useFmt();
  const { analytics, data, run } = useWorkspace();
  const toast = useToast();
  const [editing, setEditing] = useState<AdRow | null>(null);
  if (!analytics || !data) return null;

  const rows = [...analytics.period.adRows].sort((a, b) => (a.date < b.date ? 1 : -1));
  const totals = aggregateAdRows(rows);
  const m = adMetrics(totals, { days: analytics.range.days });

  const columns: Column<AdRow>[] = [
    { key: 'date', label: t('common.date'), render: (r) => fmt.date(r.date), sortValue: (r) => r.date },
    { key: 'platform', label: t('ads.platform'), render: (r) => platformLabel(r.platform), sortValue: (r) => r.platform },
    { key: 'campaign', label: t('ads.campaign'), render: (r) => r.campaign || '—', sortValue: (r) => r.campaign },
    { key: 'ad', label: t('ads.ad'), render: (r) => r.ad || '—', sortValue: (r) => r.ad, hideOnMobile: true },
    { key: 'spend', label: t('ads.spend'), numeric: true, render: (r) => fmt.money(r.spend), sortValue: (r) => r.spend },
    { key: 'revenue', label: t('ads.revenue'), numeric: true, render: (r) => fmt.money(r.revenue), sortValue: (r) => r.revenue },
    { key: 'impressions', label: t('ads.impressions'), numeric: true, render: (r) => fmt.num(r.impressions), sortValue: (r) => r.impressions, hideOnMobile: true },
    { key: 'clicks', label: t('ads.clicks'), numeric: true, render: (r) => fmt.num(r.clicks), sortValue: (r) => r.clicks, hideOnMobile: true },
    { key: 'purchases', label: t('ads.purchases'), numeric: true, render: (r) => fmt.num(r.purchases), sortValue: (r) => r.purchases },
    { key: 'roas', label: t('ads.roas'), numeric: true, render: (r) => (r.spend > 0 ? fmt.num(r.revenue / r.spend, 2) : '—'), sortValue: (r) => (r.spend > 0 ? r.revenue / r.spend : 0) },
  ];

  return (
    <>
      <div className="card__body">
        <div className="row--between row mb-4">
          <p className="tiny muted">{t('ads.manualEntryHelp')}</p>
          <Button variant="primary" icon={<IconPlus size={15} />} onClick={() => setEditing(emptyAdRow())}>
            {t('ads.newRow')}
          </Button>
        </div>
        <KeyValue
          tight
          rows={[
            { label: t('ads.rows'), value: fmt.num(rows.length) },
            { label: t('ads.spend'), value: fmt.money(totals.spend) },
            { label: t('ads.revenue'), value: fmt.money(totals.revenue) },
            { label: t('ads.roas'), value: fmt.multiple(m.roas) },
          ]}
        />
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={(r) => setEditing(r)}
        empty={<EmptyState title={t('empty.ads.title')} body={t('empty.ads.body')} action={<Button variant="primary" onClick={() => setEditing(emptyAdRow())}>{t('empty.ads.cta')}</Button>} />}
      />

      {editing && (
        <AdRowForm
          row={editing}
          onClose={() => setEditing(null)}
          onSave={async (r) => {
            await run(() => saveAdRows([r]));
            setEditing(null);
            toast.push(t('app.saved'), 'success');
          }}
        />
      )}
    </>
  );
}

function AdRowForm({ row, onClose, onSave }: { row: AdRow; onClose: () => void; onSave: (r: AdRow) => Promise<void> }) {
  const { t } = useI18n();
  const { data } = useWorkspace();
  const [draft, setDraft] = useState<AdRow>(row);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const num = (v: string) => Number(v) || 0;
  const mon = (v: string) => money(v);

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t('ads.newRow')}
      subtitle={draft.campaign || platformLabel(draft.platform)}
      footer={
        <>
          <Button onClick={onClose}>{t('action.cancel')}</Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={async () => {
              if (draft.spend <= 0) {
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
        <section className="form-section">
          <div className="form-section__head">{t('ads.section.identity')}</div>
          <div className="form-section__body">
            <TextInput label={t('common.date')} type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
            <SelectInput label={t('ads.platform')} value={draft.platform} onChange={(e) => setDraft({ ...draft, platform: e.target.value as AdPlatform })} options={[{ value: 'meta', label: t('ads.platform.meta') }, { value: 'google', label: t('ads.platform.google') }, { value: 'tiktok', label: t('ads.platform.tiktok') }, { value: 'other', label: t('ads.platform.other') }]} />
            <TextInput label={t('ads.account')} value={draft.account} onChange={(e) => setDraft({ ...draft, account: e.target.value })} />
            <TextInput label={t('ads.campaign')} value={draft.campaign} onChange={(e) => setDraft({ ...draft, campaign: e.target.value })} />
            <SelectInput label={t('ads.campaignType')} value={draft.campaignType} onChange={(e) => setDraft({ ...draft, campaignType: e.target.value })} options={[{ value: '', label: '—' }, ...['Advantage+ Shopping', 'Demand Gen', 'Performance Max', 'Search', 'Shopping', 'Smart+', 'Spark Ads', 'Video Views', 'Engagement', 'Lead Gen'].map((c) => ({ value: c, label: c }))]} />
            <TextInput label={t('ads.campaignId')} value={draft.campaignId} onChange={(e) => setDraft({ ...draft, campaignId: e.target.value })} />
            <TextInput label={t('ads.adset')} value={draft.adset} onChange={(e) => setDraft({ ...draft, adset: e.target.value })} />
            <TextInput label={t('ads.ad')} value={draft.ad} onChange={(e) => setDraft({ ...draft, ad: e.target.value })} />
            <TextInput label={t('ads.creative')} value={draft.creative} onChange={(e) => setDraft({ ...draft, creative: e.target.value })} />
            <SelectInput label={t('ads.creativeType')} value={draft.creativeType} onChange={(e) => setDraft({ ...draft, creativeType: e.target.value })} options={[{ value: '', label: '—' }, ...['Image', 'Video', 'Carousel', 'Collection', 'UGC', 'Reel'].map((c) => ({ value: c, label: c }))]} />
            <TextInput label={t('ads.text')} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
            <TextInput label={t('ads.enhancement')} value={draft.enhancement} onChange={(e) => setDraft({ ...draft, enhancement: e.target.value })} />
            <TextInput label={t('ads.placement')} value={draft.placement} onChange={(e) => setDraft({ ...draft, placement: e.target.value })} />
            <TextInput label={t('ads.network')} value={draft.network} onChange={(e) => setDraft({ ...draft, network: e.target.value })} />
            <SelectInput label={t('ads.product')} value={draft.productId ?? ''} onChange={(e) => setDraft({ ...draft, productId: e.target.value || null })} options={[{ value: '', label: '—' }, ...(data?.products ?? []).map((p) => ({ value: p.id, label: p.name }))]} />
            <TextInput label={t('products.field.sku')} value={draft.sku} onChange={(e) => setDraft({ ...draft, sku: e.target.value })} />
          </div>
        </section>

        <section className="form-section">
          <div className="form-section__head">{t('ads.section.money')}</div>
          <div className="form-section__body">
            <TextInput label={t('ads.spend')} money required value={String(toMajor(draft.spend))} onChange={(e) => setDraft({ ...draft, spend: mon(e.target.value) })} />
            <TextInput label={t('ads.revenue')} money value={String(toMajor(draft.revenue))} onChange={(e) => setDraft({ ...draft, revenue: mon(e.target.value) })} />
            <TextInput label={t('ads.conversionValue')} money value={String(toMajor(draft.conversionValue))} onChange={(e) => setDraft({ ...draft, conversionValue: mon(e.target.value) })} />
          </div>
        </section>

        <section className="form-section">
          <div className="form-section__head">{t('ads.section.delivery')}</div>
          <div className="form-section__body">
            <TextInput label={t('ads.impressions')} value={String(draft.impressions)} onChange={(e) => setDraft({ ...draft, impressions: num(e.target.value) })} />
            <TextInput label={t('ads.reach')} value={String(draft.reach)} onChange={(e) => setDraft({ ...draft, reach: num(e.target.value) })} />
            <TextInput label={t('ads.clicks')} value={String(draft.clicks)} onChange={(e) => setDraft({ ...draft, clicks: num(e.target.value) })} />
            <TextInput label={t('ads.linkClicks')} value={String(draft.linkClicks)} onChange={(e) => setDraft({ ...draft, linkClicks: num(e.target.value) })} />
            <TextInput label={t('ads.destinationClicks')} value={String(draft.destinationClicks)} onChange={(e) => setDraft({ ...draft, destinationClicks: num(e.target.value) })} />
            <TextInput label={t('ads.landingViews')} value={String(draft.landingViews)} onChange={(e) => setDraft({ ...draft, landingViews: num(e.target.value) })} />
            <TextInput label={t('ads.addToCart')} value={String(draft.addToCart)} onChange={(e) => setDraft({ ...draft, addToCart: num(e.target.value) })} />
            <TextInput label={t('ads.initiateCheckout')} value={String(draft.initiateCheckout)} onChange={(e) => setDraft({ ...draft, initiateCheckout: num(e.target.value) })} />
            <TextInput label={t('ads.purchases')} value={String(draft.purchases)} onChange={(e) => setDraft({ ...draft, purchases: num(e.target.value) })} />
            <TextInput label={t('ads.conversions')} value={String(draft.conversions)} onChange={(e) => setDraft({ ...draft, conversions: num(e.target.value) })} />
          </div>
        </section>

        <section className="form-section">
          <div className="form-section__head">{t('ads.section.video')}</div>
          <div className="form-section__body">
            <TextInput label={t('ads.videoViews')} value={String(draft.videoViews)} onChange={(e) => setDraft({ ...draft, videoViews: num(e.target.value) })} />
            <TextInput label={t('ads.videoWatched25')} value={String(draft.videoWatched25)} onChange={(e) => setDraft({ ...draft, videoWatched25: num(e.target.value) })} />
            <TextInput label={t('ads.videoWatched50')} value={String(draft.videoWatched50)} onChange={(e) => setDraft({ ...draft, videoWatched50: num(e.target.value) })} />
            <TextInput label={t('ads.videoWatched75')} value={String(draft.videoWatched75)} onChange={(e) => setDraft({ ...draft, videoWatched75: num(e.target.value) })} />
            <TextInput label={t('ads.videoWatched100')} value={String(draft.videoWatched100)} onChange={(e) => setDraft({ ...draft, videoWatched100: num(e.target.value) })} />
          </div>
        </section>
      </div>
    </Modal>
  );
}
