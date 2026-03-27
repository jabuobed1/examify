import { getGenerativeModel } from 'firebase/ai';
import { ai, firebaseAiModel, isFirebaseConfigured } from '../firebase/config';

const stripCodeFence = (text = '') =>
  String(text)
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

const extractJsonObject = (text = '') => {
  const trimmed = String(text).trim();

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return trimmed;
  }

  return trimmed.slice(firstBrace, lastBrace + 1);
};

const getFallbackRecommendations = (payload = {}) => {
  const assignmentDates = Array.isArray(payload.assignmentDates) && payload.assignmentDates.length
    ? payload.assignmentDates
    : [new Date().toISOString().slice(0, 10)];
  const topics = Array.isArray(payload.completedTopics) ? payload.completedTopics.filter(Boolean) : [];
  const titleForTopics = topics.length ? topics.slice(0, 3).map((topic, index) => `${index + 1}.1`).join(' | ') : '1.1';

  return {
    recommendations: assignmentDates.map((assignmentDate) => ({
      title: titleForTopics,
      topic: topics.length ? topics.slice(0, 3).join(' | ') : 'Tutor-completed Mathematics topic',
      reason: `AI recommendations are temporarily unavailable, so Examify is showing a safe fallback recommendation state for ${assignmentDate}.`,
      sourceLabel: 'Retry after confirming AI recommendations are enabled for this project.',
      instruction: `Complete the referenced question number(s) for ${assignmentDate}.`,
      assignmentDate,
      questionReferences: titleForTopics.split('|').map((item) => item.trim()),
      topicBreakdown: topics.slice(0, 3).map((topic, topicIndex) => ({
        topic,
        questionReference: `${topicIndex + 1}.1`,
      })),
      paperIdsUsed: Array.isArray(payload.selectedPaperIds) ? payload.selectedPaperIds.slice(0, 2) : [],
    })),
    source: 'fallback',
  };
};

const normalizeRecommendations = (parsed, payload = {}) => {
  const recommendations = Array.isArray(parsed?.recommendations)
    ? parsed.recommendations
    : [];

  const allowedTopics = new Set((payload.completedTopics || []).map((topic) => String(topic).trim()).filter(Boolean));
  const maxQuestions = Number(payload.maxQuestionsPerDay || 1);

  return {
    recommendations: recommendations.map((item, index) => {
      const normalizedBreakdown = Array.isArray(item?.topicBreakdown)
        ? item.topicBreakdown
            .map((entry) => ({
              topic: String(entry?.topic || '').trim(),
              questionReference: String(entry?.questionReference || entry?.reference || '').trim(),
            }))
            .filter((entry) => entry.topic && entry.questionReference && allowedTopics.has(entry.topic))
        : [];

      const fallbackTopic = (payload.completedTopics || []).find(Boolean) || 'Mathematics topic';
      const topicBreakdown = normalizedBreakdown.length
        ? normalizedBreakdown.slice(0, maxQuestions)
        : [{ topic: fallbackTopic, questionReference: '1.1' }];

      const questionReferences = topicBreakdown.map((entry) => entry.questionReference).slice(0, maxQuestions);

      return {
        title: questionReferences.join(' | ') || item?.title || `Recommendation ${index + 1}`,
        topic: topicBreakdown.map((entry) => entry.topic).join(' | '),
        reason: item?.reason || 'No reason provided.',
        sourceLabel: item?.sourceLabel || 'AI recommendation',
        instruction: item?.instruction || item?.reason || 'Complete the referenced question(s).',
        assignmentDate: item?.assignmentDate || payload.assignmentDates?.[index] || null,
        questionReferences,
        topicBreakdown,
        paperIdsUsed: Array.isArray(item?.paperIdsUsed)
          ? item.paperIdsUsed.filter(Boolean).slice(0, 2)
          : Array.isArray(payload.selectedPaperIds)
            ? payload.selectedPaperIds.slice(0, 2)
            : [],
      };
    }),
    source: 'firebase-ai-logic',
  };
};

