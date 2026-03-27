import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { addDays, formatISO } from 'date-fns';
import { db, isFirebaseConfigured } from '../firebase/config';
import { collections } from '../firebase/schema';
import { recommendExercises, searchPastPapersWithAi } from './aiService';
import {
  mockCompletedLessons,
  mockDashboardData,
  mockQuestionPapers,
  mockTutorReports,
  mockUsers,
  mockGuideQuizResults,
} from '../data/mockData';
import { CURRICULUMS, MAX_AI_SOURCE_PAPERS, MAX_DAILY_EXERCISES, PAPER_MONTHS, PAPER_NUMBERS, SUBJECT, WEEKLY_EXERCISE_DAYS } from '../lib/constants';

const emptyDashboardData = {
  student: {
    stats: [],
    todayExercise: null,
    exerciseHistory: [],
    peerReviewAssignment: null,
    progress: [],
    feedback: [],
    paymentCompleted: false,
    generationStatus: null,
  },
  tutor: {
    stats: [],
    students: [],
    unassignedStudents: [],
    completedTopics: [],
    reports: [],
    questionPapers: [],
  },
  admin: {
    stats: [],
    payments: [],
    tutors: [],
  },
};

const ensureDb = () => {
  if (!db) throw new Error('Firebase is not configured. Add VITE_FIREBASE_* variables to use live data.');
};

const demoUsers = Object.values(mockUsers);
const demoGuideQuizResults = [...mockGuideQuizResults];

const GENERATION_HISTORY_LIMIT = 40;

const normalizeQuestionReferenceTitle = (references = []) =>
  references
    .map((reference) => String(reference || '').trim())
    .filter(Boolean)
    .join(' | ');

const toDateOnly = (value) => {
  if (!value) return null;
  return String(value).slice(0, 10);
};

const getLocalDateISO = (value = new Date()) => [
  value.getFullYear(),
  String(value.getMonth() + 1).padStart(2, '0'),
  String(value.getDate()).padStart(2, '0'),
].join('-');

const buildStudentGenerationStatus = ({
  latestReport,
  availablePapers,
  paymentCompleted,
  completedLessons = [],
  hasInitialGeneration = false,
}) => {
  const initialReady = Boolean(paymentCompleted && latestReport && availablePapers.length >= 2 && completedLessons.length > 0);
  const weeklyReady = Boolean(hasInitialGeneration && paymentCompleted && completedLessons.length > 0 && availablePapers.length >= 2);

  return {
    paymentCompleted,
    initial: {
      ready: initialReady,
      checks: {
        paymentCompleted,
        latestTutorReportExists: Boolean(latestReport),
        minimumQuestionPaperCountMet: availablePapers.length >= 2,
        lessonCompleted: completedLessons.length > 0,
      },
    },
    weekly: {
      ready: weeklyReady,
      checks: {
        paymentCompleted,
        initialGenerationExists: hasInitialGeneration,
        lessonCompleted: completedLessons.length > 0,
        minimumQuestionPaperCountMet: availablePapers.length >= 2,
      },
    },
  };
};

const filterQuestionPapers = (papers, { grade, region, subject = SUBJECT, allowNational = true }) =>
  papers.filter((paper) => {
    const subjectMatches = paper.subject === subject;
    const gradeMatches = !paper.grade || !grade || paper.grade === grade;
    const regionMatches = paper.region === region || (allowNational && paper.region === 'National');
    return subjectMatches && gradeMatches && regionMatches;
  });

const getLatestTutorReportFromList = (studentId, reports) =>
  [...reports]
    .filter((report) => report.studentId === studentId)
    .sort((left, right) => new Date(right.updatedAt ?? right.createdAt ?? 0) - new Date(left.updatedAt ?? left.createdAt ?? 0))[0] ?? null;

const getTopicSummary = (completedLessons = []) => {
  const topicMap = new Map();

  completedLessons.forEach((lesson, lessonIndex) => {
    const topicName = String(lesson?.topic || '').trim();
    if (!topicName) return;

    const current = topicMap.get(topicName) ?? {
      topic: topicName,
      understandingLevel: Number(lesson?.understandingLevel ?? 5),
      reportSnippet: lesson?.topicReport ?? lesson?.note ?? '',
      completedOn: lesson?.completedOn ?? lesson?.createdAt ?? '',
      lessonCount: 0,
      firstSeenIndex: lessonIndex,
    };

    topicMap.set(topicName, {
      ...current,
      understandingLevel: Number(lesson?.understandingLevel ?? current.understandingLevel ?? 5),
      reportSnippet: lesson?.topicReport ?? lesson?.note ?? current.reportSnippet,
      completedOn: lesson?.completedOn ?? lesson?.createdAt ?? current.completedOn,
      lessonCount: current.lessonCount + 1,
    });
  });

  return [...topicMap.values()]
    .sort((left, right) => {
      const dateDifference = new Date(left.completedOn || 0) - new Date(right.completedOn || 0);
      if (dateDifference !== 0) return dateDifference;
      return left.firstSeenIndex - right.firstSeenIndex;
    });
};

const getInitialTopicsForDay = (topicSummaries = []) => topicSummaries.map((item) => item.topic);

const pickWeeklyTopicsForDay = ({ topicSummaries = [], maxQuestionsPerDay, dayIndex = 0, generationNumber = 1 }) => {
  if (!topicSummaries.length) return [];

  const sortedByStrength = [...topicSummaries].sort((left, right) => {
    const understandingDifference = (right.understandingLevel ?? 0) - (left.understandingLevel ?? 0);
    if (understandingDifference !== 0) return understandingDifference;
    return new Date(left.completedOn || 0) - new Date(right.completedOn || 0);
  });

  if (generationNumber <= 2) {
    return topicSummaries.slice(0, maxQuestionsPerDay).map((item) => item.topic);
  }

  const selected = [];
  const offsetPool = dayIndex % Math.max(sortedByStrength.length, 1);
  const rotated = [...sortedByStrength.slice(offsetPool), ...sortedByStrength.slice(0, offsetPool)];

  rotated.forEach((topicSummary) => {
    if (selected.length < maxQuestionsPerDay && !selected.includes(topicSummary.topic)) {
      selected.push(topicSummary.topic);
    }
  });

  if (selected.length < maxQuestionsPerDay) {
    topicSummaries.forEach((topicSummary) => {
      if (selected.length < maxQuestionsPerDay && !selected.includes(topicSummary.topic)) {
        selected.push(topicSummary.topic);
      }
    });
  }

  return selected;
};

const getGenerationNumber = (history = [], mode) => {
  const batches = new Set(
    history
      .filter((assignment) => assignment?.generationMode === mode)
      .map((assignment) => assignment?.generationBatchId)
      .filter(Boolean),
  );

  return batches.size + 1;
};

