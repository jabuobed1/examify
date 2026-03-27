import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '../components/common/AppShell';
import { SectionHeader } from '../components/common/SectionHeader';
import { useAuth } from '../hooks/useAuth';
import {
  CURRICULUMS,
  PAPER_MONTHS,
  PAPER_NUMBERS,
  REGIONS,
  ROLES,
  SOUTH_AFRICAN_GRADES,
  SUBJECT,
} from '../lib/constants';
import {
  discardPastPaperFromDraft,
  getAllQuestionPapers,
  getPastPaperSearchDraft,
  runPastPaperAiSearch,
  saveDraftPapersToOfficialCollection,
  saveQuestionPaper,
} from '../services/firestoreService';
import { uploadQuestionPaperDocuments } from '../services/storageService';

const toPaperKey = (paper = {}) => [
  String(paper.subject || '').toLowerCase(),
  String(paper.curriculum || '').toUpperCase(),
  Number(paper.year || 0),
  String(paper.grade || '').toLowerCase(),
  String(paper.province || paper.region || '').toLowerCase(),
  String(paper.paperNumber || '').toUpperCase(),
  String(paper.month || '').toLowerCase(),
].join('|');

export const PastExamPapersPage = () => {
  const { profile, logout } = useAuth();
  const [papers, setPapers] = useState([]);
  const [status, setStatus] = useState('');
  const [searchStatus, setSearchStatus] = useState('');
  const [savingDraft, setSavingDraft] = useState(false);
  const [searching, setSearching] = useState(false);
  const [draft, setDraft] = useState(null);
  const [form, setForm] = useState({
    grade: SOUTH_AFRICAN_GRADES[0],
    region: REGIONS[0],
    subject: SUBJECT,
    year: new Date().getFullYear(),
    month: PAPER_MONTHS[0],
    curriculum: CURRICULUMS[0],
    paperNumber: PAPER_NUMBERS[0],
    notes: '',
    paperFile: null,
    memoFile: null,
    source: '',
    sourceWebsite: '',
    province: REGIONS[0],
  });

  const [searchForm, setSearchForm] = useState({
    subject: SUBJECT,
    curriculum: CURRICULUMS[0],
    year: new Date().getFullYear(),
    grade: SOUTH_AFRICAN_GRADES[1],
    province: REGIONS[0],
  });

  const role = useMemo(() => profile?.role ?? 'student', [profile]);
  const isTutor = role === ROLES.TUTOR;

  useEffect(() => {
    const load = async () => {
      const result = await getAllQuestionPapers();
      setPapers(result);
    };
    load();
  }, [role]);

  useEffect(() => {
    if (!isTutor || !profile?.uid || !searchForm.grade || searchForm.grade === 'Select Grade') {
      return;
    }

    const loadDraft = async () => {
      const loadedDraft = await getPastPaperSearchDraft({
        tutorId: profile.uid,
        ...searchForm,
      });
      setDraft(loadedDraft);
      if (loadedDraft?.results?.length) {
        setSearchStatus(`Loaded ${loadedDraft.results.length} saved AI result(s) for this search.`);
      }
    };

    loadDraft();
  }, [isTutor, profile?.uid, searchForm]);

  const handleChange = (key) => (event) => {
    const value = key.endsWith('File') ? event.target.files?.[0] ?? null : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSearchChange = (key) => (event) => {
    const value = event.target.value;
    setSearchForm((current) => ({ ...current, [key]: key === 'year' ? Number(value) : value }));
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
        province: form.province || form.region,
        subject: form.subject,
        curriculum: form.curriculum,
        year: Number(form.year),
        month: form.month,
        paperNumber: form.paperNumber,
        notes: form.notes,
        source: form.source,
        sourceWebsite: form.sourceWebsite,
        paperUrl: uploads.paperUrl,
        memoUrl: uploads.memoUrl,
        paperFileName: uploads.paperFileName,
        memoFileName: uploads.memoFileName,
        createdBy: profile?.uid ?? 'unknown',
      });
      setPapers((current) => [saved, ...current]);
      setStatus('Past exam paper saved successfully.');
      setForm((current) => ({
        ...current,
        notes: '',
        paperFile: null,
        memoFile: null,
        source: '',
        sourceWebsite: '',
        year: new Date().getFullYear(),
      }));
      event.target.reset();
    } catch (error) {
      console.error('[Examify][PastPapers] submit:error', error);
      setStatus(error.message);
    }
  };

  const handleAiSearch = async () => {
    if (!profile?.uid) return;
    if (!searchForm.grade || searchForm.grade === 'Select Grade') {
      setSearchStatus('Please select a valid grade before searching.');
      return;
    }

    setSearching(true);
    setSearchStatus('Searching reliable sources via AI and saving temporary results...');

    try {
      const generatedDraft = await runPastPaperAiSearch({
        tutorId: profile.uid,
        filters: searchForm,
      });
      setDraft(generatedDraft);
      if (!generatedDraft?.results?.length) {
        setSearchStatus('No valid paper + memo PDF pairs were returned by AI for this search.');
      } else {
        setSearchStatus(`AI search completed. ${generatedDraft.results.length} result(s) are saved as a temporary draft.`);
      }
    } catch (error) {
      console.error('[Examify][PastPapers] ai-search:error', error);
      setSearchStatus(error.message || 'Failed to run AI search.');
    } finally {
      setSearching(false);
    }
  };

  const handleDiscardDraftPaper = async (paper) => {
    if (!draft?.id) return;

    const paperKey = toPaperKey(paper);
    const nextResults = (draft.results || []).filter((item) => toPaperKey(item) !== paperKey);
    setDraft((current) => ({ ...current, results: nextResults }));

    try {
      await discardPastPaperFromDraft({ draftId: draft.id, paperKey });
      setSearchStatus('Paper removed from temporary AI draft.');
    } catch (error) {
      console.error('[Examify][PastPapers] discard:error', error);
      setSearchStatus('Failed to discard this paper. Please retry.');
    }
  };

  const handleSaveDraftPapers = async () => {
    if (!draft?.id || !profile?.uid) return;

    setSavingDraft(true);
    setSearchStatus('Saving confirmed papers to official collection...');
    try {
      const result = await saveDraftPapersToOfficialCollection({
        draftId: draft.id,
        tutorId: profile.uid,
      });
      if (result.saved.length) {
        setPapers((current) => [...result.saved, ...current]);
      }
      const skippedMessage = result.skipped.length ? ` ${result.skipped.length} duplicate/invalid paper(s) skipped.` : '';
      setSearchStatus(`Saved ${result.saved.length} paper(s) to official collection.${skippedMessage}`);
    } catch (error) {
      console.error('[Examify][PastPapers] save-draft:error', error);
      setSearchStatus(error.message || 'Failed to save draft papers.');
    } finally {
      setSavingDraft(false);
    }
  };

  return (
    <AppShell
      title="Past exam papers"
      subtitle="Browse and add Mathematics past papers. Duplicate papers are blocked by paper identity fields."
      role={role}
      user={profile}
      onLogout={logout}
    >
      <SectionHeader eyebrow="Repository" title="Shared past exam papers" description="Students, tutors, and admins can browse this paper library and upload new papers with an optional memorandum." />
      <div className="space-y-6">
        {isTutor ? (
          <div className="panel grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-5">
            <div className="md:col-span-2 xl:col-span-5">
              <h3 className="text-xl font-semibold text-slate-950">Tutor AI paper search</h3>
              <p className="mt-2 text-sm text-slate-500">Searches reliable websites through AI, excludes existing Firestore papers, stores results in a temporary draft, and lets you confirm before final save (max 20).</p>
            </div>
            <label>
              <span className="label">Subject</span>
              <input className="input" value={searchForm.subject} onChange={handleSearchChange('subject')} />
            </label>
            <label>
              <span className="label">Curriculum</span>
              <select className="input" value={searchForm.curriculum} onChange={handleSearchChange('curriculum')}>
                {CURRICULUMS.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label>
              <span className="label">Year</span>
              <input type="number" min="2000" max="2100" className="input" value={searchForm.year} onChange={handleSearchChange('year')} />
            </label>
            <label>
              <span className="label">Grade</span>
              <select className="input" value={searchForm.grade} onChange={handleSearchChange('grade')}>
                {SOUTH_AFRICAN_GRADES.filter((grade) => grade !== 'Select Grade').map((grade) => <option key={grade}>{grade}</option>)}
              </select>
            </label>
            <label>
              <span className="label">Province</span>
              <select className="input" value={searchForm.province} onChange={handleSearchChange('province')}>
                {REGIONS.map((region) => <option key={region}>{region}</option>)}
              </select>
            </label>
            <div className="md:col-span-2 xl:col-span-5 flex flex-wrap gap-3">
              <button type="button" className="btn-primary" onClick={handleAiSearch} disabled={searching}>
                {searching ? 'Searching...' : 'Search past papers via AI'}
              </button>
              <button type="button" className="btn-secondary" onClick={handleSaveDraftPapers} disabled={savingDraft || !draft?.results?.length}>
                {savingDraft ? 'Saving...' : 'Save papers'}
              </button>
            </div>
            {searchStatus ? <p className="md:col-span-2 xl:col-span-5 text-sm text-slate-600">{searchStatus}</p> : null}
          </div>
        ) : null}

        {isTutor && draft?.results?.length ? (
          <div className="panel p-6">
            <h3 className="text-xl font-semibold text-slate-950">AI search results (temporary draft)</h3>
            <p className="mt-2 text-sm text-slate-500">Review each result before saving to the official paper collection.</p>
            <div className="mt-4 grid gap-4">
              {draft.results.map((paper) => (
                <div key={toPaperKey(paper)} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-slate-900">{paper.subject} • {paper.grade} • {paper.paperNumber}</p>
                      <p className="mt-1 text-sm text-slate-500">{paper.curriculum} • {paper.province || paper.region} • {paper.month} {paper.year}</p>
                      <p className="mt-2 text-xs text-slate-500">Source: {paper.source} • <a className="underline" href={paper.sourceWebsite} target="_blank" rel="noreferrer">{paper.sourceWebsite}</a></p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <a className="btn-secondary" href={paper.paperUrl} target="_blank" rel="noreferrer">Open paper</a>
                      <a className="btn-secondary" href={paper.memoUrl} target="_blank" rel="noreferrer">Open memo</a>
                      <button type="button" className="btn-secondary" onClick={() => handleDiscardDraftPaper(paper)}>Discard</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[1fr_0.95fr]">
          <div className="space-y-4">
            {papers.map((paper) => (
              <div key={paper.id} className="panel p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-950">{paper.subject} • {paper.grade} {paper.paperNumber ? `• ${paper.paperNumber}` : ''}</h3>
                    <p className="mt-1 text-sm text-slate-500">{paper.region || paper.province} • {paper.month} {paper.year} {paper.curriculum ? `• ${paper.curriculum}` : ''}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-slate-600">{paper.region || paper.province}</span>
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
              <span className="label">Curriculum</span>
              <select className="input" value={form.curriculum} onChange={handleChange('curriculum')}>
                {CURRICULUMS.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label>
              <span className="label">Paper Number</span>
              <select className="input" value={form.paperNumber} onChange={handleChange('paperNumber')}>
                {PAPER_NUMBERS.map((item) => <option key={item}>{item}</option>)}
              </select>
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
            <label>
              <span className="label">Source</span>
              <input className="input" value={form.source} onChange={handleChange('source')} placeholder="Department of Basic Education" />
            </label>
            <label className="md:col-span-2">
              <span className="label">Source website</span>
              <input className="input" value={form.sourceWebsite} onChange={handleChange('sourceWebsite')} placeholder="https://..." />
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
      </div>
    </AppShell>
  );
};
