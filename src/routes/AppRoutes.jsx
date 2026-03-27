import { Navigate, Route, Routes } from 'react-router-dom';
import { MarketingLayout } from '../layouts/MarketingLayout';
import { ProtectedRoute } from '../components/common/ProtectedRoute';
import { LandingPage } from '../pages/LandingPage';
import { LoginPage } from '../pages/auth/LoginPage';
import { SignupPage } from '../pages/auth/SignupPage';
import { StudentDashboardPage } from '../pages/student/StudentDashboardPage';
import { StudentExercisesPage } from '../pages/student/StudentExercisesPage';
import { StudentPeerReviewsPage } from '../pages/student/StudentPeerReviewsPage';
import { StudentBillingPage } from '../pages/student/StudentBillingPage';
import { StudentProfilePage } from '../pages/student/StudentProfilePage';
import { StudentLessonsPage } from '../pages/student/StudentLessonsPage';
import { StudentAssessmentResultPage } from '../pages/student/StudentAssessmentResultPage';
import { TutorDashboardPage } from '../pages/tutor/TutorDashboardPage';
import { TutorStudentsPage } from '../pages/tutor/TutorStudentsPage';
import { TutorReportsPage } from '../pages/tutor/TutorReportsPage';
import { TutorStudentDetailPage } from '../pages/tutor/TutorStudentDetailPage';
import { TutorAssessmentResultPage } from '../pages/tutor/TutorAssessmentResultPage';
import { TutorProfilePage } from '../pages/tutor/TutorProfilePage';
import { AdminDashboardPage } from '../pages/admin/AdminDashboardPage';
import { AdminUsersPage } from '../pages/admin/AdminUsersPage';
import { AdminPaymentsPage } from '../pages/admin/AdminPaymentsPage';
import { AdminSettingsPage } from '../pages/admin/AdminSettingsPage';
import { PastExamPapersPage } from '../pages/PastExamPapersPage';
import { GuidePage } from '../pages/GuidePage';
import { ROLES } from '../lib/constants';
import { PoliciesPage } from '../pages/PoliciesPage';
import { ParentDashboardPage } from '../pages/parent/ParentDashboardPage';
import { ParentStudentDetailPage } from '../pages/parent/ParentStudentDetailPage';
import { ParentAssessmentResultPage } from '../pages/parent/ParentAssessmentResultPage';
import { ParentProfilePage } from '../pages/parent/ParentProfilePage';

export const AppRoutes = () => (
  <Routes>
    <Route element={<MarketingLayout />}>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/policies" element={<PoliciesPage />} />
    </Route>

    <Route element={<ProtectedRoute allowedRoles={[ROLES.STUDENT]} />}>
      <Route path="/student" element={<StudentDashboardPage />} />
      <Route path="/student/exercises" element={<StudentExercisesPage />} />
      <Route path="/student/peer-reviews" element={<StudentPeerReviewsPage />} />
      <Route path="/student/billing" element={<StudentBillingPage />} />
      <Route path="/student/profile" element={<StudentProfilePage />} />
      <Route path="/student/lessons" element={<StudentLessonsPage />} />
      <Route path="/student/assessment/:assessmentId" element={<StudentAssessmentResultPage />} />
      <Route path="/student/papers" element={<PastExamPapersPage />} />
      <Route path="/student/guide" element={<GuidePage role="student" />} />
      <Route path="/policies" element={<PoliciesPage />} />
    </Route>

    <Route element={<ProtectedRoute allowedRoles={[ROLES.PARENT]} />}>
      <Route path="/parent" element={<ParentDashboardPage />} />
      <Route path="/parent/student/:studentId" element={<ParentStudentDetailPage />} />
      <Route path="/parent/student/:studentId/assessment/:assessmentId" element={<ParentAssessmentResultPage />} />
      <Route path="/parent/profile" element={<ParentProfilePage />} />
      <Route path="/policies" element={<PoliciesPage />} />
    </Route>

    <Route element={<ProtectedRoute allowedRoles={[ROLES.TUTOR]} />}>
      <Route path="/tutor" element={<TutorDashboardPage />} />
      <Route path="/tutor/students" element={<TutorStudentsPage />} />
      <Route path="/tutor/papers" element={<PastExamPapersPage />} />
      <Route path="/tutor/reports" element={<TutorReportsPage />} />
      <Route path="/tutor/student/:studentId" element={<TutorStudentDetailPage />} />
      <Route path="/tutor/student/:studentId/assessment/:assessmentId" element={<TutorAssessmentResultPage />} />
      <Route path="/tutor/profile" element={<TutorProfilePage />} />
      <Route path="/tutor/guide" element={<GuidePage role="tutor" />} />
      <Route path="/policies" element={<PoliciesPage />} />
    </Route>

    <Route element={<ProtectedRoute allowedRoles={[ROLES.ADMIN]} />}>
      <Route path="/admin" element={<AdminDashboardPage />} />
      <Route path="/admin/users" element={<AdminUsersPage />} />
      <Route path="/admin/payments" element={<AdminPaymentsPage />} />
      <Route path="/admin/settings" element={<AdminSettingsPage />} />
      <Route path="/admin/papers" element={<PastExamPapersPage />} />
      <Route path="/policies" element={<PoliciesPage />} />
    </Route>

    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);
