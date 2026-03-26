const brandColors = {
  pageBg: '#f1f5f9',
  cardBg: '#ffffff',
  textPrimary: '#0f172a',
  textMuted: '#475569',
  brand: '#2563eb',
  brandDark: '#1d4ed8',
  accent: '#14b8a6',
  warning: '#f59e0b',
  border: '#e2e8f0',
};

const escapeHtml = (value = '') =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const buildEmailLayout = ({ preheader = '', title, greeting, body, highlight, ctaLabel, ctaUrl, footerNote }) => {
  const safePreheader = escapeHtml(preheader);
  const safeTitle = escapeHtml(title);
  const safeGreeting = escapeHtml(greeting);

  return `
  <!doctype html>
  <html>
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <title>${safeTitle}</title>
    </head>
    <body style="margin:0;padding:0;background:${brandColors.pageBg};font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;color:${brandColors.textPrimary};">
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;visibility:hidden;">${safePreheader}</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;background:${brandColors.pageBg};">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:${brandColors.cardBg};border:1px solid ${brandColors.border};border-radius:20px;overflow:hidden;">
              <tr>
                <td style="padding:0;background:linear-gradient(135deg, ${brandColors.brandDark} 0%, ${brandColors.brand} 65%, ${brandColors.accent} 100%);">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td style="padding:26px 28px;">
                        <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;font-weight:700;color:#bfdbfe;">Examify</div>
                        <h1 style="margin:12px 0 0 0;font-size:28px;line-height:1.2;font-weight:800;color:#ffffff;">${safeTitle}</h1>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:28px;">
                  <p style="margin:0 0 14px 0;font-size:16px;line-height:1.6;color:${brandColors.textPrimary};font-weight:600;">${safeGreeting}</p>
                  ${body}
                  ${
                    highlight
                      ? `<div style="margin:20px 0 0 0;padding:16px 18px;border-radius:14px;border:1px solid #bae6fd;background:#eff6ff;color:${brandColors.textPrimary};font-size:14px;line-height:1.6;">${highlight}</div>`
                      : ''
                  }
                  ${
                    ctaLabel && ctaUrl
                      ? `<div style="margin:24px 0 0 0;"><a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:${brandColors.brand};color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;">${escapeHtml(ctaLabel)}</a></div>`
                      : ''
                  }
                </td>
              </tr>
              <tr>
                <td style="border-top:1px solid ${brandColors.border};padding:18px 28px;background:#f8fafc;">
                  <p style="margin:0;font-size:12px;line-height:1.6;color:${brandColors.textMuted};">${escapeHtml(footerNote || 'You are receiving this message because your Examify account has an active Maths learning subscription.')}</p>
                  <p style="margin:8px 0 0 0;font-size:12px;line-height:1.6;color:${brandColors.textMuted};">© ${new Date().getFullYear()} Examify. Focused Maths learning, guided with care.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
  `;
};

const createBodyParagraphs = (paragraphs = []) =>
  paragraphs
    .filter(Boolean)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 12px 0;font-size:15px;line-height:1.75;color:${brandColors.textMuted};">${escapeHtml(paragraph)}</p>`,
    )
    .join('');

export const buildWelcomeEmailTemplate = ({ displayName, role = 'student', appUrl }) => {
  const roleLabel = role === 'tutor' ? 'tutor' : role === 'parent' ? 'parent' : role === 'admin' ? 'admin' : 'student';
  const title = roleLabel === 'student' ? 'Welcome to Examify 🎓' : 'Welcome to Examify';
  const subject = roleLabel === 'student'
    ? 'Welcome to Examify — your Maths journey starts here'
    : `Welcome to Examify, ${roleLabel}`;

  const html = buildEmailLayout({
    preheader: 'Your Examify account is ready.',
    title,
    greeting: `Hi ${displayName || 'there'},`,
    body: createBodyParagraphs([
      roleLabel === 'student'
        ? 'Your Examify account is active. You can now complete your onboarding, keep up with today’s exercise, and build consistent Maths progress each day.'
        : 'Your Examify account is now active and ready to use.',
      roleLabel === 'tutor'
        ? 'As a tutor, you can manage your assigned Maths students, track reports, and support confident progress.'
        : null,
      roleLabel === 'parent'
        ? 'As a parent, you can monitor linked student progress and keep billing details up to date.'
        : null,
    ]),
    highlight: roleLabel === 'student'
      ? 'Tip: Students can only submit today’s exercise, so staying consistent daily keeps progress on track.'
      : 'Examify keeps the focus on structured, real Maths learning outcomes.',
    ctaLabel: appUrl ? 'Open Examify' : null,
    ctaUrl: appUrl || null,
  });

  const text = [
    `Hi ${displayName || 'there'},`,
    '',
    roleLabel === 'student'
      ? 'Welcome to Examify. Your account is active and your Maths learning journey starts now.'
      : 'Welcome to Examify. Your account is active.',
    appUrl ? `Open your dashboard: ${appUrl}` : null,
    '',
    '— Examify Team',
  ]
    .filter(Boolean)
    .join('\n');

  return { subject, html, text };
};

