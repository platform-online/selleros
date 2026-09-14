import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { Button, Card, EmptyState } from '../components/ui/primitives';
import { IconChart } from '../components/ui/icons';

export function NotFoundPage() {
  const { t } = useI18n();
  return (
    <Card>
      <EmptyState
        icon={<IconChart size={20} />}
        title={t('error.notFound.title')}
        body={t('error.notFound.body')}
        action={
          <Link to="/" className="btn btn--primary">
            {t('common.back')}
          </Link>
        }
      />
      <div className="row gap-2 mt-4">
        <Button size="sm" variant="ghost">
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
  );
}
