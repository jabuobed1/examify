import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { LayoutDashboard, BookOpen, ClipboardCheck, CreditCard, FileText, LogOut, Users, ShieldCheck, Menu, X } from 'lucide-react';
import { Logo } from './Logo';
import { ROLES } from '../../lib/constants';

const navigationByRole = {
  [ROLES.STUDENT]: [
    { to: '/student', label: 'Overview', icon: LayoutDashboard },
    // { to: '/student/exercises', label: 'Exercises', icon: BookOpen },
    { to: '/student/papers', label: 'Past papers', icon: BookOpen },
    { to: '/student/peer-reviews', label: 'Peer reviews', icon: ClipboardCheck },
    { to: '/student/billing', label: 'Billing', icon: CreditCard },
    { to: '/student/profile', label: 'Profile', icon: FileText },
    { to: '/student/lessons', label: 'Lessons', icon: BookOpen },
    { to: '/student/guide', label: 'Examify Guide', icon: ClipboardCheck },
  ],
  [ROLES.TUTOR]: [
    { to: '/tutor', label: 'Overview', icon: LayoutDashboard },
    { to: '/tutor/students', label: 'Students', icon: Users },
    { to: '/tutor/papers', label: 'Past papers', icon: BookOpen },
    { to: '/tutor/reports', label: 'Reports', icon: FileText },
    { to: '/tutor/profile', label: 'Profile', icon: FileText },
    { to: '/tutor/guide', label: 'Examify Guide', icon: ClipboardCheck },
  ],
  [ROLES.PARENT]: [
    { to: '/parent', label: 'Overview', icon: LayoutDashboard },
    { to: '/parent/profile', label: 'Profile', icon: FileText },
  ],
  [ROLES.ADMIN]: [
    { to: '/admin', label: 'Overview', icon: LayoutDashboard },
    { to: '/admin/users', label: 'Users', icon: Users },
    { to: '/admin/papers', label: 'Past papers', icon: BookOpen },
    { to: '/admin/payments', label: 'Payments', icon: CreditCard },
    { to: '/admin/settings', label: 'Settings', icon: ShieldCheck },
  ],
};

export const AppShell = ({ title, subtitle, role, user, onLogout, children }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navigation = navigationByRole[role] ?? [];

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-4 py-4 lg:grid lg:grid-cols-[260px_1fr] lg:px-6">
        
        {/* Mobile Header */}
        <div className="panel flex flex-none items-center justify-between p-4 lg:hidden">
          <Link to={`/${role}`}>
            <Logo />
          </Link>
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-50 transition"
          >
            <Menu className="h-6 w-6" />
          </button>
        </div>

        {/* Mobile Drawer Backdrop */}
        {isMobileMenuOpen && (
          <div 
            className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-sm lg:hidden transition-opacity"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}

        <aside 
          className={`panel z-50 flex flex-col p-5 transition-transform duration-300 ease-in-out
            fixed inset-y-4 left-4 max-w-[300px] w-[90vw] overflow-y-auto
            ${isMobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-[calc(100%+1.5rem)]'}
            lg:sticky lg:top-4 lg:w-auto lg:max-w-none lg:translate-x-0 lg:h-fit lg:shadow-sm`}
        >
          <div className="mb-8 flex items-center justify-between">
            <Link to={`/${role}`} className="block" onClick={() => setIsMobileMenuOpen(false)}>
              <Logo />
            </Link>
            <button
              onClick={() => setIsMobileMenuOpen(false)}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="space-y-2">
            {navigation.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === `/${role}`}
                onClick={() => setIsMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition ${
                    isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-8 rounded-2xl bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Signed in</p>
            <p className="mt-2 font-semibold text-slate-900">{user?.displayName}</p>
            <p className="text-sm text-slate-500">{user?.email}</p>
            <button type="button" onClick={() => { setIsMobileMenuOpen(false); onLogout(); }} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-rose-600">
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          </div>
        </aside>
        <main className="space-y-6 py-4">
          <header className="panel flex flex-col gap-3 p-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-brand-700">{role} workspace</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{title}</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">{subtitle}</p>
            </div>
          </header>
          {children}
        </main>
      </div>
    </div>
  );
};
