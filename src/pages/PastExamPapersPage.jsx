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

const normalizeName = (value = '') =>
  String(value)
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const detectProvinceFromText = (text = '') => {
  const normalizedText = normalizeName(text);
  return REGIONS.find((region) => normalizeName(region) !== 'national' && normalizedText.includes(normalizeName(region))) || REGIONS[0];
};

const detectGradeFromText = (text = '') => {
  const gradeMatch = normalizeName(text).match(/grade\s*(\d{1,2})/i);
  if (!gradeMatch) return SOUTH_AFRICAN_GRADES[1];
  const detected = `Grade ${gradeMatch[1]}`;
  return SOUTH_AFRICAN_GRADES.includes(detected) ? detected : SOUTH_AFRICAN_GRADES[1];
};

const detectPaperNumberFromText = (text = '') => {
  const normalizedText = normalizeName(text);
  if (/\bp\s*1\b/i.test(normalizedText)) return 'P1';
  if (/\bp\s*2\b/i.test(normalizedText)) return 'P2';
  if (/\bp\s*3\b/i.test(normalizedText)) return 'P3';
  return 'Non';
};

const detectCurriculumFromText = (text = '') => {
  const normalizedText = normalizeName(text);
  if (normalizedText.includes('ieb')) return 'IEB';
  if (normalizedText.includes('caps')) return 'CAPS';
  return CURRICULUMS[0];
};

const detectYearFromText = (text = '') => {
  const yearMatch = normalizeName(text).match(/\b(20\d{2})\b/);
  return yearMatch ? Number(yearMatch[1]) : new Date().getFullYear();
};

const detectMonthFromText = (text = '') => {
  const normalizedText = normalizeName(text);
  return PAPER_MONTHS.find((month) => normalizedText.includes(month.toLowerCase())) || PAPER_MONTHS[0];
};

const extractBulkPaperMetadata = (file) => {
  const baseName = String(file?.name || '').replace(/\.[^/.]+$/, '');
  const province = detectProvinceFromText(baseName);

  return {
    grade: detectGradeFromText(baseName),
    subject: SUBJECT,
    province,
    region: province,
    paperNumber: detectPaperNumberFromText(baseName),
    curriculum: detectCurriculumFromText(baseName),
    year: detectYearFromText(baseName),
    month: detectMonthFromText(baseName),
    source: 'Manual Upload',
    sourceWebsite: '',
    notes: '',
  };
};

