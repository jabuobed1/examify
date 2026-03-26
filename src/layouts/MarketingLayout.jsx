import { Link, Outlet } from 'react-router-dom';
import { Logo } from '../components/common/Logo';
import { useAuth } from '../hooks/useAuth';

export const MarketingLayout = () => {
  const { profile } = useAuth();
  
  return (
    <div className="min-h-screen bg-transparent text-slate-100">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 lg:px-6">
          <Link to={profile?.role ? `/${profile.role}` : '/'} className="inline-flex items-center">
            <Logo className="[&_p:first-of-type]:text-white [&_p:last-of-type]:text-slate-400" />
          </Link>
        <div className="flex items-center gap-3">
          <Link to="/login" className="btn-secondary border-white/20 text-white hover:border-brand-400 hover:text-white">Login</Link>
          <Link to="/signup" className="btn-primary">Get started</Link>
        </div>
      </div>
      </header>
      <Outlet />
    </div>
  );
};
