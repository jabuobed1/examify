import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, isFirebaseConfigured, storage } from '../firebase/config';

const uploadFile = async ({ file, path }) => {
  const storageRef = ref(storage, `${path}/${Date.now()}-${file.name}`);
  await uploadBytes(storageRef, file, { contentType: file.type });
  const url = await getDownloadURL(storageRef);
  return { 
    fileName: file.name, 
    url,
  };
};

export const uploadSubmissionImage = async ({ file, studentId, exerciseId }) => {
  if (!isFirebaseConfigured) {
    return {
      submittedFileName: file?.name ?? 'demo-upload.jpg',
      submittedImageUrl: URL.createObjectURL(file),
      exerciseId: 'mock-id',
    };
  }

  try {
    const upload = await uploadFile({ file, path: `submissions/${studentId}/${exerciseId}` });
    const exerciseRef = doc(db, "dailyExerciseAssignments", exerciseId);
    await updateDoc(exerciseRef, {
      studentId,
      exerciseId,
      submittedImageUrl: upload.url,
      submittedFileName: upload.fileName,
      updatedAt: serverTimestamp(),
      submitted: "Yes",
      peerReviewed: "No",
      peerReviewStatus: "pending",
      peerNotes: "",
      peerReviewDate: null,
    });
    return { 
      submittedFileName: upload.fileName, 
      submittedImageUrl: upload.url, 
      exerciseId: exerciseId 
    };
  } catch (error) {
    console.error("Upload/Update failed:", error);
    throw error;
  }
};

export const uploadPeerReviewImage = async ({ file, studentId, exerciseId }) => {
  if (!isFirebaseConfigured) {
    return {
      fileName: file?.name ?? 'demo-review.png',
      url: URL.createObjectURL(file),
    };
  }

  try {
    const upload = await uploadFile({ file, path: `submissions/${studentId}/${exerciseId}` });
    return { 
      fileName: upload.fileName, 
      url: upload.url 
    };
  } catch (error) {
    console.error("Review upload failed:", error);
    throw error;
  }
};

export const getUreviewedExercises = async (studentId) => {
  if (!isFirebaseConfigured) return [];

  const now = new Date();
  const todayLocal = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

  const q = query(
    collection(db, "dailyExerciseAssignments"),
    where("assignmentDate", "==", todayLocal),
    where("submittedImageUrl", "!=", ""),
    orderBy("assignmentDate", "asc"),
  );
  const querySnapshot = await getDocs(q);

  return querySnapshot.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .filter((item) =>
      item.studentId !== studentId &&
      item.peerReviewed !== "Yes" &&
      item.peerReviewStatus !== "pending"
    );
};

export const uploadQuestionPaperDocuments = async ({ paperFile, memoFile, uploaderId }) => {
  if (!isFirebaseConfigured) {
    return {
      paperUrl: paperFile ? URL.createObjectURL(paperFile) : '',
      memoUrl: memoFile ? URL.createObjectURL(memoFile) : '',
      paperFileName: paperFile?.name ?? '',
      memoFileName: memoFile?.name ?? '',
    };
  }

  const paperUpload = paperFile ? await uploadFile({ file: paperFile, path: `questionPapers/${uploaderId}/paper` }) : null;
  const memoUpload = memoFile ? await uploadFile({ file: memoFile, path: `questionPapers/${uploaderId}/memo` }) : null;

  return {
    paperUrl: paperUpload?.url ?? '',
    memoUrl: memoUpload?.url ?? '',
    paperFileName: paperUpload?.fileName ?? '',
    memoFileName: memoUpload?.fileName ?? '',
  };
};
