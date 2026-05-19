---
project: "10xCards"
context_type: greenfield
created: 2026-05-18
updated: 2026-05-18
product_type: web-app
target_scale:
  users: medium
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  frs_drafted: 17
  gray_areas_resolved:
    - topic: "primary persona scope"
      decision: "Polish high-school student / matura candidate — a single segment, not multi-tenant"
    - topic: "pain category"
      decision: "workflow friction + decision paralysis (both)"
    - topic: "wrong-problem socratic"
      decision: "no counter — the idea holds; AI generating from the student's own text resolves both pains"
    - topic: "auth shape"
      decision: "email + password; no OAuth / magic-link in MVP"
    - topic: "roles"
      decision: "flat — all users equal; no teacher/student split, no application-level admin"
    - topic: "ungated routes"
      decision: "landing page only; the entire application is behind the gate"
    - topic: "MVP user flow"
      decision: "7-step flow: sign-up → sign-in → empty deck list → paste text → AI proposals → accept/edit/reject → save to deck + optionally add manually → review session (on a later day)"
    - topic: "SR algorithm source"
      decision: "ready open-source library (e.g. fsrs.js / ts-fsrs / SM-2 library); no in-house implementation"
    - topic: "timeline budget"
      decision: "3 weeks after-hours; scope-cost surfaced and acknowledged"
  quality_check_status: accepted
---

# Shape notes — 10xCards

> Discovery notes leading to the PRD. Section headers (`##`) match the corresponding sections of the PRD per `references/prd-schema.md` (greenfield, 10 sections) in the required order. Body content is in English; the header names are fixed by the schema contract.

## Vision & Problem Statement

A Polish high-school student — especially in the matura (final-exam) year — prepares for tests and the matura exam using their own notes and the textbook. Spaced repetition is an effective study method, but the activation cost — turning thirty pages of textbook content into useful flashcards by hand — is so high that students either abandon the method and fall back to re-reading the textbook several times, or they download ready-made decks from the internet whose quality is low and which do not match the Polish curriculum or the specific textbook the student is using. The bottleneck is not the willingness to review, nor a dislike of the method itself — it is the workflow friction of "take my own material → turn it into a good deck" combined with the decision paralysis of "out of these thirty pages, which facts are actually worth a flashcard?".

The insight 10xCards is built on: if we take *the student's own* text — their notes, a fragment of a textbook, material the student has already deemed important — and let AI propose flashcards from it, both pains collapse simultaneously. The "what is important?" decision is delegated to the AI (the student only accepts, edits, or rejects), and the content is by construction matched to *this* material, not to an average internet deck. Spaced repetition becomes accessible to the student who, until now, simply did not have time for it.

## User & Persona

**Matura candidate / Polish high-school student in a revision-heavy year**

- **Role**: a high-school student, most often in the matura year or right before a major in-class test.
- **Context**: works with their own classroom notes and excerpts from a textbook; preparing for an exam that tests factual recall and understanding of definitions (biology, history, civics, parts of Polish language, foundational math — knowledge-heavy subjects).
- **Moment when they reach for the product**: they are starting revision for a test or for the matura, they already have material chosen (notes, a textbook chapter), and they need to convert it into a deck they can review by spaced repetition over the coming days or weeks.
- **State today without the product**: either they do not use flashcards at all (re-reading the textbook several times), or they download ready-made decks of poor quality / mismatched to the Polish curriculum.

## Success Criteria

### Primary

- At least **75% of AI-generated flashcards are accepted** by the user (after the first review pass — acceptance may include editing, but not rejection). Measures the quality of AI proposals; below this threshold the product is worse than creating cards manually, because the user spends more effort editing than they save.
- At least **75% of all flashcards in the user's library originate from AI generation** (vs. created manually). Measures adoption of the product's core path; below this threshold 10xCards is just another Anki clone with a rarely-used "AI" button.

### Secondary

- **D7 retention**: a user who signed up and created their first deck returns and completes a review session 7 days later. Measures whether the spaced-repetition habit actually "catches" — creating a deck without coming back a week later means the product solved only half the problem (activation cost) and missed the other half (habit retention).

### Guardrails

A failure here is a regression even if Primary metrics are met.

