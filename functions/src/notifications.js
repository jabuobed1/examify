import { logger } from 'firebase-functions';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { appConfigSecret, resendConfigSecret } from './config.js';
import {
  sendSubmissionAndPeerMarkEmail,
  sendWelcomeEmail,
} from './email/events.js';

const triggerOptions = {
  secrets: [appConfigSecret, resendConfigSecret],
};

export const onUserCreatedSendWelcomeEmail = onDocumentCreated(
  {
    ...triggerOptions,
    document: 'users/{userId}',
  },
  async (event) => {
    const data = event.data?.data();
    const userId = event.params.userId;

    if (!data?.email) {
      logger.warn('Welcome email skipped: user has no email', { userId });
      return;
    }

    try {
      await sendWelcomeEmail({
        userId,
        email: data.email,
        role: data.role,
        displayName: data.displayName,
      });
    } catch (error) {
      logger.error('Welcome email failed', {
        userId,
        error: error?.message ?? String(error),
      });
    }
  },
);

const isCompletedSubmissionAndPeerMark = (record = {}) => {
  const hasSubmission = record.submitted === 'Yes' || Boolean(record.submittedImageUrl);
  const peerMarkCompleted = record.peerReviewStatus === 'completed' || record.peerReviewed === 'Yes';
  return hasSubmission && peerMarkCompleted;
};

export const onAssignmentCompletedSendSubmissionPeerMarkEmail = onDocumentUpdated(
  {
    ...triggerOptions,
    document: 'dailyExerciseAssignments/{assignmentId}',
  },
  async (event) => {
    const before = event.data?.before.data() ?? {};
    const after = event.data?.after.data() ?? {};
    const assignmentId = event.params.assignmentId;

    const becameCompleted = !isCompletedSubmissionAndPeerMark(before) && isCompletedSubmissionAndPeerMark(after);

    if (!becameCompleted) {
      return;
    }

    if (!after.studentId) {
      logger.warn('Submission+peer mark email skipped: missing studentId', { assignmentId });
      return;
    }

    try {
      await sendSubmissionAndPeerMarkEmail({
        studentId: after.studentId,
        assignmentId,
        assignmentTitle: after.title || after.exerciseTitle || null,
      });
    } catch (error) {
      logger.error('Submission+peer mark email failed', {
        assignmentId,
        studentId: after.studentId,
        error: error?.message ?? String(error),
      });
    }
  },
);
