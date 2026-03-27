import { Link } from 'react-router-dom';

const toPercent = (assessment) => {
  if (assessment?.percentage !== undefined && assessment?.percentage !== null) {
    return Number(assessment.percentage);
  }
  const score = Number(assessment?.score ?? 0);
  const total = Number(assessment?.totalQuestions ?? 0);
  return total > 0 ? Math.round((score / total) * 100) : 0;
};

export const AssessmentSummaryCard = ({ assessment, title = 'Assessment result', detailUrl = null }) => {
  if (!assessment) {
    return (
      <div className="panel p-5 text-sm text-slate-500">
        No assessment result has been recorded yet.
      </div>
    );
  }

  const percentage = toPercent(assessment);

  return (
    <div className="panel p-5">
      <p className="text-xs uppercase tracking-[0.25em] text-brand-700">Assessment</p>
      <h3 className="mt-2 text-lg font-semibold text-slate-950">{title}</h3>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          <p className="text-slate-500">Score</p>
          <p className="mt-1 font-semibold text-slate-950">{assessment.score ?? 0}/{assessment.totalQuestions ?? 0} ({percentage}%)</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          <p className="text-slate-500">Assessment date</p>
          <p className="mt-1 font-semibold text-slate-950">{assessment.assessmentDate || 'N/A'}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          <p className="text-slate-500">Recommended sessions</p>
          <p className="mt-1 font-semibold text-slate-950">{assessment.recommendedSessions ?? 'N/A'}</p>
        </div>
      </div>
      {detailUrl ? (
        <div className="mt-4">
          <Link to={detailUrl} className="btn-primary inline-flex">See Results in Examify</Link>
        </div>
      ) : null}
    </div>
  );
};

export const AssessmentDetailCard = ({ assessment, backTo }) => {
  if (!assessment) {
    return <div className="panel p-5 text-sm text-slate-500">Assessment result not found.</div>;
  }

  const percentage = toPercent(assessment);
  const questionResults = Array.isArray(assessment.questionResults) ? assessment.questionResults : [];

  return (
    <div className="space-y-6">
      <div className="panel p-6">
        <p className="text-xs uppercase tracking-[0.25em] text-brand-700">Assessment details</p>
        <h2 className="mt-2 text-2xl font-bold text-slate-950">{assessment.studentName || 'Student assessment result'}</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="rounded-xl bg-slate-50 p-3 text-sm">
            <p className="text-slate-500">Score</p>
            <p className="mt-1 font-semibold text-slate-950">{assessment.score ?? 0}/{assessment.totalQuestions ?? 0}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 text-sm">
            <p className="text-slate-500">Percentage</p>
            <p className="mt-1 font-semibold text-slate-950">{percentage}%</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 text-sm">
            <p className="text-slate-500">Assessment date</p>
            <p className="mt-1 font-semibold text-slate-950">{assessment.assessmentDate || 'N/A'}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 text-sm">
            <p className="text-slate-500">Recommended sessions</p>
            <p className="mt-1 font-semibold text-slate-950">{assessment.recommendedSessions ?? 'N/A'}</p>
          </div>
        </div>
        {backTo ? (
          <div className="mt-4">
            <Link to={backTo} className="btn-secondary inline-flex">Back</Link>
          </div>
        ) : null}
      </div>

      <div className="panel p-6">
        <h3 className="text-lg font-semibold text-slate-950">Questions and answers</h3>
        {!questionResults.length ? (
          <p className="mt-3 text-sm text-slate-500">No question breakdown stored for this assessment yet.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {questionResults.map((item, index) => {
              const isCorrect = item?.selectedOptionId && item?.selectedOptionId === item?.correctOptionId;
              return (
                <div key={`${item?.questionId || 'q'}-${index}`} className={`rounded-xl border p-4 ${isCorrect ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
                  <p className="text-sm font-semibold text-slate-950">Q{index + 1}: {item?.prompt || 'Question'}</p>
                  <p className="mt-2 text-sm text-slate-700">Selected: <strong>{item?.selectedOptionText || 'No answer'}</strong></p>
                  <p className="text-sm text-slate-700">Correct: <strong>{item?.correctOptionText || 'N/A'}</strong></p>
                  <p className={`mt-2 text-xs font-semibold uppercase tracking-[0.2em] ${isCorrect ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {isCorrect ? 'Correct' : 'Incorrect'}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
