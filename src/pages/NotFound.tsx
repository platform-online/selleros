import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { PageHeader } from '../components/layout/PageHeader';
import { Button, Card } from '../components/ui/primitives';
import { IconChart } from '../components/ui/icons';

/**
 * Unknown-route screen.
 *
 * Uses the shared PageHeader so this page carries the same single <h1> as
 * every other screen — the document outline never starts on an empty page,
 * and screen readers always land on a real heading first.
 */
export function NotFoundPage() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader
        title={t('error.notFound.title')}
        subtitle={t('error.notFound.body')}
        actions={
          <Link to="/" className="btn btn--primary">
            {t('common.back')}
          </Link>
        }
      />
      <Card>
        <div className="row gap-2">
          <Button size="sm" variant="ghost" icon={<IconChart size={13} />}>
            <Link to="/orders">{t('nav.orders')}</Link>
          </Button>
          <Button size="sm" variant="ghost">
            <Link to="/finance">{t('nav.finance')}</Link>
          </Button>
          <Button size="sm" variant="ghost">
            <Link to="/settings">{t('nav.settings')}</Link>
          </Button>
        </div>
      </Card>
    </>
  );
}
