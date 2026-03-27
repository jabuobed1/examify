import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AppShell } from '../../components/common/AppShell';
import { useAuth } from '../../hooks/useAuth';
import { acceptAssessmentRecommendation, getAssessmentForParentStudent } from '../../services/firestoreService';
import { AssessmentDetailCard } from '../../components/assessment/AssessmentResultPanel';

export const ParentAssessmentResultPage = () => {
  const { profile, logout } = useAuth();
  const { studentId, assessmentId } = useParams();
  const [assessment, setAssessment] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [isAccepting, setIsAccepting] = useState(false);

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

  const handleAcceptRecommendation = async () => {
    if (!profile?.uid || !studentId || !assessmentId) return;

    try {
      setIsAccepting(true);
      setError('');
      setStatus('');

      const result = await acceptAssessmentRecommendation({
        studentId,
        assessmentId,
        acceptedByUserId: profile.uid,
        acceptedByRole: 'parent',
        parentId: profile.uid,
      });

      setStatus(
        `Recommendation accepted. Latest mark updated to ${result.latestMark}% for subscription calculations.`,
      );
    } catch (err) {
      setError(err.message || 'Failed to accept recommendation.');
    } finally {
      setIsAccepting(false);
    }
  };

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
      {assessment ? (
        <div className="panel mt-6 space-y-3 p-5">
          <p className="text-sm text-slate-600">
            Accept the recommendation to apply this assessment mark as the student&apos;s latest mark for billing.
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={handleAcceptRecommendation}
            disabled={isAccepting}
          >
            {isAccepting ? 'Accepting recommendation...' : 'Accept recommendation'}
          </button>
          {status ? <p className="text-sm font-medium text-emerald-700">{status}</p> : null}
        </div>
      ) : null}
    </AppShell>
  );
};
