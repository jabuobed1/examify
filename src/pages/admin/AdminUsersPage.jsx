import { useEffect, useState } from 'react';
import { AppShell } from '../../components/common/AppShell';
import { SectionHeader } from '../../components/common/SectionHeader';
import { useAuth } from '../../hooks/useAuth';
import { getGuideQuizResultsSummary } from '../../services/firestoreService';

const ScoreList = ({ title, description, users = [] }) => (
  <section className="space-y-4">
    <SectionHeader eyebrow="Guide results" title={title} description={description} />
    <div className="space-y-3">
      {users.map((user) => (
        <div key={user.id} className="panel flex items-center justify-between gap-4 p-5">
          <div>
            <p className="text-lg font-semibold text-slate-950">{user.name}</p>
            <p className="mt-1 text-sm text-slate-500">Latest Examify Guide mark</p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-right">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Mark</p>
            <p className="mt-1 text-2xl font-bold text-slate-950">{user.percentage ?? '—'}{user.percentage !== null ? '%' : ''}</p>
          </div>
        </div>
      ))}
      {!users.length ? <div className="panel p-5 text-sm text-slate-500">No users are available in this category yet.</div> : null}
    </div>
  </section>
);

export const AdminUsersPage = () => {
  const { profile, logout } = useAuth();
  const [summary, setSummary] = useState({ students: [], tutors: [] });

  useEffect(() => {
    getGuideQuizResultsSummary().then(setSummary).catch((error) => {
      console.error('[Examify][AdminUsers] load:error', error);
      setSummary({ students: [], tutors: [] });
    });
  }, []);

  return (
    <AppShell
      title="User management"
      subtitle="Review tutor and student guide-test performance so you can confirm who understands the platform workflow."
      role="admin"
      user={profile}
      onLogout={logout}
    >
      <div className="grid gap-6 xl:grid-cols-2">
        <ScoreList
          title="Students"
          description="Each learner appears with the latest percentage from the student Examify Guide test."
          users={summary.students}
        />
        <ScoreList
          title="Tutors"
          description="Each tutor appears with the latest percentage from the tutor Examify Guide test."
          users={summary.tutors}
        />
      </div>
    </AppShell>
  );
};
