# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Always write user-facing text in Polish

- **Context**: Any UI string, label, button, message, toast, error, or copy rendered to the end user — across pages, components, and API responses. 10xCards is a Polish-only product.
- **Problem**: Agents scaffold new components and strings in English by default, leaving a mixed PL/EN UI; the S-06 slice exists partly to clean up English strings that accumulated across earlier slices.
- **Rule**: All text presented to the user must be written in Polish. Never introduce English user-facing strings; new UI copy, labels, messages, and errors are authored in Polish.
- **Applies to**: plan, implement, impl-review

## All modals must use a react-doom portal

- **Context**: Any modal/dialog component in the codebase.
- **Problem**: Modals rendered inline may be clipped or hidden by parent stacking contexts, causing z-index issues.
- **Rule**: All modals must be rendered using a portal from react-doom. Never render modal/dialog components inline in the DOM tree.
- **Applies to**: all
