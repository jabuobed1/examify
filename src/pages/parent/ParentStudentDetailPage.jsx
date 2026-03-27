import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AppShell } from '../../components/common/AppShell';
import { SectionHeader } from '../../components/common/SectionHeader';
import { AssessmentSummaryCard } from '../../components/assessment/AssessmentResultPanel';
import { useAuth } from '../../hooks/useAuth';
import {
  getLatestAssessmentForStudent,
  getParentStudentById,
  subscribeToScheduledLessonsForStudent,
  subscribeToUserProfile,
} from '../../services/firestoreService';

export const ParentStudentDetailPage = () => {
  const { studentId } = useParams();
  const { profile, logout } = useAuth();

  const [student, setStudent] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [latestAssessment, setLatestAssessment] = useState(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!profile?.uid || !studentId) return () => {};

    const load = async () => {
      try {
        const result = await getParentStudentById({ parentId: profile.uid, studentId });
        if (!result) {
          setStatus('Student not found.');
        } else {
          setStudent(result);
          const assessment = await getLatestAssessmentForStudent(studentId);
          setLatestAssessment(assessment);
        }
      } catch (error) {
        setStatus(error.message || 'Unable to load student details.');
      }
    };

    load();

    const unsubStudent = subscribeToUserProfile(studentId, setStudent);
    const unsubLessons = subscribeToScheduledLessonsForStudent(studentId, setLessons);

    return () => {
      unsubStudent();
      unsubLessons();
    };
  }, [profile?.uid, studentId]);

  const completedLessons = lessons.filter((lesson) => lesson.lessonCompleted);
  const scheduledLessons = lessons.filter((lesson) => !lesson.lessonCompleted);

  return (
    <AppShell
      title="Student details"
      subtitle="Full student profile view for parents, including scheduled and completed lessons."
      role="parent"
      user={profile}
      onLogout={logout}
    >
      {status ? <div className="panel p-4 text-sm text-slate-700">{status}</div> : null}

      {student ? (
        <>
          <section className="panel p-6">
            <SectionHeader eyebrow="Profile" title={student.displayName || student.email || 'Student'} description="Linked student details and latest progress context." />
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <p className="text-sm text-slate-600">Grade: <strong>{student.grade || 'Unknown'}</strong></p>
              <p className="text-sm text-slate-600">Region: <strong>{student.province || 'Unknown'}</strong></p>
              <p className="text-sm text-slate-600">Assessment score: <strong>{student.assessmentScore ?? 'Not assessed yet'}</strong></p>
              <p className="text-sm text-slate-600">Assessment date: <strong>{student.assessmentDate || 'N/A'}</strong></p>
            </div>
          </section>

          <AssessmentSummaryCard
            assessment={latestAssessment}
            title="Latest assessment outcome"
            detailUrl={latestAssessment?.id ? `/parent/student/${studentId}/assessment/${latestAssessment.id}` : null}
          />

          <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
            <div className="panel p-6">
              <SectionHeader eyebrow="Scheduled" title="Upcoming lessons" description="Lessons planned by the tutor and not yet completed." />
              <div className="mt-4 space-y-3">
                {scheduledLessons.length ? scheduledLessons.map((lesson) => (
                  <div key={lesson.id} className="rounded-2xl border border-slate-200 p-4">
                    <p className="font-semibold text-slate-900">{lesson.topic}</p>
                    <p className="text-sm text-slate-500">{lesson.date} at {lesson.time}</p>
                    {lesson.link ? <a href={lesson.link} target="_blank" rel="noreferrer" className="text-sm text-brand-700">Open link</a> : null}
                  </div>
                )) : <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No upcoming lessons.</div>}
              </div>
            </div>

            <div className="panel p-6">
              <SectionHeader eyebrow="Completed" title="Completed lessons" description="Finished sessions with tutor report and understanding level." />
              <div className="mt-4 space-y-3">
                {completedLessons.length ? completedLessons.map((lesson) => (
                  <div key={lesson.id} className="rounded-2xl border border-slate-200 p-4">
                    <p className="font-semibold text-slate-900">{lesson.topic}</p>
                    <p className="text-sm text-slate-500">{lesson.date} at {lesson.time}</p>
                    <p className="text-xs text-slate-500">Understanding: {lesson.understandingLevel ?? 'N/A'}/10</p>
                    {lesson.topicReport ? <p className="mt-2 text-sm text-slate-600">{lesson.topicReport}</p> : null}
                  </div>
                )) : <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No completed lessons yet.</div>}
              </div>
            </div>
          </section>
        </>
      ) : null}
    </AppShell>
  );
};
