import { useEffect, useState, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { I18nProvider } from './i18n';
import { WorkspaceProvider, useWorkspace } from './state/workspace';
import { ToastProvider } from './components/ui/primitives';
import { AppShell } from './components/layout/AppShell';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { Button, Card } from './components/ui/primitives';
import { DashboardPage } from './pages/Dashboard';
import { SalesPage } from './pages/Sales';
import { OrdersPage, OrderDetailPage } from './pages/Orders';
import { ProductsPage, ProductDetailPage } from './pages/Products';
import { InventoryPage } from './pages/Inventory';
import { CustomersPage, CustomerDetailPage, SuppliersPage, CouriersPage } from './pages/People';
import { AdsPage } from './pages/Ads';
import { FinancePage } from './pages/Finance';
import { InsightsPage } from './pages/Insights';
import { ReportsPage } from './pages/Reports';
import { DocumentsPage } from './pages/Documents';
import { SettingsPage } from './pages/Settings';
import { OnboardingPage } from './pages/Onboarding';
import { NotFoundPage } from './pages/NotFound';
import type { Language } from './lib/format';

/**
 * Router + providers.
 *
 * HashRouter is used deliberately: the app is a static bundle that must run
 * from any subpath (a GitHub Pages project site, a subfolder, a custom domain)
 * without any server-side rewrite rules.
 */
export default function App() {
  return (
    <ErrorBoundary
      title="SellerOS ran into a problem"
      body="Your data is safe — it is stored on this device. Try reloading, and if the problem
persists, restoring from a backup in Settings → Data."
      retryLabel="Try again"
      homeLabel="Reload app"
      detailLabel="Technical details"
    >
      <WorkspaceProvider>
        <Localized>
          <ToastProvider>
            <HashRouter>
              <Gate />
            </HashRouter>
          </ToastProvider>
        </Localized>
      </WorkspaceProvider>
      <UpdateNotice />
    </ErrorBoundary>
  );
}

/** Language follows the workspace setting, so the shell stays in sync. */
function Localized({ children }: { children: ReactNode }) {
  const { lang } = useWorkspace();
  return <I18nProvider lang={(lang ?? 'en') as Language}>{children}</I18nProvider>;
}

function Gate() {
  const { settings, loading, error } = useWorkspace();
  const location = useLocation();

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorScreen message={error} />;
  if (!settings) return <ErrorScreen message="Workspace could not be opened." />;

  if (!settings.onboardingComplete) {
    return (
      <Routes>
        <Route path="*" element={<OnboardingPage />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AppShell />} path="/">
        <Route index element={<DashboardPage />} />
        <Route path="sales" element={<SalesPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="orders/:id" element={<OrderDetailPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="products/:id" element={<ProductDetailPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="customers/:id" element={<CustomerDetailPage />} />
        <Route path="suppliers" element={<SuppliersPage />} />
        <Route path="couriers" element={<CouriersPage />} />
        <Route path="ads" element={<AdsPage />} />
        <Route path="finance" element={<FinancePage />} />
        <Route path="insights" element={<InsightsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="settings/:section" element={<SettingsPage />} />
        <Route path="onboarding" element={<OnboardingPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace state={{ from: location.pathname }} />} />
    </Routes>
  );
}

function LoadingScreen() {
  return (
    <div className="boot">
      <div className="boot__brand">SellerOS</div>
      <div className="skeleton skeleton--text" />
      <div className="skeleton skeleton--text" style={{ width: '60%' }} />
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="boot">
      <Card>
        <h2>Something went wrong</h2>
        <p className="muted small">{message}</p>
        <p className="tiny muted mt-4">
          SellerOS stores everything in this browser. If the database is locked or the browser is in
          private mode, IndexedDB may be unavailable — try a normal window.
        </p>
        <div className="mt-4">
          <Button variant="primary" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      </Card>
    </div>
  );
}

/**
 * Update detection (spec §5). The service worker is registered with
 * `registerType: 'prompt'`, so a new version waits until the user accepts.
 */
function UpdateNotice() {
  const [ready, setReady] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onReady = (e: Event) => {
      const detail = (e as CustomEvent<{ sw?: ServiceWorker }>).detail;
      if (detail?.sw) setReady(detail.sw);
    };
    window.addEventListener('vite-plugin-pwa:update-ready', onReady as EventListener);

    // Fallback for the standard controllerchange flow.
    const onController = () => {
      if (navigator.serviceWorker.controller) setReady(navigator.serviceWorker.controller);
    };
    navigator.serviceWorker?.addEventListener('controllerchange', onController);

    return () => {
      window.removeEventListener('vite-plugin-pwa:update-ready', onReady as EventListener);
      navigator.serviceWorker?.removeEventListener('controllerchange', onController);
    };
  }, []);

  if (!ready) return null;

  return (
    <div className="update-notice" role="status">
      <span className="small">A new version of SellerOS is ready.</span>
      <Button size="sm" variant="primary" onClick={() => window.location.reload()}>
        Reload
      </Button>
    </div>
  );
}