const buildTutorDashboard = () => {
  const assignedStudents = demoUsers.filter((user) => user.role === 'student' && user.tutorId === 'mock-tutor-1');
  const unassignedStudents = demoUsers.filter((user) => user.role === 'student' && !user.tutorId);

  return {
    ...mockDashboardData.tutor,
    students: assignedStudents.map((student) => ({
      id: student.uid,
      name: student.displayName,
      grade: student.grade,
      latestMark: student.latestMark,
      province: student.province,
      paymentCompleted: student.paymentCompleted,
    })),
    unassignedStudents: unassignedStudents.map((student) => ({
      id: student.uid,
      name: student.displayName,
      grade: student.grade,
      latestMark: student.latestMark,
      province: student.province,
      paymentCompleted: student.paymentCompleted,
    })),
    reports: mockTutorReports,
    completedTopics: mockCompletedLessons,
    questionPapers: mockQuestionPapers,
    stats: [
      { label: 'Assigned students', value: String(assignedStudents.length), detail: 'All Maths only' },
      { label: 'Unassigned students', value: String(unassignedStudents.length), detail: 'Ready to add' },
      { label: 'Question papers', value: String(mockQuestionPapers.length), detail: 'Published' },
      { label: 'Reports', value: String(mockTutorReports.length), detail: 'Latest editable notes' },
    ],
  };
};

const buildStudentDashboard = (studentId) => {
  const student = demoUsers.find((user) => user.uid === studentId) ?? demoUsers.find((user) => user.role === 'student');
  const availablePapers = filterQuestionPapers(mockQuestionPapers, { grade: student?.grade, region: student?.province });
  const latestReport = student?.latestReport || getLatestTutorReportFromList(student?.uid, mockTutorReports)?.note || '';
  const assignmentHistory = mockDashboardData.student.exerciseHistory ?? [];
  const generationStatus = buildStudentGenerationStatus({
    student,
    latestReport,
    availablePapers,
    paymentCompleted: Boolean(student?.paymentCompleted),
    completedLessons: mockCompletedLessons.filter((lesson) => lesson.studentId === student?.uid),
    hasInitialGeneration: assignmentHistory.some((assignment) => assignment?.generationMode === 'initial'),
  });

  return {
    ...mockDashboardData.student,
    paymentCompleted: Boolean(student?.paymentCompleted),
    generationStatus,
    stats: [
      { label: 'Average mark', value: `${student?.latestMark ?? 0}%`, detail: 'Current learning signal' },
      { label: 'Previous year mark', value: `${student?.previousYearMark ?? 0}%`, detail: 'Entered by student' },
      { label: 'Completed topics', value: String(mockCompletedLessons.filter((lesson) => lesson.studentId === student?.uid).length), detail: 'Tutor confirmed' },
      { label: 'Subscription', value: student?.paymentCompleted ? 'Active' : 'Pending', detail: student?.paymentCompleted ? 'Paid and unlocked' : 'Payment required' },
    ],
  };
};

export const getRoleDashboardData = async (role, options = {}) => {
  if (!isFirebaseConfigured) {
    if (role === 'student') return buildStudentDashboard(options.studentId ?? 'mock-student-1');
    if (role === 'tutor') return buildTutorDashboard();
    return mockDashboardData[role];
  }
  return emptyDashboardData[role] ?? { stats: [] };
};

export const getTodayExercise = async (studentId) => {
  if (!isFirebaseConfigured) return buildStudentDashboard(studentId).todayExercise;
  ensureDb();
  const today = getLocalDateISO();
  const q = query(
    collection(db, collections.dailyExerciseAssignments),
    where('studentId', '==', studentId),
    where('assignmentDate', '==', today),
    limit(1),
  );
  const snapshot = await getDocs(q);
  return snapshot.docs[0] ? { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } : null;
};