export const buildPaymentSuccessTemplate = ({ recipientName, studentName, amount, currency = 'ZAR', reference, appUrl, recurring = false }) => {
  const formattedAmount = `${currency} ${Number(amount ?? 0).toFixed(2)}`;
  const subject = recurring
    ? 'Examify payment received — subscription renewed successfully'
    : 'Examify payment successful — your subscription is active';

  const html = buildEmailLayout({
    preheader: 'Payment confirmed successfully.',
    title: recurring ? 'Subscription Renewal Successful' : 'Payment Successful',
    greeting: `Hi ${recipientName || 'there'},`,
    body: createBodyParagraphs([
      `We’ve successfully received a payment of ${formattedAmount}${studentName ? ` for ${studentName}` : ''}.`,
      recurring
        ? 'Your recurring subscription charge was completed successfully, and learning access remains active without interruption.'
        : 'Your payment has been verified and the student account remains unlocked for active Maths exercises and progress tracking.',
    ]),
    highlight: `Reference: ${escapeHtml(reference || 'N/A')}`,
    ctaLabel: appUrl ? 'View Dashboard' : null,
    ctaUrl: appUrl || null,
  });

  const text = [
    `Hi ${recipientName || 'there'},`,
    '',
    `Payment successful: ${formattedAmount}${studentName ? ` for ${studentName}` : ''}.`,
    recurring ? 'Recurring subscription renewal was successful.' : 'Payment has been verified successfully.',
    `Reference: ${reference || 'N/A'}`,
    appUrl ? `Dashboard: ${appUrl}` : null,
    '',
    '— Examify Team',
  ]
    .filter(Boolean)
    .join('\n');

  return { subject, html, text };
};

export const buildSubmissionPeerMarkTemplate = ({ recipientName, assignmentTitle, appUrl }) => {
  const subject = 'Excellent work — submission and peer marking complete';

  const html = buildEmailLayout({
    preheader: 'You completed both submission and peer marking.',
    title: 'Great Progress Today ✅',
    greeting: `Hi ${recipientName || 'there'},`,
    body: createBodyParagraphs([
      'Well done. You have successfully submitted your work and completed peer marking for another student.',
      assignmentTitle ? `Completed exercise: ${assignmentTitle}.` : null,
      'Consistency like this is exactly how strong Maths confidence is built over time.',
    ]),
    highlight: 'Keep showing up for each day’s exercise to maintain your learning streak.',
    ctaLabel: appUrl ? 'Continue in Examify' : null,
    ctaUrl: appUrl || null,
  });

  const text = [
    `Hi ${recipientName || 'there'},`,
    '',
    'You completed today’s submission and peer marking successfully.',
    assignmentTitle ? `Exercise: ${assignmentTitle}` : null,
    appUrl ? `Open Examify: ${appUrl}` : null,
    '',
    '— Examify Team',
  ]
    .filter(Boolean)
    .join('\n');

  return { subject, html, text };
};

export const buildAutoBillingFailedTemplate = ({ recipientName, studentName, reference, appUrl }) => {
  const subject = 'Action needed: Examify subscription charge was unsuccessful';

  const html = buildEmailLayout({
    preheader: 'Your automatic subscription charge could not be completed.',
    title: 'Subscription Charge Unsuccessful',
    greeting: `Hi ${recipientName || 'there'},`,
    body: createBodyParagraphs([
      `We were unable to complete the latest automatic subscription charge${studentName ? ` for ${studentName}` : ''}.`,
      'No action panic is needed — please update your payment method or retry payment to keep learning access uninterrupted.',
    ]),
    highlight: `<span style="color:${brandColors.warning};font-weight:700;">Reference:</span> ${escapeHtml(reference || 'N/A')}`,
    ctaLabel: appUrl ? 'Update Billing' : null,
    ctaUrl: appUrl || null,
  });

  const text = [
    `Hi ${recipientName || 'there'},`,
    '',
    `Automatic subscription billing failed${studentName ? ` for ${studentName}` : ''}.`,
    'Please update payment details or retry to keep access active.',
    `Reference: ${reference || 'N/A'}`,
    appUrl ? `Update billing in Examify: ${appUrl}` : null,
    '',
    '— Examify Team',
  ]
    .filter(Boolean)
    .join('\n');

  return { subject, html, text };
};
