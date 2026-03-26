# Examify architecture

## Frontend
- React + Vite + Tailwind CSS.
- React Router controls the landing page, auth flows, and role-based workspaces.
- Firebase client SDK handles authentication, Firestore, Storage, and callable functions.
- Demo-mode fallbacks keep the app runnable before credentials are configured.

## Backend
- Firebase Cloud Functions provide secure Paystack initialization, verification, and stored-authorization charging.
- Firebase AI Logic provides Gemini-powered exercise recommendations from the web app through the shared Firebase client configuration.
- Firestore stores users, tutor assignments, covered topics, question papers, subscriptions, payments, submissions, tutor reports, and peer reviews.
- Firebase Storage stores uploaded image submissions.

## Key business rules implemented
- Maths-only positioning is reflected across landing copy, role flows, and backend metadata.
- Students can access only today's exercise for completion; missed work is locked and upcoming work is unavailable.
- Tutors can record covered topics and reports.
- A tutor-to-student assignment check prevents more than one active Maths tutor relationship.
- Subscription quotes derive from the latest mark and session type.
- Gemini recommendations are architected to use grade, region, completed topics, tutor reports, past marks, and question paper metadata.
