import { useEffect, useState } from 'react';
import { AppShell } from '../../components/common/AppShell';
import { SectionHeader } from '../../components/common/SectionHeader';
import { useAuth } from '../../hooks/useAuth';
import { subscribeToScheduledLessonsForStudent } from '../../services/firestoreService';

export const StudentLessonsPage = () => {
  const { profile, logout } = useAuth();
  const [lessons, setLessons] = useState([]);

  useEffect(() => {
    if (!profile?.uid) return () => {};
    return subscribeToScheduledLessonsForStudent(profile.uid, setLessons);
  }, [profile?.uid]);

  return (
    <AppShell
      title="Scheduled lessons"
      subtitle="See all scheduled and completed lessons in one place."
      role="student"
      user={profile}
      onLogout={logout}
    >
      <section className="panel p-6">
        <SectionHeader
          eyebrow="Lessons"
          title="Your lesson schedule"
          description="This includes upcoming lessons and completed lessons from your tutor schedule."
        />
        <div className="mt-5 space-y-3">
          {lessons.length ? lessons.map((lesson) => (
            <div key={lesson.id} className="rounded-2xl border border-slate-200 p-4">
              <p className="font-semibold text-slate-900">{lesson.topic}</p>
              <p className="text-sm text-slate-500">{lesson.date} at {lesson.time}</p>
              <p className="text-xs text-slate-500">Status: {lesson.lessonCompleted ? 'Completed' : 'Scheduled'}</p>
              {lesson.link ? <a href={lesson.link} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-sm font-semibold text-brand-700">Open lesson link</a> : null}
              {lesson.topicReport ? <p className="mt-2 text-sm text-slate-600">Report: {lesson.topicReport}</p> : null}
            </div>
          )) : <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No lessons scheduled yet.</div>}
        </div>
      </section>
    </AppShell>
  );
};
