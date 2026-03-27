import { logger } from 'firebase-functions';
import { getDb } from '../admin.js';
import { getResendConfig } from '../config.js';
import { sendEmail, withEmailDedupe } from './service.js';
import {
  buildAutoBillingFailedTemplate,
  buildPaymentSuccessTemplate,
  buildSubmissionPeerMarkTemplate,
  buildWelcomeEmailTemplate,
  buildAssessmentOutcomeTemplate,
} from './templates.js';

const getUserProfile = async (uid) => {
  if (!uid) return null;
  const snapshot = await getDb().collection('users').doc(uid).get();
  return snapshot.exists ? snapshot.data() : null;
};

const normalizeName = (profile) => profile?.displayName || profile?.name || profile?.email || 'there';

const getAppUrl = () => getResendConfig().resendAppUrl || null;

export const sendWelcomeEmail = async ({ userId, email, role, displayName }) =>
  withEmailDedupe({
    key: `welcome:user:${userId}`,
    eventType: 'welcome_email',
    metadata: { userId, email, role },
    action: async () => {
      const template = buildWelcomeEmailTemplate({
        displayName,
        role,
        appUrl: getAppUrl(),
      });

      return sendEmail({
        to: email,
        ...template,
        tags: [{ name: 'event', value: 'welcome' }, { name: 'role', value: role || 'unknown' }],
      });
    },
  });

export const sendPaymentSuccessEmail = async ({
  studentId,
  reference,
  amount,
  currency,
  recurring = false,
}) => {
  const studentProfile = await getUserProfile(studentId);

  if (!studentProfile?.email) {
    logger.warn('Payment success email skipped: missing student email', { studentId, reference });
    return { skipped: true, reason: 'missing_student_email' };
  }

  const recipients = [{
    email: studentProfile.email,
    name: normalizeName(studentProfile),
    relation: 'student',
  }];

  if (studentProfile.parentId) {
    const parentProfile = await getUserProfile(studentProfile.parentId);
    if (parentProfile?.email) {
      recipients.push({
        email: parentProfile.email,
        name: normalizeName(parentProfile),
        relation: 'parent',
      });
    }
  }

  const studentName = normalizeName(studentProfile);

  const jobs = recipients.map((recipient) =>
    withEmailDedupe({
      key: `payment_success:${reference}:${recipient.email}`,
      eventType: 'payment_success',
      metadata: {
        studentId,
        recipient: recipient.email,
        relation: recipient.relation,
        reference,
        recurring,
      },
      action: async () => {
        const template = buildPaymentSuccessTemplate({
          recipientName: recipient.name,
          studentName: recipient.relation === 'parent' ? studentName : null,
          amount,
          currency,
          reference,
          recurring,
          appUrl: getAppUrl(),
        });

        return sendEmail({
          to: recipient.email,
          ...template,
          tags: [
            { name: 'event', value: recurring ? 'recurring_payment_success' : 'payment_success' },
            { name: 'relation', value: recipient.relation },
          ],
        });
      },
    }),
  );

  return Promise.allSettled(jobs);
};

export const sendSubmissionAndPeerMarkEmail = async ({ studentId, assignmentId, assignmentTitle }) => {
  const studentProfile = await getUserProfile(studentId);

  if (!studentProfile?.email) {
    logger.warn('Submission+peer mark email skipped: missing student email', { studentId, assignmentId });
    return { skipped: true, reason: 'missing_student_email' };
  }

  const recipients = [{
    email: studentProfile.email,
    name: normalizeName(studentProfile),
    relation: 'student',
  }];

  if (studentProfile.parentId) {
    const parentProfile = await getUserProfile(studentProfile.parentId);
    if (parentProfile?.email) {
      recipients.push({
        email: parentProfile.email,
        name: normalizeName(parentProfile),
        relation: 'parent',
      });
    }
  }

  const studentName = normalizeName(studentProfile);

  const jobs = recipients.map((recipient) =>
    withEmailDedupe({
      key: `submission_peer_complete:${assignmentId}:${studentId}:${recipient.email}`,
      eventType: 'submission_peer_mark_complete',
      metadata: { studentId, assignmentId, relation: recipient.relation },
      action: async () => {
        const template = buildSubmissionPeerMarkTemplate({
          recipientName: recipient.name,
          assignmentTitle,
          appUrl: getAppUrl(),
          studentName,
          relation: recipient.relation,
        });

        return sendEmail({
          to: recipient.email,
          ...template,
          tags: [{ name: 'event', value: 'submission_peer_mark_complete' }, { name: 'relation', value: recipient.relation }],
        });
      },
    }),
  );

  return Promise.allSettled(jobs);
};