export const getExerciseHistory = async (studentId) => {
  if (!isFirebaseConfigured) return buildStudentDashboard(studentId).exerciseHistory;
  
  ensureDb();

  // Create a string for 'today' in the user's local timezone (YYYY-MM-DD)
  // This ensures "today" is relative to the person using the app.
  const todayLocal = getLocalDateISO();

  const q = query(
    collection(db, "dailyExerciseAssignments"),
    where('studentId', '==', studentId),
    where('assignmentDate', '<', todayLocal), // Strictly less than TODAY
    orderBy('assignmentDate', 'desc'),        // Changed to 'desc' so newest history is first
    limit(20)
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
};

export const getCurrentWeekExercises = async (studentId) => {
  if (!isFirebaseConfigured) {
    const all = buildStudentDashboard(studentId).exerciseHistory ?? [];
    const today = new Date().toISOString().slice(0, 10);
    return all.filter((ex) => ex.assignmentDate >= today).slice(0, 7);
  }
  ensureDb();
  const today = getLocalDateISO();
  const q = query(
    collection(db, collections.dailyExerciseAssignments),
    where('studentId', '==', studentId),
    where('assignmentDate', '>=', today),
    orderBy('assignmentDate', 'asc'),
    limit(7),
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
};

export const getFutureExercises = async (studentId) => {
  if (!isFirebaseConfigured) {
    const all = buildStudentDashboard(studentId).exerciseHistory ?? [];
    const weekFromToday = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return all.filter((ex) => ex.assignmentDate > weekFromToday);
  }
  ensureDb();
  const weekFromToday = getLocalDateISO(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  const q = query(
    collection(db, collections.dailyExerciseAssignments),
    where('studentId', '==', studentId),
    where('assignmentDate', '>', weekFromToday),
    orderBy('assignmentDate', 'asc'),
    limit(20),
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
};

const getAssignmentHistory = async (studentId, maxRecords = GENERATION_HISTORY_LIMIT) => {
  if (!studentId) return [];
  if (!isFirebaseConfigured) return buildStudentDashboard(studentId).exerciseHistory ?? [];

  ensureDb();
  const q = query(
    collection(db, collections.dailyExerciseAssignments),
    where('studentId', '==', studentId),
    orderBy('assignmentDate', 'desc'),
    limit(maxRecords),
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
};

const getLastAssignmentDate = (history = []) =>
  [...history]
    .map((assignment) => toDateOnly(assignment?.assignmentDate))
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;

const groupAssignmentsByBatch = (history = []) => {
  const sortedHistory = [...history].sort((left, right) => {
    const leftDate = new Date(left?.createdAt?.toDate?.() ?? left?.createdAt ?? left?.assignmentDate ?? 0).getTime();
    const rightDate = new Date(right?.createdAt?.toDate?.() ?? right?.createdAt ?? right?.assignmentDate ?? 0).getTime();
    return rightDate - leftDate;
  });

  const groups = [];
  const fallbackMap = new Map();

  sortedHistory.forEach((assignment) => {
    const createdAtValue = assignment?.createdAt?.toDate?.() ?? assignment?.createdAt ?? assignment?.assignmentDate ?? null;
    const createdAt = createdAtValue ? new Date(createdAtValue) : null;
    const explicitBatchId = assignment?.generationBatchId;

    if (explicitBatchId) {
      const existing = groups.find((group) => group.batchId === explicitBatchId);
      if (existing) {
        existing.assignments.push(assignment);
        return;
      }

      groups.push({
        batchId: explicitBatchId,
        createdAt,
        assignments: [assignment],
      });
      return;
    }

    const fallbackKey = `${assignment?.generationMode || 'legacy'}-${toDateOnly(assignment?.assignmentDate)}`;
    const existingFallback = fallbackMap.get(fallbackKey);

    if (existingFallback) {
      existingFallback.assignments.push(assignment);
      return;
    }

    const group = {
      batchId: fallbackKey,
      createdAt,
      assignments: [assignment],
    };
    fallbackMap.set(fallbackKey, group);
    groups.push(group);
  });

  return groups.sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0));
};

const getRecentGenerationSummaries = (history = [], count = 2) =>
  groupAssignmentsByBatch(history)
    .slice(0, count)
    .map((group) => ({
      batchId: group.batchId,
      generationMode: group.assignments[0]?.generationMode ?? 'unknown',
      paperIds: [...new Set(group.assignments.flatMap((assignment) => assignment?.paperIds ?? []))],
      assignmentDates: group.assignments.map((assignment) => assignment?.assignmentDate).filter(Boolean),
    }));

const selectSourcePapers = ({ papers = [], assignmentHistory = [] }) => {
  const recentPaperIds = new Set(getRecentGenerationSummaries(assignmentHistory, 2).flatMap((group) => group.paperIds));
  const eligiblePapers = papers.filter((paper) => !recentPaperIds.has(paper.id));
  const selectedPapers = eligiblePapers.slice(0, MAX_AI_SOURCE_PAPERS);
  return {
    selectedPapers,
    recentPaperIds: [...recentPaperIds],
  };
};

const buildAssignmentDates = ({ mode, assignmentHistory = [] }) => {
  const lastAssignmentDate = getLastAssignmentDate(assignmentHistory);
  const baseDate = lastAssignmentDate ? addDays(new Date(lastAssignmentDate), 1) : new Date();
  const daysToCreate = mode === 'weekly' ? WEEKLY_EXERCISE_DAYS : 7;

  return Array.from({ length: daysToCreate }, (_, dayIndex) =>
    formatISO(addDays(baseDate, dayIndex), { representation: 'date' }),
  );
};

const buildAiQuestionPlan = ({ mode, topicSummaries = [], assignmentDates = [], generationNumber = 1 }) => {
  if (mode === 'initial') {
    return {
      maxQuestionsPerDay: Math.max(1, topicSummaries.length),
      perDayTopics: assignmentDates.map((assignmentDate) => ({
        assignmentDate,
        topics: getInitialTopicsForDay(topicSummaries),
      })),
      rules: {
        titleFormat: 'question-references-only',
        oneQuestionPerTopicPerDay: true,
        disallowRanges: true,
      },
    };
  }

  const maxQuestionsPerDay = Math.min(MAX_DAILY_EXERCISES, Math.max(1, generationNumber));
  return {
    maxQuestionsPerDay,
    perDayTopics: assignmentDates.map((assignmentDate, dayIndex) => ({
      assignmentDate,
      topics: pickWeeklyTopicsForDay({
        topicSummaries,
        maxQuestionsPerDay: Math.min(maxQuestionsPerDay, topicSummaries.length || 1),
        dayIndex,
        generationNumber,
      }),
    })),
    rules: {
      titleFormat: 'question-references-only',
      distinctTopicsPerDay: true,
      weightedTowardHigherUnderstandingFromFourthTopic: topicSummaries.length > 3,
      maxQuestionsPerDay,
    },
  };
};

const buildAssignmentsFromAiRecommendations = ({
  recommendations = [],
  student,
  selectedPapers = [],
  generationBatchId,
  mode,
  topicSummaries = [],
  maxQuestionsPerDay = MAX_DAILY_EXERCISES,
  grade,
}) =>
  recommendations.map((recommendation, index) => {
    let topicBreakdown = Array.isArray(recommendation?.topicBreakdown) && recommendation.topicBreakdown.length
      ? recommendation.topicBreakdown
      : (Array.isArray(recommendation?.questionReferences) ? recommendation.questionReferences : [])
          .map((reference, referenceIndex) => ({
            topic: topicSummaries[referenceIndex]?.topic ?? recommendation?.topic ?? 'Mathematics topic',
            questionReference: reference,
          }));

    const seenTopics = new Set();
    topicBreakdown = topicBreakdown
      .map((entry) => ({
        topic: String(entry?.topic || 'Mathematics topic').trim(),
        questionReference: String(entry?.questionReference || entry?.reference || '').trim(),
      }))
      .filter((entry) => entry.questionReference)
      .filter((entry) => {
        if (mode === 'initial') {
          if (seenTopics.has(entry.topic)) return false;
          seenTopics.add(entry.topic);
          return true;
        }

        if (seenTopics.has(entry.topic)) return false;
        seenTopics.add(entry.topic);
        return true;
      })
      .slice(0, Math.min(MAX_DAILY_EXERCISES, maxQuestionsPerDay));

    const questionReferences = topicBreakdown.map((entry) => entry.questionReference).filter(Boolean);

    return {
      studentId: student.uid,
      assignmentDate: recommendation.assignmentDate,
      title: normalizeQuestionReferenceTitle(questionReferences) || `Question set ${index + 1}`,
      topic: topicBreakdown.map((entry) => entry.topic).filter(Boolean).join(' | ') || recommendation.topic || 'Mathematics topic',
      sourceLabel: recommendation.sourceLabel || selectedPapers.map((paper) => `${paper.year} ${paper.region} ${paper.month} paper`).join('; '),
      instruction: recommendation.instruction || recommendation.reason || 'Answer the referenced question number(s) only.',
      subject: SUBJECT,
      grade,
      generatedBy: 'frontend-ai-service',
      generationMode: mode,
      generationBatchId,
      paperIds: Array.isArray(recommendation?.paperIdsUsed) && recommendation.paperIdsUsed.length
        ? recommendation.paperIdsUsed.slice(0, MAX_AI_SOURCE_PAPERS)
        : selectedPapers.map((paper) => paper.id),
      understandingLevel: null,
      reportSnippet: topicBreakdown.map((entry) => {
        const match = topicSummaries.find((topicSummary) => topicSummary.topic === entry.topic);
        return match ? `${entry.topic}: ${match.reportSnippet}` : entry.topic;
      }).filter(Boolean).join('\n'),
      questionReferences,
      topicBreakdown,
      submittedImageUrl: "",
      submittedFileName: "",
      peerReviewed: "No",
      peerReviewStatus: "pending",
      peerReviewDate: null,
      submittedReviewImageUrl: "",
      submittedReviewFileName: "",
    };
  });

export const getStudentAccessState = async (student) => {
  if (!student) {
    return {
      paymentCompleted: false,
      paymentRequired: true,
      initialGenerationReady: false,
      weeklyGenerationReady: false,
      matchingQuestionPapers: [],
      latestTutorReport: null,
      completedLessons: [],
      latestGeneratedAssignments: [],
      hasInitialGeneration: false,
    };
  }

  if (!isFirebaseConfigured) {
    const matchingQuestionPapers = filterQuestionPapers(mockQuestionPapers, { grade: student.grade, region: student.province });
    const latestTutorReport = student.latestReport || getLatestTutorReportFromList(student.uid, mockTutorReports)?.note || '';
    const completedLessons = mockCompletedLessons.filter((lesson) => lesson.studentId === student.uid);
    const assignmentHistory = await getAssignmentHistory(student.uid);
    const generationStatus = buildStudentGenerationStatus({
      student,
      latestReport: latestTutorReport,
      availablePapers: matchingQuestionPapers,
      paymentCompleted: Boolean(student.paymentCompleted),
      completedLessons,
      hasInitialGeneration: assignmentHistory.some((assignment) => assignment?.generationMode === 'initial'),
    });

    return {
      paymentCompleted: Boolean(student.paymentCompleted),
      paymentRequired: !student.paymentCompleted,
      initialGenerationReady: generationStatus.initial.ready,
      weeklyGenerationReady: generationStatus.weekly.ready,
      generationStatus,
      matchingQuestionPapers: matchingQuestionPapers.slice(0, MAX_AI_SOURCE_PAPERS),
      latestTutorReport,
      completedLessons,
      latestGeneratedAssignments: assignmentHistory,
      hasInitialGeneration: assignmentHistory.some((assignment) => assignment?.generationMode === 'initial'),
    };
  }

  ensureDb();
  const studentSnapshot = await getDoc(doc(db, collections.users, student.uid));
  const subscriptionSnapshot = await getDoc(doc(db, collections.subscriptions, student.uid));
  const paymentCompleted = subscriptionSnapshot.exists() ? subscriptionSnapshot.data().status === 'active' : Boolean(student.paymentCompleted);
  const papers = await getQuestionPapers({ grade: student.grade, region: student.province, subject: SUBJECT });
  const reports = await getTutorReports(student.uid);
  const lessons = await getCompletedLessons(student.uid);
  const assignmentHistory = await getAssignmentHistory(student.uid);
  const latestTutorReport = studentSnapshot.exists() ? (studentSnapshot.data().latestReport || '') : (student.latestReport || reports[0]?.note || '');
  const generationStatus = buildStudentGenerationStatus({
    student,
    latestReport: latestTutorReport,
    availablePapers: papers,
    paymentCompleted,
    completedLessons: lessons,
    hasInitialGeneration: assignmentHistory.some((assignment) => assignment?.generationMode === 'initial'),
  });

  return {
    paymentCompleted,
    paymentRequired: !paymentCompleted,
    initialGenerationReady: generationStatus.initial.ready,
    weeklyGenerationReady: generationStatus.weekly.ready,
    generationStatus,
    matchingQuestionPapers: papers.slice(0, MAX_AI_SOURCE_PAPERS),
    latestTutorReport,
    completedLessons: lessons,
    latestGeneratedAssignments: assignmentHistory,
    hasInitialGeneration: assignmentHistory.some((assignment) => assignment?.generationMode === 'initial'),
  };
};

export const getUnassignedStudents = async () => {
  if (!isFirebaseConfigured) {
    return demoUsers.filter((user) => user.role === 'student' && !user.tutorId);
  }

  ensureDb();
  const snapshot = await getDocs(query(collection(db, collections.users), where('role', '==', 'student')));
  return snapshot.docs
    .map((item) => item.data())
    .filter((student) => !student.tutorId);
};

export const getAssignedStudentsForTutor = async (tutorId) => {
  if (!isFirebaseConfigured) {
    return demoUsers.filter((user) => user.role === 'student' && user.tutorId === tutorId);
  }

  ensureDb();
  const snapshot = await getDocs(query(collection(db, collections.users), where('tutorId', '==', tutorId)));
  return snapshot.docs.map((item) => item.data());
};

export const getTutorReports = async (studentId) => {
  if (!isFirebaseConfigured) {
    return mockTutorReports
      .filter((report) => !studentId || report.studentId === studentId)
      .sort((left, right) => new Date(right.updatedAt ?? 0) - new Date(left.updatedAt ?? 0));
  }

  ensureDb();
  const q = studentId
    ? query(collection(db, collections.tutorReports), where('studentId', '==', studentId), orderBy('updatedAt', 'desc'))
    : query(collection(db, collections.tutorReports), orderBy('updatedAt', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
};

export const saveTutorReport = async ({ reportId, studentId, tutorId, note, studentName }) => {
  if (!isFirebaseConfigured) {
    return {
      id: reportId ?? `mock-report-${Date.now()}`,
      studentId,
      tutorId,
      note,
      studentName,
      updatedAt: new Date().toISOString(),
    };
  }

  ensureDb();
  const payload = {
    studentId,
    tutorId,
    note,
    studentName,
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  };

  if (reportId) {
    await updateDoc(doc(db, collections.tutorReports, reportId), payload);
    return { id: reportId, ...payload };
  }

  const ref = await addDoc(collection(db, collections.tutorReports), payload);
  return { id: ref.id, ...payload };
};

export const getCompletedLessons = async (studentId) => {
  if (!isFirebaseConfigured) {
    return mockCompletedLessons.filter((lesson) => !studentId || lesson.studentId === studentId);
  }

  ensureDb();
  const q = studentId
    ? query(collection(db, collections.coveredTopics), where('studentId', '==', studentId), orderBy('completedOn', 'desc'))
    : query(collection(db, collections.coveredTopics), orderBy('completedOn', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
};

export const saveCompletedLesson = async ({ studentId, tutorId, topic, topicReport, understandingLevel, studentName }) => {
  if (!isFirebaseConfigured) {
    return {
      id: `mock-lesson-${Date.now()}`,
      studentId,
      tutorId,
      topic,
      topicReport,
      understandingLevel,
      studentName,
      completedOn: new Date().toISOString().slice(0, 10),
    };
  }

  ensureDb();
  const ref = await addDoc(collection(db, collections.coveredTopics), {
    studentId,
    tutorId,
    topic,
    note: topicReport,
    topicReport,
    understandingLevel,
    studentName,
    completedOn: new Date().toISOString().slice(0, 10),
    createdAt: serverTimestamp(),
  });
  return { id: ref.id, studentId, tutorId, topic, topicReport, understandingLevel, studentName };
};

export const assignStudentToTutor = async ({ studentId, tutorId }) => {
  if (!isFirebaseConfigured) {
    return { id: 'mock-assignment', studentId, tutorId };
  }
  ensureDb();

  const existing = await getDocs(
    query(collection(db, collections.tutorStudentAssignments), where('studentId', '==', studentId), where('active', '==', true), limit(1)),
  );

  if (!existing.empty) {
    throw new Error('This student already has an active Maths tutor assignment.');
  }

  const ref = doc(collection(db, collections.tutorStudentAssignments));
  await setDoc(ref, {
    studentId,
    tutorId,
    subject: SUBJECT,
    active: true,
    assignedAt: serverTimestamp(),
  });

  await updateDoc(doc(db, collections.users, studentId), { tutorId });
  return { id: ref.id, studentId, tutorId };
};

export const getQuestionPapers = async ({ grade, region, subject = SUBJECT } = {}) => {
  if (!isFirebaseConfigured) {
    return filterQuestionPapers(mockQuestionPapers, { grade, region, subject, allowNational: true });
  }

  ensureDb();
  const snapshot = await getDocs(query(collection(db, collections.questionPapers), where('subject', '==', subject)));
  return filterQuestionPapers(
    snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
    { grade, region, subject, allowNational: true },
  );
};

export const getAllQuestionPapers = async () => {
  if (!isFirebaseConfigured) {
    return mockQuestionPapers;
  }

  ensureDb();
  const snapshot = await getDocs(query(collection(db, collections.questionPapers), orderBy('year', 'desc')));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
};

export const getQuestionPapersByIds = async (ids) => {
  if (!isFirebaseConfigured) {
    return mockQuestionPapers.filter((paper) => ids.includes(paper.id));
  }

  ensureDb();
  const promises = ids.map((id) => getDoc(doc(db, collections.questionPapers, id)));
  const snapshots = await Promise.all(promises);
  return snapshots.filter((snap) => snap.exists()).map((snap) => ({ id: snap.id, ...snap.data() }));
};

const normalizePaperForStorage = (paper = {}, fallback = {}) => {
  const month = String(paper.month || fallback.month || '').trim();
  const curriculum = String(paper.curriculum || fallback.curriculum || '').trim().toUpperCase();
  const paperNumber = String(paper.paperNumber || fallback.paperNumber || '').trim().toUpperCase();
  const year = Number(paper.year ?? fallback.year);

  return {
    subject: String(paper.subject || fallback.subject || SUBJECT).trim(),
    curriculum: CURRICULUMS.includes(curriculum) ? curriculum : fallback.curriculum || 'CAPS',
    year: Number.isFinite(year) ? year : Number(new Date().getFullYear()),
    grade: String(paper.grade || fallback.grade || '').trim(),
    province: String(paper.province || fallback.province || paper.region || '').trim(),
    region: String(paper.region || paper.province || fallback.province || fallback.region || '').trim(),
    paperUrl: String(paper.paperUrl || '').trim(),
    memoUrl: String(paper.memoUrl || '').trim(),
    source: String(paper.source || '').trim(),
    sourceWebsite: String(paper.sourceWebsite || '').trim(),
    paperNumber: PAPER_NUMBERS.includes(paperNumber) ? paperNumber : (fallback.paperNumber || 'P1'),
    month: PAPER_MONTHS.includes(month) ? month : (fallback.month || 'June'),
    notes: String(paper.notes || '').trim(),
    paperFileName: String(paper.paperFileName || '').trim(),
    memoFileName: String(paper.memoFileName || '').trim(),
    createdBy: paper.createdBy || fallback.createdBy || 'unknown',
  };
};

const buildQuestionPaperIdentityKey = (paper = {}) => [
  String(paper.subject || '').toLowerCase(),
  String(paper.curriculum || '').toUpperCase(),
  Number(paper.year || 0),
  String(paper.grade || '').toLowerCase(),
  String(paper.province || paper.region || '').toLowerCase(),
  String(paper.paperNumber || '').toUpperCase(),
  String(paper.month || '').toLowerCase(),
].join('|');

const isDuplicateQuestionPaper = (existing = {}, candidate = {}) =>
  buildQuestionPaperIdentityKey(existing) === buildQuestionPaperIdentityKey(candidate);

export const saveQuestionPaper = async (paper) => {
  const normalizedPaper = normalizePaperForStorage(paper, {
    subject: SUBJECT,
    curriculum: 'CAPS',
    grade: paper.grade,
    province: paper.province || paper.region,
    region: paper.region || paper.province,
    month: paper.month,
    paperNumber: paper.paperNumber,
    createdBy: paper.createdBy,
  });

  const existsInDemo = mockQuestionPapers.some((item) =>
    isDuplicateQuestionPaper(normalizePaperForStorage(item, normalizedPaper), normalizedPaper),
  );

  if (!isFirebaseConfigured) {
    if (existsInDemo) {
      throw new Error('This past exam paper already exists for the same subject, curriculum, year, grade, province, paper number, and month.');
    }
    return { id: `mock-paper-${Date.now()}`, ...normalizedPaper };
  }

  ensureDb();
  const scopedSnapshot = await getDocs(
    query(
      collection(db, collections.questionPapers),
      where('subject', '==', normalizedPaper.subject),
      where('year', '==', Number(normalizedPaper.year)),
      limit(100),
    ),
  );
  const duplicateExists = scopedSnapshot.docs
    .map((item) => normalizePaperForStorage(item.data(), normalizedPaper))
    .some((item) => isDuplicateQuestionPaper(item, normalizedPaper));

  if (duplicateExists) {
    throw new Error('This past exam paper already exists for the same subject, curriculum, year, grade, province, paper number, and month.');
  }

  const ref = await addDoc(collection(db, collections.questionPapers), {
    ...normalizedPaper,
    createdAt: serverTimestamp(),
  });
  return { id: ref.id, ...normalizedPaper };
};

const buildPastPaperSearchDraftId = ({ tutorId, subject, curriculum, year, grade, province }) =>
  [
    tutorId,
    String(subject || '').toLowerCase().replace(/\s+/g, '-'),
    String(curriculum || '').toLowerCase(),
    String(year || '').trim(),
    String(grade || '').toLowerCase().replace(/\s+/g, '-'),
    String(province || '').toLowerCase().replace(/\s+/g, '-'),
  ].join('__');

export const getExistingQuestionPapersForSearch = async ({
  subject = SUBJECT,
  curriculum,
  year,
  grade,
  province,
}) => {
  const matches = (items = []) => items
    .map((item) => normalizePaperForStorage(item, { subject, curriculum, year, grade, province, region: province }))
    .filter((item) =>
      item.subject === subject
      && item.curriculum === curriculum
      && item.year === Number(year)
      && item.grade === grade
      && (item.province === province || item.region === province));

  if (!isFirebaseConfigured) {
    return matches(mockQuestionPapers);
  }

  ensureDb();
  const snapshot = await getDocs(
    query(
      collection(db, collections.questionPapers),
      where('subject', '==', subject),
      where('year', '==', Number(year)),
    ),
  );

  return matches(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
};

export const getPastPaperSearchDraft = async ({ tutorId, subject, curriculum, year, grade, province }) => {
  if (!tutorId) return null;

  const draftId = buildPastPaperSearchDraftId({ tutorId, subject, curriculum, year, grade, province });
  if (!isFirebaseConfigured) return null;

  ensureDb();
  const snapshot = await getDoc(doc(db, collections.pastPaperSearchDrafts, draftId));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
};

export const runPastPaperAiSearch = async ({
  tutorId,
  filters,
}) => {
  const existingPapers = await getExistingQuestionPapersForSearch(filters);
  const aiResult = await searchPastPapersWithAi({
    ...filters,
    existingPapers: existingPapers.map((paper) => ({
      subject: paper.subject,
      curriculum: paper.curriculum,
      year: paper.year,
      grade: paper.grade,
      province: paper.province || paper.region,
      paperNumber: paper.paperNumber,
      month: paper.month,
      paperUrl: paper.paperUrl,
      memoUrl: paper.memoUrl,
      sourceWebsite: paper.sourceWebsite,
    })),
    maxResults: 20,
  });

  const papers = aiResult.papers.map((paper) => normalizePaperForStorage(paper, {
    ...filters,
    region: filters.province,
    createdBy: tutorId,
  }));

  const draft = {
    tutorId,
    ...filters,
    status: 'pending',
    generatedAt: new Date().toISOString(),
    existingPapersCount: existingPapers.length,
    results: papers,
  };

  if (!isFirebaseConfigured) {
    return { id: `draft-${Date.now()}`, ...draft };
  }

  ensureDb();
  const draftId = buildPastPaperSearchDraftId({ tutorId, ...filters });
  await setDoc(doc(db, collections.pastPaperSearchDrafts, draftId), {
    ...draft,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  return { id: draftId, ...draft };
};

export const updatePastPaperSearchDraftResults = async ({
  draftId,
  results,
}) => {
  if (!draftId) return null;
  if (!isFirebaseConfigured) return { id: draftId, results };

  ensureDb();
  await updateDoc(doc(db, collections.pastPaperSearchDrafts, draftId), {
    results,
    updatedAt: serverTimestamp(),
  });
  return { id: draftId, results };
};

export const discardPastPaperFromDraft = async ({ draftId, paperKey }) => {
  if (!draftId || !paperKey) return null;
  if (!isFirebaseConfigured) return { id: draftId, results: [] };
  ensureDb();
  const draft = await getDoc(doc(db, collections.pastPaperSearchDrafts, draftId));
  if (!draft.exists()) return null;
  const data = draft.data();
  const nextResults = Array.isArray(data.results)
    ? data.results.filter((item) => buildQuestionPaperIdentityKey(item) !== paperKey)
    : [];
  return updatePastPaperSearchDraftResults({ draftId, results: nextResults });
};

export const saveDraftPapersToOfficialCollection = async ({ draftId, tutorId }) => {
  if (!draftId) return { saved: [], skipped: [] };

  if (!isFirebaseConfigured) {
    return { saved: [], skipped: [] };
  }

  ensureDb();
  const draftRef = doc(db, collections.pastPaperSearchDrafts, draftId);
  const draftSnap = await getDoc(draftRef);
  if (!draftSnap.exists()) {
    throw new Error('Draft not found.');
  }

  const draft = draftSnap.data();
  const results = Array.isArray(draft.results) ? draft.results : [];
  const saved = [];
  const skipped = [];

  for (const item of results) {
    try {
      const savedItem = await saveQuestionPaper({
        ...item,
        createdBy: item.createdBy || tutorId || draft.tutorId || 'unknown',
      });
      saved.push(savedItem);
    } catch (error) {
      skipped.push({ item, reason: error.message });
    }
  }

  await updateDoc(draftRef, {
    status: 'saved',
    savedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return { saved, skipped };
};

export const deletePastPaperSearchDraft = async ({ draftId }) => {
  if (!draftId || !isFirebaseConfigured) return;
  ensureDb();
  await deleteDoc(doc(db, collections.pastPaperSearchDrafts, draftId));
};

export const savePeerReview = async (payload) => {
  if (!isFirebaseConfigured) return { id: 'mock-peer-review', ...payload };
  ensureDb();
  const ref = await addDoc(collection(db, collections.peerReviews), { ...payload, createdAt: serverTimestamp() });
  return { id: ref.id, ...payload };
};

export const getSubmissionById = async (submissionId) => {
  if (!isFirebaseConfigured) {
    return {
      id: submissionId,
      studentName: 'Ayanda Molefe',
      imageUrl: 'https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=900&q=80',
      exerciseTitle: 'Quadratic factorisation',
    };
  }
  ensureDb();
  const snapshot = await getDoc(doc(db, collections.submissions, submissionId));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
};

export const getSubmissionForExercise = async (exerciseId) => {
  if (!isFirebaseConfigured) {
    // Mock: assume no submission for demo
    return null;
  }
  ensureDb();
  const snapshot = await getDoc(doc(db, collections.dailyExerciseAssignments, exerciseId));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
};

export const generateExercisePlanIfEligible = async ({ student, mode, latestTutorReport, completedLesson, understandingLevel, availablePapers }) => {
  const studentState = await getStudentAccessState(student);
  const papers = availablePapers ?? studentState.matchingQuestionPapers;
  const completedLessons = completedLesson
    ? [...studentState.completedLessons, {
      ...completedLesson,
      topicReport: completedLesson.topicReport ?? latestTutorReport ?? studentState.latestTutorReport,
      understandingLevel: completedLesson.understandingLevel ?? understandingLevel ?? 5,
    }]
    : studentState.completedLessons;
  const assignmentHistory = await getAssignmentHistory(student?.uid);
  const ready = mode === 'initial'
    ? Boolean(studentState.initialGenerationReady && !studentState.hasInitialGeneration)
    : Boolean(studentState.weeklyGenerationReady && studentState.hasInitialGeneration);

  if (!ready) {
    return {
      generated: false,
      reason: `Criteria not met for ${mode} generation`,
      criteria: studentState.generationStatus,
      assignments: [],
    };
  }

  const { selectedPapers, recentPaperIds } = selectSourcePapers({ papers, assignmentHistory });
  if (selectedPapers.length < MAX_AI_SOURCE_PAPERS) {
    return {
      generated: false,
      reason: 'At least two eligible past papers are required for generation.',
      criteria: {
        ...studentState.generationStatus,
        excludedRecentPaperIds: recentPaperIds,
      },
      assignments: [],
    };
  }

  const topicSummaries = getTopicSummary(completedLessons);
  const generationNumber = mode === 'weekly' ? getGenerationNumber(assignmentHistory, 'weekly') : 1;
  const assignmentDates = buildAssignmentDates({ mode, assignmentHistory });
  const aiPlan = buildAiQuestionPlan({
    mode,
    topicSummaries,
    assignmentDates,
    generationNumber,
  });
  const generationBatchId = `${mode}-${student.uid}-${Date.now()}`;
  const aiResponse = await recommendExercises({
    grade: student?.grade,
    region: student?.province,
    mode,
    assignmentDates,
    completedTopics: topicSummaries.map((item) => item.topic),
    tutorReports: completedLessons.map((lesson) => lesson.topicReport ?? lesson.note).filter(Boolean),
    tutorNotes: latestTutorReport ?? studentState.latestTutorReport ?? '',
    pastMarks: [student?.latestMark, student?.previousYearMark].filter((value) => value !== undefined && value !== null),
    questionPaperMetadata: selectedPapers.map((paper) => ({
      id: paper.id,
      year: paper.year,
      month: paper.month,
      region: paper.region,
      subject: paper.subject,
      grade: paper.grade,
    })),
    selectedPapers: selectedPapers.map((paper) => ({
      id: paper.id,
      year: paper.year,
      month: paper.month,
      region: paper.region,
      grade: paper.grade,
    })),
    selectedPaperIds: selectedPapers.map((paper) => paper.id),
    maxQuestionsPerDay: Math.min(aiPlan.maxQuestionsPerDay, topicSummaries.length || 1),
    questionPlanRules: aiPlan,
    lessonHistory: completedLessons.map((lesson) => ({
      topic: lesson.topic,
      topicReport: lesson.topicReport ?? lesson.note ?? '',
      understandingLevel: Number(lesson.understandingLevel ?? understandingLevel ?? 5),
      completedOn: lesson.completedOn ?? lesson.createdAt ?? '',
    })),
    understandingByTopic: topicSummaries.map((summary) => ({
      topic: summary.topic,
      understandingLevel: summary.understandingLevel,
      completedOn: summary.completedOn,
    })),
    previousGenerationSummaries: getRecentGenerationSummaries(assignmentHistory, 2),
  });

  const assignments = buildAssignmentsFromAiRecommendations({
    recommendations: aiResponse?.recommendations ?? [],
    student,
    selectedPapers,
    generationBatchId,
    mode,
    topicSummaries,
    maxQuestionsPerDay: aiPlan.maxQuestionsPerDay,
    grade: student?.grade,
  }).filter((assignment) => Boolean(assignment.assignmentDate));

  if (!isFirebaseConfigured) {
    return {
      generated: assignments.length > 0,
      reason: 'Demo generation complete',
      assignments,
      criteria: {
        ...studentState.generationStatus,
        selectedPaperIds: selectedPapers.map((paper) => paper.id),
      },
    };
  }

  ensureDb();
  const createdAssignments = [];
  for (const assignment of assignments) {
    const existingForDay = await getDocs(query(
      collection(db, collections.dailyExerciseAssignments),
      where('studentId', '==', assignment.studentId),
      where('assignmentDate', '==', assignment.assignmentDate),
      limit(1),
    ));

    if (!existingForDay.empty) {
      console.log('[Examify][Firestore] generateExercisePlanIfEligible:skip-existing', assignment);
      continue;
    }

    const ref = await addDoc(collection(db, collections.dailyExerciseAssignments), {
      ...assignment,
      createdAt: serverTimestamp(),
    });
    createdAssignments.push({ id: ref.id, ...assignment });
  }

  return { generated: createdAssignments.length > 0, reason: `${mode} generation complete`, assignments: createdAssignments, criteria: studentState.generationStatus };
};

export const subscribeToAssignedStudentsForTutor = (tutorId, callback) => {
  if (!isFirebaseConfigured) {
    const demoStudents = demoUsers.filter((user) => user.role === 'student' && user.tutorId === tutorId);
    callback(demoStudents);
    return () => {};
  }
  const q = query(collection(db, collections.users), where('tutorId', '==', tutorId));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(item => item.data()));
  }, (error) => console.error('[Examify][Firestore] subscribeToAssignedStudents error', error));
};

export const subscribeToUnassignedStudents = (callback) => {
  if (!isFirebaseConfigured) {
    const demoStudents = demoUsers.filter((user) => user.role === 'student' && !user.tutorId);
    callback(demoStudents);
    return () => {};
  }
  const q = query(collection(db, collections.users), where('role', '==', 'student'));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(item => item.data()).filter(student => !student.tutorId));
  }, (error) => console.error('[Examify][Firestore] subscribeToUnassignedStudents error', error));
};

export const subscribeToUserProfile = (uid, callback) => {
  if (!isFirebaseConfigured) {
    const mockUser = Object.values(mockUsers).find((u) => u.uid === uid);
    callback(mockUser || null);
    return () => {};
  }
  return onSnapshot(doc(db, collections.users, uid), (snapshot) => {
    callback(snapshot.exists() ? snapshot.data() : null);
  }, (error) => console.error('[Examify][Firestore] subscribeToUserProfile error', error));
};

export const subscribeToTodayExercise = (studentId, callback) => {
  if (!studentId) return () => {};
  if (!isFirebaseConfigured) {
    callback(buildStudentDashboard(studentId).todayExercise ?? null);
    return () => {};
  }

  const today = getLocalDateISO();
  const q = query(
    collection(db, collections.dailyExerciseAssignments),
    where('studentId', '==', studentId),
    where('assignmentDate', '==', today),
    limit(1),
  );

  return onSnapshot(q, (snapshot) => {
    const item = snapshot.docs[0] ? { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } : null;
    callback(item);
  }, (error) => console.error('[Examify][Firestore] subscribeToTodayExercise error', error));
};

export const subscribeToStudentExerciseHistory = (studentId, callback) => {
  if (!studentId) return () => {};
  if (!isFirebaseConfigured) {
    const all = buildStudentDashboard(studentId).exerciseHistory ?? [];
    const today = getLocalDateISO();
    const weekFromToday = getLocalDateISO(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    callback({
      history: all.filter((item) => item.assignmentDate < today).slice(0, 20),
      currentWeek: all.filter((item) => item.assignmentDate >= today && item.assignmentDate <= weekFromToday).slice(0, 7),
      future: all.filter((item) => item.assignmentDate > weekFromToday).slice(0, 20),
    });
    return () => {};
  }

  const q = query(
    collection(db, collections.dailyExerciseAssignments),
    where('studentId', '==', studentId),
    orderBy('assignmentDate', 'desc'),
    limit(60),
  );

  return onSnapshot(q, (snapshot) => {
    const all = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    const today = getLocalDateISO();
    const weekFromToday = getLocalDateISO(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    callback({
      history: all.filter((item) => item.assignmentDate < today).slice(0, 20),
      currentWeek: all.filter((item) => item.assignmentDate >= today && item.assignmentDate <= weekFromToday).reverse(),
      future: all.filter((item) => item.assignmentDate > weekFromToday).reverse().slice(0, 20),
    });
  }, (error) => console.error('[Examify][Firestore] subscribeToStudentExerciseHistory error', error));
};


export const saveGuideQuizResult = async ({ userId, role, userName, answers, score, totalQuestions, percentage }) => {
  const payload = {
    userId,
    role,
    userName,
    answers,
    score,
    totalQuestions,
    percentage,
    submittedAt: new Date().toISOString(),
  };

  if (!isFirebaseConfigured) {
    const result = { id: `mock-guide-result-${Date.now()}`, ...payload };
    demoGuideQuizResults.push(result);
    return result;
  }

  ensureDb();
  const ref = await addDoc(collection(db, collections.guideQuizResults), {
    ...payload,
    submittedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
  return { id: ref.id, ...payload };
};

export const getLatestGuideQuizResult = async ({ userId, role }) => {
  if (!userId) return null;

  if (!isFirebaseConfigured) {
    return [...demoGuideQuizResults]
      .filter((item) => item.userId === userId && (!role || item.role === role))
      .sort((left, right) => new Date(right.submittedAt ?? 0) - new Date(left.submittedAt ?? 0))[0] ?? null;
  }

  ensureDb();
  const q = query(
    collection(db, collections.guideQuizResults),
    where('userId', '==', userId),
    ...(role ? [where('role', '==', role)] : []),
    orderBy('submittedAt', 'desc'),
    limit(1),
  );
  const snapshot = await getDocs(q);
  return snapshot.docs[0] ? { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } : null;
};

export const getGuideQuizResultsSummary = async () => {
  if (!isFirebaseConfigured) {
    const users = demoUsers.filter((user) => user.role === 'student' || user.role === 'tutor');
    return {
      students: users
        .filter((user) => user.role === 'student')
        .map((user) => {
          const latest = [...demoGuideQuizResults]
            .filter((item) => item.userId === user.uid && item.role === 'student')
            .sort((left, right) => new Date(right.submittedAt ?? 0) - new Date(left.submittedAt ?? 0))[0] ?? null;
          return {
            id: user.uid,
            name: user.displayName || user.email || 'Student',
            percentage: latest?.percentage ?? null,
          };
        }),
      tutors: users
        .filter((user) => user.role === 'tutor')
        .map((user) => {
          const latest = [...demoGuideQuizResults]
            .filter((item) => item.userId === user.uid && item.role === 'tutor')
            .sort((left, right) => new Date(right.submittedAt ?? 0) - new Date(left.submittedAt ?? 0))[0] ?? null;
          return {
            id: user.uid,
            name: user.displayName || user.email || 'Tutor',
            percentage: latest?.percentage ?? null,
          };
        }),
    };
  }

  ensureDb();
  const usersSnapshot = await getDocs(collection(db, collections.users));
  const resultsSnapshot = await getDocs(query(collection(db, collections.guideQuizResults), orderBy('submittedAt', 'desc')));
  const resultsByUser = new Map();

  resultsSnapshot.docs.forEach((item) => {
    const data = { id: item.id, ...item.data() };
    if (!resultsByUser.has(data.userId)) {
      resultsByUser.set(data.userId, data);
    }
  });

  const users = usersSnapshot.docs.map((item) => item.data()).filter((user) => user.role === 'student' || user.role === 'tutor');
  const buildRow = (user) => ({
    id: user.uid,
    name: user.displayName || user.email || (user.role === 'student' ? 'Student' : 'Tutor'),
    percentage: resultsByUser.get(user.uid)?.percentage ?? null,
  });

  return {
    students: users.filter((user) => user.role === 'student').map(buildRow),
    tutors: users.filter((user) => user.role === 'tutor').map(buildRow),
  };
};

export const assignStudentToParent = async ({ parentId, studentIdentifier }) => {
  if (!isFirebaseConfigured) {
    return { success: true, studentId: 'demo-student', parentId };
  }
  ensureDb();
  
  let q;
  if (studentIdentifier.includes('@')) {
    q = query(collection(db, collections.users), where('email', '==', studentIdentifier), where('role', '==', 'student'), limit(1));
  } else {
    q = query(collection(db, collections.users), where('uid', '==', studentIdentifier), where('role', '==', 'student'), limit(1));
  }
  
  const snapshot = await getDocs(q);
  if (snapshot.empty) {
    throw new Error('Student not found. Please check the email or student ID.');
  }
  
  const studentDoc = snapshot.docs[0];
  const student = studentDoc.data();
  
  if (student.parentId && student.parentId !== parentId) {
    throw new Error('This student is already assigned to another parent.');
  }
  
  await updateDoc(doc(db, collections.users, student.uid), {
    parentId,
    updatedAt: serverTimestamp(),
  });
  
  return { success: true, studentId: student.uid, parentId, studentName: student.displayName || student.email };
};

export const getStudentsForParent = async (parentId) => {
  if (!isFirebaseConfigured) {
    return []; // Empty for demo initially unless pushed to a mock array
  }
  ensureDb();
  const q = query(collection(db, collections.users), where('parentId', '==', parentId), where('role', '==', 'student'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(docSnap => docSnap.data());
};

export const updateStudentProfileByParent = async ({ parentId, studentId, updates }) => {
  if (!isFirebaseConfigured) {
    return { success: true, studentId, ...updates };
  }
  ensureDb();

  const studentRef = doc(db, collections.users, studentId);
  const snapshot = await getDoc(studentRef);
  
  if (!snapshot.exists()) {
    throw new Error('Student not found');
  }

  const studentData = snapshot.data();
  if (studentData.parentId !== parentId) {
    throw new Error('Unauthorized: You are not assigned to this student.');
  }

  const payload = {
    ...updates,
    updatedAt: serverTimestamp()
  };

  // Convert previousYearMark back to number if provided
  if (payload.previousYearMark !== undefined) {
    payload.previousYearMark = Number(payload.previousYearMark);
  }

  await updateDoc(studentRef, payload);
  return { success: true, studentId, ...payload };
};

export const getTutorStudentById = async ({ tutorId, studentId }) => {
  if (!studentId) return null;

  if (!isFirebaseConfigured) {
    const student = demoUsers.find((user) => user.uid === studentId && user.role === 'student');
    if (!student) return null;
    if (tutorId && student.tutorId !== tutorId) {
      throw new Error('This student is not assigned to the current tutor.');
    }
    return student;
  }

  ensureDb();
  const snapshot = await getDoc(doc(db, collections.users, studentId));
  if (!snapshot.exists()) return null;
  const student = snapshot.data();
  if (student.role !== 'student') return null;
  if (tutorId && student.tutorId !== tutorId) {
    throw new Error('This student is not assigned to the current tutor.');
  }
  return student;
};

export const createScheduledLesson = async ({ studentId, tutorId, topic, date, time, link, studentName }) => {
  const payload = {
    studentId,
    tutorId,
    topic,
    date,
    time,
    link: link || '',
    studentName: studentName || 'Student',
    status: 'scheduled',
    lessonCompleted: false,
    topicReport: '',
    understandingLevel: null,
    completedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (!isFirebaseConfigured) {
    return { id: `mock-scheduled-${Date.now()}`, ...payload };
  }

  ensureDb();
  const ref = await addDoc(collection(db, collections.scheduledLessons), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return { id: ref.id, ...payload };
};

export const updateScheduledLesson = async ({ lessonId, updates }) => {
  if (!lessonId) throw new Error('lessonId is required.');

  if (!isFirebaseConfigured) {
    return { id: lessonId, ...updates };
  }

  ensureDb();
  const lessonRef = doc(db, collections.scheduledLessons, lessonId);
  await updateDoc(lessonRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  });

  const snapshot = await getDoc(lessonRef);
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : { id: lessonId, ...updates };
};

export const getScheduledLessonsForStudent = async (studentId) => {
  if (!studentId) return [];

  if (!isFirebaseConfigured) {
    return [];
  }

  ensureDb();
  const q = query(
    collection(db, collections.scheduledLessons),
    where('studentId', '==', studentId),
    orderBy('date', 'asc'),
    orderBy('time', 'asc'),
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
};

export const subscribeToScheduledLessonsForStudent = (studentId, callback) => {
  if (!studentId) return () => {};

  if (!isFirebaseConfigured) {
    callback([]);
    return () => {};
  }

  const q = query(
    collection(db, collections.scheduledLessons),
    where('studentId', '==', studentId),
    orderBy('date', 'asc'),
    orderBy('time', 'asc'),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    },
    (error) => console.error('[Examify][Firestore] subscribeToScheduledLessonsForStudent error', error),
  );
};

export const saveAssessmentResult = async ({
  studentId,
  tutorId,
  studentName,
  grade,
  subject,
  score,
  totalQuestions,
  percentage,
  recommendedSessions,
  questionResults,
  assessmentDate,
}) => {
  const payload = {
    studentId,
    tutorId,
    studentName,
    grade,
    subject,
    score,
    totalQuestions,
    percentage,
    recommendedSessions,
    questionResults,
    assessmentDate,
  };

  if (!isFirebaseConfigured) {
    return { id: `mock-assessment-${Date.now()}`, ...payload };
  }

  ensureDb();

  await setDoc(
    doc(db, collections.users, studentId),
    {
      assessmentScore: percentage,
      assessmentDate,
      recommendedSessions,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  const ref = await addDoc(collection(db, collections.assessments), {
    ...payload,
    createdAt: serverTimestamp(),
  });

  return { id: ref.id, ...payload };
};

export const getParentStudentById = async ({ parentId, studentId }) => {
  if (!studentId) return null;

  if (!isFirebaseConfigured) {
    return demoUsers.find((user) => user.uid === studentId && user.role === 'student') || null;
  }

  ensureDb();
  const snapshot = await getDoc(doc(db, collections.users, studentId));
  if (!snapshot.exists()) return null;
  const student = snapshot.data();

  if (student.role !== 'student') return null;
  if (parentId && student.parentId !== parentId) {
    throw new Error('This student is not linked to the current parent account.');
  }

  return student;
};