- **Privacy of pasted text**: a student's notes / textbook fragments pasted into the generator do not leak outside the user's account — they are not shown to other users, not used to train any public model, and do not remain in operator-accessible storage after the request that consumed them completes.
- **Durability of flashcards and SR state**: the user does not lose decks or review history between sessions. Spaced repetition lives across weeks and months; any data loss means the product died for that user, regardless of the quality of other features.
- **AI response time**: generating flashcards from a single text excerpt (a copy-paste fragment) returns proposals within a time that lets the student stay in their study session — the target value < 30 s p95 is refined in NFRs.
- **Password reset**: losing a password does NOT mean losing all decks / SR state. Email-based reset must be reliable; otherwise weeks of study vanish because of a single forgotten password.
- **SR algorithm correctness**: any card that, per the SR algorithm, is due for review today shows up in today's review session (never lost, never shown twice). The algorithm is delegated to a ready library, but the product is responsible for using it correctly.

## User Stories

### US-01: A student generates their first deck from pasted text

- **Given** a signed-in student with no decks yet
- **When** they paste a fragment of notes or textbook content into the generator and confirm
- **Then** they see a list of proposed flashcards (question + answer), each of which they can independently accept, edit, or reject, and the accepted ones land in a new deck

#### Acceptance Criteria
- The proposal list renders only after generation completes (loader / progress visible while the AI is working).
- Each proposal is a separate row with three actions (accept / edit / reject).
- Editing happens inline (directly in the row); confirming an edit = accepting the modified version.
- After the review, the student can name the new deck and save it (or add the proposals to an existing deck).
- Empty input (no text / too-short text) blocks the AI call with a clear message explaining why.
- An AI-side error (timeout, API error) is surfaced to the user with a "try again" option, without losing the pasted text.

### US-02: A student adds a flashcard manually to an existing deck

- **Given** a signed-in student who has at least one deck
- **When** they open the deck and pick "Add flashcard manually"
- **Then** they enter a question and an answer, save, and the flashcard appears in the deck, available for review

#### Acceptance Criteria
- The form enforces a non-empty question and a non-empty answer.
- After saving, the flashcard has zero SR state (a new card, due "today" per the algorithm).
- Cancelling closes the form without saving, with no warning if both fields were empty; with a warning if any input had been started.

### US-03: A student runs a review session

