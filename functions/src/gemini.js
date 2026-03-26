import { GoogleGenerativeAI } from '@google/generative-ai';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { functionConfig } from './config.js';

const buildPrompt = ({ grade, region, completedTopics = [], tutorReports = [], pastMarks = [], questionPaperMetadata = [] }) => `
You are helping Examify recommend Mathematics-only exercises for South African students.

Rules:
- Only recommend Mathematics exercises.
- Only use topics already completed by the tutor.
- Reference question papers by metadata and question numbers when possible.
- Keep to South African school context for ${grade} in ${region}.
- Consider tutor reports, past marks, and paper metadata.
- Return JSON with a top-level key "recommendations".

Completed topics: ${JSON.stringify(completedTopics)}
Tutor reports: ${JSON.stringify(tutorReports)}
Past marks: ${JSON.stringify(pastMarks)}
Question paper metadata: ${JSON.stringify(questionPaperMetadata)}
`;

export const generateExerciseRecommendations = onCall(async (request) => {
  if (!functionConfig.geminiApiKey) {
    return {
      recommendations: [
        {
          title: 'Demo factorisation recommendation',
          topic: request.data?.completedTopics?.[0] ?? 'Tutor-completed topic required',
          reason: 'Gemini API key is not configured yet, so this deterministic fallback is returned.',
          sourceLabel: 'Attach a live paper reference after configuring Gemini.',
        },
      ],
      source: 'fallback',
    };
  }

  try {
    const client = new GoogleGenerativeAI(functionConfig.geminiApiKey);
    const model = client.getGenerativeModel({ model: functionConfig.geminiModel });
    const result = await model.generateContent(buildPrompt(request.data ?? {}));
    const text = result.response.text();
    const parsed = JSON.parse(text);
    return parsed;
  } catch (error) {
    throw new HttpsError('internal', `Gemini recommendation failed: ${error.message}`);
  }
});
