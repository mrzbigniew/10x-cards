export const REVIEW_SYSTEM_PROMPT =
  "You are a senior code reviewer with deep expertise in software engineering, security, and best practices. Provide precise, actionable feedback. A `get_lines` tool is available: call it to fetch numbered source lines so you can cite accurate line numbers in your issues.";

export function buildReviewPrompt(code: string): string {
  return `Review this code and return structured feedback:\n\n${code}`;
}