- **Given** a signed-in student who owns a deck with at least one card scheduled for today by the SR algorithm
- **When** they start a review session for that deck
- **Then** they see cards one after another; for each card they first see the question, reveal the answer, rate their recall (using the SR library's native scale — e.g. Again / Hard / Good / Easy), and the algorithm updates that card's SR state

#### Acceptance Criteria
- The session contains exactly those cards in the deck that are "due ≤ today" per the SR algorithm — no more, no less.
- After rating the last card, the session ends with a summary (e.g. "X cards reviewed").
- SR state is saved after every card (interrupting the session does not roll back already-rated cards).
- If the deck has no cards due today, a "0 due" screen explains that the student should wait or add new cards.

### US-04: A student resets a forgotten password

- **Given** a student with an existing account who does not remember their password
- **When** they click "I forgot my password", enter their email, click the link in the message, and set a new password
- **Then** they can sign in with the new password and have access to all their decks and to the full SR history from before the reset

#### Acceptance Criteria
- The reset link expires after a finite time (e.g. 24 h) — the schema does not pin the exact value, but it is finite.
- The link works exactly once — clicking it a second time does not let the user change the password again with the same link.
- Submitting a non-existent email does NOT reveal whether an account exists (message: "if an account with this email exists, a reset link has been sent").
- After the reset, all existing decks and the entire SR state remain intact.

### US-05: A student edits an existing flashcard in a deck

- **Given** a signed-in student browsing one of their decks
- **When** they pick a flashcard and click "Edit"
- **Then** they may change the question and/or the answer, optionally tick "reset review progress for this card", and save; the card returns to the deck with its SR state preserved (by default) or reset (if the option was ticked)

#### Acceptance Criteria
- By default the "reset progress" checkbox is unticked — minor edits (typos) do not affect the SR state.
- Ticking the option + saving = the card's SR state returns to zero (as if it were a new card), the rest of the deck untouched.
- Cancelling returns to the deck view without saving.
- Non-empty field validation as in US-02.

## Functional Requirements

### Authentication & account

- FR-001: A non-signed-in user can register an account by providing an email and a password. Priority: must-have
  > Socrates: Counter-argument considered: "open registration is exposed to bots / spam accounts". Resolution: the FR stands as written; bot protection (CAPTCHA / signup rate limit) is a property observable from the outside → routed to NFRs. The question "is CAPTCHA in the MVP scope?" goes to Open Questions.
- FR-002: A registered user can sign in by providing their email and password. Priority: must-have
  > Socrates: Counter-argument considered: "without rate limiting on login the product is exposed to brute-force password guessing". Resolution: the FR stands; rate-limiting on failed login attempts is an NFR (a security property at the system boundary), not a separate FR.
- FR-003: A signed-in user can sign out. Priority: must-have
  > Socrates: Counter-argument considered: "manual logout is not enough — a student on a shared device (a library computer) leaves their session open and someone else sees their decks". Resolution: the FR stands (manual logout covers the intentional exit case); automatic logout after N minutes of inactivity is an NFR (session-timeout policy) and an Open Question ("is auto-logout in MVP, and what is N?").
- FR-004: A user who has forgotten their password can initiate a reset (email-based link), set a new password, and recover access to their account together with all decks and SR state. Priority: must-have
  > Socrates: Counter-argument considered: "email as the only reset channel is unreliable — mail in spam, the student does not check email, delay blocks the review". Resolution: the FR stands; v1 has a single channel (email). SMS / other channels intentionally out of MVP scope (in line with the spirit of idea-notes: no other integrations). Known limitation, accepted.
- FR-005: A non-signed-in user who tries to reach a product route (anything other than the landing page) is redirected to the sign-in screen. Priority: must-have
  > Socrates: Counter-arguments considered: "a hard redirect kills any try-without-account demo" and "no deep-link preservation worsens UX after sign-in". Resolution: no demo without an account is a conscious choice (the entire application sits behind the gate); deep-link preservation after sign-in is an implementation detail, not an FR. The FR stands as written.

### AI flashcard generation

- FR-006: A signed-in user can paste source text (plain text, copy-paste) of a bounded maximum length (the exact value → NFR + Open Question) and ask the AI to generate flashcard proposals from that text. Priority: must-have
  > Socrates: Counter-argument considered: "without a length limit the student pastes an entire textbook, LLM cost explodes, proposal quality drops". Resolution: the FR is expanded with an explicit length cap; the concrete value (characters / tokens) is pinned in NFRs and in Open Questions. Counter-arguments about AI hallucinations and Polish-language quality are routed to Open Questions ("proposal quality in Polish — evaluate after MVP launch").
- FR-007: A user who hits a generation error (timeout / API error / empty response / model refusal) can retry the call without losing the source text they entered. Priority: must-have
  > Socrates: Counter-argument considered: "loading state is an NFR, not an FR — the original FR-007 bloats the list". Resolution: FR-007 is reduced to error-recovery (preserving user input across an error is semantic, not merely visual). The "visible loading during operations longer than 2 s" part is moved to NFRs. The auto-retry counter-argument → Open Question (whether to implement backoff in v1).
- FR-008: A user sees the list of proposed flashcards; for each one they may pick one of three actions (accept / edit inline before accepting / reject), AND they have bulk actions available (accept all remaining, reject all remaining). Priority: must-have
  > Socrates: Counter-argument considered: "without bulk actions friction comes back — a student clicking 20 times across 20 good proposals loses the point of the AI shortcut". Resolution: the FR is expanded with bulk actions (accept-all / reject-all over the still-undecided proposals). Inline-edit complexity stays (consciously chosen earlier); the default action for unmarked proposals → Open Question.
- FR-009: Accepted proposals are saved as flashcards in the user's chosen existing deck or in a new deck; the new deck's name is proposed automatically (e.g. the first ~50 characters of the source text, truncated) and is editable by the user before saving and later. Priority: must-have
  > Socrates: Counter-argument considered: "requiring a manual name at save time is friction; an auto-name with the option to edit is better". Resolution: the FR is revised — the system proposes an auto-name by default, the user may overwrite it before saving or later (via the normal deck edit). The counter-argument about losing the session if the browser tab is closed → Open Question ("auto-save of the proposal draft before saving the deck — in MVP?").

### Manual flashcard CRUD

- FR-010: A user can manually create a flashcard (a non-empty question + a non-empty answer) and add it to a chosen deck. Priority: must-have
  > Socrates: Counter-arguments considered: "manual creation drags down the 75%-from-AI metric", "any flashcard can be created via the generator by pasting a one-line input", "full CRUD bloats the MVP". Resolution: the FR stands (literally required by idea-notes). The metric risk is addressed in Success Criteria: the 75%-from-AI ratio is measured over flashcards in the library, not over session events; manual creation still delivers value to the student even if it "hurts" the metric.
- FR-011: A user can edit any flashcard in their deck; at the moment of editing they may optionally indicate that the change should reset the card's SR state (default: SR state is preserved; the "reset SR" option is at the user's discretion per edit). Priority: must-have
  > Socrates: Counter-argument considered: "editing the question or answer should RESET SR, because cognitively this is a different card — preserving SR lies to the memory model". Resolution: the FR is revised — by default SR is preserved (typos and minor edits are typical), but the user can pick reset per edit (when rephrasing heavily). The "minor vs. major edit" decision is delegated to the user; the system does not try to tell them apart.
