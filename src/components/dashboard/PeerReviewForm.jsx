import { useEffect, useState } from 'react';

export const PeerReviewForm = ({ submission, canReview, onSubmit }) => {
  const [mark, setMark] = useState('');
  const [comment, setComment] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    setStatus('');
  }, [submission?.id]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      await onSubmit({ mark: Number(mark), comment });
      setStatus('Peer review submitted successfully.');
      setMark('');
      setComment('');
    } catch (error) {
      setStatus(error.message);
    }
  };

  if (!submission) {
    return <div className="panel p-5 text-sm text-slate-500">No peer review assignment yet.</div>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="panel overflow-hidden p-3">
        <img src={submission.imageUrl} alt={`Submission by ${submission.studentName}`} className="h-full max-h-[500px] w-full rounded-2xl object-cover" />
      </div>
      <form onSubmit={handleSubmit} className="panel space-y-4 p-5">
        <div>
          <h3 className="text-xl font-semibold text-slate-950">Review {submission.studentName}</h3>
          <p className="mt-2 text-sm text-slate-500">Exercise: {submission.exerciseTitle}</p>
        </div>
        <label className="block">
          <span className="label">Mark out of 100</span>
          <input type="number" min="0" max="100" value={mark} onChange={(event) => setMark(event.target.value)} className="input" disabled={!canReview} />
        </label>
        <label className="block">
          <span className="label">Comments</span>
          <textarea value={comment} onChange={(event) => setComment(event.target.value)} className="input min-h-40" disabled={!canReview} placeholder="Explain the score, point out errors, and note strong working steps." />
        </label>
        <button type="submit" className="btn-primary" disabled={!canReview}>Submit peer review</button>
        <p className="text-sm text-slate-500">{canReview ? 'You can review because your own submission is complete.' : 'Submit your own work first to unlock peer review.'}</p>
        {status ? <p className="text-sm text-slate-600">{status}</p> : null}
      </form>
    </div>
  );
};
