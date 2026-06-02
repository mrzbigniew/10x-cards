---
name: 10x-roadmap-proposal
description: >
  Add a new proposed slice (S-NN) or foundation (F-NN) to context/foundation/roadmap.md.
  Updates the At a glance table, the body section, and the Backlog Handoff table in one
  consistent edit. Use when the user wants to propose new work without regenerating the
  full roadmap. Trigger phrases: "add to roadmap", "propose new slice", "propose a change",
  "add slice", "add foundation", "dodaj do roadmapy", "zaproponuj zmianę".
argument-hint: "[freeform intent describing the proposed change]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - AskUserQuestion
---

# /10x-roadmap-proposal — Add a Proposal to the Roadmap

Appends a new **Foundation** (`F-NN`) or **Slice** (`S-NN`) entry to `context/foundation/roadmap.md` —
updating the `## At a glance` table, the appropriate body section (`## Foundations` or `## Slices`),
and the `## Backlog Handoff` table — without regenerating or overwriting the whole file.

Use this skill when the scope of work is clear enough to name but you don't yet want to run `/10x-plan`.
The proposal lands with `Status: proposed` by default; prerequisites are declared explicitly so the
dependency graph stays honest.

## Initial Response

When this skill is invoked:

1. **Check if the roadmap file exists.**

```bash
test -f context/foundation/roadmap.md
```

If the file does NOT exist, print:

```
error: context/foundation/roadmap.md not found.
Run /10x-roadmap first to generate the roadmap, then use /10x-roadmap-proposal to extend it.
```

Then STOP.

2. **Check if an argument was provided.**
   - If provided, treat the full argument string as the **intent** (freeform description of the proposed change). Proceed to Step 1.
   - If NOT provided, print:

```
I'll add a new proposal to context/foundation/roadmap.md.

Provide a short description of what you want to propose, for example:
  /10x-roadmap-proposal user can export a deck as a CSV file
  /10x-roadmap-proposal add onboarding tour for first-time users
  /10x-roadmap-proposal foundation: set up email delivery via Resend

The description becomes the starting point for the Outcome field.
```

Then **wait** for the user to provide an argument.

## Process

### Step 1: Read the roadmap

Read `context/foundation/roadmap.md` **fully** (no `limit`/`offset`).

From the file, extract:
- The **last F-NN ID** used (scan `## At a glance` or `## Foundations` — pattern: `| F-\d{2}`). If none, next foundation ID is `F-01`.
- The **last S-NN ID** used (scan `## At a glance` or `## Slices` — pattern: `| S-\d{2}`). If none, next slice ID is `S-01`.
- All **existing Change IDs** (from `## At a glance` — second column). Needed for uniqueness check.
- All **existing IDs** (F-NN, S-NN) to validate Prerequisites the user names.

### Step 2: Determine type and intent

Use `AskUserQuestion` to ask one combined question. Pre-fill the intent from the argument if one was given:

Interactive question:
- question: "What type of roadmap item do you want to add?"
  header: "Item type"
  options:
  - label: "Slice — S-NN (user-visible capability) (Recommended)"
    description: "The most common case: a new user-facing feature. Gets an S-NN ID."
  - label: "Foundation — F-NN (cross-cutting enabler)"
    description: "Infrastructure or scaffolding that unblocks multiple slices. Gets an F-NN ID and requires an Unlocks field."
  multiSelect: false

Record the answer as `<item-type>` (`slice` or `foundation`).

Based on the answer, the next ID is:
- `slice` → increment the last S-NN by 1 (e.g. last was `S-07` → next is `S-08`). Zero-pad to two digits.
- `foundation` → increment the last F-NN by 1 (e.g. last was `F-01` → next is `F-02`). Zero-pad to two digits.

### Step 3: Collect required fields

Collect each field in a **single multi-field interview round** using `AskUserQuestion`. Run the questions
sequentially (each round is one question with free-form answer via "Other"):

**Field 1 — Outcome**

Interactive question:
- question: "What is the user-visible outcome? Phrase it as 'user can …' for a slice, or '(foundation) …' for a foundation. Starting point from your intent: '<intent>'"
  header: "Outcome"
  options:
  - label: "Use suggested outcome (fill it in via Other)"
    description: "Phrase it as a complete, verb-led sentence."
  multiSelect: false

Accept free-form text. The outcome MUST be verb-led:
- Slice: starts with "user can …"
- Foundation: starts with "(foundation) …"

If the user provides a noun-phrase outcome, ask them to rephrase.

**Field 2 — Change ID**

