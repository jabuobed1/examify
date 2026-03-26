import { useEffect, useState } from 'react';
import { AppShell } from '../../components/common/AppShell';
import { PeerReviewForm } from '../../components/dashboard/PeerReviewForm';
import { useAuth } from '../../hooks/useAuth';
import { getRoleDashboardData, getStudentAccessState, getSubmissionById, savePeerReview } from '../../services/firestoreService';
import { canSubmitPeerReview } from '../../utils/exerciseRules';

export const StudentPeerReviewsPage = () => {
  const { profile, logout } = useAuth();
  const [assignment, setAssignment] = useState(null);
  const [submission, setSubmission] = useState(null);
  const [paymentCompleted, setPaymentCompleted] = useState(false);

  useEffect(() => {
    const load = async () => {
      const access = await getStudentAccessState(profile);
      setPaymentCompleted(access.paymentCompleted);
      if (!access.paymentCompleted) return;
      const data = await getRoleDashboardData('student', { studentId: profile?.uid });
      const peerAssignment = data.peerReviewAssignment ?? null;
      setAssignment(peerAssignment);
      if (peerAssignment?.submissionId) {
        const result = await getSubmissionById(peerAssignment.submissionId);
        setSubmission(result);
      } else {
        setSubmission(null);
      }
    };
    load();
  }, [profile]);

  return (
    <AppShell title="Peer reviews" subtitle="Review a classmate’s uploaded Maths answer after you have submitted your own work." role="student" user={profile} onLogout={logout}>
      {!paymentCompleted ? <div className="panel p-5 text-sm text-amber-700">Payment is required before peer review activities unlock.</div> : null}
      <PeerReviewForm
        submission={submission}
        canReview={paymentCompleted && canSubmitPeerReview(assignment ?? {})}
        onSubmit={(payload) =>
          savePeerReview({
            ...payload,
            reviewerId: profile?.uid,
            submissionId: assignment?.submissionId,
            assignmentDate: assignment?.assignmentDate,
          })
        }
      />
    </AppShell>
  );
};
