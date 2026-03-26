import { logger } from 'firebase-functions';
import { Resend } from 'resend';
import { admin, getDb } from '../admin.js';
import { getResendConfig } from '../config.js';

const getResendClient = () => {
  const { resendApiKey } = getResendConfig();

  if (!resendApiKey) {
    throw new Error('Missing RESEND_CONFIG.apiKey secret.');
  }

  return new Resend(resendApiKey);
};

export const sendEmail = async ({ to, subject, html, text, tags = [] }) => {
  const recipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);

  if (!recipients.length) {
    logger.warn('sendEmail skipped: missing recipients', { subject });
    return { skipped: true, reason: 'missing_recipients' };
  }

  const { resendFromEmail, resendReplyToEmail } = getResendConfig();

  if (!resendFromEmail) {
    throw new Error('Missing RESEND_CONFIG.fromEmail secret.');
  }

  const resend = getResendClient();

  const payload = {
    from: resendFromEmail,
    to: recipients,
    subject,
    html,
    text,
    ...(resendReplyToEmail ? { replyTo: resendReplyToEmail } : {}),
    ...(tags.length
      ? {
          tags: tags.map((tag) => ({
            name: String(tag.name ?? 'event').slice(0, 256),
            value: String(tag.value ?? '').slice(0, 256),
          })),
        }
      : {}),
  };

  const { data, error } = await resend.emails.send(payload);

  if (error) {
    logger.error('Resend sendEmail error', { subject, recipients, error });
    throw new Error(error.message || 'Resend email send failed.');
  }

  logger.info('Resend email sent', {
    subject,
    recipients,
    resendId: data?.id ?? null,
  });

  return { id: data?.id ?? null, recipients };
};

export const withEmailDedupe = async ({ key, eventType, metadata = {}, action }) => {
  const db = getDb();
  const dispatchRef = db.collection('emailDispatches').doc(key);

  let alreadySent = false;

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(dispatchRef);
    if (snapshot.exists) {
      alreadySent = true;
      return;
    }

    transaction.create(dispatchRef, {
      key,
      eventType,
      metadata,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  if (alreadySent) {
    logger.info('Email dedupe hit, skipping send', { key, eventType });
    return { skipped: true, reason: 'dedupe' };
  }

  try {
    const result = await action();

    await dispatchRef.set(
      {
        status: 'sent',
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return result;
  } catch (error) {
    logger.error('Email send failed after dedupe reservation', {
      key,
      eventType,
      error: error?.message ?? String(error),
    });

    await dispatchRef.set(
      {
        status: 'failed',
        failedAt: admin.firestore.FieldValue.serverTimestamp(),
        errorMessage: error?.message ?? String(error),
      },
      { merge: true },
    );

    throw error;
  }
};
