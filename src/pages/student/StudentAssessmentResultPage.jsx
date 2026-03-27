import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AppShell } from '../../components/common/AppShell';
import { useAuth } from '../../hooks/useAuth';
import { getAssessmentForStudent } from '../../services/firestoreService';
import { AssessmentDetailCard } from '../../components/assessment/AssessmentResultPanel';

export const StudentAssessmentResultPage = () => {
  const { profile, logout } = useAuth();
  const { assessmentId } = useParams();
  const [assessment, setAssessment] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const run = async () => {
      if (!profile?.uid) return;
      try {
        setError('');
        const result = await getAssessmentForStudent({ studentId: profile.uid, assessmentId });
        setAssessment(result);
      } catch (err) {
        setError(err.message || 'Failed to load assessment result.');
      }
    };
    run();
  }, [profile?.uid, assessmentId]);

  return (
    <AppShell
      title="Assessment Result"
      subtitle="Review your detailed assessment outcome and question-level correctness."
      role="student"
      user={profile}
      onLogout={logout}
    >
      {error ? <div className="panel p-4 text-sm text-rose-700">{error}</div> : null}
      <AssessmentDetailCard assessment={assessment} backTo="/student" />
    </AppShell>
  );
};
