import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useWorkspace } from '../state/workspace';
import { useFmt } from '../state/format';
import { PageHeader } from '../components/layout/PageHeader';
import {
  Button,
  Card,
  Chip,
  ConfirmDialog,
  EmptyState,
  Field,
  KeyValue,
  SelectInput,
  Switch,
  TextInput,
  useToast,
} from '../components/ui/primitives';
import { DataTable } from '../components/ui/DataTable';
import {
  db,
  countScope,
  clearAllData,
  backupWorkspace,
  restoreWorkspace,
  isBackupFile,
  resetScope,
  pruneOrphans,
  rebuildLedger,
  type ResetScope,
} from '../db';
import { RESET_SCOPES } from '../db/schema';
import { APP_VERSION } from '../domain/defaults';
import { CURRENCIES } from '../lib/format';
import { downloadJSON, parseCSV, parseDateValue, rowsAsObjects } from '../lib/csv';
import { money, toMajor } from '../lib/money';
import { uid } from '../lib/id';
import type { Business, Settings as SettingsType } from '../domain/types';
import { IconDownload, IconUpload } from '../components/ui/icons';

type TabId = 'business' | 'preferences' | 'thresholds' | 'guardrails' | 'categories' | 'data' | 'export' | 'import' | 'about';

const TABS: TabId[] = ['business', 'preferences', 'thresholds', 'guardrails', 'categories', 'data', 'export', 'import', 'about'];
const SCOPES = Object.keys(RESET_SCOPES) as ResetScope[];

