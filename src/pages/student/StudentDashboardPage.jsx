import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../components/common/AppShell';
import { SectionHeader } from '../../components/common/SectionHeader';
import { StatCard } from '../../components/common/StatCard';
import { ExerciseCard } from '../../components/dashboard/ExerciseCard';
import { useAuth } from '../../hooks/useAuth';
import { canOpenExercise, getExerciseAvailability } from '../../utils/exerciseRules';
import {
  generateExercisePlanIfEligible,
  getCurrentWeekExercises,
  getExerciseHistory,
  getFutureExercises,
  getRoleDashboardData,
  getStudentAccessState,
  getTodayExercise,
  subscribeToStudentExerciseHistory,
  subscribeToTodayExercise,
  subscribeToUserProfile,
} from '../../services/firestoreService';
import { getSubscriptionQuote } from '../../services/paymentsService';

const dashboardCacheByStudent = new Map();

export const StudentDashboardPage = () => {
  const { profile, logout } = useAuth();
  const cached = profile?.uid ? dashboardCacheByStudent.get(profile.uid) : null;
  const [dashboard, setDashboard] = useState(cached?.dashboard ?? null);
  const [history, setHistory] = useState([]);
  const [currentWeek, setCurrentWeek] = useState([]);
  const [futureExercises, setFutureExercises] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [accessState, setAccessState] = useState(null);
  const [tutorProfile, setTutorProfile] = useState(null);
  const [isInitialLoading, setIsInitialLoading] = useState(!cached?.dashboard);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationMessage, setGenerationMessage] = useState('');
  const [showGenerationPanel, setShowGenerationPanel] = useState(false);

  const [viewMode, setViewMode] = useState('current');

  const runGeneratePlan = async (mode, { silent = false } = {}) => {
    setIsGenerating(true);
    setShowGenerationPanel(!silent);
    setGenerationProgress(10);
    setGenerationMessage(`${mode === 'initial' ? 'Initial' : 'Weekly'} AI generation started...`);

    try {
      const result = await generateExercisePlanIfEligible({ student: profile, mode });
      setGenerationProgress(60);

      if (result?.generated) {
        setGenerationMessage(`AI ${mode} generation complete: ${result.assignments?.length ?? 0} exercise(s) assigned.`);
      } else {
        setGenerationMessage(`AI ${mode} generation did not run: ${result?.reason ?? 'criteria not met'}.`);
      }

      setGenerationProgress(100);
      return result;
    } catch (error) {
      setGenerationMessage(`AI ${mode} generation failed: ${error?.message ?? 'unexpected error'}.`);
      setGenerationProgress(100);
      return null;
    } finally {
      setTimeout(() => setIsGenerating(false), 400);
      if (silent) setShowGenerationPanel(false);
    }
  };

  useEffect(() => {
    if (profile?.tutorId) {
      const unsubscribe = subscribeToUserProfile(profile.tutorId, setTutorProfile);
      return () => unsubscribe();
    } else {
      setTutorProfile(null);
    }
  }, [profile?.tutorId]);

  const refreshDashboardData = async ({ showStatus = false } = {}) => {
    if (!profile?.uid) return;
    if (showStatus) {
      setIsRefreshing(true);
      setStatusMessage('Refreshing dashboard...');
    }
    try {
      const [data, exerciseHistory, currentWeekExercises, futureExs, studentAccess, liveTodayExercise] = await Promise.all([
        getRoleDashboardData('student', { studentId: profile?.uid }),
        getExerciseHistory(profile?.uid),
        getCurrentWeekExercises(profile?.uid),
        getFutureExercises(profile?.uid),
        getStudentAccessState(profile),
        getTodayExercise(profile?.uid),
      ]);

      const todaySubmitted = Boolean(liveTodayExercise?.submittedImageUrl || liveTodayExercise?.submittedFileName);
      const mergedDashboard = {
        ...data,
        todayExercise: liveTodayExercise ? { ...liveTodayExercise, submitted: todaySubmitted } : null,
        paymentCompleted: studentAccess.paymentCompleted,
        generationStatus: studentAccess.generationStatus,
      };

      setDashboard(mergedDashboard);
      setHistory(exerciseHistory);
      setCurrentWeek(currentWeekExercises);
      setFutureExercises(futureExs);
      setAccessState(studentAccess);
      setLoadError('');
      dashboardCacheByStudent.set(profile.uid, { dashboard: mergedDashboard, updatedAt: Date.now() });
      if (showStatus) setStatusMessage('Dashboard updated.');

      if (!studentAccess.paymentCompleted) {
        setLoadError('Complete payment first. Exercises and exercise generation remains locked until payment is recorded.');
        return;
      }

      if (studentAccess.initialGenerationReady) {
        const generationResult = await runGeneratePlan('initial', { silent: true });
        if (generationResult?.generated) {
          await refreshDashboardData();
        }
      } else if (studentAccess.weeklyGenerationReady) {
        const generationResult = await runGeneratePlan('weekly', { silent: true });
        if (generationResult?.generated) {
          await refreshDashboardData();
        }
      }
    } catch (error) {
      setDashboard((current) => current ?? { stats: [], todayExercise: null, feedback: [], peerReviewAssignment: null });
      setHistory([]);
      setLoadError('Some student dashboard data could not be loaded yet. Please try again after confirming the required student records are available.');
      if (showStatus) setStatusMessage('Refresh failed. Please try again.');
    } finally {
      setIsInitialLoading(false);
      if (showStatus) {
        setIsRefreshing(false);
        setTimeout(() => setStatusMessage(''), 1800);
      }
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        await refreshDashboardData();
      } catch (error) {
        setLoadError('Some student dashboard data could not be loaded yet. Please try again after confirming the required student records are available.');
      }
    };

    if (profile?.uid) {
      load();
    }
  }, [profile?.uid]);

  useEffect(() => {
    if (!profile?.uid) return () => {};
    const unsubscribeToday = subscribeToTodayExercise(profile.uid, (todayExercise) => {
      setDashboard((current) => {
        if (!current) return current;
        return {
          ...current,
          todayExercise: todayExercise
            ? { ...todayExercise, submitted: Boolean(todayExercise.submittedImageUrl || todayExercise.submittedFileName) }
            : null,
        };
      });
    });

    const unsubscribeHistory = subscribeToStudentExerciseHistory(profile.uid, (streams) => {
      if (!streams) return;
      setHistory(streams.history ?? []);
      setCurrentWeek(streams.currentWeek ?? []);
      setFutureExercises(streams.future ?? []);
    });

    return () => {
      unsubscribeToday();
      unsubscribeHistory();
    };
  }, [profile?.uid]);

  const todayExercise = dashboard?.todayExercise;
  const quote = useMemo(
    () => getSubscriptionQuote({ latestMark: profile?.latestMark ?? profile?.previousYearMark ?? 0, sessionType: profile?.sessionType ?? 'online' }),
    [profile],
  );

  const handleSubmissionSaved = (result) => {
    setDashboard((current) => {
      if (!current?.todayExercise) return current;
      return {
        ...current,
        todayExercise: {
          ...current.todayExercise,
          submittedImageUrl: result?.submittedImageUrl ?? current.todayExercise.submittedImageUrl,
          submittedFileName: result?.submittedFileName ?? current.todayExercise.submittedFileName,
          submitted: true,
        },
      };
    });
    setStatusMessage('Submission received. Syncing latest data...');
    refreshDashboardData({ showStatus: true });
  };

  if (isInitialLoading && !dashboard) {
    return (
      <AppShell title="Student dashboard" subtitle="See your exercises for today and more." role="student" user={profile} onLogout={logout}>
        <div className="panel p-6 text-sm text-slate-600">Loading your dashboard…</div>
      </AppShell>
    );
  }

  if (!dashboard) return null;

  const availability = todayExercise ? getExerciseAvailability(todayExercise.assignmentDate, false) : null;
  const paymentLocked = accessState ? !accessState.paymentCompleted : !(profile?.paymentCompleted);

  return (
    <AppShell
      title="Student dashboard"
      subtitle="See your exercises for today and more."
      role="student"
      user={profile}
      onLogout={logout}
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {(dashboard.stats ?? []).map((item) => <StatCard key={item.label} {...item} />)}
      </section>

      {paymentLocked ? (
        <div className="panel flex flex-col gap-3 border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <strong>Payment required before lessons and exercises unlock.</strong>
          <p>Go to the Billing page to complete payment. No AI generation or exercise access will happen until payment is complete.</p>
        </div>
      ) : null}

      {loadError ? <div className="panel p-4 text-sm text-amber-700">{loadError}</div> : null}
      {isRefreshing || statusMessage ? (
        <div className="panel p-3 text-sm text-brand-700">
          {isRefreshing ? 'Refreshing data…' : statusMessage}
        </div>
      ) : null}

      {isGenerating && showGenerationPanel ? (
        <div className="panel mb-4 p-4">
          <p className="font-medium text-slate-700">{generationMessage}</p>
          <div className="mt-3 h-2 w-full rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-brand-600 transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, generationProgress))}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">{Math.min(100, Math.max(0, generationProgress))}%</p>
        </div>
      ) : null}
      
      <section className="flex">
        {!paymentLocked && todayExercise && availability ? (
          <ExerciseCard 
            exercise={todayExercise} 
            availability={availability}
            paymentLocked={paymentLocked}
            studentId={profile?.uid}
            onSubmissionSaved={handleSubmissionSaved}
          />
        ) : (
          <div className="panel flex min-h-72 items-center justify-center p-6 text-center text-sm text-slate-500 w-full">
            {paymentLocked ? 'Exercises are locked until payment is complete.' : 'No exercise has been assigned for today yet. Once tutor-approved work is scheduled, it will appear here.'}
          </div>
        )}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="space-y-6">
          <SectionHeader eyebrow="Exercises" title={viewMode === 'current' ? 'Current Week' : viewMode === 'past' ? 'Past Exercises' : 'Future Exercises'} description={viewMode === 'current' ? 'Today and the next 6 days of assigned exercises.' : viewMode === 'past' ? 'Previously completed exercises for reference.' : 'Exercises scheduled beyond the current week.'} />
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setViewMode('current')}
              className={`btn ${viewMode === 'current' ? 'btn-primary' : 'btn-secondary'}`}
            >
              Current Week
            </button>
            <button
              onClick={() => setViewMode('past')}
              className={`btn ${viewMode === 'past' ? 'btn-primary' : 'btn-secondary'}`}
            >
              View Past
            </button>
            <button
              onClick={() => setViewMode('future')}
              className={`btn ${viewMode === 'future' ? 'btn-primary' : 'btn-secondary'}`}
            >
              View Future
            </button>
          </div>
          <div className="space-y-4">
            {(viewMode === 'current' ? currentWeek : viewMode === 'past' ? history : futureExercises).map((exercise) => {
              const itemAvailability = getExerciseAvailability(exercise.assignmentDate, exercise.submitted);
              return (
                <div key={exercise.id} className="panel flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-950">{exercise.title}</h3>
                    <p className="mt-1 text-sm text-slate-500">{exercise.topic}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.25em] text-slate-400">{exercise.assignmentDate}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-700">{itemAvailability.label}</p>
                    <p className="mt-1 text-xs text-slate-400">{canOpenExercise(exercise.assignmentDate) ? 'Open today' : 'Reference only ☀️'}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-6">
          <div className="space-y-6">
            <SectionHeader eyebrow="Support" title="Assigned Tutor" description="Your assigned mathematics tutor who reviews your work and approves AI generation." />
            <div className="panel p-6 flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-xl font-bold text-brand-700">
                {tutorProfile?.displayName?.[0] ?? 'T'}
              </div>
              <div>
                <p className="text-lg font-semibold text-slate-950">{tutorProfile ? tutorProfile.displayName : 'Awaiting assignment'}</p>
                <p className="text-sm text-slate-500">{tutorProfile ? 'Active Tutor' : 'No tutor assigned yet'}</p>
              </div>
            </div>
          </div>
          <SectionHeader eyebrow="Billing" title="Subscription guidance" description="Plan pricing is derived from the student-entered previous year mark or the latest mark once results exist." />
          <div className="panel space-y-4 p-6">
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm">
              <span>Session type</span>
              <strong>{profile?.sessionType ?? 'online'}</strong>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm">
              <span>Recommended sessions</span>
              <strong>{quote.sessionCount}/month</strong>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm">
              <span>Estimated amount</span>
              <strong>R{quote.amount.toFixed(2)}</strong>
            </div>
          </div>
        </div>
      </section>
    </AppShell>
  );
};