const buildPrompt = ({
  grade,
  region,
  completedTopics = [],
  tutorReports = [],
  pastMarks = [],
  questionPaperMetadata = [],
  tutorNotes = '',
  mode = 'initial',
  assignmentDates = [],
  selectedPapers = [],
  selectedPaperIds = [],
  maxQuestionsPerDay = 1,
  questionPlanRules = {},
  lessonHistory = [],
  understandingByTopic = [],
  previousGenerationSummaries = [],
} = {}) => `
You are Examify's Mathematics exercise recommendation assistant for South African grades.

Business rules:
- Recommend Mathematics only.
- Recommend exercises only from tutor-completed topics.
- Prefer references to question papers and question numbers instead of rewriting full question text.
- Consider grade, region, tutor reports, tutor notes, question paper metadata, and past marks.
- Return strict JSON with a top-level key called "recommendations".
- Each recommendation must include: title, topic, reason, sourceLabel, instruction, assignmentDate, questionReferences, topicBreakdown, paperIdsUsed.
- Return only valid JSON.
- Use double quotes for all property names and string values.
- Do not include markdown.
- Do not include code fences.
- Do not include comments.
- Do not include trailing commas.
- Do not include any explanation before or after the JSON.

Example format:
{
  "recommendations": [
    {
      "title": "1.1 | 2.3.4",
      "topic": "Probability | Geometry",
      "reason": "Probability and Geometry are tutor-completed topics selected for this day.",
      "sourceLabel": "2023 Gauteng June Paper, Q1.1; 2022 National November Paper, Q2.3.4",
      "instruction": "Answer the exact referenced question numbers only.",
      "assignmentDate": "2026-03-24",
      "questionReferences": ["1.1", "2.3.4"],
      "topicBreakdown": [
        { "topic": "Probability", "questionReference": "1.1" },
        { "topic": "Geometry", "questionReference": "2.3.4" }
      ],
      "paperIdsUsed": ["paper-a", "paper-b"]
    }
  ]
}

Student grade: ${grade ?? 'Unknown'}
Region: ${region ?? 'Unknown'}
Generation mode: ${mode}
Completed topics: ${JSON.stringify(completedTopics)}
Tutor reports: ${JSON.stringify(tutorReports)}
Tutor notes: ${tutorNotes}
Past marks: ${JSON.stringify(pastMarks)}
Question paper metadata: ${JSON.stringify(questionPaperMetadata)}
Assignment dates to schedule: ${JSON.stringify(assignmentDates)}
Selected source papers: ${JSON.stringify(selectedPapers)}
Selected source paper ids: ${JSON.stringify(selectedPaperIds)}
Lesson history with understanding: ${JSON.stringify(lessonHistory)}
Understanding by topic: ${JSON.stringify(understandingByTopic)}
Recent generation summaries to avoid repeating source papers: ${JSON.stringify(previousGenerationSummaries)}
Question-plan rules: ${JSON.stringify(questionPlanRules)}
Maximum question references per day: ${maxQuestionsPerDay}

Additional mandatory generation rules:
- The title must be only the question reference numbers joined by " | " when there are multiple references.
- Never use topic names in the title.
- Return exactly one recommendation object per assignment date.
- Each question reference must belong to a tutor-completed topic, and every topic in topicBreakdown MUST be one of Completed topics exactly (case-sensitive).
- For initial mode, return exactly one question reference per covered topic for that day, without ranges like "1.1.3 - 1.1.5".
- For weekly mode, never exceed the provided maximum question references per day.
- For weekly mode, question references on the same day must come from different topics.
- When more than three topics are available, bias selections toward higher understanding topics, while still occasionally including lower understanding topics.
- Only use the selected source papers and include only those ids in paperIdsUsed.
- NEVER REPEAT the same question for different assignments dates, unless the number total number of questions in the given past papers is not enough or is less than 7.
- An Exercise generation can have multiple papers references, for example assignedment date 1 from paper A and assignment date 2 paper B, this will give you multiple options to work with.
`;

export const recommendExercises = async (payload = {}) => {
  console.log('[Examify][AI] recommendExercises:start', payload);

  if (!isFirebaseConfigured) {
    return getFallbackRecommendations(payload);
  }

  try {
    if (!ai) {
      console.log('[Examify][AI] recommendExercises:fallback:no-ai-instance');
      return getFallbackRecommendations(payload);
    }

    const model = getGenerativeModel(ai, {
      model: firebaseAiModel,
    });

    const result = await model.generateContent(buildPrompt(payload));
    const rawText = result?.response?.text?.() ?? '';
    const strippedText = stripCodeFence(rawText);
    const jsonText = extractJsonObject(strippedText);

    console.log('[Examify][AI] recommendExercises:rawText', rawText);
    console.log('[Examify][AI] recommendExercises:jsonText', jsonText);

    const parsed = JSON.parse(jsonText);

    if (!parsed || !Array.isArray(parsed.recommendations)) {
      throw new Error('Invalid AI response format: recommendations array missing.');
    }

    const response = normalizeRecommendations(parsed, payload);
    console.log('[Examify][AI] recommendExercises:success', response);
    return response;
  } catch (error) {
    console.error('[Examify][AI] recommendExercises:error', error);
    return getFallbackRecommendations(payload);
  }
};
