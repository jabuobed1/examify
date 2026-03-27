import { logger } from 'firebase-functions';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { appConfigSecret, resendConfigSecret } from './config.js';
import { getDb } from './admin.js';
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

const toComparableTimestamp = (value) => {
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  const date = new Date(value);
  const millis = date.getTime();
  return Number.isFinite(millis) ? millis : 0;
};

const getLatestAssessmentForStudent = async (studentId) => {
  const snapshot = await getDb()
    .collection('assessments')
    .where('studentId', '==', studentId)
    .limit(20)
    .get();

  if (snapshot.empty) return null;

  const sorted = snapshot.docs
    .map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() }))
    .sort((left, right) => {
      const rightTime = Math.max(
        toComparableTimestamp(right.createdAt),
        toComparableTimestamp(right.updatedAt),
        toComparableTimestamp(right.assessmentDate),
      );
      const leftTime = Math.max(
        toComparableTimestamp(left.createdAt),
        toComparableTimestamp(left.updatedAt),
        toComparableTimestamp(left.assessmentDate),
      );
      return rightTime - leftTime;
    });

  return sorted[0] ?? null;
};

export const onParentLinkedSendLatestAssessmentOutcomeEmail = onDocumentUpdated(
  {
    ...triggerOptions,
    document: 'users/{userId}',
  },
  async (event) => {
    const before = event.data?.before.data() ?? {};
    const after = event.data?.after.data() ?? {};
    const studentId = event.params.userId;
    const previousParentId = String(before.parentId || '').trim();
    const nextParentId = String(after.parentId || '').trim();

    if ((after.role && after.role !== 'student') || !nextParentId || previousParentId === nextParentId) {
      return;
    }

    try {
      const latestAssessment = await getLatestAssessmentForStudent(studentId);
      if (!latestAssessment) {
        logger.info('Parent linked but no assessment exists yet', { studentId, parentId: nextParentId });
        return;
      }

      await sendAssessmentOutcomeEmail({
        assessmentId: latestAssessment.id,
        studentId,
        percentage: Number(latestAssessment.percentage ?? 0),
        score: Number(latestAssessment.score ?? 0),
        totalQuestions: Number(latestAssessment.totalQuestions ?? 0),
        recommendedSessions: Number(latestAssessment.recommendedSessions ?? 0),
        assessmentDate: latestAssessment.assessmentDate || new Date().toISOString().slice(0, 10),
        questionResults: Array.isArray(latestAssessment.questionResults) ? latestAssessment.questionResults : [],
        recipientRelations: ['parent'],
      });
    } catch (error) {
      logger.error('Parent-link assessment outcome email failed', {
        studentId,
        parentId: nextParentId,
        error: error?.message ?? String(error),
      });
    }
  },
);