export const sendAutoBillingFailedEmail = async ({ studentId, reference, reason = 'charge_failed' }) => {
  const studentProfile = await getUserProfile(studentId);

  if (!studentProfile?.email) {
    logger.warn('Auto billing failed email skipped: missing student email', { studentId, reference, reason });
    return { skipped: true, reason: 'missing_student_email' };
  }

  const recipients = [{
    email: studentProfile.email,
    name: normalizeName(studentProfile),
    relation: 'student',
  }];

  if (studentProfile.parentId) {
    const parentProfile = await getUserProfile(studentProfile.parentId);
    if (parentProfile?.email) {
      recipients.push({
        email: parentProfile.email,
        name: normalizeName(parentProfile),
        relation: 'parent',
      });
    }
  }

  const studentName = normalizeName(studentProfile);

  const jobs = recipients.map((recipient) =>
    withEmailDedupe({
      key: `autobilling_failed:${studentId}:${reference || reason}:${recipient.email}`,
      eventType: 'auto_billing_failed',
      metadata: {
        studentId,
        recipient: recipient.email,
        relation: recipient.relation,
        reference,
        reason,
      },
      action: async () => {
        const template = buildAutoBillingFailedTemplate({
          recipientName: recipient.name,
          studentName: recipient.relation === 'parent' ? studentName : null,
          reference,
          appUrl: getAppUrl(),
        });

        return sendEmail({
          to: recipient.email,
          ...template,
          tags: [{ name: 'event', value: 'auto_billing_failed' }],
        });
      },
    }),
  );

  return Promise.allSettled(jobs);
};


export const sendAssessmentOutcomeEmail = async ({
  assessmentId,
  studentId,
  percentage,
  score,
  totalQuestions,
  recommendedSessions,
  assessmentDate,
  questionResults = [],
  recipientRelations = null,
}) => {
  const studentProfile = await getUserProfile(studentId);

  if (!studentProfile?.email) {
    logger.warn('Assessment email skipped: missing student email', { studentId, assessmentId });
    return { skipped: true, reason: 'missing_student_email' };
  }

  const recipients = [{
    email: studentProfile.email,
    name: normalizeName(studentProfile),
    relation: 'student',
  }];

  if (studentProfile.tutorId) {
    const tutorProfile = await getUserProfile(studentProfile.tutorId);
    if (tutorProfile?.email) {
      recipients.push({
        email: tutorProfile.email,
        name: normalizeName(tutorProfile),
        relation: 'tutor',
      });
    }
  }

  if (studentProfile.parentId) {
    const parentProfile = await getUserProfile(studentProfile.parentId);
    if (parentProfile?.email) {
      recipients.push({
        email: parentProfile.email,
        name: normalizeName(parentProfile),
        relation: 'parent',
      });
    }
  }

  const relationFilter = Array.isArray(recipientRelations) && recipientRelations.length
    ? new Set(recipientRelations.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean))
    : null;

  const uniqueRecipients = [];
  const seenEmails = new Set();
  recipients.forEach((recipient) => {
    const email = String(recipient?.email || '').trim().toLowerCase();
    if (!email || seenEmails.has(email)) return;
    if (relationFilter && !relationFilter.has(String(recipient.relation || '').toLowerCase())) return;
    seenEmails.add(email);
    uniqueRecipients.push(recipient);
  });

  if (!uniqueRecipients.length) {
    logger.info('Assessment email skipped: no matching recipients after filtering', {
      assessmentId,
      studentId,
      recipientRelations,
    });
    return { skipped: true, reason: 'no_matching_recipients' };
  }

  const studentName = normalizeName(studentProfile);

  const jobs = uniqueRecipients.map((recipient) =>
    withEmailDedupe({
      key: `assessment_outcome:${assessmentId}:${recipient.email}`,
      eventType: 'assessment_outcome',
      metadata: { assessmentId, studentId, relation: recipient.relation },
      action: async () => {
        const template = buildAssessmentOutcomeTemplate({
          recipientName: recipient.name,
          studentName,
          relation: recipient.relation,
          percentage,
          score,
          totalQuestions,
          recommendedSessions,
          assessmentDate,
          questionResults,
          appUrl: getAppUrl(),
        });

        return sendEmail({
          to: recipient.email,
          ...template,
          tags: [{ name: 'event', value: 'assessment_outcome' }, { name: 'relation', value: recipient.relation }],
        });
      },
    }),
  );

  return Promise.allSettled(jobs);
};
