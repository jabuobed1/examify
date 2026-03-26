import { useEffect, useMemo, useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { AppShell } from '../../components/common/AppShell';
import { SectionHeader } from '../../components/common/SectionHeader';
import { StatCard } from '../../components/common/StatCard';
import { useAuth } from '../../hooks/useAuth';
import {
  assignStudentToTutor,
  generateExercisePlanIfEligible,
  getQuestionPapers,
  getRoleDashboardData,
  saveCompletedLesson,
  subscribeToAssignedStudentsForTutor,
  subscribeToUnassignedStudents,
} from '../../services/firestoreService';
import { db } from '../../firebase/config';

export const TutorDashboardPage = () => {
  const { profile, logout } = useAuth();

  const [dashboard, setDashboard] = useState(null);
  const [students, setStudents] = useState([]);
  const [unassignedStudents, setUnassignedStudents] = useState([]);
  const [status, setStatus] = useState('');

  const [activeStudentId, setActiveStudentId] = useState('');
  const [reportNote, setReportNote] = useState('');
  const [lessonForm, setLessonForm] = useState({
    topic: '',
    topicReport: '',
    understandingLevel: 5,
  });

  const loadDashboard = async () => {
    if (!profile?.uid) return;
    console.log('[Examify][TutorDashboard] load:start', { tutorId: profile.uid });
    const data = await getRoleDashboardData('tutor', { tutorId: profile.uid });
    setDashboard(data);
  };

  useEffect(() => {
    if (!profile?.uid) return;

    loadDashboard();

    const unsub1 = subscribeToAssignedStudentsForTutor(profile.uid, (data) => {
      setStudents(data);
    });

    const unsub2 = subscribeToUnassignedStudents(setUnassignedStudents);

    return () => {
      unsub1();
      unsub2();
    };
  }, [profile?.uid]);

  const activeStudent =
    students.find((student) => (student.uid || student.id) === activeStudentId) ?? null;

  const activeStudentFirestoreId = activeStudent?.uid || activeStudent?.id || '';
  const hasInitialReport = Boolean((activeStudent?.latestReport || '').trim());

  const filteredReports = useMemo(() => {
    if (!dashboard?.reports || !activeStudent) return [];

    const currentStudentId = activeStudent.uid || activeStudent.id;
    const currentStudentName = activeStudent.displayName || activeStudent.name || '';

    return dashboard.reports.filter((report) => {
      const reportStudentId = report.studentId || report.uid || report.userId;
      const reportStudentName = report.studentName || report.name || '';
      return (
        (reportStudentId && reportStudentId === currentStudentId) ||
        (reportStudentName && reportStudentName === currentStudentName)
      );
    });
  }, [dashboard?.reports, activeStudent]);

  const filteredCompletedLessons = useMemo(() => {
    if (!dashboard?.completedTopics || !activeStudent) return [];

    const currentStudentId = activeStudent.uid || activeStudent.id;
    const currentStudentName = activeStudent.displayName || activeStudent.name || '';

    return dashboard.completedTopics.filter((lesson) => {
      const lessonStudentId = lesson.studentId || lesson.uid || lesson.userId;
      const lessonStudentName = lesson.studentName || lesson.name || '';
      return (
        (lessonStudentId && lessonStudentId === currentStudentId) ||
        (lessonStudentName && lessonStudentName === currentStudentName)
      );
    });
  }, [dashboard?.completedTopics, activeStudent]);

  const openStudentModal = (student) => {
    const studentId = student.uid || student.id || '';
    setActiveStudentId(studentId);
    setReportNote('');
    setLessonForm({
      topic: '',
      topicReport: '',
      understandingLevel: 5,
    });
    setStatus('');
  };

  const closeStudentModal = () => {
    setActiveStudentId('');
    setReportNote('');
    setLessonForm({
      topic: '',
      topicReport: '',
      understandingLevel: 5,
    });
  };

  const handleAssignStudent = async (studentId) => {
    console.log('[Examify][TutorDashboard] assignStudent:start', {
      studentId,
      tutorId: profile?.uid,
    });

    try {
      const result = await assignStudentToTutor({ studentId, tutorId: profile?.uid });
      console.log('[Examify][TutorDashboard] assignStudent:success', result);
      setStatus('Student assigned successfully. You can now open that student and manage reports and lessons.');
      await loadDashboard();
    } catch (error) {
      console.error('[Examify][TutorDashboard] assignStudent:error', error);
      setStatus(error.message || 'Failed to assign student.');
    }
  };

  const handleSaveInitialReport = async () => {
    if (!activeStudent || !activeStudentFirestoreId) {
      setStatus('Please select a student first.');
      return;
    }

    if (!reportNote.trim()) {
      setStatus('Please enter the initial report before saving.');
      return;
    }

    try {
      console.log('[Examify][TutorDashboard] saveInitialReport:start', {
        studentId: activeStudentFirestoreId,
      });

      const newEntryFormatted = `
      --- Report for: ${activeStudent.displayName || activeStudent.name || 'Student'} ---

      Report Entry:
      ${reportNote}
      Date: ${new Date().toLocaleString()}`;

      await setDoc(
        doc(db, 'users', activeStudentFirestoreId),
        {
          latestReport: newEntryFormatted,
          updatedAt: new Date(),
        },
        { merge: true }
      );

      console.log('[Examify][TutorDashboard] saveInitialReport:success');
      setReportNote('');
      setStatus('Initial report saved successfully.');
      await loadDashboard();
    } catch (error) {
      console.error('[Examify][TutorDashboard] saveInitialReport:error', error);
      setStatus(error.message || 'Failed to save initial report.');
    }
  };

  const handleCompleteLesson = async () => {
    if (!activeStudent || !activeStudentFirestoreId) {
      setStatus('Please select a student first.');
      return;
    }

    if (!lessonForm.topic.trim()) {
      setStatus('Please enter the topic name.');
      return;
    }

    if (!lessonForm.topicReport.trim()) {
      setStatus('Please enter the lesson report.');
      return;
    }

    try {
      console.log('[Examify][TutorDashboard] completeLesson:start', {
        studentId: activeStudentFirestoreId,
        lessonForm,
      });

      const existingReport = activeStudent.latestReport || '';

      const newEntryFormatted = `
        --- ${lessonForm.topic} ---
        Topic: ${lessonForm.topic}
        Tutor Topic Report:
        ${lessonForm.topicReport}
        Understanding Level: ${Number(lessonForm.understandingLevel)}/10
        Date: ${new Date().toLocaleString()}
      `;

      const updatedReport = `${existingReport}${existingReport ? '\n\n' : ''}${newEntryFormatted}`;

      await setDoc(
        doc(db, 'users', activeStudentFirestoreId),
        {
          latestReport: updatedReport,
          updatedAt: new Date(),
        },
        { merge: true }
      );

      const lesson = await saveCompletedLesson({
        studentId: activeStudentFirestoreId,
        tutorId: profile?.uid,
        topic: lessonForm.topic,
        topicReport: lessonForm.topicReport,
        understandingLevel: Number(lessonForm.understandingLevel),
        studentName: activeStudent.displayName || activeStudent.name || 'Student',
      });

      const availablePapers = await getQuestionPapers({
        grade: activeStudent.grade,
        region: activeStudent.province,
        subject: 'Mathematics',
      });

      const generation = await generateExercisePlanIfEligible({
        student: {
          uid: activeStudentFirestoreId,
          grade: activeStudent.grade,
          province: activeStudent.province,
          paymentCompleted: activeStudent.paymentCompleted,
        },
        mode: 'weekly',
        completedLesson: lesson,
        understandingLevel: Number(lessonForm.understandingLevel),
        availablePapers,
      });

      console.log('[Examify][TutorDashboard] completeLesson:generation', generation);

      setLessonForm({
        topic: '',
        topicReport: '',
        understandingLevel: 5,
      });

      setStatus(
        generation.generated
          ? 'Lesson saved and weekly exercise generation was triggered successfully.'
          : 'Lesson saved, but weekly generation is still waiting for payment or matching papers.'
      );

      await loadDashboard();
    } catch (error) {
      console.error('[Examify][TutorDashboard] completeLesson:error', error);
      setStatus(error.message || 'Failed to complete lesson.');
    }
  };

  if (!dashboard) return null;

  return (
    <AppShell
      title="Tutor dashboard"
      subtitle="Assign students, open a learner profile, create the initial report once, then continue with lesson completion and weekly AI generation."
      role="tutor"
      user={profile}
      onLogout={logout}
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {(dashboard.stats ?? []).map((item) => (
          <StatCard key={item.label} {...item} />
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="space-y-6">
          <SectionHeader
            eyebrow="Students"
            title="Assigned learners"
            description="Click a student to open their report, lesson completion, reports, and completed lessons."
          />

          <div className="space-y-4">
            {students.length ? (
              students.map((student) => {
                const studentHasReport = Boolean((student.latestReport || '').trim());

                return (
                  <button
                    key={student.uid || student.id}
                    type="button"
                    onClick={() => openStudentModal(student)}
                    className="panel block w-full p-5 text-left transition hover:shadow-lg"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-lg font-semibold text-slate-950">
                          {student.displayName || student.name || 'Student'}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {student.grade || '?'} • {student.province || '?'}
                        </p>
                        <p className="mt-2 text-xs text-slate-500">
                          {studentHasReport
                            ? 'Initial report exists. Click to continue lessons and view history.'
                            : 'No initial report yet. Click to create the first report.'}
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] ${
                            student.paymentCompleted
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {student.paymentCompleted ? 'paid' : 'unpaid'}
                        </span>

                        <span
                          className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${
                            studentHasReport
                              ? 'bg-sky-100 text-sky-700'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {studentHasReport ? 'report ready' : 'report needed'}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="panel p-5 text-sm text-slate-500">
                No students are assigned to this tutor yet.
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <SectionHeader
            eyebrow="Add student"
            title="Unassigned students"
            description="Only students without a Maths tutor appear here."
          />

          <div className="space-y-4">
            {unassignedStudents.length ? (
              unassignedStudents.map((student) => (
                <div
                  key={student.uid || student.id}
                  className="panel flex items-center justify-between gap-3 p-5"
                >
                  <div>
                    <p className="font-semibold text-slate-950">
                      {student.displayName || student.name || 'Student'}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {student.grade || '?'} • {student.province || '?'}
                    </p>
                  </div>

                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => handleAssignStudent(student.uid || student.id)}
                  >
                    Add student
                  </button>
                </div>
              ))
            ) : (
              <div className="panel p-5 text-sm text-slate-500">
                There are no unassigned students right now.
              </div>
            )}
          </div>
        </div>
      </section>

      {status ? <div className="panel p-4 text-sm text-slate-700">{status}</div> : null}

      {activeStudent ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                  Student details
                </p>
                <h2 className="mt-2 text-2xl font-bold text-slate-950">
                  {activeStudent.displayName || activeStudent.name || 'Student'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {activeStudent.grade || '?'} • {activeStudent.province || '?'} •{' '}
                  {activeStudent.paymentCompleted ? 'Paid' : 'Unpaid'}
                </p>
              </div>

              <button
                type="button"
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                onClick={closeStudentModal}
              >
                Close
              </button>
            </div>

            <div className="space-y-6 p-6">
              {!hasInitialReport ? (
                <section className="panel space-y-4 p-6">
                  <SectionHeader
                    eyebrow="Initial Report"
                    title="Student report upon adding"
                    description="This section only appears before the first report is created for this student."
                  />

                  <textarea
                    className="input min-h-40"
                    value={reportNote}
                    onChange={(event) => setReportNote(event.target.value)}
                    placeholder="Explain the student's capabilities, weaknesses, and readiness."
                  />

                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleSaveInitialReport}
                    disabled={!reportNote.trim()}
                  >
                    Save initial report
                  </button>
                </section>
              ) : null}

              {hasInitialReport ? (
                <section className="panel space-y-4 p-6">
                  <SectionHeader
                    eyebrow="Lesson complete"
                    title="Complete topic and trigger weekly generation"
                    description="This section appears after the initial report already exists. Each lesson appends to latestReport."
                  />

                  <input
                    className="input"
                    value={lessonForm.topic}
                    onChange={(event) =>
                      setLessonForm((current) => ({ ...current, topic: event.target.value }))
                    }
                    placeholder="Topic name covered"
                  />

                  <textarea
                    className="input min-h-32"
                    value={lessonForm.topicReport}
                    onChange={(event) =>
                      setLessonForm((current) => ({
                        ...current,
                        topicReport: event.target.value,
                      }))
                    }
                    placeholder="Topic-specific report for the student"
                  />

                  <label>
                    <span className="label">Understanding level (0 - 10)</span>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      className="input"
                      value={lessonForm.understandingLevel}
                      onChange={(event) =>
                        setLessonForm((current) => ({
                          ...current,
                          understandingLevel: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleCompleteLesson}
                    disabled={!lessonForm.topic.trim() || !lessonForm.topicReport.trim()}
                  >
                    Mark lesson complete
                  </button>
                </section>
              ) : null}

              <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
                <div className="panel p-6">
                  <SectionHeader
                    eyebrow="Reports"
                    title="Latest tutor reports"
                    description="This shows reports linked to the selected student."
                  />

                  <div className="mt-4 space-y-3">
                    {filteredReports.length ? (
                      filteredReports.map((report) => (
                        <div key={report.id} className="rounded-2xl bg-slate-50 p-4">
                          <p className="font-semibold text-slate-950">
                            {report.studentName || activeStudent.displayName || activeStudent.name}
                          </p>
                          <p className="mt-2 text-sm text-slate-600">{report.note}</p>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
                        No tutor reports found for this student yet.
                      </div>
                    )}
                  </div>
                </div>

                <div className="panel p-6">
                  <SectionHeader
                    eyebrow="Completed lessons"
                    title="Topic readiness"
                    description="Understanding scores flow into the weekly exercise generation logic."
                  />

                  <div className="mt-4 space-y-3">
                    {filteredCompletedLessons.length ? (
                      filteredCompletedLessons.map((lesson) => (
                        <div key={lesson.id} className="rounded-2xl bg-slate-50 p-4">
                          <p className="font-semibold text-slate-950">{lesson.topic}</p>
                          <p className="mt-1 text-sm text-slate-500">
                            Understanding: {lesson.understandingLevel}/10
                          </p>
                          <p className="mt-2 text-sm text-slate-600">
                            {lesson.topicReport ?? lesson.note}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
                        No completed lessons found for this student yet.
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {hasInitialReport ? (
                <section className="panel p-6">
                  <SectionHeader
                    eyebrow="Latest report"
                    title="Current latestReport value"
                    description="This is the exact report string currently stored for the student and used for AI context."
                  />
                  <pre className="mt-4 whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                    {activeStudent.latestReport || 'No latest report found.'}
                  </pre>
                </section>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
};