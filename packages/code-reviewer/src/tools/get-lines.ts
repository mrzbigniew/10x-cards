import { tool } from "ai";
import { z } from "zod";

/**
 * Line-citation tool. Reads the code under review from `experimental_context`
 * (NOT a closed-over constant) so a single reusable agent can cite accurate
 * line numbers across many requests. The agent passes the requested 1-based,
 * inclusive range and receives the matching numbered source lines.
 */
export const getLinesTool = tool({
  description:
    "Fetch numbered source lines from the code under review so you can cite accurate line numbers. Range is 1-based and inclusive.",
  inputSchema: z.object({
    startLine: z.number().describe("First line to return (1-based, inclusive)"),
    endLine: z.number().describe("Last line to return (1-based, inclusive)"),
  }),
  execute: ({ startLine, endLine }, { experimental_context }) => {
    const { code } = experimental_context as { code: string };
    const lines = code.split("\n");

    // Clamp the requested range to the available lines (1-based, inclusive).
    const start = Math.max(1, Math.min(startLine, endLine));
    const end = Math.min(lines.length, Math.max(startLine, endLine));

    const numbered: { line: number; text: string }[] = [];
    for (let line = start; line <= end; line++) {
      numbered.push({ line, text: lines[line - 1] });
    }

    return { lines: numbered, totalLines: lines.length };
  },
});