- FR-012: A user can delete any flashcard from their deck. Deleting the last flashcard in a deck does NOT delete the deck itself — an empty deck stays and can be filled again later. Priority: must-have
  > Socrates: Counter-arguments considered: "no undo after a hard-delete" and "what happens to an empty deck?". Resolution: no undo accepted in MVP (soft-delete / trash → v2); empty decks explicitly remain (intentionally deleting cards does not always equal intent to delete the deck).
- FR-013: A user can create a new deck (with a name), rename an existing deck, and see the list of all their decks. Priority: must-have
  > Socrates: Counter-argument considered: "a name alone is not enough — a student with 10 decks needs folders / tags / colors / sorting". Resolution: deck organization (folders, tags, colors, sorting) is consciously deferred to v2. In MVP the list is flat with default sorting (an implementation detail). The student's deck count in MVP is not pinned; we assume 5–10 decks × a flat list is tolerable. Note: rename was folded into this FR as a separate capability after FR-018 (standalone "rename deck") was demoted in the Socratic round (trivial; fits within the deck management view covered by FR-013).

### Spaced repetition session

- FR-014: A user can start a review session for a chosen deck; the system presents the cards that the SR algorithm has scheduled for today (or earlier). Priority: must-have
  > Socrates: Counter-arguments considered: "cross-deck is better — all cards due today at once" and "no per-session card cap → frustration at 200 due". Resolution: per-deck is cognitively simpler in MVP (the student studies one subject at a time); cross-deck is deferred to v2. A daily-load cap (e.g. "max N cards per session") routed to Open Questions — decided after first usage data.
- FR-015: During a session the user rates each card using the scale offered by the chosen SR library (e.g. Again / Hard / Good / Easy for FSRS, or the SM-2 equivalent), and the algorithm updates that card's SR state (interval, due date). Priority: must-have
  > Socrates: Counter-argument considered: "the library's scale (0–4) carries more information than binary 'I know / I don't'; the simplification starves the algorithm". Resolution: the FR is revised — we use the library's native scale, with no custom mapping to a binary form. The scale belongs to the library; the FR only guarantees that all of the library's categories are surfaced to the user.
- FR-016: Each card's SR state (intervals, due-dates, rating history at whatever fidelity the algorithm requires) is persisted per user and used to plan subsequent sessions — tomorrow's session shows the cards scheduled for tomorrow. Priority: must-have
  > Socrates: Counter-arguments considered: "race condition on multi-device — last-write-wins drops ratings" and "the FR does not specify *what* exactly to persist for FSRS". Resolution: multi-device sync is consciously out of MVP scope (we assume one device per student in v1; conflict resolution = v2). The exact set of persisted fields is owned by the SR library plus a thin adapter layer; pinned during implementation.

### Deck management