Derive a **suggested Change ID** from the intent: lowercase, kebab-case, 2-5 words, outcome-oriented
(e.g. intent "export deck as CSV" → `deck-csv-export`).

Interactive question:
- question: "Change ID (kebab-case slug for the context/changes/ folder). Suggested: '<suggested-id>'. Accept or type your own."
  header: "Change ID"
  options:
  - label: "Use suggested: <suggested-id>"
    description: "This ID will be used as the folder name under context/changes/ when you run /10x-plan."
  multiSelect: false

Validate the user's choice:
- Must match `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`
- Must NOT already exist in the roadmap's existing Change IDs list (from Step 1)

On failure, print the specific error and re-ask.

**Field 3 — Prerequisites**

List the known roadmap IDs (F-NN, S-NN) in a compact block so the user can reference them.

Interactive question:
- question: "Prerequisites: which existing roadmap IDs must be done before this item can start? List them comma-separated (e.g. F-01, S-03), or type — if none."
  header: "Prerequisites"
  options:
  - label: "None (—)"
    description: "This item has no prerequisites — it can start immediately."
  multiSelect: false

Accept free-form text. Validate: every named ID must exist in the roadmap (from Step 1 ID list).
If an unknown ID is named, print an error listing the valid IDs and re-ask.

**Field 4 — PRD refs**

Interactive question:
- question: "PRD references (FR-NNN, US-NN, NFR-NN). If this is a UX refinement with no new FR, write 'UX refinement' or '—'. Examples: US-05, FR-010, FR-011"
  header: "PRD refs"
  options:
  - label: "No specific PRD refs (—)"
    description: "Use this for UX polish or technical housekeeping not tied to a specific FR or user story."
  multiSelect: false

Accept free-form text. No validation (user knows their PRD IDs).

**Field 5 — Unlocks (foundations only)**

Ask ONLY if `<item-type>` is `foundation`:

Interactive question:
- question: "Unlocks: which downstream S-NN slices or blocking unknowns does this foundation enable? List slice IDs comma-separated."
  header: "Unlocks"
  options:
  - label: "I'll specify (type via Other)"
    description: "Required for foundations — a foundation without an Unlocks is horizontal drift."
  multiSelect: false

Accept free-form text. Must be non-empty for foundations.

**Field 6 — Parallel with**

Interactive question:
- question: "Can this item run in parallel with any other? List IDs (e.g. S-05, S-06) or type — if none."
  header: "Parallel with"
  options:
  - label: "None (—)"
    description: "No items can run in parallel with this one."
  multiSelect: false

Accept free-form text. Validate named IDs if any are given.

**Field 7 — Risk**

Interactive question:
- question: "Risk: one line on why it's sequenced here and what could go wrong. Or type — if none."
  header: "Risk"
  options:
  - label: "No specific risk (—)"
    description: "No notable sequencing risk for this item."
  multiSelect: false

Accept free-form text.

### Step 4: Compose the entry

Build the entry text in memory.

**For a Slice:**

```markdown
### <S-NN>: <Title derived from Outcome — sentence case, ≤ 60 chars>

- **Outcome:** <Outcome field>
- **Change ID:** <change-id>
- **PRD refs:** <PRD refs field>
- **Prerequisites:** <Prerequisites field>
- **Parallel with:** <Parallel with field>
- **Blockers:** —
- **Unknowns:** —
- **Risk:** <Risk field>
- **Status:** proposed
```

**For a Foundation:**

```markdown
### <F-NN>: <Title derived from Outcome — sentence case, ≤ 60 chars>

- **Outcome:** <Outcome field>
- **Change ID:** <change-id>
- **PRD refs:** <PRD refs field>
- **Unlocks:** <Unlocks field>
- **Prerequisites:** <Prerequisites field>
- **Parallel with:** <Parallel with field>
- **Blockers:** —
- **Unknowns:** —
- **Risk:** <Risk field>
- **Status:** proposed
```

The **Title** is a short human-readable label derived from the Outcome (NOT the outcome verbatim).
Strip "user can" from slice outcomes; strip "(foundation)" from foundation outcomes. Capitalize first word.
Examples: "Outcome: user can export a deck as CSV" → Title: "Deck CSV export".

**At-a-glance row:**

```
| <ID>  | <change-id>  | <Outcome — truncated to ≤ 80 chars if needed> | <Prerequisites> | <PRD refs> | proposed |
```

**Backlog Handoff row:**

```
| <ID>  | <change-id>  | <Suggested issue title — plain imperative, ≤ 70 chars> | no | Needs <prerequisite names> done |
```

