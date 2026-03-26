import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { getDb } from './admin.js';
import { paystackConfigSecret, appConfigSecret, resendConfigSecret } from './config.js';
import { chargeAuthorizationForSubscription } from './paystack.js';
import { sendAutoBillingFailedEmail } from './email/events.js';

export const processSubscriptionRenewals = onSchedule(
  {
    schedule: 'every day 01:00',
    timeZone: 'Africa/Johannesburg',
    secrets: [paystackConfigSecret, appConfigSecret, resendConfigSecret],
  },
  async () => {
    const db = getDb();
    const now = new Date();

    const dueSubscriptionsSnapshot = await db
      .collection('subscriptions')
      .where('autoRenew', '==', true)
      .where('status', '==', 'active')
      .where('renewalDate', '<=', now)
      .get();

    logger.info('Found due subscriptions', { count: dueSubscriptionsSnapshot.size });

    for (const doc of dueSubscriptionsSnapshot.docs) {
      const subscription = doc.data();
      const studentId = subscription.studentId;

      try {
        const authDoc = await db.collection('subscriptionAuthorizations').doc(studentId).get();

        if (!authDoc.exists) {
          logger.error('Missing stored authorization', { studentId });
          await db.collection('subscriptions').doc(studentId).set(
            {
              status: 'past_due',
              lastChargeStatus: 'missing_authorization',
              lastChargeAttemptAt: new Date(),
            },
            { merge: true }
          );

          try {
            await sendAutoBillingFailedEmail({
              studentId,
              reference: subscription.latestReference ?? null,
              reason: 'missing_authorization',
            });
          } catch (emailError) {
            logger.error('Failed to send missing authorization auto billing email', {
              studentId,
              error: emailError?.message ?? String(emailError),
            });
          }

          continue;
        }

        const auth = authDoc.data();

        const renewalResult = await chargeAuthorizationForSubscription({
          studentId,
          email: auth.email,
          amount: subscription.amount,
          authorizationCode: auth.authorizationCode,
          metadata: {
            sessionType: subscription.sessionType ?? 'online',
            sessionCount: subscription.sessionCount ?? 1,
          },
        });

        if (!renewalResult.succeeded) {
          logger.warn('Subscription renewal completed with non-success charge status', {
            studentId,
            chargeStatus: renewalResult.charge?.status ?? 'unknown',
          });
        } else {
          logger.info('Subscription renewed successfully', { studentId });
        }
      } catch (error) {
        logger.error('Subscription renewal failed', {
          studentId,
          error: error?.message ?? String(error),
        });

        await db.collection('subscriptions').doc(studentId).set(
          {
            status: 'past_due',
            lastChargeStatus: 'failed',
            lastChargeAttemptAt: new Date(),
          },
          { merge: true }
        );

        await db.collection('users').doc(studentId).set(
          {
            subscriptionStatus: 'past_due',
            updatedAt: new Date(),
          },
          { merge: true }
        );

        try {
          await sendAutoBillingFailedEmail({
            studentId,
            reference: subscription.latestReference ?? null,
            reason: 'charge_failed_exception',
          });
        } catch (emailError) {
          logger.error('Failed to send failed auto billing email', {
            studentId,
            error: emailError?.message ?? String(emailError),
          });
        }
      }
    }
  }
);