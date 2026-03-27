import { logger } from 'firebase-functions';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { appConfigSecret, resendConfigSecret } from './config.js';
import {
  sendSubmissionAndPeerMarkEmail,
  sendWelcomeEmail,
  sendAssessmentOutcomeEmail,
} from './email/events.js';

const triggerOptions = {
  secrets: [appConfigSecret, resendConfigSecret],
  database: 'tutoring',
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


export const onAssessmentCompletedSendOutcomeEmail = onDocumentCreated(
  {
    ...triggerOptions,
    document: 'assessments/{assessmentId}',
  },
  async (event) => {
    const data = event.data?.data() ?? {};
    const assessmentId = event.params.assessmentId;

    if (!data.studentId) {
      logger.warn('Assessment outcome email skipped: missing studentId', { assessmentId });
      return;
    }

    try {
      await sendAssessmentOutcomeEmail({
        assessmentId,
        studentId: data.studentId,
        percentage: Number(data.percentage ?? 0),
        score: Number(data.score ?? 0),
        totalQuestions: Number(data.totalQuestions ?? 0),
        recommendedSessions: Number(data.recommendedSessions ?? 0),
        assessmentDate: data.assessmentDate || new Date().toISOString().slice(0, 10),
        questionResults: Array.isArray(data.questionResults) ? data.questionResults : [],
      });
    } catch (error) {
      logger.error('Assessment outcome email failed', {
        assessmentId,
        studentId: data.studentId,
        error: error?.message ?? String(error),
      });
    }
  },
);
