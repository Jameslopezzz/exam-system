/* =========================================================
   Mock data layer. Replace with real API calls later.
   ========================================================= */

var VIOLATION_THRESHOLD = 3;

var VIOLATION_TYPES = [
  { id: "face-angle", label: "Face angle away from screen", severity: "high" },
  { id: "eye-gaze", label: "Eye gaze off-screen", severity: "high" },
  { id: "multiple-faces", label: "Another person detected on camera", severity: "critical" },
  { id: "no-face", label: "No face detected", severity: "medium" },
  { id: "copy-paste", label: "Copy / paste attempt", severity: "medium" },
  { id: "tab-switch", label: "Left the exam window", severity: "high" }
];

var EXAMS = [
  {
    id: "it-401-midterm",
    title: "Midterm Examination",
    subject: "Data Analytics and Visualization",
    code: "IT 401",
    professor: "Prof. R. Dela Cruz",
    durationMinutes: 45,
    schedule: "Today, 1:00 PM",
    status: "available",
    questions: [
      {
        id: "q1",
        type: "multiple-choice",
        points: 5,
        prompt:
          "Based on the enrollment table below, which academic year recorded the highest percentage growth in enrolled students?",
        media: {
          kind: "table",
          caption: "Table 1. PLMu enrollment per academic year (sample data).",
          headers: ["Academic Year", "Enrolled", "Graduates", "Retention %"],
          rows: [
            ["2021-2022", "4,120", "812", "88%"],
            ["2022-2023", "4,905", "935", "90%"],
            ["2023-2024", "5,380", "1,010", "91%"],
            ["2024-2025", "6,240", "1,188", "93%"]
          ]
        },
        choices: ["2021-2022", "2022-2023", "2023-2024", "2024-2025"]
      },
      {
        id: "q2",
        type: "multiple-choice",
        points: 5,
        prompt: "Study the bar chart. Which quarter registered the lowest recorded violations?",
        media: {
          kind: "bar-chart",
          caption: "Figure 1. Recorded academic integrity violations per quarter.",
          data: [
            { label: "Q1", value: 42 },
            { label: "Q2", value: 27 },
            { label: "Q3", value: 35 },
            { label: "Q4", value: 18 }
          ]
        },
        choices: ["First Quarter", "Second Quarter", "Third Quarter", "Fourth Quarter"]
      },
      {
        id: "q3",
        type: "multiple-choice",
        points: 5,
        prompt:
          "Refer to the line graph of average assessment scores. What trend is observed from Week 3 to Week 6?",
        media: {
          kind: "line-graph",
          caption: "Figure 2. Weekly average assessment score.",
          data: [
            { label: "W1", value: 68 },
            { label: "W2", value: 71 },
            { label: "W3", value: 66 },
            { label: "W4", value: 74 },
            { label: "W5", value: 80 },
            { label: "W6", value: 86 }
          ]
        },
        choices: [
          "A steady decline",
          "A consistent upward trend",
          "No measurable change",
          "An irregular drop then plateau"
        ]
      },
      {
        id: "q4",
        type: "multiple-choice",
        points: 5,
        prompt: "Using the pie chart, which detection category accounts for the largest share of flags?",
        media: {
          kind: "pie-chart",
          caption: "Figure 3. Distribution of detection categories.",
          data: [
            { label: "Eye gaze", value: 44 },
            { label: "Face angle", value: 28 },
            { label: "Multiple faces", value: 18 },
            { label: "Copy / paste", value: 10 }
          ]
        },
        choices: ["Eye gaze", "Face angle", "Multiple faces", "Copy / paste"]
      },
      {
        id: "q5",
        type: "multiple-choice",
        points: 5,
        prompt: "Watch the short clip on data ethics. What is the primary responsibility discussed?",
        media: {
          kind: "video",
          caption: "Video 1. Sample exam video item (replace with your own media).",
          src: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4"
        },
        choices: [
          "Maximizing collected data",
          "Protecting respondent privacy",
          "Publishing raw datasets",
          "Avoiding documentation"
        ]
      },
      {
        id: "q6",
        type: "essay",
        points: 10,
        prompt:
          "Examine the labeled diagram. In your own words, explain how the structure supports the transport of nutrients. Write at least three sentences.",
        media: {
          kind: "image",
          alt: "Labeled scientific cross-section diagram used as a sample exam item",
          caption: "Figure 4. Sample diagram item (placeholder illustration).",
          src: "assets/question-diagram.jpg"
        }
      },
      {
        id: "q7",
        type: "essay",
        points: 10,
        prompt:
          "Discuss how real-time proctoring affects academic integrity in web-based assessments. Cite at least two advantages and one limitation."
      }
    ]
  },
  {
    id: "ge-102-quiz",
    title: "Long Quiz No. 2",
    subject: "Science, Technology and Society",
    code: "GE 102",
    professor: "Prof. M. Santiago",
    durationMinutes: 30,
    schedule: "Sep 12, 9:00 AM",
    status: "scheduled",
    questions: []
  },
  {
    id: "cs-210-prelim",
    title: "Preliminary Examination",
    subject: "Discrete Structures",
    code: "CS 210",
    professor: "Prof. A. Reyes",
    durationMinutes: 60,
    schedule: "Sep 1, 10:00 AM",
    status: "completed",
    score: 88,
    questions: []
  }
];

