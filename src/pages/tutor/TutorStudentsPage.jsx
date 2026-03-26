import { useEffect, useState } from 'react';
import { AppShell } from '../../components/common/AppShell';
import { SectionHeader } from '../../components/common/SectionHeader';
import { useAuth } from '../../hooks/useAuth';
import { subscribeToUnassignedStudents, subscribeToAssignedStudentsForTutor, assignStudentToTutor } from '../../services/firestoreService';
import { UserPlus, X, Loader2 } from 'lucide-react';

const AssignStudentModal = ({ isOpen, onClose, tutorId }) => {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [assigningId, setAssigningId] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      const unsubscribe = subscribeToUnassignedStudents((data) => {
        setStudents(data);
        setLoading(false);
      });
      return () => unsubscribe();
    }
  }, [isOpen]);

  const handleAssign = async (studentId) => {
    try {
      setAssigningId(studentId);
      await assignStudentToTutor({ studentId, tutorId });
      // Real-time listener handles the UI update!
      onClose();
    } catch (err) {
      alert(err.message || 'Failed to assign student');
    } finally {
      setAssigningId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="panel w-full max-w-md animate-in fade-in zoom-in-95 p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <h2 className="text-lg font-semibold text-slate-900">Assign unassigned student</h2>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 transition">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4 max-h-[60vh] overflow-y-auto pr-2 space-y-3">
          {loading ? (
            <div className="flex justify-center p-8 text-brand-600">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : students.length === 0 ? (
            <p className="p-4 text-center text-sm text-slate-500">No unassigned students available.</p>
          ) : (
            students.map((student) => (
              <div key={student.uid || student.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div>
                  <p className="font-semibold text-slate-900">{student.displayName || student.name || student.email || 'Unknown Student'}</p>
                  <p className="text-xs text-slate-500">Grade {student.grade || '?'} • {student.province || 'Unknown Region'}</p>
                </div>
                <button 
                  onClick={() => handleAssign(student.uid || student.id)}
                  disabled={assigningId === (student.uid || student.id)}
                  className="btn-primary py-2 px-4 text-xs font-semibold"
                >
                  {assigningId === (student.uid || student.id) ? 'Assigning...' : 'Assign'}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export const TutorStudentsPage = () => {
  const { profile, logout } = useAuth();
  const [students, setStudents] = useState([]);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);

  useEffect(() => {
    if (profile?.uid) {
      const unsubscribe = subscribeToAssignedStudentsForTutor(profile.uid, setStudents);
      return () => unsubscribe();
    }
  }, [profile?.uid]);

  return (
    <AppShell title="Students" subtitle="See assigned learner performance and tutor-owned context." role="tutor" user={profile} onLogout={logout}>
      <SectionHeader 
        eyebrow="Roster" 
        title="Tutor students" 
        description="Students stay scoped to their assigned tutor in the dashboard experience." 
        action={
          <button onClick={() => setIsAssignModalOpen(true)} className="btn-primary gap-2">
            <UserPlus className="h-4 w-4" />
            Assign Student
          </button>
        }
      />

      <AssignStudentModal 
        isOpen={isAssignModalOpen} 
        onClose={() => setIsAssignModalOpen(false)} 
        tutorId={profile?.uid || 'mock-tutor-1'} 
      />

      <div className="grid gap-4">
        {students.map((student) => (
          <div key={student.uid || student.id} className="panel p-5">
            <p className="text-lg font-semibold text-slate-950">{student.displayName || student.name || 'Learner'}</p>
            <p className="mt-1 text-sm text-slate-500">{student.grade || 'Unknown grade'} • {student.province || 'Unknown province'}</p>
            <p className="mt-3 text-sm text-slate-600">Latest mark: {student.latestMark ?? student.previousYearMark ?? 0}%</p>
          </div>
        ))}
        {!students.length ? <div className="panel p-5 text-sm text-slate-500">No tutor students have been assigned yet.</div> : null}
      </div>
    </AppShell>
  );
};
