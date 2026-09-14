import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useWorkspace } from '../state/workspace';
import { Button, Card, Chip, Field, SelectInput, Switch, TextInput } from '../components/ui/primitives';
import { db } from '../db';
import { seedDemoData } from '../db/demo';
import { CURRENCIES } from '../lib/format';
import { money } from '../lib/money';
import type { Settings as SettingsType } from '../domain/types';
import { IconSpark } from '../components/ui/icons';

/**
 * First-run setup. Two honest paths: start empty, or load clearly-labelled demo
 * data. The demo is opt-in and removable — it is never presented as the user's
 * own business data.
 */
export function OnboardingPage() {
  const { t } = useI18n();
  const { business, settings, run } = useWorkspace();
  const navigate = useNavigate();
  const [name, setName] = useState(business?.name ?? '');
  const [owner, setOwner] = useState(business?.ownerName ?? '');
  const [currency, setCurrency] = useState(settings?.currency ?? 'BDT');
  const [timezone, setTimezone] = useState(settings?.timezone ?? 'Asia/Dhaka');
  const [openingCash, setOpeningCash] = useState('0');
  const [demo, setDemo] = useState(false);
  const [busy, setBusy] = useState(false);

  const finish = async () => {
    setBusy(true);
    try {
      await run(async () => {
        if (business) {
          await db.business.put({ ...business, name: name.trim() || business.name, ownerName: owner });
        }
        if (settings) {
          const next: SettingsType = {
            ...settings,
            currency,
            timezone,
            openingCash: money(openingCash),
            onboardingComplete: true,
          };
          await db.settings.put(next);
        }
      });
      if (demo) {
        await run(() => seedDemoData(120));
      }
      navigate('/', { replace: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="onboarding">
      <div className="onboarding__card">
        <div className="onboarding__brand">
          <IconSpark size={22} />
          <span>SellerOS</span>
        </div>
        <h1>{t('onboarding.title')}</h1>
        <p className="muted">{t('onboarding.subtitle')}</p>

        <div className="stack mt-5">
          <Field label={t('settings.businessName')} help={t('onboarding.businessHelp')}>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('onboarding.businessPlaceholder')} />
          </Field>
          <Field label={t('settings.ownerName')}>
            <input className="input" value={owner} onChange={(e) => setOwner(e.target.value)} />
          </Field>
          <SelectInput
            label={t('settings.currency')}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            options={Object.values(CURRENCIES).map((c) => ({ value: c.code, label: `${c.code} · ${c.symbol}` }))}
          />
          <TextInput label={t('settings.timezone')} value={timezone} help={t('settings.timezoneHelp')} onChange={(e) => setTimezone(e.target.value)} />
          <TextInput label={t('settings.openingCash')} money value={openingCash} help={t('settings.openingCashHelp')} onChange={(e) => setOpeningCash(e.target.value)} />
          <Switch label={t('onboarding.loadDemo')} checked={demo} onChange={setDemo} />
          <p className="tiny muted">{t('onboarding.demoHelp')}</p>
        </div>

        <div className="row gap-2 mt-5">
          <Button variant="primary" onClick={finish} disabled={busy}>
            {busy ? t('app.saving') : t('onboarding.start')}
          </Button>
        </div>

        <div className="row gap-2 mt-5">
          <Chip tone="outline">{t('about.offlineValue')}</Chip>
          <Chip tone="outline">{t('settings.dataLocationValue')}</Chip>
        </div>

        <Card className="panel mt-5">
          <p className="tiny muted">{t('onboarding.privacy')}</p>
        </Card>
      </div>
    </div>
  );
}