- FR-017: A user can delete an entire deck (together with all of its flashcards and SR state). The operation requires hard confirmation — the user types the deck's name into a confirmation field, only then is the delete button active. No undo after confirmation in MVP. Priority: must-have
  > Socrates: Counter-arguments considered: "hard-delete without undo is a nuclear option" and "a plain 'Are you sure?' modal is too weak". Resolution: undo / trash consciously out of MVP; the stronger confirmation (GitHub-style "type the name to delete") enforces intentional confirmation sufficiently. Soft-delete / trash in v2.

> Note: during phase 4.5 a standalone FR-018 "the user can rename a deck" was considered. It was demoted as too trivial (a single field edit inside the deck management view) and folded into FR-013 as one of three capabilities (create / rename / list). The number FR-018 is not reused in the MVP, to avoid reference drift.

## Non-Functional Requirements

- **Privacy of source text**: text pasted by the student (their own notes, fragments of textbooks) does not remain in operator-accessible storage after the request that consumed it completes, is not shared with other users, and is not used to train any public model (a contractual commitment with the AI provider, not just a technical one).
- **User data isolation**: no authenticated user can read or modify the flashcards, decks, or spaced-repetition state of another user.
- **Durability of flashcards and spaced-repetition state**: no loss of flashcards, decks, or SR state for an individual user over the lifetime of their account. Backups and disaster-recovery procedures are out of MVP scope, but the "normal" usage cycle (closing sessions, signing in again, restarting the browser, changing the password) never causes loss of any of these three data classes.
- **AI generation latency**: for pasted text up to roughly 10 000 characters, the time to return the full list of flashcard proposals is below 30 s at the 95th percentile; the target median is below 15 s.
- **Maximum input length**: the generator accepts plain-text input up to roughly 10 000 characters; above this bound the request is rejected with a clear message, without any attempt at partial processing.
- **Continuous feedback for long operations**: every user-visible operation whose execution time exceeds 2 s presents continuous progress feedback until completion (success or error) — the product never shows a static, signal-less screen while work is in flight.
- **Authentication abuse resistance**: a legitimate user mistyping their password several times in a row is not locked out; at the same time, coordinated credential-stuffing against the login endpoint is rejected before it reaches the password store.
- **Signup automation resistance**: the registration endpoint is resistant to mass automation (bots registering thousands of fake accounts do not get meaningful throughput in MVP). The concrete mechanism is pinned in Open Questions.
- **Session lifecycle**: a user's session has a defined expiry / invalidation policy (duration, behavior after the browser is closed). The concrete values are pinned in Open Questions.
- **Password reset reliability**: a reset email-link issued in response to a "forgot password" request is deliverable, works exactly once, and expires no later than 24 h after issuance.
- **Spaced-repetition algorithm correctness**: a card scheduled by the algorithm for day D is shown exactly once in the session run on day D (or in the first session after day D, if the user does not open the application on day D); no card is dropped and no card appears in a session in which it should not appear.
- **Browser support**: the product is functional in the latest two major versions of each of the four mainstream desktop browsers (Chrome, Firefox, Safari, Edge). Full mobile support (Safari iOS, Chrome Android) is out of MVP scope, but the application should remain usable on narrow viewports (graceful degradation).

## Business Logic

