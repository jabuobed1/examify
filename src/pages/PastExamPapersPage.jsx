import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '../components/common/AppShell';
import { SectionHeader } from '../components/common/SectionHeader';
import { useAuth } from '../hooks/useAuth';
import { PAPER_MONTHS, REGIONS, SOUTH_AFRICAN_GRADES, SUBJECT } from '../lib/constants';
import { getAllQuestionPapers, saveQuestionPaper } from '../services/firestoreService';
import { uploadQuestionPaperDocuments } from '../services/storageService';

export const PastExamPapersPage = () => {
  const { profile, logout } = useAuth();
  const [papers, setPapers] = useState([]);
  const [status, setStatus] = useState('');
  const [form, setForm] = useState({
    grade: SOUTH_AFRICAN_GRADES[0],
    region: REGIONS[0],
    subject: SUBJECT,
    year: new Date().getFullYear(),
    month: PAPER_MONTHS[0],
    notes: '',
    paperFile: null,
    memoFile: null,
  });

  const role = useMemo(() => profile?.role ?? 'student', [profile]);

  useEffect(() => {
    const load = async () => {
      const result = await getAllQuestionPapers();
      setPapers(result);
    };
    load();
  }, [role]);

  const handleChange = (key) => (event) => {
    const value = key.endsWith('File') ? event.target.files?.[0] ?? null : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    console.log('[Examify][PastPapers] submit:start', form);
    setStatus('Uploading documents and checking duplicates...');

    try {
      const uploads = await uploadQuestionPaperDocuments({
        paperFile: form.paperFile,
        memoFile: form.memoFile,
        uploaderId: profile?.uid ?? 'anonymous',
      });
      const saved = await saveQuestionPaper({
        grade: form.grade,
        region: form.region,
        subject: form.subject,
        year: Number(form.year),
        month: form.month,
        notes: form.notes,
        paperUrl: uploads.paperUrl,
        memoUrl: uploads.memoUrl,
        paperFileName: uploads.paperFileName,
        memoFileName: uploads.memoFileName,
        createdBy: profile?.uid ?? 'unknown',
      });
      setPapers((current) => [saved, ...current]);
      setStatus('Past exam paper saved successfully.');
      setForm((current) => ({ ...current, notes: '', paperFile: null, memoFile: null, year: new Date().getFullYear() }));
      event.target.reset();
    } catch (error) {
      console.error('[Examify][PastPapers] submit:error', error);
      setStatus(error.message);
    }
  };

  return (
    <AppShell
      title="Past exam papers"
      subtitle="Browse and add Mathematics past papers. Duplicate papers are blocked by region, subject, year, and month."
      role={role}
      user={profile}
      onLogout={logout}
    >
      <SectionHeader eyebrow="Repository" title="Shared past exam papers" description="Students, tutors, and admins can browse this paper library and upload new papers with an optional memorandum." />
      <div className="grid gap-6 xl:grid-cols-[1fr_0.95fr]">
        <div className="space-y-4">
          {papers.map((paper) => (
            <div key={paper.id} className="panel p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-950">{paper.subject} • {paper.grade}</h3>
                  <p className="mt-1 text-sm text-slate-500">{paper.region} • {paper.month} {paper.year}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-slate-600">{paper.region}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-3 text-sm">
                <a className="btn-secondary" href={paper.paperUrl} target="_blank" rel="noreferrer">Open paper</a>
                {paper.memoUrl ? <a className="btn-secondary" href={paper.memoUrl} target="_blank" rel="noreferrer">Open memo</a> : <span className="rounded-full bg-slate-50 px-3 py-2 text-slate-500">No memo uploaded</span>}
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="panel grid gap-4 p-6 md:grid-cols-2">
          <div className="md:col-span-2">
            <h3 className="text-xl font-semibold text-slate-950">Add past exam paper</h3>
            <p className="mt-2 text-sm text-slate-500">All users can upload papers. The app checks for duplicates before saving.</p>
          </div>
          <label>
            <span className="label">Region</span>
            <select className="input" value={form.region} onChange={handleChange('region')}>
              {REGIONS.map((region) => <option key={region}>{region}</option>)}
            </select>
          </label>
          <label>
            <span className="label">Subject</span>
            <input className="input" value={form.subject} onChange={handleChange('subject')} />
          </label>
          <label>
            <span className="label">Grade</span>
            <select className="input" value={form.grade} onChange={handleChange('grade')}>
              {SOUTH_AFRICAN_GRADES.map((grade) => <option key={grade}>{grade}</option>)}
            </select>
          </label>
          <label>
            <span className="label">Year</span>
            <input type="number" className="input" value={form.year} onChange={handleChange('year')} min="2000" max="2100" />
          </label>
          <label>
            <span className="label">Month</span>
            <select className="input" value={form.month} onChange={handleChange('month')}>
              {PAPER_MONTHS.map((month) => <option key={month}>{month}</option>)}
            </select>
          </label>
          <label className="md:col-span-2">
            <span className="label">Actual paper document</span>
            <input type="file" className="input" onChange={handleChange('paperFile')} accept=".pdf,.doc,.docx,image/*" required />
          </label>
          <label className="md:col-span-2">
            <span className="label">Memorandum document (optional)</span>
            <input type="file" className="input" onChange={handleChange('memoFile')} accept=".pdf,.doc,.docx,image/*" />
          </label>
          <label className="md:col-span-2">
            <span className="label">Notes</span>
            <textarea className="input min-h-28" value={form.notes} onChange={handleChange('notes')} />
          </label>
          <div className="md:col-span-2">
            <button type="submit" className="btn-primary w-full">Save past paper</button>
            {status ? <p className="mt-3 text-sm text-slate-600">{status}</p> : null}
          </div>
        </form>
      </div>
    </AppShell>
  );
};