export const PastExamPapersPage = () => {
  const { profile, logout } = useAuth();
  const [papers, setPapers] = useState([]);
  const [status, setStatus] = useState('');
  const [searchStatus, setSearchStatus] = useState('');
  const [savingDraft, setSavingDraft] = useState(false);
  const [searching, setSearching] = useState(false);
  const [draft, setDraft] = useState(null);
  const [bulkRows, setBulkRows] = useState([]);
  const [savingRows, setSavingRows] = useState({});
  const [bulkSaving, setBulkSaving] = useState(false);

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

  const handleSearchChange = (key) => (event) => {
    const value = event.target.value;
    setSearchForm((current) => ({ ...current, [key]: key === 'year' ? Number(value) : value }));
  };

  const updateBulkRow = (rowId, key, value) => {
    setBulkRows((current) => current.map((row) => (row.id === rowId ? { ...row, [key]: value } : row)));
  };

  const markBulkRowState = (rowId, payload = {}) => {
    setBulkRows((current) => current.map((row) => (row.id === rowId ? { ...row, ...payload } : row)));
  };

  const handleBulkFilesChange = (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) {
      setStatus('Please select at least one paper document.');
      return;
    }

    const newRows = files.map((file, index) => ({
      id: `${Date.now()}-${index}-${file.name}`,
      file,
      fileName: file.name,
      saveState: 'pending',
      saveMessage: '',
      ...extractBulkPaperMetadata(file),
    }));

    setBulkRows((current) => [...newRows, ...current]);
    setStatus(`${files.length} paper(s) loaded. Review fields and save individually or in bulk.`);
    event.target.value = '';
  };

  const persistBulkRow = async (row) => {
    if (!row?.file) throw new Error('No paper file found for this row.');

    const uploads = await uploadQuestionPaperDocuments({
      paperFile: row.file,
      memoFile: null,
      uploaderId: profile?.uid ?? 'anonymous',
    });

    const saved = await saveQuestionPaper({
      grade: row.grade,
      region: row.province,
      province: row.province,
      subject: row.subject || SUBJECT,
      curriculum: row.curriculum,
      year: Number(row.year),
      month: row.month,
      paperNumber: row.paperNumber,
      notes: row.notes,
      source: row.source,
      sourceWebsite: row.sourceWebsite,
      paperUrl: uploads.paperUrl,
      memoUrl: '',
      paperFileName: uploads.paperFileName,
      memoFileName: '',
      createdBy: profile?.uid ?? 'unknown',
    });

    return saved;
  };

  const handleSaveBulkRow = async (rowId) => {
    const row = bulkRows.find((item) => item.id === rowId);
    if (!row || row.saveState === 'saved') return false;

    setSavingRows((current) => ({ ...current, [rowId]: true }));
    markBulkRowState(rowId, { saveState: 'saving', saveMessage: 'Saving...' });

    try {
      const saved = await persistBulkRow(row);
      setPapers((current) => [saved, ...current]);
      markBulkRowState(rowId, { saveState: 'saved', saveMessage: 'Saved successfully.' });
      setStatus('Paper saved successfully.');
      return true;
    } catch (error) {
      markBulkRowState(rowId, { saveState: 'error', saveMessage: error.message || 'Failed to save this paper.' });
      setStatus(error.message || 'Failed to save one or more papers.');
      return false;
    } finally {
      setSavingRows((current) => ({ ...current, [rowId]: false }));
    }
  };

  const handleSaveAllBulkRows = async () => {
    const pendingRows = bulkRows.filter((row) => row.saveState !== 'saved');
    if (!pendingRows.length) {
      setStatus('All loaded papers are already saved.');
      return;
    }

    setBulkSaving(true);
    setStatus(`Saving ${pendingRows.length} paper(s)...`);

    let successCount = 0;
    for (const row of pendingRows) {
      const wasSaved = await handleSaveBulkRow(row.id);
      if (wasSaved) successCount += 1;
    }

    setStatus(`Bulk save completed. ${successCount} of ${pendingRows.length} paper(s) saved.`);
    setBulkSaving(false);
  };

  const handleRemoveBulkRow = (rowId) => {
    setBulkRows((current) => current.filter((row) => row.id !== rowId));
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
        <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
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

          <div className="panel space-y-4 p-6">
            <div>
              <h3 className="text-xl font-semibold text-slate-950">Bulk upload past exam papers</h3>
              <p className="mt-2 text-sm text-slate-500">Upload multiple paper files once. Examify extracts fields locally from each filename, lets you edit, then save one-by-one or all together.</p>
            </div>
            <label>
              <span className="label">Paper documents (multiple)</span>
              <input type="file" multiple className="input" accept=".pdf,.doc,.docx,image/*" onChange={handleBulkFilesChange} />
            </label>
            <div className="flex flex-wrap gap-3">
              <button type="button" className="btn-primary" onClick={handleSaveAllBulkRows} disabled={bulkSaving || !bulkRows.length}>
                {bulkSaving ? 'Saving all...' : 'Save all loaded papers'}
              </button>
            </div>
            {status ? <p className="text-sm text-slate-600">{status}</p> : null}

            {bulkRows.length ? (
              <div className="space-y-4">
                {bulkRows.map((row) => (
                  <div key={row.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-900">{row.fileName}</p>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${row.saveState === 'saved' ? 'bg-emerald-100 text-emerald-700' : row.saveState === 'error' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-700'}`}>
                        {row.saveState === 'saved' ? 'Saved' : row.saveState === 'error' ? 'Error' : 'Pending'}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <label>
                        <span className="label">Grade</span>
                        <select className="input" value={row.grade} onChange={(event) => updateBulkRow(row.id, 'grade', event.target.value)}>
                          {SOUTH_AFRICAN_GRADES.filter((grade) => grade !== 'Select Grade').map((grade) => <option key={grade}>{grade}</option>)}
                        </select>
                      </label>
                      <label>
                        <span className="label">Subject</span>
                        <input className="input" value={row.subject} onChange={(event) => updateBulkRow(row.id, 'subject', event.target.value)} />
                      </label>
                      <label>
                        <span className="label">Province</span>
                        <select className="input" value={row.province} onChange={(event) => updateBulkRow(row.id, 'province', event.target.value)}>
                          {REGIONS.map((region) => <option key={region}>{region}</option>)}
                        </select>
                      </label>
                      <label>
                        <span className="label">Paper number</span>
                        <select className="input" value={row.paperNumber} onChange={(event) => updateBulkRow(row.id, 'paperNumber', event.target.value)}>
                          {PAPER_NUMBERS.map((item) => <option key={item}>{item}</option>)}
                        </select>
                      </label>
                      <label>
                        <span className="label">Curriculum</span>
                        <select className="input" value={row.curriculum} onChange={(event) => updateBulkRow(row.id, 'curriculum', event.target.value)}>
                          {CURRICULUMS.map((item) => <option key={item}>{item}</option>)}
                        </select>
                      </label>
                      <label>
                        <span className="label">Year</span>
                        <input type="number" min="2000" max="2100" className="input" value={row.year} onChange={(event) => updateBulkRow(row.id, 'year', Number(event.target.value))} />
                      </label>
                      <label>
                        <span className="label">Month</span>
                        <select className="input" value={row.month} onChange={(event) => updateBulkRow(row.id, 'month', event.target.value)}>
                          {PAPER_MONTHS.map((month) => <option key={month}>{month}</option>)}
                        </select>
                      </label>
                      <label>
                        <span className="label">Source</span>
                        <input className="input" value={row.source} onChange={(event) => updateBulkRow(row.id, 'source', event.target.value)} />
                      </label>
                      <label className="md:col-span-2">
                        <span className="label">Source website</span>
                        <input className="input" value={row.sourceWebsite} placeholder="https://..." onChange={(event) => updateBulkRow(row.id, 'sourceWebsite', event.target.value)} />
                      </label>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button type="button" className="btn-primary" disabled={savingRows[row.id] || row.saveState === 'saved'} onClick={() => handleSaveBulkRow(row.id)}>
                        {savingRows[row.id] ? 'Saving...' : row.saveState === 'saved' ? 'Saved' : 'Save this paper'}
                      </button>
                      <button type="button" className="btn-secondary" onClick={() => handleRemoveBulkRow(row.id)}>
                        Remove from list
                      </button>
                    </div>
                    {row.saveMessage ? <p className="mt-2 text-sm text-slate-600">{row.saveMessage}</p> : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No bulk papers loaded yet.</p>
            )}
          </div>
        </div>

        {isTutor ? (
          <div className="panel grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-5">
            <div className="md:col-span-2 xl:col-span-5">
              <h3 className="text-xl font-semibold text-slate-950">Tutor AI paper search</h3>
              <p className="mt-2 text-sm text-slate-500">Temporarily moved to the bottom while manual bulk uploading is prioritised.</p>
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
      </div>
    </AppShell>
  );
};
