export const ROLES = {
  STUDENT: 'student',
  TUTOR: 'tutor',
  ADMIN: 'admin',
  PARENT: 'parent',
};

export const SUBJECT = 'Mathematics';

export const SOUTH_AFRICAN_GRADES = [
  'Select Grade',
  'Grade 4',
  'Grade 5',
  'Grade 6',
  'Grade 7',
  'Grade 8',
  'Grade 9',
  'Grade 10',
  'Grade 11',
  'Grade 12',
];

export const PAPER_MONTHS = ['March', 'June', 'September', 'December'];
export const CURRICULUMS = ['CAPS', 'IEB'];
export const PAPER_NUMBERS = ['P1', 'P2', 'P3', 'Non'];

export const REGIONS = [
  'National',
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'North West',
  'Northern Cape',
  'Western Cape',
];

export const SESSION_PRICING = {
  online: 220,
  inPerson: 250,
};

export const SESSION_TYPE_LABELS = {
  online: 'Online',
  inPerson: 'In-person',
};

export const MAX_DAILY_EXERCISES = 3;
export const WEEKLY_EXERCISE_DAYS = 7;
export const MAX_AI_SOURCE_PAPERS = 2;

export const TOPICS_BY_GRADE = {
  'Grade 4': [
    'Number Patterns', 'Place Value', 'Addition and Subtraction', 'Multiplication and Division', 'Fractions Basics',
    'Measurement (Length and Mass)', 'Time', 'Money', '2D Shapes', 'Data Handling',
  ],
  'Grade 5': [
    'Number Patterns', 'Whole Numbers', 'Common Fractions', 'Decimals Basics', 'Factors and Multiples',
    'Perimeter and Area', 'Angles', '3D Objects', 'Coordinate Grid Basics', 'Data Representation',
  ],
  'Grade 6': [
    'Integers Introduction', 'Fractions and Decimals', 'Percentages Basics', 'Ratios', 'Algebraic Expressions',
    'Geometry of Triangles', 'Area and Volume', 'Transformations', 'Probability Basics', 'Graphs and Tables',
  ],
  'Grade 7': [
    'Integers and Operations', 'Rational Numbers', 'Algebraic Expressions', 'Linear Equations', 'Ratio and Rate',
    'Geometry and Angles', 'Perimeter Area Volume', 'Probability', 'Data Handling', 'Coordinate Plane',
  ],
  'Grade 8': [
    'Exponents', 'Scientific Notation', 'Algebraic Identities', 'Solving Equations', 'Functions and Mapping',
    'Geometry of Polygons', 'Pythagorean Theorem', 'Statistics', 'Probability', 'Transformations in the Plane',
  ],
  'Grade 9': [
    'Number Systems', 'Algebraic Manipulation', 'Linear Functions', 'Simultaneous Equations', 'Surface Area and Volume',
    'Euclidean Geometry', 'Trigonometry Intro', 'Probability and Relative Frequency', 'Statistics and Measures', 'Coordinate Geometry',
  ],
  'Grade 10': [
    'Algebraic Fractions', 'Quadratic Expressions', 'Linear and Quadratic Functions', 'Sequences and Series', 'Trigonometric Ratios',
    'Euclidean Geometry', 'Analytical Geometry', 'Measurement', 'Probability', 'Statistics',
  ],
  'Grade 11': [
    'Quadratic Functions', 'Exponential Functions', 'Finance and Growth', 'Trigonometric Identities', 'Trigonometric Equations',
    'Euclidean Geometry Theorems', 'Analytical Geometry of Circles', 'Statistics', 'Probability Distributions', 'Sequences and Series',
  ],
  'Grade 12': [
    'Calculus Basics', 'Differentiation', 'Functions and Graphs', 'Algebraic Equations', 'Number Patterns and Series',
    'Trigonometry', 'Euclidean Geometry Riders', 'Analytical Geometry', 'Probability', 'Statistics and Regression',
  ],
};

const conceptQuestionBank = [
  {
    id: 'concept-1',
    prompt: 'What is a number pattern?',
    options: [
      { id: 'a', text: 'A sequence of numbers that follows a rule', correct: true },
      { id: 'b', text: 'A random list of numbers' },
      { id: 'c', text: 'A type of graph' },
      { id: 'd', text: 'A 3D shape' },
    ],
  },
  {
    id: 'concept-2',
    prompt: 'What is the Cartesian plane used for?',
    options: [
      { id: 'a', text: 'To plot points using ordered pairs', correct: true },
      { id: 'b', text: 'To measure mass only' },
      { id: 'c', text: 'To solve fractions only' },
      { id: 'd', text: 'To draw pie charts only' },
    ],
  },
  {
    id: 'concept-3',
    prompt: 'Which statement best describes a fraction?',
    options: [
      { id: 'a', text: 'A way to show equal parts of a whole', correct: true },
      { id: 'b', text: 'A number bigger than every whole number' },
      { id: 'c', text: 'A rule for reflecting a shape' },
      { id: 'd', text: 'A type of bar graph' },
    ],
  },
  {
    id: 'concept-4',
    prompt: 'What does probability describe?',
    options: [
      { id: 'a', text: 'How likely an event is to happen', correct: true },
      { id: 'b', text: 'How long an object is' },
      { id: 'c', text: 'How many sides a polygon has' },
      { id: 'd', text: 'How to convert units' },
    ],
  },
  {
    id: 'concept-5',
    prompt: 'What is an equation?',
    options: [
      { id: 'a', text: 'A mathematical statement that two expressions are equal', correct: true },
      { id: 'b', text: 'A picture made of shapes only' },
      { id: 'c', text: 'A number pattern without a rule' },
      { id: 'd', text: 'A list of data in a table' },
    ],
  },
];

const topicQuestionFactory = (topic, index) => {
  const genericPrompt = `Which statement best describes ${topic}?`;
  const calculationPrompt = `A learner solves a question from ${topic}. Which step is most mathematically correct?`;

  return {
    id: `topic-${index + 1}`,
    prompt: index % 2 === 0 ? genericPrompt : calculationPrompt,
    options: index % 2 === 0
      ? [
        { id: 'a', text: `${topic} applies clear mathematical rules and structure.`, correct: true },
        { id: 'b', text: `${topic} has no rules and can be solved randomly.` },
        { id: 'c', text: `${topic} is only about drawing pictures.` },
        { id: 'd', text: `${topic} cannot include numbers.` },
      ]
      : [
        { id: 'a', text: 'Use the correct operation sequence and show working clearly.', correct: true },
        { id: 'b', text: 'Guess an answer without calculation.' },
        { id: 'c', text: 'Ignore the units and the values provided.' },
        { id: 'd', text: 'Replace every value with zero.' },
      ],
    topic,
  };
};

export const buildAssessmentQuestionsForGrade = (grade) => {
  const gradeTopics = TOPICS_BY_GRADE[grade] || TOPICS_BY_GRADE['Grade 8'];
  const topicQuestions = gradeTopics.slice(0, 10).map((topic, index) => topicQuestionFactory(topic, index));
  return [...conceptQuestionBank, ...topicQuestions];
};

export const getRecommendedSessionsFromAssessment = (percentage) => {
  if (Number(percentage) < 70) return 4;
  return 2;
};
