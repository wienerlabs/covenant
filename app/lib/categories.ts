export const JOB_CATEGORIES = [
  { id: "text_writing", label: "Text Writing", tag: "TXT", description: "Articles, blogs, essays", fields: ["minWords"] },
  { id: "code_review", label: "Code Review", tag: "CODE", description: "Code review, PR analysis", fields: ["minWords", "language"] },
  { id: "translation", label: "Translation", tag: "LANG", description: "Language translation", fields: ["sourceLang", "targetLang", "minWords"] },
  { id: "data_labeling", label: "Data Labeling", tag: "DATA", description: "AI training data labeling", fields: ["minItems"] },
  { id: "bug_bounty", label: "Bug Bounty", tag: "BUG", description: "Security testing, bug finding", fields: ["severity"] },
  { id: "design", label: "Design", tag: "DSN", description: "UI/UX design, logos", fields: ["deliverableType"] },
] as const;

export type CategoryId = typeof JOB_CATEGORIES[number]["id"];

export function getCategoryById(id: string) {
  return JOB_CATEGORIES.find(c => c.id === id) || JOB_CATEGORIES[0];
}
