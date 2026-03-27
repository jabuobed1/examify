import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AppShell } from '../../components/common/AppShell';
import { useAuth } from '../../hooks/useAuth';
import { getAssessmentForParentStudent } from '../../services/firestoreService';
import { AssessmentDetailCard } from '../../components/assessment/AssessmentResultPanel';

export const ParentAssessmentResultPage = () => {
  const { profile, logout } = useAuth();
  const { studentId, assessmentId } = useParams();
  const [assessment, setAssessment] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const run = async () => {
      if (!profile?.uid || !studentId) return;
      try {
        setError('');
        const result = await getAssessmentForParentStudent({
          parentId: profile.uid,
          studentId,
          assessmentId,
        });
        setAssessment(result);
      } catch (err) {
        setError(err.message || 'Failed to load assessment result.');
      }
    };
    run();
  }, [profile?.uid, studentId, assessmentId]);

  return (
    <AppShell
      title="Student Assessment Result"
      subtitle="View full assessment details for your linked student."
      role="parent"
      user={profile}
      onLogout={logout}
    >
      {error ? <div className="panel p-4 text-sm text-rose-700">{error}</div> : null}
      <AssessmentDetailCard assessment={assessment} backTo={`/parent/student/${studentId}`} />
    </AppShell>
  );
};
