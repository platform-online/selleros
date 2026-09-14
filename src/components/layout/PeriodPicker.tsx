import { PERIOD_KEYS, type PeriodKey } from '../../lib/dates';
import { useI18n } from '../../i18n';
import { useWorkspace } from '../../state/workspace';
import { Button, TextInput } from '../ui/primitives';
import { formatDate } from '../../lib/format';
import { IconCalendar } from '../ui/icons';

/** Period control shared by every analytics screen (spec §18). */
export function PeriodPicker() {
  const { t, lang } = useI18n();
  const { period, setPeriod, custom, setCustom, range } = useWorkspace();

  return (
    <div className="row gap-2" role="group" aria-label={t('common.date')}>
      <div className="segmented" style={{ maxWidth: '100%' }}>
        {PERIOD_KEYS.filter((k) => k !== 'custom').map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={period === key}
            onClick={() => {
              setPeriod(key);
              setCustom(null);
            }}
          >
            {t(`period.${key}`)}
          </button>
        ))}
        <button type="button" aria-pressed={period === 'custom'} onClick={() => setPeriod('custom')}>
          <IconCalendar size={13} /> {t('period.custom')}
        </button>
      </div>
      <span className="muted tiny nowrap hide-mobile">
        {formatDate(range.start, lang)} – {formatDate(range.end, lang)}
      </span>
      {period === 'custom' && (
        <div className="row gap-2">
          <TextInput
            type="date"
            aria-label={t('common.from')}
            value={custom?.start ?? range.start}
            max={custom?.end ?? range.end}
            onChange={(e) => setCustom({ start: e.target.value, end: custom?.end ?? range.end })}
          />
          <TextInput
            type="date"
            aria-label={t('common.to')}
            value={custom?.end ?? range.end}
            min={custom?.start ?? range.start}
            onChange={(e) => setCustom({ start: custom?.start ?? range.start, end: e.target.value })}
          />
          <Button size="sm" variant="primary" onClick={() => setCustom(null)}>
            {t('common.apply')}
          </Button>
        </div>
      )}
    </div>
  );
}

export type { PeriodKey };
