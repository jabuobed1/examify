import { AppShell } from '../../components/common/AppShell';
import { useAuth } from '../../hooks/useAuth';

export const AdminPaymentsPage = () => {
  const { profile, logout } = useAuth();
  return (
    <AppShell title="Payments" subtitle="Inspect subscription status, billing history, and authorization readiness." role="admin" user={profile} onLogout={logout}>
      <div className="panel p-5 text-sm text-slate-600">Payments are created, verified, and stored securely so no Paystack secret keys are exposed to the frontend.</div>
    </AppShell>
  );
};
