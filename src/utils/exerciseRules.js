import { format, isAfter, isBefore, isSameDay, startOfDay } from 'date-fns';

export const getExerciseAvailability = (assignmentDate, hasSubmission) => {
  const today = startOfDay(new Date());
  const target = startOfDay(new Date(assignmentDate));

  if (isSameDay(today, target)) {
    return {
      state: 'active',
      label: hasSubmission ? 'Submitted ✅' : 'For Today ⏳',
    };
  }

  if (isAfter(target, today)) {
    return {
      state: 'upcoming',
      label: `Opens ${format(target, 'PPP')}`,
    };
  }

  return {
    state: hasSubmission ? 'completed' : 'locked',
    label: hasSubmission ? 'Completed' : 'Missed and locked',
  };
};

export const canOpenExercise = (assignmentDate) => isSameDay(startOfDay(new Date(assignmentDate)), startOfDay(new Date()));

export const canSubmitPeerReview = ({ ownSubmissionComplete, peerReviewSubmitted, assignmentDate }) => {
  if (!assignmentDate) return false;
  return ownSubmissionComplete && !peerReviewSubmitted && !isBefore(startOfDay(new Date()), startOfDay(new Date(assignmentDate)));
};
