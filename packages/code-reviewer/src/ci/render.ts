import type { Review } from "../schemas/review";

export type Verdict = "passed" | "failed";

/** Maps a review score to a pass/fail verdict given a threshold. */
export function verdictFor(review: Review, threshold: number): Verdict {
  return review.score >= threshold ? "passed" : "failed";
}

const SEVERITY_HEADINGS: Record<Review["issues"][number]["severity"], string> = {
  error: "Errors",
  warning: "Warnings",
  info: "Info",
};

const SEVERITY_ORDER: Review["issues"][number]["severity"][] = ["error", "warning", "info"];

/**
 * Renders the PR comment markdown: a verdict + score header, the summary, and
 * the issues grouped by severity with line citations (`line` may be null).
 * User-facing text is English — this is a developer CI artifact, not product UI.
 */
export function renderComment(review: Review, verdict: Verdict): string {
  const emoji = verdict === "passed" ? "✅" : "❌";
  const lines: string[] = [
    `## ${emoji} AI Code Review — ${verdict} (score: ${review.score}/10)`,
    "",
    review.summary,
    "",
  ];

  if (review.issues.length === 0) {
    lines.push("No issues found.");
    return lines.join("\n");
  }

  for (const severity of SEVERITY_ORDER) {
    const group = review.issues.filter((issue) => issue.severity === severity);
    if (group.length === 0) continue;

    lines.push(`### ${SEVERITY_HEADINGS[severity]}`, "");
    for (const issue of group) {
      const location = issue.line === null ? "" : ` (line ${issue.line})`;
      lines.push(`- ${issue.message}${location}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}
