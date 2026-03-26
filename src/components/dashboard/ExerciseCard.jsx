import { CalendarDays, Lock, FileText } from 'lucide-react';
import { useState, useEffect } from 'react';
import { SubmissionUpload } from './SubmissionUpload';
import { uploadSubmissionImage, uploadPeerReviewImage } from '../../services/storageService';
import { canSubmitPeerReview } from '../../utils/exerciseRules';
import { getQuestionPapersByIds } from '../../services/firestoreService';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { MarkingCanvas as ImageEditor } from '../canvas/pictureEditorCanvas';

export const ExerciseCard = ({ exercise, availability, paymentLocked, studentId, dashboard }) => {
  const [openingPapers, setOpeningPapers] = useState(false);
  const [unreviewedExercises, setUnreviewedExercises] = useState([]);
  const [reviewingItem, setReviewingItem] = useState(null);
  
  const handleOpenPapers = async () => {
    if (!exercise?.paperIds?.length) return;
    setOpeningPapers(true);
    try {
      const papers = await getQuestionPapersByIds(exercise.paperIds);
      papers.forEach((paper) => {
        if (paper.paperUrl) {
          window.open(paper.paperUrl, '_blank');
        }
      });
    } catch (error) {
      console.error('Failed to open papers:', error);
    } finally {
      setOpeningPapers(false);
    }
  };

  const handleSaveReview = async (file) => {
    if (!reviewingItem) return;

    try {
      // Rename the file
      const originalName = reviewingItem.submittedFileName || 'submission.png';
      const reviewFileName = originalName.replace(/\.[^/.]+$/, '-review.png');
      const renamedFile = new File([file], reviewFileName, { type: file.type });

      // Upload reviewed image
      const upload = await uploadPeerReviewImage({ file: renamedFile, studentId: reviewingItem.studentId, exerciseId: reviewingItem.id });

      // Update the reviewed exercise document
      const exerciseRef = doc(db, "dailyExerciseAssignments", reviewingItem.id);
      await updateDoc(exerciseRef, {
        submittedReviewImageUrl: upload.url,
        submittedReviewFileName: upload.fileName,
        peerReviewed: "Yes",
        peerReviewStatus: "completed",
        peerReviewDate: serverTimestamp(),
      });

      setReviewingItem(null); // Close editor
    } catch (error) {
      console.error('Failed to save review:', error);
    }
  };

  useEffect(() => {
    if (!exercise.submittedImageUrl) {
      setUnreviewedExercises([]);
      return;
    }

    const now = new Date();
    const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const q = query(
      collection(db, "dailyExerciseAssignments"),
      where("assignmentDate", "==", todayLocal),
      where("submittedImageUrl", "!=", ""),
      orderBy("assignmentDate", "asc"),
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const list = querySnapshot.docs
        .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
        .filter((item) =>
          item.studentId !== studentId &&
          item.peerReviewStatus === "pending"
        );
      setUnreviewedExercises(list);
    });

    return unsubscribe;
  }, [exercise.submittedImageUrl, studentId]);

  return (
    <div className="panel p-6 w-full">
      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
        <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 font-semibold text-brand-700">
          <CalendarDays className="h-4 w-4" />
          {exercise.assignmentDate}
        </span>
        <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600">{availability.label}</span>
      </div>
      <h3 className="mt-4 text-2xl font-bold text-slate-950">{exercise.title}</h3>
      <p className="mt-2 text-sm font-semibold text-accent">{exercise.topic}</p>
      <p className="mt-3 text-sm text-slate-500">{exercise.sourceLabel}</p>
      <p className="mt-4 text-sm leading-7 text-slate-600">{exercise.instruction}</p>
      {exercise?.paperIds?.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={handleOpenPapers}
            disabled={openingPapers}
            className="btn-secondary inline-flex items-center gap-2"
          >
            <FileText className="h-4 w-4" />
            {openingPapers ? 'Opening...' : 'View Question Papers'}
          </button>
        </div>
      )}
      <div className="mt-6 flex flex-wrap gap-3">
        {availability.state === 'active' ? (
          exercise.submittedImageUrl !== '' && exercise.submittedFileName !== '' ? (
            <div className="panel flex items-center w-full mb-4 justify-center p-6 text-center text-sm text-slate-500">
              Work submitted ✅.
            </div>
          ) : !paymentLocked && exercise ? (
            <SubmissionUpload
              exerciseId={exercise.id}
              onSubmit={({ file, exerciseId }) => uploadSubmissionImage({ file, exerciseId, studentId })}
              exercise={exercise}
            />
          ) : (
            <div className="panel flex min-h-56 items-center justify-center p-6 text-center text-sm text-slate-500">
              Uploads unlock only after payment is complete and an exercise has been assigned.
            </div>
          )
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-500">
            <Lock className="h-4 w-4" />
            Submission unavailable
          </span>
        )}
      </div>
      <div className="panel space-y-4 p-6 w-full">
        <h3 className="text-xl font-semibold text-slate-950">Mark for Others</h3>
        {unreviewedExercises.length > 0 && (
          <div className="mt-4 space-y-3">
            <h4 className="font-semibold">Choose one To Review</h4>
            {unreviewedExercises.map((item) => (
              <div key={item.id} className="rounded-xl border p-3">
                <p className="text-sm font-medium">{item.exerciseTitle || item.title || "Note exercise"}</p>
                <p className="mt-2 text-sm font-semibold text-accent">Topic: {item.topic}</p>
                {item?.paperIds?.length > 0 && (
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={handleOpenPapers}
                      disabled={openingPapers}
                      className="btn-secondary inline-flex items-center gap-2"
                    >
                      <FileText className="h-4 w-4" />
                      {openingPapers ? 'Opening...' : 'View Paper Used'}
                    </button>
                  </div>
                )}
                <button 
                  onClick={() => setReviewingItem(item)} 
                  className="btn-secondary text-sm mt-4"
                >
                  Mark ✅
                </button>
              </div>
            ))}
          </div>
        )}
        {reviewingItem && (
          <div className="mt-4">
            <h4 className="font-semibold mb-2">Reviewing: {reviewingItem.exerciseTitle || "Exercise"}</h4>
            <ImageEditor 
              imageUrl={reviewingItem.submittedImageUrl} 
              onSave={handleSaveReview} 
            />
            <button 
              onClick={() => setReviewingItem(null)} 
              className="btn-secondary mt-2"
            >
              Cancel Review
            </button>
          </div>
        )}
      </div>
    </div>
  );
};