From pasted raw source text (a student's notes, a textbook fragment), 10xCards proposes a set of question-and-answer flashcards covering the key facts of that text, which the user then accepts, edits, or rejects before they are added to a deck.

The rule consumes three classes of user input: (1) the source text itself — any plain-text fragment pasted into the generator, bounded above in length; (2) the deck context — the user's choice of an existing target deck or a request to create a new one; (3) a review decision per proposed flashcard — accept, edit-and-accept, or reject. The rule makes no assumption about the language, style, or structure of the source text, accepting both classroom notes and textbook excerpts.

The rule's output is a set of "question — answer" pairs proposed as candidate flashcards, where each candidate ends its review cycle in one of three statuses (accepted / accepted-after-edit / rejected). Only candidates in an accepted status (with or without edits) are saved as flashcards into the chosen deck and from that moment enter the spaced-repetition cycle with a pristine SR state.

The user encounters this rule twice in a single generation session: once when pasting the text and confirming the request (kicking off generation → waiting for proposals), and again during the review of the candidate list (per-candidate decisions plus bulk actions). Accepted flashcards become immediately available — right after the deck save — in the review sessions planned by the spaced-repetition algorithm.

## Access Control

A multi-user model with a flat hierarchy. Every registered user sees and edits only their own flashcards and decks — no sharing, no "teacher / student" roles, no application-level admin in MVP.

- **Sign-up**: email + password. No OAuth (Google/Apple) and no magic-link in MVP — intentionally, to limit the integration surface during the first three weeks.
- **Sign-in**: the same pair (email + password).
- **Session**: persistence of the sign-in across visits (the concrete expiry policy → Open Questions).
- **Password reset**: required (email-based reset link) — without it, a user who loses their password loses all of their decks, which is unacceptable for spaced repetition (a multi-week / multi-month retention loop).
- **Ungated routes**: only the landing page / marketing pages. Every product feature (generation, editing, browsing, review session) requires a signed-in account.
- **Gated routes**: everything outside the landing page — anonymous users are redirected to the sign-in screen, with no read-only preview.
- **Data isolation boundary**: user A cannot read or modify any flashcard or deck belonging to user B. The MVP contains no sharing mechanism (see Non-Goals below).

## Non-Goals

The 10xCards MVP explicitly does NOT do the following. The list is active — any of these items appearing during implementation is a scope-creep signal and must be addressed.

**Functional non-goals (capabilities the MVP will not build):**

- **An in-house advanced spaced-repetition algorithm** (SuperMemo-grade, FSRS-from-scratch, Anki-equivalent). The MVP uses a ready open-source library — no homegrown SR engine.
- **File imports in any format other than plain text** (PDF, DOCX, EPUB, slides, OCR from images). The MVP accepts copy-paste plain text only.
- **Sharing decks between users** (shared decks, public links, a deck marketplace, "copy someone else's deck"). A closed, single-user ecosystem.
- **Integrations with other educational platforms** (LMSes such as Moodle / Canvas, Anki import/export, Quizlet sync, Google Classroom). 10xCards is a standalone application, not a hub.
- **Native mobile applications (iOS / Android)**. Web only in MVP. A browser on a phone is enough (graceful degradation per NFRs).
- **OAuth / social login / magic-link / passwordless authentication**. Email + password only. Additional sign-in paths are out of scope.
- **Teacher / admin / student roles**. Flat model — all users are equal and see only their own data.
- **Folders / tags / colors / custom sorting of decks**. Flat list in MVP.
- **Undo / trash / soft-delete / change history for flashcards and decks**. All delete operations are hard-deletes (with a hard confirmation for decks); no recovery of deleted items.
- **Multi-device sync with conflict resolution**. The MVP assumes one device per user; signing in from a second device works, but conflicts from rating cards in parallel sessions are out of scope.
- **Cross-deck review sessions** (simultaneous review of cards due today across multiple decks). The session is per-deck in MVP.
- **Demo / try-without-account**. The entire application is behind the sign-in.

**Non-functional non-goals (quality dimensions the MVP will not aim for):**

- **Offline-first / PWA-installable**. The product requires an internet connection (both for AI generation and for SR-state persistence).
- **Full WCAG-AA accessibility certification**. Baseline-friendly UX (readable contrast, keyboard as the primary navigator, semantic markup) is the target; a formal audit and full conformance are out of MVP scope.
- **Compliance beyond a GDPR baseline** (SOC 2, ISO 27001, HIPAA, FERPA, formal Polish-law education-data requirements for minors). The MVP keeps personal-data hygiene aligned with GDPR but holds no certification.
- **An in-house AI-quality evaluation pipeline** (golden sets, automated quality regression tests, A/B testing across models). The 75%-acceptance metric is measured naturally from user behavior, with no formal model-evaluation pipeline.
- **Internationalization (i18n) / a multilingual UI**. Polish UI only in MVP (the target persona is a Polish matura candidate).

## Open Questions

Questions the shape phase did not resolve and which should be addressed in the PRD, in further chain steps (`/10x-prd`, `10x-tech-stack-selector`), or during implementation. Each entry: question name → context → who should resolve it.

1. **Anti-bot mitigation on signup** — does the MVP ship a CAPTCHA / honeypot / signup rate-limit, or is it deferred to v2? Owner: user. (Surfaced in: FR-001 Socratic.)
2. **Auto-logout after N minutes of inactivity** — is it in MVP at all, and what is N? (Currently the session is persistent by default.) Owner: user. (FR-003 Socratic.)
3. **Maximum input length (exact value)** — placeholder ~10 000 characters in NFRs; the true value depends on the chosen AI provider's token cost. Owner: stack-selector + first measurements.
4. **Auto-retry with exponential backoff on AI errors** — MVP or v2? Owner: implementation. (FR-007 Socratic.)
5. **Default action for undecided proposals** — what happens at deck-save time for proposals the user left without an explicit action? (Accepted by default? Rejected? Skipped with a warning?) Owner: user. (FR-008 Socratic.)
6. **Auto-save of the proposal draft before saving the deck** — MVP or v2? Do we accept the risk of losing the entire review if the browser tab is closed? Owner: user. (FR-009 Socratic.)
7. **Daily-load cap "max N cards per review session"** — does the MVP cap the number of cards in a single session, or does it show all cards due today? Decided after first usage. Owner: implementation + usage observation. (FR-014 Socratic.)
8. **Session lifecycle policy (duration, post-close behavior)** — values pinned during implementation. Owner: stack-selector + implementation. (NFRs.)
9. **AI proposal quality in Polish** — is the 75%-acceptance target achievable with a default prompt and the available models, or does it require per-subject calibration (biology vs. history vs. civics)? Owner: testing after MVP launch. (FR-006 Socratic.)

---

## Timeline acknowledgment

> Non-schema section — informational for `/10x-prd`, not mapped into the PRD.

Acknowledged on 2026-05-18: the 3-week MVP target was chosen deliberately despite the surfaced scope-cost (auth + password reset, LLM integration, AI proposal review UX, review session + SR library, manual flashcard CRUD, landing + polish). The optimistic sum is roughly 15–25 working days vs. ~30 hours of after-hours budget across 3 weeks. The user accepts the risk that some areas may need to be compressed during implementation; if that becomes necessary, the first candidate for reduction is the AI proposal review UX (e.g. instead of a full inline editor — only accept/reject in v1, edit in v2).

## Forward: tech-stack

> Non-schema section — informational for `10x-tech-stack-selector`, not mapped into the PRD.

- **Web app (browser-only) in MVP** — no native applications, no PWA-installable. Support for the latest 2 major versions of Chrome / Firefox / Safari / Edge.
- **Spaced-repetition library** — ready, open-source (candidates: `ts-fsrs`, `fsrs.js`, or an SM-2 equivalent). The concrete library is chosen in the stack-selector.
- **AI/LLM provider** — via an external API (no self-hosted model — cost, latency, and complexity are out of MVP budget). Concrete provider + model: a stack-selector decision with emphasis on Polish-language quality and cost per generation.
- **Auth** — email + password (FR-001..FR-004) + password reset via email-link. Requires a transactional email service.
- **Persistence** — requires durable storage for: user accounts (with hashed passwords), decks, flashcards, SR state per card. Choice of technology (SQL, NoSQL, managed service) is made in the stack-selector.
- **No file parsers** — the "no PDF/DOCX import" non-goal eliminates the need for document-parsing libraries in MVP.
- **Scalability insight (Socrates Step 6)**: at 10 000+ users the LLM cost per generation becomes the dominant operational constraint → per-user rate-limits, cost monitoring, and possibly a cheaper model or prompt caching will be needed. At MVP scale (medium ≤ ~100 users) this constraint does not bite, but the design of the generation layer should leave room for such measures in v2.

## Quality cross-check

> Non-schema section — informational for `/10x-prd`, not mapped into the PRD.

Cross-check run in phase 7. All 5 elements of the greenfield quality bar (Access Control, Business Logic, Project artifacts, Timeline-cost acknowledgment, Non-Goals) — present. No gaps to flag as warnings. The "Preserved behavior" element does not apply (greenfield).

Status: `accepted`. The 9 open questions captured during the shape phase (the `## Open Questions` section above) are NOT treated as quality-bar gaps — they are deliberately deferred decisions, which `/10x-prd` will carry over verbatim into the PRD's `## Open Questions`.