The Suggested issue title is an imperative phrase derived from the Outcome without "user can".
Example: "user can export a deck as CSV" → "Deck CSV export".
If no prerequisites: `Notes` = `Run /10x-plan <change-id>` with `Ready for /10x-plan` = `yes`.

### Step 5: Echo and confirm

Show the user the complete composed entry plus the two table rows:

```
Proposed entry for context/foundation/roadmap.md:

──────────────────────────────────────────────────
BODY (## Slices or ## Foundations section):

<body entry>

──────────────────────────────────────────────────
AT A GLANCE row:

<at-a-glance row>

──────────────────────────────────────────────────
BACKLOG HANDOFF row:

<backlog handoff row>
──────────────────────────────────────────────────
```

Then ask:

Interactive question:
- question: "Append these entries to context/foundation/roadmap.md?"
  header: "Confirm"
  options:
  - label: "Append"
    description: "Write all three inserts to the file."
  - label: "Edit fields"
    description: "Go back and revise one or more fields."
  - label: "Cancel"
    description: "Discard — don't write anything."
  multiSelect: false

On "Edit fields": re-run Step 3 from the beginning (reuse already-confirmed values as defaults).
On "Cancel": print `Cancelled — no changes written.` and STOP.
On "Append": proceed to Step 6.

### Step 6: Write to roadmap.md

Apply three targeted edits using the `Edit` tool (NOT a full file rewrite):

**Edit 1 — At a glance table**

Append the new row at the **end** of the `## At a glance` table (the last `| ... |` line before the
next `##` heading or a blank line after the table). Insert BEFORE the blank line that ends the table.

To locate the insertion point: find the last table row that matches `^| [FS]-\d{2}` in the At a glance
section, then append the new row immediately after it.

**Edit 2 — Body section**

- For **slices**: append the body entry at the **end** of `## Slices`, immediately before `## Backlog Handoff`
  (or `## Open Roadmap Questions` if Backlog Handoff is absent). Find the last `### S-\d{2}:` block and
  append after its last line.
- For **foundations**: append the body entry at the **end** of `## Foundations`, immediately before `## Slices`.
  Find the last `### F-\d{2}:` block and append after its last line.

**Edit 3 — Backlog Handoff table**

Append the new row at the **end** of the `## Backlog Handoff` table. Find the last `| [FS]-\d{2}` row in
that table and append the new row after it.

**Also update the roadmap's `updated:` frontmatter field** to today's date (YYYY-MM-DD).

After all edits, re-read the file and verify:
- The new ID appears in the At a glance table.
- The new body section exists.
- The new Backlog Handoff row exists.
- The `updated:` frontmatter reflects today's date.

If any of these checks fail, report the specific failure and do NOT silently leave the file in a
partial state.

### Step 7: Confirm result

Print:

```
✓ Appended to context/foundation/roadmap.md

  <ID>  (<change-id>)  Status: proposed
  Outcome: <Outcome>

Next step when ready to plan:
  → /10x-plan <change-id>
```

Copy the suggested next command to clipboard:

```bash
NEXT_CMD="/10x-plan <change-id>"
echo -n "$NEXT_CMD" | clip.exe 2>/dev/null || echo -n "$NEXT_CMD" | xclip -selection clipboard 2>/dev/null || true
```

```powershell
Set-Clipboard "/10x-plan <change-id>"
```

If no clipboard tool is available, drop the clipboard note.

STOP. Do not chain into another skill.

## Guardrails

1. **Edit-in-place, never full rewrite.** Use `Edit` for all three inserts. The roadmap is a
   live document; overwriting it risks losing in-progress status updates.

2. **Unique IDs and Change IDs.** The next ID is strictly +1 from the highest existing ID of
   that type. A Change ID collision with any existing entry is a hard error.

3. **Valid prerequisite IDs only.** Any ID named in Prerequisites or Parallel with must exist
   in the roadmap. Unknown IDs are a hard error at Step 3.

4. **Foundations require Unlocks.** A foundation entry with an empty Unlocks field is rejected
   before the write.

5. **No time estimates, no size labels.** Do not add "small/medium/large", story points, or
   day estimates to any field.

6. **Status is always `proposed` on creation.** The skill does not set `ready`, `blocked`, or
   `done`. Those transitions are owned by `/10x-plan`, `/10x-archive`, and the user manually.

7. **Three inserts or nothing.** If any of the three edits (At a glance, body, Backlog Handoff)
   fail, report all failures and leave the file as-is. Partial writes corrupt the cross-reference
   invariant between the table and the body sections.

8. **No invented PRD refs.** If the user types a PRD ref, take it verbatim. Do not infer or
   expand FR/US numbers the user didn't supply.