function getExam(id) {
  for (var i = 0; i < EXAMS.length; i++) {
    if (EXAMS[i].id === id) return EXAMS[i];
  }
  return null;
}

var MONITORED_STUDENTS = [
  {
    id: "s1",
    name: "Althea Castillo",
    studentNo: "23151159",
    section: "BSIT-4F",
    exam: "IT 401 Midterm",
    progress: 62,
    violations: 0,
    lastFlag: "—",
    status: "in-progress"
  },
  {
    id: "s2",
    name: "Jodielyn Crystal Chan",
    studentNo: "23151250",
    section: "BSIT-4F",
    exam: "IT 401 Midterm",
    progress: 48,
    violations: 2,
    lastFlag: "Eye gaze off-screen · 1:42 PM",
    status: "flagged"
  },
  {
    id: "s3",
    name: "James Vann Lopez",
    studentNo: "23151223",
    section: "BSIT-4F",
    exam: "IT 401 Midterm",
    progress: 100,
    violations: 3,
    lastFlag: "Another person detected · 1:38 PM",
    status: "auto-submitted"
  },
  {
    id: "s4",
    name: "Erica Faith Corilla",
    studentNo: "23151216",
    section: "BSIT-4B",
    exam: "IT 401 Midterm",
    progress: 100,
    violations: 0,
    lastFlag: "—",
    status: "submitted"
  },
  {
    id: "s5",
    name: "Christian Izon",
    studentNo: "23151179",
    section: "BSIT-4B",
    exam: "IT 401 Midterm",
    progress: 71,
    violations: 1,
    lastFlag: "Face angle away · 1:45 PM",
    status: "flagged"
  }
];

var LIVE_ALERTS = [
  { id: "a1", student: "Jasmine Ocampo", type: "Another person detected on camera", time: "1:38 PM", severity: "critical" },
  { id: "a2", student: "Miguel Bautista", type: "Eye gaze off-screen (4.2s)", time: "1:42 PM", severity: "high" },
  { id: "a3", student: "Kim Estrada", type: "Face angle away from screen", time: "1:45 PM", severity: "high" },
  { id: "a4", student: "Miguel Bautista", type: "Copy / paste attempt blocked", time: "1:47 PM", severity: "medium" }
];

var STUDENT_RESULTS = [
  { code: "CS 210", title: "Preliminary Examination", date: "Sep 1, 2026", score: "88 / 100", violations: 0, remark: "Clean" },
  { code: "GE 102", title: "Long Quiz No. 1", date: "Aug 20, 2026", score: "45 / 50", violations: 1, remark: "Warned" },
  { code: "IT 350", title: "Final Examination", date: "Jul 28, 2026", score: "92 / 100", violations: 0, remark: "Clean" }
];
