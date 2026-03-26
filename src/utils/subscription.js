import { SESSION_PRICING } from '../lib/constants';

export const getRecommendedSessionCount = (latestMark = 0) => {
  if (latestMark < 70) return 4;
  return 2;
};

export const calculateSubscriptionQuote = ({ latestMark = 0, sessionType = 'online' }) => {
  const sessionCount = getRecommendedSessionCount(latestMark);
  const unitPrice = SESSION_PRICING[sessionType] ?? SESSION_PRICING.online;
  const amount = Number((sessionCount * unitPrice).toFixed(2));

  return {
    latestMark,
    sessionType,
    sessionCount,
    unitPrice,
    amount,
  };
};