export function SettingsPage() {
  const { t } = useI18n();
  const { data, business, settings, loading } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<TabId>('business');

  useEffect(() => {
    const target = params.get('section');
    if (target && (TABS as string[]).includes(target)) {
      setTab(target as TabId);
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  if (loading || !business || !settings || !data) return <Card><p className="muted small">{t('common.loading')}</p></Card>;

  return (
    <>
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />

      <Card flush>
        <div className="card__body" style={{ paddingBottom: 0 }}>
          <div className="tabs tabs--scroll" role="tablist" aria-label={t('settings.title')}>
            {TABS.map((id) => (
              <button key={id} type="button" role="tab" className="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
                {t(`settings.tab.${id}`)}
              </button>
            ))}
          </div>
        </div>

        {tab === 'business' && <div role="tabpanel" tabIndex={-1}><BusinessTab /></div>}
        {tab === 'preferences' && <div role="tabpanel" tabIndex={-1}><PreferencesTab /></div>}
        {tab === 'thresholds' && <div role="tabpanel" tabIndex={-1}><ThresholdsTab /></div>}
        {tab === 'guardrails' && <div role="tabpanel" tabIndex={-1}><GuardrailsTab /></div>}
        {tab === 'categories' && <div role="tabpanel" tabIndex={-1}><CategoriesTab /></div>}
        {tab === 'data' && <div role="tabpanel" tabIndex={-1}><DataTab /></div>}
        {tab === 'export' && <div role="tabpanel" tabIndex={-1}><ExportTab /></div>}
        {tab === 'import' && <div role="tabpanel" tabIndex={-1}><ImportTab /></div>}
        {tab === 'about' && <div role="tabpanel" tabIndex={-1}><AboutTab /></div>}
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Business profile
 * ------------------------------------------------------------------ */

function BusinessTab() {
  const { t } = useI18n();
  const { business, run } = useWorkspace();
  const toast = useToast();
  const [draft, setDraft] = useState<Business | null>(business);

  useEffect(() => setDraft(business), [business]);
  if (!business || !draft) return null;

  return (
    <div className="card__body">
      <div className="row gap-3">
        <TextInput label={t('settings.businessName')} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <TextInput label={t('settings.ownerName')} value={draft.ownerName} onChange={(e) => setDraft({ ...draft, ownerName: e.target.value })} />
        <TextInput label={t('common.phone')} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
        <TextInput label={t('common.email')} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
        <TextInput label={t('common.city')} value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} />
        <TextInput label={t('settings.country')} value={draft.country} onChange={(e) => setDraft({ ...draft, country: e.target.value })} />
        <TextInput label={t('settings.businessType')} value={draft.businessType} onChange={(e) => setDraft({ ...draft, businessType: e.target.value })} />
        <TextInput label={t('common.address')} value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} />
        <TextInput label={t('settings.website')} value={draft.website} onChange={(e) => setDraft({ ...draft, website: e.target.value })} />
        <TextInput label={t('settings.facebook')} value={draft.facebook} onChange={(e) => setDraft({ ...draft, facebook: e.target.value })} />
        <TextInput label={t('settings.instagram')} value={draft.instagram} onChange={(e) => setDraft({ ...draft, instagram: e.target.value })} />
        <TextInput label={t('settings.tiktok')} value={draft.tiktok} onChange={(e) => setDraft({ ...draft, tiktok: e.target.value })} />
      </div>
      <div className="row gap-2 mt-5">
        <Button
          variant="primary"
          onClick={async () => {
            await run(() => db.business.put(draft));
            toast.push(t('app.saved'), 'success');
          }}
        >
          {t('action.save')}
        </Button>
      </div>
      <Card className="panel mt-5">
        <p className="small">{t('settings.noDeleteBusiness')}</p>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Preferences
 * ------------------------------------------------------------------ */

function PreferencesTab() {
  const { t } = useI18n();
  const { settings, run } = useWorkspace();
  const toast = useToast();
  const [draft, setDraft] = useState<SettingsType | null>(settings);
  const [lockPin, setLockPin] = useState(settings?.appLock.pin ?? '');

  useEffect(() => setDraft(settings), [settings]);
  if (!settings || !draft) return null;

  const save = async (patch: Partial<SettingsType>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    await run(() => db.settings.put(next));
  };

  return (
    <div className="card__body">
      <div className="grid grid--2">
        <Card title={t('settings.regional')}>
          <div className="stack">
            <SelectInput
              label={t('settings.language')}
              value={draft.language}
              onChange={async (e) => {
                await save({ language: e.target.value as SettingsType['language'] });
                toast.push(t('app.saved'), 'success');
              }}
              options={[
                { value: 'en', label: t('settings.language.en') },
                { value: 'bn', label: t('settings.language.bn') },
              ]}
            />
            <SelectInput
              label={t('settings.currency')}
              value={draft.currency}
              onChange={async (e) => {
                await save({ currency: e.target.value });
                toast.push(t('app.saved'), 'success');
              }}
              options={Object.values(CURRENCIES).map((c) => ({ value: c.code, label: `${c.code} · ${c.symbol}` }))}
            />
            <TextInput
              label={t('settings.timezone')}
              value={draft.timezone}
              help={t('settings.timezoneHelp')}
              onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
              onBlur={() => save({ timezone: draft.timezone })}
            />
            <SelectInput
              label={t('settings.defaultPeriod')}
              value={draft.defaultPeriod}
              onChange={async (e) => {
                await save({ defaultPeriod: e.target.value as SettingsType['defaultPeriod'] });
                toast.push(t('app.saved'), 'success');
              }}
              options={[
                { value: 'today', label: t('period.today') },
                { value: 'yesterday', label: t('period.yesterday') },
                { value: 'last7', label: t('period.last7') },
                { value: 'last30', label: t('period.last30') },
                { value: 'thisMonth', label: t('period.thisMonth') },
                { value: 'lastMonth', label: t('period.lastMonth') },
                { value: 'quarter', label: t('period.quarter') },
                { value: 'year', label: t('period.year') },
              ]}
            />
            <TextInput
              label={t('settings.openingCash')}
              money
              value={String(toMajor(draft.openingCash))}
              help={t('settings.openingCashHelp')}
              onChange={(e) => setDraft({ ...draft, openingCash: money(e.target.value) })}
              onBlur={() => save({ openingCash: draft.openingCash })}
            />
            <SelectInput
              label={t('settings.attributionMethod')}
              value={draft.attributionMethod}
              onChange={async (e) => {
                await save({ attributionMethod: e.target.value as SettingsType['attributionMethod'] });
                toast.push(t('app.saved'), 'success');
              }}
              options={[
                { value: 'last-touch', label: t('ads.attributionMethod.lastTouch') },
                { value: 'first-touch', label: t('ads.attributionMethod.firstTouch') },
                { value: 'manual', label: t('ads.attributionMethod.manual') },
              ]}
            />
          </div>
        </Card>

        <Card title={t('settings.privacy')}>
          <Switch
            label={t('settings.appLock')}
            checked={draft.appLock.enabled}
            onChange={(v) => save({ appLock: { enabled: v, pin: v ? lockPin || draft.appLock.pin : null } })}
          />
          <p className="field__help">{t('settings.appLockHelp')}</p>
          {draft.appLock.enabled && (
            <div className="mt-4" style={{ maxWidth: 220 }}>
              <TextInput
                label={t('settings.pin')}
                type="password"
                value={lockPin}
                help={t('settings.pinHelp')}
                onChange={(e) => setLockPin(e.target.value)}
                onBlur={() => save({ appLock: { enabled: true, pin: lockPin || null } })}
              />
            </div>
          )}
          <Card className="panel mt-5">
            <KeyValue
              tight
              rows={[
                { label: t('settings.dataLocation'), value: t('settings.dataLocationValue') },
                { label: t('settings.tracking'), value: t('settings.trackingValue') },
                { label: t('settings.network'), value: t('settings.networkValue') },
              ]}
            />
          </Card>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Thresholds & guardrails
 * ------------------------------------------------------------------ */

function ThresholdsTab() {
  const { t } = useI18n();
  const { settings, run } = useWorkspace();
  const toast = useToast();
  const [draft, setDraft] = useState(settings?.thresholds);

  useEffect(() => setDraft(settings?.thresholds), [settings]);
  if (!settings || !draft) return null;

  const save = async () => {
    await run(() => db.settings.put({ ...settings, thresholds: draft }));
    toast.push(t('app.saved'), 'success');
  };

  const fields: { key: keyof typeof draft; label: string; step?: number }[] = [
    { key: 'changePct', label: t('settings.threshold.changePct') },
    { key: 'minOrders', label: t('settings.threshold.minOrders') },
    { key: 'minPurchases', label: t('settings.threshold.minPurchases') },
    { key: 'minDays', label: t('settings.threshold.minDays') },
    { key: 'targetRoas', label: t('settings.threshold.targetRoas'), step: 0.1 },
    { key: 'maxCac', label: t('settings.threshold.maxCac') },
    { key: 'returnRatePct', label: t('settings.threshold.returnRatePct'), step: 0.5 },
    { key: 'healthyNetMarginPct', label: t('settings.threshold.healthyNetMarginPct'), step: 0.5 },
    { key: 'healthyGrossMarginPct', label: t('settings.threshold.healthyGrossMarginPct'), step: 0.5 },
    { key: 'cashRunwayDays', label: t('settings.threshold.cashRunwayDays') },
    { key: 'concentrationPct', label: t('settings.threshold.concentrationPct'), step: 0.5 },
    { key: 'stockoutDays', label: t('settings.threshold.stockoutDays') },
    { key: 'slowMoverDays', label: t('settings.threshold.slowMoverDays') },
    { key: 'deadStockDays', label: t('settings.threshold.deadStockDays') },
  ];

  return (
    <div className="card__body">
      <p className="tiny muted mb-4">{t('settings.thresholdsHelp')}</p>
      <div className="row gap-3">
        {fields.map((f) => (
          <div key={String(f.key)} style={{ flex: '1 1 200px', minWidth: 180 }}>
            <TextInput
              label={f.label}
              step={f.step}
              value={String(draft[f.key])}
              onChange={(e) => setDraft({ ...draft, [f.key]: Number(e.target.value) || 0 })}
            />
          </div>
        ))}
      </div>
      <div className="mt-5">
        <Button variant="primary" onClick={save}>{t('action.save')}</Button>
      </div>
    </div>
  );
}

function GuardrailsTab() {
  const { t } = useI18n();
  const { settings, run } = useWorkspace();
  const toast = useToast();
  const [draft, setDraft] = useState(settings?.guardrails);

  useEffect(() => setDraft(settings?.guardrails), [settings]);
  if (!settings || !draft) return null;

  const save = async () => {
    await run(() => db.settings.put({ ...settings, guardrails: draft }));
    toast.push(t('app.saved'), 'success');
  };

  const fields: { key: keyof typeof draft; label: string; step?: number }[] = [
    { key: 'minPurchases', label: t('ads.guardrails.minPurchases') },
    { key: 'minDays', label: t('ads.guardrails.minDays') },
    { key: 'targetRoas', label: t('ads.guardrails.targetRoas'), step: 0.1 },
    { key: 'minContributionMarginPct', label: t('ads.guardrails.minContributionMarginPct'), step: 0.5 },
    { key: 'maxCac', label: t('ads.guardrails.maxCac') },
    { key: 'maxReturnRatePct', label: t('ads.guardrails.maxReturnRatePct'), step: 0.5 },
    { key: 'observationWindowDays', label: t('ads.guardrails.observationWindowDays') },
    { key: 'maxBudgetStepPct', label: t('ads.guardrails.maxBudgetStepPct'), step: 1 },
  ];

  return (
    <div className="card__body">
      <p className="tiny muted mb-4">{t('settings.guardrailsHelp')}</p>
      <div className="row gap-3">
        {fields.map((f) => (
          <div key={String(f.key)} style={{ flex: '1 1 200px', minWidth: 180 }}>
            <TextInput
              label={f.label}
              step={f.step}
              value={String(draft[f.key])}
              onChange={(e) => setDraft({ ...draft, [f.key]: Number(e.target.value) || 0 })}
            />
          </div>
        ))}
      </div>
      <div className="mt-5">
        <Button variant="primary" onClick={save}>{t('action.save')}</Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Categories
 * ------------------------------------------------------------------ */

function CategoriesTab() {
  const { t } = useI18n();
  const { settings, run } = useWorkspace();
  const toast = useToast();
  const [draft, setDraft] = useState(settings);

  useEffect(() => setDraft(settings), [settings]);
  if (!settings || !draft) return null;

  const save = async (patch: Partial<SettingsType>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    await run(() => db.settings.put(next));
    toast.push(t('app.saved'), 'success');
  };

  const listField = (key: 'productCategories' | 'orderChannels' | 'paymentMethods' | 'expenseCategories' | 'courierPresets', label: string) => (
    <Card title={label} key={key}>
      <div className="stack">
        {draft[key].map((value, i) => (
          <div key={`${value}-${i}`} className="row gap-2">
            <div style={{ flex: 1 }}>
              <TextInput
                aria-label={label}
                value={value}
                onChange={(e) => {
                  const next = [...draft[key]];
                  next[i] = e.target.value;
                  setDraft({ ...draft, [key]: next });
                }}
                onBlur={() => save({ [key]: draft[key] } as Partial<SettingsType>)}
              />
            </div>
            <Button
              size="sm"
              variant="ghost"
              aria-label={t('action.remove')}
              onClick={() => save({ [key]: draft[key].filter((_, j) => j !== i) } as Partial<SettingsType>)}
            >
              ✕
            </Button>
          </div>
        ))}
        <Button size="sm" variant="secondary" onClick={() => save({ [key]: [...draft[key], ''] } as Partial<SettingsType>)}>
          {t('action.add')}
        </Button>
      </div>
    </Card>
  );

  return (
    <div className="card__body">
      <p className="tiny muted mb-4">{t('settings.categoriesHelp')}</p>
      <div className="grid grid--2">
        {listField('productCategories', t('settings.productCategories'))}
        {listField('expenseCategories', t('settings.expenseCategories'))}
        {listField('orderChannels', t('settings.orderChannels'))}
        {listField('paymentMethods', t('settings.paymentMethods'))}
        {listField('courierPresets', t('settings.courierPresets'))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Scoped data reset (spec §9) — NO "delete business"
 * ------------------------------------------------------------------ */

function DataTab() {
  const { t } = useI18n();
  const fmt = useFmt();
  const { data, refresh } = useWorkspace();
  const toast = useToast();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [scope, setScope] = useState<ResetScope | null>(null);
  const [lastResult, setLastResult] = useState<{ scope: string; cleared: number; ledger: number } | null>(null);
  const [clearAll, setClearAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const out: Record<string, number> = {};
      for (const s of SCOPES) out[s] = await countScope(s);
      if (!cancelled) setCounts(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [data]);

  const rows = SCOPES.map((s) => ({ scope: s, count: counts[s] ?? 0, tables: RESET_SCOPES[s].tables.join(', ') }));

  return (
    <div className="card__body">
      <Card className="panel mb-5">
        <p className="small">{t('settings.noDeleteBusiness')}</p>
        <p className="tiny muted mt-2">{t('settings.resetExplain')}</p>
      </Card>

      {lastResult && (
        <Card className="panel mb-5">
          <KeyValue
            tight
            rows={[
              { label: t('data.scope'), value: t(`data.scope.${lastResult.scope}`) },
              { label: t('data.cleared'), value: fmt.num(lastResult.cleared) },
              { label: t('data.ledgerRebuilt'), value: fmt.num(lastResult.ledger) },
              { label: t('data.autoBackup'), value: t('data.autoBackupDone') },
            ]}
          />
        </Card>
      )}

      <DataTable
        columns={[
          { key: 'scope', label: t('data.scope'), render: (r: (typeof rows)[number]) => t(`data.scope.${r.scope}`), sortValue: (r) => r.scope },
          { key: 'count', label: t('data.records'), numeric: true, render: (r) => fmt.num(r.count), sortValue: (r) => r.count },
          { key: 'tables', label: t('data.tables'), render: (r) => r.tables, sortValue: (r) => r.tables, hideOnMobile: true },
          {
            key: 'act',
            label: t('common.actions'),
            render: (r) => (
              <Button size="sm" variant="danger-quiet" disabled={r.count === 0} onClick={() => setScope(r.scope)}>
                {t('data.clear')}
              </Button>
            ),
            sortValue: (r) => r.scope,
          },
        ]}
        rows={rows}
        rowKey={(r) => r.scope}
        empty={<EmptyState title={t('data.nothing')} body={t('data.nothingBody')} />}
      />

      <div className="mt-5">
        <Card title={t('data.maintenance')}>
          <div className="row gap-2">
            <Button
              variant="secondary"
              onClick={async () => {
                const pruned = await pruneOrphans();
                const ledger = await rebuildLedger();
                await refresh();
                toast.push(`${t('data.pruned')}: ${pruned.removed} · ${t('data.ledgerRebuilt')}: ${ledger}`, 'success');
              }}
            >
              {t('data.rebuild')}
            </Button>
          </div>
          <p className="field__help mt-4">{t('data.rebuildHelp')}</p>
        </Card>
      </div>

      <div className="mt-5">
        <Card title={t('data.clearAll')}>
          <p className="small">{t('data.clearAllHelp')}</p>
          <div className="mt-4">
            <Button variant="danger" onClick={() => setClearAll(true)}>
              {t('data.clearAll')}
            </Button>
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={scope !== null}
        onClose={() => setScope(null)}
        onConfirm={async () => {
          if (!scope) return;
          const result = await resetScope(scope);
          setLastResult({
            scope,
            cleared: result.cleared.reduce((a, c) => a + c.count, 0),
            ledger: result.ledgerRebuilt,
          });
          downloadJSON(`selleros-backup-${result.backup.label}-${Date.now()}.json`, result.backup);
          setScope(null);
          await refresh();
          toast.push(t('data.resetDone'), 'success');
        }}
        title={t('data.clear')}
        body={t('data.consequences')}
        confirmLabel={t('data.clear')}
        cancelLabel={t('action.cancel')}
        typedPhrase="RESET"
        typePrompt={t('data.typeToConfirm', { phrase: 'RESET' })}
      />

      <ConfirmDialog
        open={clearAll}
        onClose={() => setClearAll(false)}
        onConfirm={async () => {
          const result = await clearAllData();
          downloadJSON(`selleros-backup-clear-all-${Date.now()}.json`, result.backup);
          setClearAll(false);
          await refresh();
          toast.push(t('data.resetDone'), 'success');
        }}
        title={t('data.clearAll')}
        body={t('data.clearAllConsequences')}
        confirmLabel={t('data.clearAll')}
        cancelLabel={t('action.cancel')}
        typedPhrase="DELETE ALL"
        typePrompt={t('data.typeToConfirm', { phrase: 'DELETE ALL' })}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Export
 * ------------------------------------------------------------------ */

function ExportTab() {
  const { t } = useI18n();
  const fmt = useFmt();
  const { data } = useWorkspace();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ label: string; at: string; counts: Record<string, number> } | null>(null);

  const doBackup = async () => {
    setBusy(true);
    try {
      const backup = await backupWorkspace('manual');
      downloadJSON(`selleros-backup-${new Date().toISOString().slice(0, 10)}.json`, backup);
      setLast({ label: backup.label, at: backup.exportedAt, counts: backup.counts });
      toast.push(t('export.done'), 'success');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card__body">
      <Card className="panel">
        <div className="row--between row">
          <div>
            <h4>{t('export.title')}</h4>
            <p className="tiny muted">{t('export.explain')}</p>
          </div>
          <Button variant="primary" icon={<IconDownload size={15} />} onClick={doBackup} disabled={busy}>
            {busy ? t('app.saving') : t('action.backup')}
          </Button>
        </div>
      </Card>

      {last && (
        <Card className="mt-5" title={t('export.lastBackup')}>
          <KeyValue
            rows={[
              { label: t('common.date'), value: fmt.date(last.at.slice(0, 10)) },
              { label: t('export.label'), value: last.label },
              ...Object.entries(last.counts)
                .filter(([, v]) => v > 0)
                .map(([k, v]) => ({ label: k, value: fmt.num(v) })),
            ]}
          />
        </Card>
      )}

      {data && (
        <Card className="mt-5" title={t('export.contents')}>
          <DataTable
            columns={[
              { key: 'table', label: t('data.tables'), render: (r: { table: string; count: number }) => r.table, sortValue: (r) => r.table },
              { key: 'count', label: t('data.records'), numeric: true, render: (r) => fmt.num(r.count), sortValue: (r) => r.count },
            ]}
            rows={Object.entries(data.business ? { products: data.products.length, orders: data.orders.length, customers: data.customers.length, suppliers: data.suppliers.length, couriers: data.couriers.length, expenses: data.expenses.length, adRows: data.adRows.length, movements: data.movements.length, ledger: data.ledger.length, purchases: data.purchases.length, returns: data.returns.length, damages: data.damages.length, goals: data.goals.length } : {}).map(([table, count]) => ({ table, count }))}
            rowKey={(r) => r.table}
          />
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Import
 * ------------------------------------------------------------------ */

type ImportTarget = 'products' | 'orders' | 'expenses' | 'adRows';

function ImportTab() {
  const { t } = useI18n();
  const fmt = useFmt();
  const { run, refresh } = useWorkspace();
  const toast = useToast();
  const [target, setTarget] = useState<ImportTarget>('products');
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<{ headers: string[]; rows: Record<string, string>[]; errors: string[] } | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [backupText, setBackupText] = useState('');
  const [backupError, setBackupError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => {
    if (!text.trim()) return null;
    const result = parseCSV(text);
    const rows = rowsAsObjects(result);
    const errors: string[] = [];
    if (result.headers.length === 0) errors.push(t('import.error.noHeaders'));
    if (rows.length === 0) errors.push(t('import.error.noRows'));
    const required = REQUIRED_COLUMNS[target];
    for (const col of required) {
      if (!result.headers.some((h) => h.toLowerCase() === col.toLowerCase())) {
        errors.push(t('import.error.missingColumn', { column: col }));
      }
    }
    rows.forEach((row, i) => {
      for (const col of required) {
        const value = pick(row, col);
        if (value === undefined || value === '') errors.push(t('import.error.missingValue', { row: i + 2, column: col }));
      }
    });
    return { headers: result.headers, rows, errors: errors.slice(0, 40) };
  }, [text, target, t]);

  const onFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ''));
    reader.readAsText(file);
  };

  const importCsv = async () => {
    if (!parsed || parsed.errors.length > 0) {
      toast.push(t('error.validation'), 'danger');
      return;
    }
    const { db } = await import('../db');
    const now = new Date().toISOString();
    await run(async () => {
      if (target === 'products') {
        const existing = await db.products.toArray();
        const rows = parsed.rows.map((row) => ({
          id: uid('prd'),
          sku: pick(row, 'sku') ?? '',
          name: pick(row, 'name') ?? '',
          category: pick(row, 'category') ?? '',
          sellingPrice: money(pick(row, 'sellingPrice') ?? '0'),
          buyingPrice: money(pick(row, 'buyingPrice') ?? '0'),
          reorderLevel: Number(pick(row, 'reorderLevel') ?? 0) || 0,
          createdAt: now,
          updatedAt: now,
        }));
        const dupes = rows.filter((r) => existing.some((e) => e.sku === r.sku));
        if (dupes.length > 0) throw new Error(t('import.error.duplicateSku'));
        const { emptyProduct } = await import('../state/mutations');
        await db.products.bulkAdd(rows.map((r) => ({ ...emptyProduct(), ...r })) as never[]);
      } else if (target === 'expenses') {
        const { emptyExpense } = await import('../state/mutations');
        await db.expenses.bulkAdd(
          parsed.rows.map((row) => ({
            ...emptyExpense(),
            date: parseDateValue(pick(row, 'date')) ?? new Date().toISOString().slice(0, 10),
            category: pick(row, 'category') ?? 'Other',
            amount: money(pick(row, 'amount') ?? '0'),
            vendor: pick(row, 'vendor') ?? '',
            note: pick(row, 'note') ?? '',
          })) as never[],
        );
      } else if (target === 'adRows') {
        const { emptyAdRow } = await import('../state/mutations');
        await db.adRows.bulkAdd(
          parsed.rows.map((row) => ({
            ...emptyAdRow(),
            date: parseDateValue(pick(row, 'date')) ?? new Date().toISOString().slice(0, 10),
            platform: (pick(row, 'platform') ?? 'other') as 'meta' | 'google' | 'tiktok' | 'other',
            campaign: pick(row, 'campaign') ?? '',
            adset: pick(row, 'adset') ?? '',
            ad: pick(row, 'ad') ?? '',
            creative: pick(row, 'creative') ?? '',
            sku: pick(row, 'sku') ?? '',
            spend: money(pick(row, 'spend') ?? '0'),
            revenue: money(pick(row, 'revenue') ?? '0'),
            impressions: Number(pick(row, 'impressions') ?? 0) || 0,
            clicks: Number(pick(row, 'clicks') ?? 0) || 0,
            purchases: Number(pick(row, 'purchases') ?? 0) || 0,
          })) as never[],
        );
      } else {
        throw new Error(t('import.error.ordersManual'));
      }
    });
    toast.push(t('import.done', { count: fmt.num(parsed.rows.length) }), 'success');
    setText('');
    setPreview(null);
  };

  return (
    <div className="card__body">
      <Card className="panel mb-5">
        <p className="small">{t('import.explain')}</p>
        <p className="tiny muted mt-2">{t('import.noApi')}</p>
      </Card>

      <div className="grid grid--2">
        <Card title={t('import.csv')}>
          <div className="stack">
            <SelectInput
              label={t('import.target')}
              value={target}
              onChange={(e) => {
                setTarget(e.target.value as ImportTarget);
                setPreview(null);
              }}
              options={[
                { value: 'products', label: t('nav.products') },
                { value: 'expenses', label: t('expenses.title') },
                { value: 'adRows', label: t('ads.title') },
                { value: 'orders', label: t('orders.title') },
              ]}
            />
            <Field label={t('import.paste')} help={t('import.pasteHelp')}>
              <textarea className="textarea" rows={8} value={text} onChange={(e) => setText(e.target.value)} />
            </Field>
            <div className="row gap-2">
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
              <Button variant="secondary" icon={<IconUpload size={15} />} onClick={() => fileRef.current?.click()}>
                {t('import.chooseFile')}
              </Button>
              <Button variant="secondary" onClick={() => setPreview(parsed)} disabled={!text.trim()}>
                {t('import.preview')}
              </Button>
              <Button variant="primary" onClick={importCsv} disabled={!parsed || parsed.errors.length > 0}>
                {t('action.import')}
              </Button>
            </div>
            <p className="tiny muted">{t('import.requiredColumns', { keys: REQUIRED_COLUMNS[target].join(', ') })}</p>
          </div>
        </Card>

        <Card title={t('import.restore')}>
          <Field label={t('import.restorePaste')} help={t('import.restoreHelp')}>
            <textarea className="textarea" rows={8} value={backupText} onChange={(e) => setBackupText(e.target.value)} />
          </Field>
          <div className="row gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                try {
                  const value: unknown = JSON.parse(backupText);
                  if (!isBackupFile(value)) {
                    setBackupError(t('import.error.notBackup'));
                    return;
                  }
                  setBackupError(null);
                  setRestoreOpen(true);
                } catch {
                  setBackupError(t('import.error.invalidJson'));
                }
              }}
              disabled={!backupText.trim()}
            >
              {t('import.validate')}
            </Button>
          </div>
          {backupError && <p className="tiny money-negative mt-2">{backupError}</p>}
        </Card>
      </div>

      {preview && (
        <Card className="mt-5" title={t('import.previewTitle')}>
          {preview.errors.length > 0 ? (
            <div className="stack">
              <Chip tone="danger">{t('import.error.title')}</Chip>
              <ul>
                {preview.errors.map((e, i) => (
                  <li key={`${e}-${i}`} className="tiny money-negative">{e}</li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <div className="row gap-2 mb-4">
                <Chip tone="success">{t('import.valid')}</Chip>
                <Chip tone="outline">{fmt.num(preview.rows.length)} {t('data.records').toLowerCase()}</Chip>
              </div>
              <div className="table-wrap" style={{ maxHeight: 320 }}>
                <table className="table">
                  <thead>
                    <tr>
                      {preview.headers.map((h) => (
                        <th key={h} scope="col">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 15).map((row, i) => (
                      <tr key={i}>
                        {preview.headers.map((h) => (
                          <td key={h}>{row[h] ?? '—'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      )}

      <ConfirmDialog
        open={restoreOpen}
        onClose={() => setRestoreOpen(false)}
        onConfirm={async () => {
          const value: unknown = JSON.parse(backupText);
          if (!isBackupFile(value)) {
            setBackupError(t('import.error.notBackup'));
            setRestoreOpen(false);
            return;
          }
          const report = await restoreWorkspace(value);
          setRestoreOpen(false);
          setBackupText('');
          await refresh();
          toast.push(`${t('import.restored')}: ${fmt.num(report.restored.reduce((a, r) => a + r.count, 0))}`, 'success');
        }}
        title={t('import.restore')}
        body={t('data.consequences')}
        confirmLabel={t('import.restore')}
        cancelLabel={t('action.cancel')}
        typedPhrase="RESTORE"
        typePrompt={t('data.typeToConfirm', { phrase: 'RESTORE' })}
      />
    </div>
  );
}

const REQUIRED_COLUMNS: Record<ImportTarget, string[]> = {
  products: ['sku', 'name', 'sellingPrice'],
  orders: ['date', 'customer', 'product', 'qty', 'price'],
  expenses: ['date', 'category', 'amount'],
  adRows: ['date', 'platform', 'spend'],
};

function pick(row: Record<string, string>, key: string): string | undefined {
  const direct = row[key];
  if (direct !== undefined) return direct;
  const lower = key.toLowerCase();
  for (const [k, v] of Object.entries(row)) if (k.toLowerCase() === lower) return v;
  return undefined;
}

/* ------------------------------------------------------------------ *
 * About — the ONLY place creator attribution appears
 * ------------------------------------------------------------------ */

function AboutTab() {
  const { t } = useI18n();
  const { data } = useWorkspace();

  return (
    <div className="card__body">
      <div className="grid grid--2">
        <Card title="SellerOS">
          <KeyValue
            rows={[
              { label: t('about.version'), value: APP_VERSION },
              { label: t('about.license'), value: t('about.licenseValue') },
              { label: t('about.storage'), value: t('settings.dataLocationValue') },
              { label: t('about.offline'), value: t('about.offlineValue') },
              { label: t('about.creator'), value: t('about.creatorName') },
              {
                label: t('about.contact'),
                value: (
                  <a href={`mailto:${t('about.creatorEmail')}`} style={{ color: 'var(--primary-600)' }}>
                    {t('about.creatorEmail')}
                  </a>
                ),
              },
            ]}
          />
        </Card>
        <Card title={t('about.principles')}>
          <ul>
            <li className="small">{t('about.principle1')}</li>
            <li className="small">{t('about.principle2')}</li>
            <li className="small">{t('about.principle3')}</li>
            <li className="small">{t('about.principle4')}</li>
            <li className="small">{t('about.principle5')}</li>
          </ul>
        </Card>
      </div>

      <Card className="mt-5" title={t('about.workspace')}>
        <KeyValue
          rows={[
            { label: t('about.products'), value: String(data?.products.length ?? 0) },
            { label: t('about.orders'), value: String(data?.orders.length ?? 0) },
            { label: t('about.adRows'), value: String(data?.adRows.length ?? 0) },
            { label: t('about.ledgerEntries'), value: String(data?.ledger.length ?? 0) },
          ]}
        />
      </Card>
    </div>
  );
}
