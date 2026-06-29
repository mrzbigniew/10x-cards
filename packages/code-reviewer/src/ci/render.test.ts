import { describe, expect, it } from "vitest";
import type { Review } from "../schemas/review";
import { renderComment, verdictFor } from "./render";

function makeReview(overrides: Partial<Review> = {}): Review {
  return {
    summary: "Looks fine overall.",
    issues: [],
    score: 8,
    ...overrides,
  };
}

describe("verdictFor", () => {
  it("passes when score equals the threshold", () => {
    expect(verdictFor(makeReview({ score: 7 }), 7)).toBe("passed");
  });

  it("fails just below the threshold", () => {
    expect(verdictFor(makeReview({ score: 6.9 }), 7)).toBe("failed");
  });

  it("fails at the bottom of the range", () => {
    expect(verdictFor(makeReview({ score: 0 }), 7)).toBe("failed");
  });

  it("passes at the top of the range", () => {
    expect(verdictFor(makeReview({ score: 10 }), 7)).toBe("passed");
  });
});

describe("renderComment", () => {
  it("includes the verdict, score, and summary", () => {
    const out = renderComment(makeReview({ summary: "Solid work.", score: 9 }), "passed");
    expect(out).toContain("passed");
    expect(out).toContain("9/10");
    expect(out).toContain("Solid work.");
  });

  it("renders an issue with a line and one without", () => {
    const review = makeReview({
      score: 4,
      issues: [
        { severity: "error", message: "SQL injection risk", line: 42 },
        { severity: "warning", message: "Missing test coverage", line: null },
      ],
    });
    const out = renderComment(review, "failed");
    expect(out).toContain("failed");
    expect(out).toContain("SQL injection risk (line 42)");
    expect(out).toContain("Missing test coverage");
    expect(out).not.toContain("Missing test coverage (line");
  });

  it("handles an empty issues array", () => {
    const out = renderComment(makeReview({ issues: [] }), "passed");
    expect(out).toContain("No issues found.");
  });
});
