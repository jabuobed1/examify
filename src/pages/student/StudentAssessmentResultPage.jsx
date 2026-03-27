import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AppShell } from '../../components/common/AppShell';
import { useAuth } from '../../hooks/useAuth';
import { acceptAssessmentRecommendation, getAssessmentForStudent } from '../../services/firestoreService';
import { AssessmentDetailCard } from '../../components/assessment/AssessmentResultPanel';

export const StudentAssessmentResultPage = () => {
  const { profile, logout, refreshProfile } = useAuth();
  const { assessmentId } = useParams();
  const [assessment, setAssessment] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [isAccepting, setIsAccepting] = useState(false);

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

  const handleAcceptRecommendation = async () => {
    if (!profile?.uid || !assessmentId) return;

    try {
      setIsAccepting(true);
      setError('');
      setStatus('');

      const result = await acceptAssessmentRecommendation({
        studentId: profile.uid,
        assessmentId,
        acceptedByUserId: profile.uid,
        acceptedByRole: 'student',
      });

      await refreshProfile(profile.uid);
      setStatus(
        `Recommendation accepted. Latest mark updated to ${result.latestMark}% and billing will use this mark.`,
      );
    } catch (err) {
      setError(err.message || 'Failed to accept recommendation.');
    } finally {
      setIsAccepting(false);
    }
  };

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
      {assessment ? (
        <div className="panel mt-6 space-y-3 p-5">
          <p className="text-sm text-slate-600">
            Accept the recommendation to update your latest mark and monthly billing calculation.
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
