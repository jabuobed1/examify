import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, setDoc } from 'firebase/firestore';
import { AppShell } from '../../components/common/AppShell';
import { AssessmentSummaryCard } from '../../components/assessment/AssessmentResultPanel';
import { SectionHeader } from '../../components/common/SectionHeader';
import { useAuth } from '../../hooks/useAuth';
import { db } from '../../firebase/config';
import {
    createScheduledLesson,
    generateExercisePlanIfEligible,
    getLatestAssessmentForStudent,
    getQuestionPapers,
  getTutorStudentById,
  saveAssessmentResult,
  saveCompletedLesson,
  subscribeToScheduledLessonsForStudent,
  subscribeToUserProfile,
  updateScheduledLesson,
} from '../../services/firestoreService';
import { buildAssessmentQuestionsForGrade, getRecommendedSessionsFromAssessment, SUBJECT, TOPICS_BY_GRADE } from '../../lib/constants';

const defaultLessonForm = { topic: '', date: '', time: '', link: '' };
const defaultUpdateForm = { topicReport: '', understandingLevel: 5, lessonCompleted: false };

const toQuestionResult = (question, selectedOptionId) => {
  const selectedOption = question.options.find((option) => option.id === selectedOptionId);
  const correctOption = question.options.find((option) => option.correct);

  return {
    questionId: question.id,
    prompt: question.prompt,
    selectedOptionId: selectedOption?.id || null,
    selectedOptionText: selectedOption?.text || 'No answer',
    correctOptionId: correctOption?.id || null,
    correctOptionText: correctOption?.text || '',
    isCorrect: Boolean(selectedOption && correctOption && selectedOption.id === correctOption.id),
    topic: question.topic || null,
  };
};

