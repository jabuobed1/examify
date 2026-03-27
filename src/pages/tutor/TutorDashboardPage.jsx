import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../../components/common/AppShell';
import { SectionHeader } from '../../components/common/SectionHeader';
import { StatCard } from '../../components/common/StatCard';
import { useAuth } from '../../hooks/useAuth';
import {
  assignStudentToTutor,
  getRoleDashboardData,
  subscribeToAssignedStudentsForTutor,
  subscribeToUnassignedStudents,
} from '../../services/firestoreService';

export const TutorDashboardPage = () => {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();

  const [dashboard, setDashboard] = useState(null);
  const [students, setStudents] = useState([]);
  const [unassignedStudents, setUnassignedStudents] = useState([]);
  const [status, setStatus] = useState('');

  const loadDashboard = async () => {
    if (!profile?.uid) return;
    const data = await getRoleDashboardData('tutor', { tutorId: profile.uid });
    setDashboard(data);
  };

  useEffect(() => {
    if (!profile?.uid) return;

    loadDashboard();

    const unsub1 = subscribeToAssignedStudentsForTutor(profile.uid, setStudents);
    const unsub2 = subscribeToUnassignedStudents(setUnassignedStudents);

    return () => {
      unsub1();
      unsub2();
    };
  }, [profile?.uid]);

  const handleAssignStudent = async (studentId) => {
    try {
      await assignStudentToTutor({ studentId, tutorId: profile?.uid });
      setStatus('Student assigned successfully.');
      await loadDashboard();
    } catch (error) {
      setStatus(error.message || 'Failed to assign student.');
    }
  };

  if (!dashboard) return null;

  return (
    <AppShell
      title="Tutor dashboard"
      subtitle="Open students in a full page, schedule lessons, and update scheduled lessons safely."
      role="tutor"
      user={profile}
      onLogout={logout}
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {(dashboard.stats ?? []).map((item) => (
          <StatCard key={item.label} {...item} />
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="space-y-6">
          <SectionHeader
            eyebrow="Students"
            title="Assigned learners"
            description="Click a student to open a full page for reports, assessment, and lesson schedule updates."
          />

          <div className="space-y-4">
            {students.length ? (
              students.map((student) => {
                const studentHasReport = Boolean((student.latestReport || '').trim());

                return (
                  <button
                    key={student.uid || student.id}
                    type="button"
                    onClick={() => navigate(`/tutor/student/${student.uid || student.id}`)}
                    className="panel block w-full p-5 text-left transition hover:shadow-lg"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-lg font-semibold text-slate-950">{student.displayName || student.name || 'Student'}</p>
                        <p className="mt-1 text-sm text-slate-500">{student.grade || '?'} • {student.province || '?'}</p>
                        <p className="mt-2 text-xs text-slate-500">{studentHasReport ? 'Initial report exists.' : 'Initial report needed.'}</p>
                      </div>

                      <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] ${student.paymentCompleted ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {student.paymentCompleted ? 'paid' : 'unpaid'}
                      </span>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="panel p-5 text-sm text-slate-500">No students are assigned to this tutor yet.</div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <SectionHeader eyebrow="Add student" title="Unassigned students" description="Only students without a Maths tutor appear here." />

          <div className="space-y-4">
            {unassignedStudents.length ? (
              unassignedStudents.map((student) => (
                <div key={student.uid || student.id} className="panel flex items-center justify-between gap-3 p-5">
                  <div>
                    <p className="font-semibold text-slate-950">{student.displayName || student.name || 'Student'}</p>
                    <p className="mt-1 text-sm text-slate-500">{student.grade || '?'} • {student.province || '?'}</p>
                  </div>

                  <button type="button" className="btn-primary" onClick={() => handleAssignStudent(student.uid || student.id)}>
                    Add student
                  </button>
                </div>
              ))
            ) : (
              <div className="panel p-5 text-sm text-slate-500">There are no unassigned students right now.</div>
            )}
          </div>
        </div>
      </section>

      {status ? <div className="panel p-4 text-sm text-slate-700">{status}</div> : null}
    </AppShell>
  );
};