export const TutorStudentDetailPage = () => {
  const { studentId } = useParams();
  const { profile, logout } = useAuth();
  const navigate = useNavigate();

  const [student, setStudent] = useState(null);
  const [latestAssessment, setLatestAssessment] = useState(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  const [initialReport, setInitialReport] = useState('');
  const [scheduleForm, setScheduleForm] = useState(defaultLessonForm);
  const [savingSchedule, setSavingSchedule] = useState(false);

  const [scheduledLessons, setScheduledLessons] = useState([]);
  const [editingLessonId, setEditingLessonId] = useState('');
  const [updateForm, setUpdateForm] = useState(defaultUpdateForm);

  const [assessmentAnswers, setAssessmentAnswers] = useState({});
  const [submittingAssessment, setSubmittingAssessment] = useState(false);

  useEffect(() => {
    if (!profile?.uid || !studentId) return;

    const load = async () => {
      setLoading(true);
      try {
        const studentProfile = await getTutorStudentById({ tutorId: profile.uid, studentId });
        if (!studentProfile) {
          setStatus('Student not found.');
          setStudent(null);
        } else {
          setStudent(studentProfile);
          const assessment = await getLatestAssessmentForStudent(studentId);
          setLatestAssessment(assessment);
          setStatus('');
        }
      } catch (error) {
        setStatus(error.message || 'Unable to load student details.');
      } finally {
        setLoading(false);
      }
    };

    load();

    const unsubscribeStudent = subscribeToUserProfile(studentId, (data) => {
      if (data?.role === 'student') {
        setStudent(data);
      }
    });

    const unsubscribeLessons = subscribeToScheduledLessonsForStudent(studentId, setScheduledLessons);

    return () => {
      unsubscribeStudent();
      unsubscribeLessons();
    };
  }, [profile?.uid, studentId]);

  const hasInitialReport = Boolean((student?.latestReport || '').trim());
  const gradeTopics = useMemo(() => TOPICS_BY_GRADE[student?.grade] || TOPICS_BY_GRADE['Grade 8'], [student?.grade]);
  const assessmentQuestions = useMemo(() => buildAssessmentQuestionsForGrade(student?.grade), [student?.grade]);

  const saveInitialReport = async () => {
    if (!initialReport.trim()) {
      setStatus('Please enter the initial report.');
      return;
    }

    try {
      await setDoc(
        doc(db, 'users', studentId),
        {
          latestReport: `--- Initial Report ---\n${initialReport}\nDate: ${new Date().toLocaleString()}`,
          updatedAt: new Date(),
        },
        { merge: true },
      );
      setInitialReport('');
      setStatus('Initial report saved successfully.');
    } catch (error) {
      setStatus(error.message || 'Failed to save initial report.');
    }
  };

  const handleScheduleLesson = async () => {
    if (!scheduleForm.topic || !scheduleForm.date || !scheduleForm.time) {
      setStatus('Topic, date and time are required to schedule a lesson.');
      return;
    }

    setSavingSchedule(true);
    try {
      await createScheduledLesson({
        studentId,
        tutorId: profile?.uid,
        topic: scheduleForm.topic,
        date: scheduleForm.date,
        time: scheduleForm.time,
        link: scheduleForm.link,
        studentName: student?.displayName || student?.name || 'Student',
      });
      setScheduleForm(defaultLessonForm);
      setStatus('Lesson scheduled successfully.');
    } catch (error) {
      setStatus(error.message || 'Failed to schedule lesson.');
    } finally {
      setSavingSchedule(false);
    }
  };

  const openEditLesson = (lesson) => {
    setEditingLessonId(lesson.id);
    setUpdateForm({
      topicReport: lesson.topicReport || '',
      understandingLevel: Number(lesson.understandingLevel ?? 5),
      lessonCompleted: Boolean(lesson.lessonCompleted),
    });
  };

  const saveLessonUpdate = async () => {
    const lesson = scheduledLessons.find((item) => item.id === editingLessonId);
    if (!lesson) {
      setStatus('Scheduled lesson not found.');
      return;
    }

    if (updateForm.lessonCompleted && !updateForm.topicReport.trim()) {
      setStatus('Please add lesson report before marking as completed.');
      return;
    }

    try {
      await updateScheduledLesson({
        lessonId: editingLessonId,
        updates: {
          topicReport: updateForm.topicReport,
          understandingLevel: Number(updateForm.understandingLevel),
          lessonCompleted: Boolean(updateForm.lessonCompleted),
          status: updateForm.lessonCompleted ? 'completed' : 'scheduled',
          completedAt: updateForm.lessonCompleted ? new Date().toISOString() : null,
        },
      });

      if (updateForm.lessonCompleted) {
        const existingReport = student?.latestReport || '';
        const reportEntry = `--- ${lesson.topic} ---\nTopic: ${lesson.topic}\nTutor Topic Report:\n${updateForm.topicReport}\nUnderstanding Level: ${Number(updateForm.understandingLevel)}/10\nDate: ${new Date().toLocaleString()}`;
        const updatedReport = `${existingReport}${existingReport ? '\n\n' : ''}${reportEntry}`;

        await setDoc(
          doc(db, 'users', studentId),
          {
            latestReport: updatedReport,
            updatedAt: new Date(),
          },
          { merge: true },
        );

        const completedLesson = await saveCompletedLesson({
          studentId,
          tutorId: profile?.uid,
          topic: lesson.topic,
          topicReport: updateForm.topicReport,
          understandingLevel: Number(updateForm.understandingLevel),
          studentName: student?.displayName || student?.name || 'Student',
        });

        const availablePapers = await getQuestionPapers({
          grade: student?.grade,
          region: student?.province,
          subject: SUBJECT,
        });

        await generateExercisePlanIfEligible({
          student: {
            uid: studentId,
            grade: student?.grade,
            province: student?.province,
            paymentCompleted: student?.paymentCompleted,
            latestMark: student?.latestMark,
            previousYearMark: student?.previousYearMark,
          },
          mode: 'weekly',
          completedLesson,
          understandingLevel: Number(updateForm.understandingLevel),
          availablePapers,
        });
      }

      setEditingLessonId('');
      setUpdateForm(defaultUpdateForm);
      setStatus('Lesson updated successfully.');
    } catch (error) {
      setStatus(error.message || 'Failed to update lesson.');
    }
  };

  const handleAssessmentSubmit = async () => {
    const answeredCount = assessmentQuestions.filter((question) => assessmentAnswers[question.id]).length;
    if (answeredCount !== assessmentQuestions.length) {
      setStatus('Please answer all assessment questions before submitting.');
      return;
    }

    setSubmittingAssessment(true);
    try {
      const questionResults = assessmentQuestions.map((question) => toQuestionResult(question, assessmentAnswers[question.id]));
      const score = questionResults.filter((item) => item.isCorrect).length;
      const totalQuestions = assessmentQuestions.length;
      const percentage = Math.round((score / totalQuestions) * 100);
      const recommendedSessions = getRecommendedSessionsFromAssessment(percentage);
      const assessmentDate = new Date().toISOString().slice(0, 10);

      const savedAssessment = await saveAssessmentResult({
        studentId,
        tutorId: profile?.uid,
        studentName: student?.displayName || student?.name || 'Student',
        grade: student?.grade || 'Unknown',
        subject: SUBJECT,
        score,
        totalQuestions,
        percentage,
        recommendedSessions,
        questionResults,
        assessmentDate,
      });

      setLatestAssessment(savedAssessment);
      setStatus(`Assessment submitted. Score: ${percentage}%. Recommended sessions: ${recommendedSessions}.`);
    } catch (error) {
      setStatus(error.message || 'Failed to submit assessment.');
    } finally {
      setSubmittingAssessment(false);
    }
  };

  if (loading) {
    return (
      <AppShell title="Student details" subtitle="Loading student profile..." role="tutor" user={profile} onLogout={logout}>
        <div className="panel p-6 text-sm text-slate-600">Loading student details…</div>
      </AppShell>
    );
  }

  if (!student) {
    return (
      <AppShell title="Student details" subtitle="Student record unavailable." role="tutor" user={profile} onLogout={logout}>
        <div className="panel p-6 text-sm text-slate-600">{status || 'Student not found.'}</div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={`${student.displayName || student.name || 'Student'} details`}
      subtitle="Manage initial report, schedule lessons, update scheduled lessons, and run subject assessment from one page."
      role="tutor"
      user={profile}
      onLogout={logout}
    >
      <section className="panel p-5">
        <button type="button" className="btn-secondary" onClick={() => navigate('/tutor')}>
          Back to Tutor Dashboard
        </button>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="panel space-y-4 p-6">
          <SectionHeader
            eyebrow="Student"
            title="Student profile details"
            description="This is now a full page view instead of a popup for safer production workflows."
          />
          <p className="text-sm text-slate-600">Grade: <strong>{student.grade || 'Unknown'}</strong></p>
          <p className="text-sm text-slate-600">Region: <strong>{student.province || 'Unknown'}</strong></p>
          <p className="text-sm text-slate-600">Payment: <strong>{student.paymentCompleted ? 'Paid' : 'Unpaid'}</strong></p>
          <p className="text-sm text-slate-600">Assessment score: <strong>{student.assessmentScore ?? 'Not done yet'}</strong></p>
          <p className="text-sm text-slate-600">Assessment date: <strong>{student.assessmentDate || 'Not done yet'}</strong></p>
        </div>

        <div className="panel space-y-4 p-6">
          {!hasInitialReport ? (
            <>
              <SectionHeader
                eyebrow="Initial report"
                title="Create first report"
                description="Before lesson updates, save the first tutor report for this student."
              />
              <textarea
                className="input min-h-36"
                value={initialReport}
                onChange={(event) => setInitialReport(event.target.value)}
                placeholder="Initial summary of current level, strengths, and support areas"
              />
              <button type="button" className="btn-primary" onClick={saveInitialReport}>
                Save initial report
              </button>
            </>
          ) : (
            <>
              <SectionHeader
                eyebrow="Schedule lesson"
                title="Plan lesson for this student"
                description="Schedule first, then update completion and report from the list below."
              />

              <label>
                <span className="label">Topic</span>
                <select
                  className="input"
                  value={scheduleForm.topic}
                  onChange={(event) => setScheduleForm((current) => ({ ...current, topic: event.target.value }))}
                >
                  <option value="">Select topic</option>
                  {gradeTopics.map((topic) => (
                    <option key={topic} value={topic}>{topic}</option>
                  ))}
                </select>
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label>
                  <span className="label">Date</span>
                  <input
                    type="date"
                    className="input"
                    value={scheduleForm.date}
                    onChange={(event) => setScheduleForm((current) => ({ ...current, date: event.target.value }))}
                  />
                </label>
                <label>
                  <span className="label">Time</span>
                  <input
                    type="time"
                    className="input"
                    value={scheduleForm.time}
                    onChange={(event) => setScheduleForm((current) => ({ ...current, time: event.target.value }))}
                  />
                </label>
              </div>

              <label>
                <span className="label">Meeting link (Zoom/Meet/Teams)</span>
                <input
                  className="input"
                  value={scheduleForm.link}
                  onChange={(event) => setScheduleForm((current) => ({ ...current, link: event.target.value }))}
                  placeholder="https://..."
                />
              </label>

              <button type="button" className="btn-primary" onClick={handleScheduleLesson} disabled={savingSchedule}>
                {savingSchedule ? 'Scheduling...' : 'Schedule lesson'}
              </button>
            </>
          )}
        </div>
      </section>

      <AssessmentSummaryCard
        assessment={latestAssessment}
        title="Latest assessment outcome"
        detailUrl={latestAssessment?.id ? `/tutor/student/${studentId}/assessment/${latestAssessment.id}` : null}
      />

      {hasInitialReport ? (
        <section className="panel p-6">
          <SectionHeader
            eyebrow="Scheduled lessons"
            title="Update existing lesson"
            description="When a lesson is completed and saved, its report is appended to latestReport and AI weekly generation can run."
          />

          <div className="mt-5 space-y-3">
            {scheduledLessons.length ? scheduledLessons.map((lesson) => (
              <div key={lesson.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">{lesson.topic}</p>
                    <p className="text-sm text-slate-500">{lesson.date} at {lesson.time}</p>
                    <p className="text-xs text-slate-500">Status: {lesson.lessonCompleted ? 'Completed' : 'Scheduled'}</p>
                  </div>
                  <button type="button" className="btn-secondary" onClick={() => openEditLesson(lesson)}>Edit</button>
                </div>
              </div>
            )) : (
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No scheduled lessons yet.</div>
            )}
          </div>

          {editingLessonId ? (
            <div className="mt-5 rounded-2xl border border-slate-200 p-4">
              <h3 className="text-lg font-semibold text-slate-900">Update scheduled lesson</h3>
              <textarea
                className="input mt-3 min-h-28"
                value={updateForm.topicReport}
                onChange={(event) => setUpdateForm((current) => ({ ...current, topicReport: event.target.value }))}
                placeholder="Add tutor lesson report"
              />
              <label className="mt-3 block">
                <span className="label">Understanding Level (0 - 10)</span>
                <input
                  type="number"
                  min="0"
                  max="10"
                  className="input"
                  value={updateForm.understandingLevel}
                  onChange={(event) => setUpdateForm((current) => ({ ...current, understandingLevel: event.target.value }))}
                />
              </label>
              <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={updateForm.lessonCompleted}
                  onChange={(event) => setUpdateForm((current) => ({ ...current, lessonCompleted: event.target.checked }))}
                />
                Mark as completed
              </label>

              <div className="mt-4 flex gap-2">
                <button type="button" className="btn-primary" onClick={saveLessonUpdate}>Save lesson update</button>
                <button type="button" className="btn-secondary" onClick={() => setEditingLessonId('')}>Cancel</button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="panel p-6">
        <SectionHeader
          eyebrow="Assessment"
          title="Grade and subject assessment"
          description="15-question assessment (5 concepts + 10 grade-topic checks) with score, recommended sessions, and saved question answers."
        />

        <div className="mt-5 space-y-5">
          {assessmentQuestions.map((question, index) => (
            <div key={question.id} className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Question {index + 1}</p>
              <p className="mt-2 font-semibold text-slate-900">{question.prompt}</p>
              <div className="mt-3 grid gap-2">
                {question.options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`rounded-xl border px-3 py-2 text-left text-sm ${assessmentAnswers[question.id] === option.id ? 'border-brand-600 bg-brand-50 text-brand-900' : 'border-slate-200 text-slate-700'}`}
                    onClick={() => setAssessmentAnswers((current) => ({ ...current, [question.id]: option.id }))}
                  >
                    {option.text}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5">
          <button type="button" className="btn-primary" onClick={handleAssessmentSubmit} disabled={submittingAssessment}>
            {submittingAssessment ? 'Submitting assessment...' : 'Submit assessment'}
          </button>
        </div>
      </section>

      {status ? <div className="panel p-4 text-sm text-slate-700">{status}</div> : null}
    </AppShell>
  );
};
