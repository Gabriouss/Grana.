---
name: anti-ui-slop
description: >
  Detect, review, prevent, and remove AI-generated UI convergence patterns ("AI slop")
  in frontend code. Use whenever building or styling a UI, reviewing frontend changes,
  refining visual design, or when the user asks to remove the AI look, make an interface
  feel human-designed, polish a page, audit UI quality, or explain why a design feels
  generic. Covers HTML, CSS, JSX/TSX, Vue, Svelte, and Tailwind; audits 46 catalogued
  patterns plus composition-level checks, separates source-confirmed, rendered, and
  judgment-based evidence, and rewrites authorized code toward a product-specific design
  direction without requiring external dependencies.
license: MIT
---

# Anti UI Slop

## Goal

AI-generated interfaces reveal themselves through convergence: familiar fonts, palettes,
card anatomies, copy rhythms, spacing, and motion accumulate until the page could belong to
any product. A single fashionable choice provides weak evidence. Repeated context-free choices
provide strong evidence.

The finished interface should express its product, audience, content, and constraints. Removing
a tell counts as progress only when the replacement strengthens that specificity.

Keep two classes of findings separate:

- **Quality failures** reduce accessibility, readability, robustness, or performance. Confirmed
  failures receive correction recommendations in reviews and fixes in authorized edit tasks.
- **Slop signals** reveal convergence. Context, repetition, composition, and product fit determine
  whether they become actionable findings.

## Operating contract

- Match the user's authorization. Review and audit requests produce findings only. Diagnose
  requests explain causes only. Build, fix, refine, and polish requests authorize edits.
- Preserve the established design system, brand language, component conventions, responsive
  behavior, semantics, and interaction behavior.
- Read changed UI files first, then shared tokens, layout primitives, typography, and representative
  pages. Existing intent supplies the design direction.
- Exclude generated output, dependency code, lockfiles, snapshots, and intentional anti-pattern
  specimens. Storybooks, design-system galleries, and documentation examples need page-context
  confirmation before they count as repeated composition.
- Use existing fonts, packages, icons, and assets. Obtain user authorization before adding a
  dependency, remote font, generated image, or broad design-system change.
- Preserve product facts. Remove unsupported metrics and decorative claims; never invent evidence.
- Keep fixes scoped. A local tell receives a local fix. A repeated system-level tell receives a
  token or primitive fix.

## Workflow

1. **Scope the interface.** Identify the route, components, styles, and shared primitives that
   control the requested surface. Inspect recent or changed files first in an existing project.
2. **Write the direction.** State one sentence before editing:
   `[product/audience] should feel [qualities]; [content] has priority; [constraints] shape the UI.`
3. **Scan in three passes.** Check quality failures, catalogued slop signals, then composition-level
   repetition across the whole page.
4. **Classify the evidence.** Assign layer, confidence, and context. Record earned exemptions.
5. **Fix the highest-leverage cause.** Correct shared tokens and repeated structures before isolated
   selectors. Let content hierarchy determine layout, emphasis, and rhythm.
6. **Verify.** Inspect the diff, run existing checks, and perform rendered checks when a browser or
   preview is available.
7. **Report the outcome.** Lead with findings for reviews. Lead with implemented changes for edit
   requests. Include remaining rendered-verification items.

## Evidence model

| Layer | Meaning | Reporting rule |
|---|---|---|
| **Source** | Literal markup, styles, tokens, or copy provide direct evidence | Cite the selector, class, component, or text and its source line |
| **Render** | Computed layout, stacking, viewport size, or composited color determines the result | Confirm in a rendered page; otherwise label `Candidate - needs rendered verification` |
| **Judgment** | Product context and page composition determine whether a pattern is earned | Cite at least two concrete observations and explain the product mismatch |
| **Opt-in** | Provider-associated weak signal from the reference catalog | Keep silent unless the user requests an aggressive/provider-specific sweep |

Use these confidence levels:

- **Confirmed:** direct quality failure, rendered failure, or unmistakable source pattern with its
  component role verified.
- **Probable:** one dominant slop signature or at least two independent slop signals within the same
  region.
- **Candidate:** missing rendered evidence, unresolved variables, incomplete component context, or a
  weak global signal.
- **Exempted:** the pattern communicates real meaning, follows the established brand, or serves a
  functional interaction.

Severity and confidence answer different questions. Severity describes user impact; confidence
describes evidential strength.

- **Critical:** blocks access or use, ships a broken asset, hides required content, or creates a major
  accessibility failure.
- **High:** affects a primary flow or dominates a page through a repeated slop cluster.
- **Medium:** affects a local component, secondary flow, or isolated slop signature.
- **Low:** cleanup with limited user impact. Keep unverified Candidates in their own section.

Accuracy rules:

- Quality findings can stand alone. Slop findings need a dominant signature or a local cluster.
- Weak global signals **T8, T9, C1, and C5 never stand alone**. Fonts and colors become evidence
  through their relationship with layout, type hierarchy, copy, and decoration.
- Count related symptoms once. An identical feature grid with icon tiles is one compositional cluster,
  with both rule IDs cited as supporting evidence.
- Follow variables, component variants, conditional classes, and shared tokens to their effective use.
- Use the rendered DOM for heading order when component composition changes source order.
- Trace localized strings and mapped components to their rendered role before applying copy or
  repetition rules.
- Treat demo pages that intentionally display bad UI as specimens. Preserve the demonstrated defect.
- Treat thresholds as screening values. Component role, physical size, language, density, and viewport
  determine the final judgment.

## Replacement principles

- **Structure follows content.** Comparable items suit tables or aligned lists. Sequences suit steps.
  Narrative content suits editorial flow. Interactive choices suit controls with clear boundaries.
- **Hierarchy uses a system.** Establish explicit roles for display, heading, body, label, and data.
  A single font family can support strong hierarchy through size, weight, width, optical size, and
  spacing. A second family earns its place through a clear role.
- **Color carries a job.** Assign colors to brand, action, status, emphasis, and surfaces. Repeated
  decorative gradients and glows dilute those jobs.
- **Spacing communicates relationship.** Related items sit close. Sections receive larger separation.
  Repeated spacing tokens remain useful when their semantic roles differ visibly.
- **Motion communicates state, continuity, or causality.** Default surfaces stay still. One meaningful
  transition carries more value than many ornamental effects.
- **Decoration carries meaning.** Domain artifacts, real product UI, data, photography, diagrams, and
  brand motifs provide specificity. Generic icons and blobs disappear when they carry no information.
- **Asymmetry follows priority.** Give more space to more important content. Avoid arbitrary card-size
  variation created solely to appear designed.

## The 46-rule catalog

The catalog preserves the reference split: 41 deterministic candidates, five Judgment rules, and
four provider-specific Opt-in modifiers.

### Visual details

| ID | Kind | Layer | Candidate and confirmation | Correction |
|---|---|---|---|---|
| **V1 Border accent on rounded element** | Slop | Source | Colored border `>= 2px` and radius `>= 12px` on the same generic card. Outlined controls and an established graphic style can earn it | Choose one edge strategy: neutral 1px border, lower radius, or no border |
| **V2 Glassmorphism everywhere** | Slop | Judgment | Repeated translucent cards and `backdrop-filter: blur` decorate static content. Functional overlays can retain blur | Use opaque surfaces and express hierarchy through contrast, spacing, and elevation |
| **V3 Side-tab accent border** | Slop | Source | One side of a card has a colored border `>= 3px`. Confirm whether it encodes status or category | Use a status dot, icon, label, or restrained tint when meaning exists; remove empty decoration |
| **V4 Hairline border with wide shadow** | Slop | Source + opt-in GPT | A 1px border and shadow blur `>= 20px` share one element | Keep the crisp edge or the soft elevation |
| **V5 Repeating-gradient stripes** | Slop | Source + opt-in GPT | `repeating-linear-gradient` or `repeating-conic-gradient` decorates a surface. Progress indicators and diagrams can earn the pattern | Use a solid surface or an existing brand texture |
| **V6 Extreme border radius** | Slop | Judgment | Radius `>= 24px` turns a small card, section, or input into a blob. Pills, tags, and large shaped panels are role-based exceptions | Use a role-based radius scale; common cards land around 8-16px |
| **V7 Amateurish hand-drawn SVG** | Slop | Judgment | A complex inline SVG scene or mascot has rough illustrative geometry. Icons, logos, diagrams, and data visualization are exempt | Use a real asset, simplify to a purposeful diagram, or remove the illustration |

### Typography

| ID | Kind | Layer | Candidate and confirmation | Correction |
|---|---|---|---|---|
| **T1 Flat type hierarchy** | Slop | Source | Adjacent roles differ by less than about 1.25x and also lack contrast in weight, family, spacing, or color | Define fewer roles with clearer combined contrast; use the ratio as a screening heuristic |
| **T2 Icon tile stacked above heading** | Slop | Source | Repeated feature cards use a rounded-square icon tile directly above a heading | Align icon and heading, place the icon in flow, or remove the container |
| **T3 Italic serif display headline** | Slop | Source | Serif italic `>= 32px` leads a generic startup hero. Editorial and fashion contexts can earn it | Use roman styling or a display treatment derived from the brand register |
| **T4 Hero eyebrow or pill chip** | Slop | Source | Tiny tracked uppercase text or a pill sits immediately above the hero heading. Breadcrumbs, status, and release metadata are functional exceptions | Fold the information into the heading, navigation context, or body copy |
| **T5 Repeated section kickers** | Slop | Source | Three or more sections repeat the same uppercase tracked mini-label | Let heading hierarchy, artifacts, and section-specific structure create navigation |
| **T6 Oversized hero headline** | Slop | Source | A heading with roughly eight or more words uses `>= 48px` or `text-5xl` styling | Shorten the claim or reduce the responsive size so supporting content remains visible |
| **T7 Crushed letter spacing** | Slop | Source | Display tracking is tighter than `-0.05em`; body text carries negative tracking | Restore character shapes; use modest optical tightening around `0` to `-0.02em` |
| **T8 Overused font** | Slop | Source, weak | Inter, Geist, Space Grotesk, or Instrument Serif appears as the default identity. Brand and system constraints are valid | Report only with other convergence signals; strengthen roles with existing fonts before proposing a new face |
| **T9 Single font for everything** | Slop | Source, weak | One family also uses nearly identical weight, width, spacing, and proportions across every role | Build contrast inside the family or add a second family with a defined display, body, or data role |
| **T10 All-caps body text** | Quality | Source | Paragraphs or long blocks around 20+ words use uppercase | Use sentence case; reserve uppercase for short labels |

### Color and contrast

| ID | Kind | Layer | Candidate and confirmation | Correction |
|---|---|---|---|---|
| **C1 AI color palette** | Slop | Source, weak | Purple/violet gradients or cyan-on-dark dominate without brand evidence | Report only as a cluster signal; derive action, status, surface, and accent colors from existing product context |
| **C2 Dark mode with glowing accents** | Slop | Source | Dark surfaces repeat colored box shadows or neon text shadows. Focus rings and meaningful state glows are exempt | Use neutral elevation and bounded state indicators |
| **C3 Gradient text** | Slop | Source | `background-clip: text` and transparent fill decorate headings, metrics, or many labels | Use solid text color and express emphasis through hierarchy |
| **C4 Gray text on colored background** | Quality | Source/Render | Neutral gray sits on a chromatic surface and loses contrast | Use a light or dark tint related to the surface hue and verify contrast |
| **C5 Cream or beige reflex** | Slop | Source, weak | Warm off-white becomes the whole page's generic tasteful surface without a supporting palette | Report only as a cluster signal; establish deliberate surface, ink, accent, and status colors |

### Layout and space

| ID | Kind | Layer | Candidate and confirmation | Correction |
|---|---|---|---|---|
| **L1 Hero metric layout** | Slop | Judgment | Hero centers a large number, tiny label, and supporting stats with generic accent treatment or unsupported claims | Lead with the product, artifact, or verified evidence; preserve only meaningful metrics |
| **L2 Identical card grids** | Slop | Judgment | Four or more siblings repeat icon, heading, and paragraph with identical sizing. Comparable interactive items can benefit from consistency | Choose a structure from the content: ranked layout, table, list, accordion, or genuinely uniform controls |
| **L3 Monotonous spacing** | Slop | Source | The same gap or padding token serves item, group, component, and section boundaries with no visible rhythm | Map spacing tokens to semantic relationships and create clear grouping contrast |
| **L4 Nested cards** | Slop | Source | Three or more nested levels repeat borders, fills, radii, or shadows. Semantic wrappers without repeated chrome are exempt | Remove redundant surfaces; group with spacing, headings, dividers, or one shared container |
| **L5 Numbered section markers** | Slop | Source | Display `01 / 02 / 03` labels decorate independent sections | Keep numbers for real sequences, timelines, ranks, or references |
| **L6 Line length too long** | Quality | Render | Running text exceeds about 80 characters per line. Code, tables, and deliberate data regions are exempt | Constrain prose to roughly `60ch-75ch` |
| **L7 Content overflowing its container** | Quality | Render | Text or media spills, clips, or creates accidental horizontal scroll | Wrap, constrain, truncate with an accessible affordance, or provide deliberate scrolling |
| **L8 Positioned child clipped by overflow container** | Quality | Render | A tooltip, menu, or popover is cut by an ancestor using `overflow: hidden` or `clip` | Move the layer outside the clipping context, use a portal, or change overflow where safe |

### Motion

| ID | Kind | Layer | Candidate and confirmation | Correction |
|---|---|---|---|---|
| **M1 Bounce or elastic easing** | Slop | Source | Dialogs, cards, and routine controls use overshoot curves or repeated spring effects. Playful or physical interactions can earn them | Use a restrained ease-out curve and shorter travel |
| **M2 Layout-property animation** | Quality | Source | Large or repeated transitions animate width, height, padding, margin, top, or left and cause reflow | Prefer transform and opacity; use a bounded disclosure pattern for necessary height changes |
| **M3 Image hover transform** | Slop | Source + opt-in Gemini | Generic cards repeatedly scale or rotate imagery on hover. Product zoom controls are functional exceptions | Keep imagery still or use a restrained overlay, caption, or border response |

### Copy

| ID | Kind | Layer | Candidate and confirmation | Correction |
|---|---|---|---|---|
| **P1 Em-dash overuse** | Slop | Source | A body block contains three or more `—` characters or repeated equivalent HTML entities. Apply language-aware judgment | Rewrite with sentence boundaries, commas, colons, or parentheses |
| **P2 Marketing buzzword** | Slop | Source | Generic claims such as `supercharge`, `streamline`, `empower`, `world-class`, `enterprise-grade`, `seamlessly`, or `unlock` lack a concrete object or outcome | Name the exact action, object, user, and result |
| **P3 Aphoristic cadence** | Slop | Source | Multiple sections repeat patterns such as `Not X. Y.` or `Less X. More Y.` | Replace the cadence with direct product facts and natural sentence rhythm |
| **P4 Theater framing copy** | Slop | Source + opt-in GPT | Marketing dismisses a category as `theater` without explaining the practical failure. Established domain terms such as security theater require context | State the behavior, limitation, or consequence directly |

### Imagery

| ID | Kind | Layer | Candidate and confirmation | Correction |
|---|---|---|---|---|
| **I1 Broken or placeholder image** | Quality | Source | Rendered image markup has missing or empty `src`, `#`, known placeholder services, or placeholder API paths. Confirm conditional branches | Use a real asset, a generated asset with authorization, a fallback, or remove the element |

### General quality

| ID | Kind | Layer | Candidate and confirmation | Correction |
|---|---|---|---|---|
| **Q1 Cramped padding** | Quality | Render | Text or controls sit within about 8px of a bordered or colored edge. Dense tables and tiny badges use role-specific spacing | Provide enough internal space for the component's role; 12-16px suits common controls and cards |
| **Q2 Body text touching viewport edge** | Quality | Render | Running text reaches the viewport edge, especially on mobile. Full-bleed media is exempt | Add a responsive content gutter, commonly at least 16px on narrow screens |
| **Q3 Justified text** | Quality | Source | Screen body copy uses `text-align: justify` without effective hyphenation and language support | Left-align body copy or enable tested hyphenation for an editorial use case |
| **Q4 Low contrast text** | Quality | Source/Render | Text misses WCAG AA: 4.5:1 for normal text and 3:1 for large text. Variables, alpha, gradients, and imagery require rendered verification | Adjust foreground, background, weight, or size and verify the computed result |
| **Q5 Skipped heading level** | Quality | Source/Render | The rendered outline jumps from `h1` to `h3` or similar | Restore sequential semantic levels and keep visual styling in classes |
| **Q6 Tight line height** | Quality | Source | Multi-line body text uses line height below about `1.3`. Display headings are role-based exceptions | Use roughly `1.45-1.7` according to typeface and measure |
| **Q7 Tiny body text** | Quality | Source | Running body text is below 12px; 12-13px body copy remains a readability risk. Captions and dense data labels need context | Use at least 14px for body copy; 16px is a strong default |
| **Q8 Wide letter spacing on body** | Quality | Source | Paragraphs use tracking above `0.05em` | Restore normal tracking; reserve wide tracking for short labels |

## Composition checks beyond the catalog

These page-level checks catch the synthetic specimens represented in the reference gallery:

- **X1 Motion saturation:** many elements enter, float, pulse, wiggle, or bounce. Keep motion tied to the
  single state change or spatial relationship that needs explanation.
- **X2 Decorative priority inversion:** icon containers, badges, or ornaments occupy more visual weight
  than the message they introduce. Reduce or remove them.
- **X3 Redundant UX writing:** label, sublabel, helper, placeholder, and hint repeat the same fact. Keep
  the shortest complete instruction and retain helper text that adds new information.
- **X4 Modal abuse:** a scrolling, multi-column, multi-section workflow lives inside a modal. Move
  sustained work to a page or panel and reserve the modal for a bounded decision.

## Fix order

Apply fixes in this sequence to prevent cosmetic churn:

1. Broken behavior, accessibility, overflow, and readability.
2. Information architecture and unsupported content.
3. Repeated page templates, card anatomy, and container depth.
4. Type hierarchy, spacing rhythm, and color roles.
5. Decorative borders, gradients, glows, radii, icons, and motion.
6. Copy cadence and redundant labels.

After each system-level change, rescan the page. One primitive edit can clear many local symptoms.

## Verification

- Inspect the final diff for swapped defaults, new dependencies, invented claims, and unrelated churn.
- Run the project's existing formatter, typecheck, tests, and build in proportion to the change.
- When rendering is available, check desktop and mobile widths, horizontal scroll, line measure,
  contrast, popover clipping, keyboard focus, reduced motion, and content expansion.
- When rendering is unavailable, list every Render-layer item as unverified. Do not present it as a
  confirmed defect.
- Apply four final tests:
  - **Swap test:** another product would require meaningful visual and content changes.
  - **Hierarchy test:** the most important content wins attention without decorative assistance.
  - **System test:** repeated values express consistent roles and deliberate exceptions.
  - **Restraint test:** every strong visual effect has a defined job.

## Reporting

For a review, list findings first in severity order with file and line references. For an edit, lead
with the implemented result and list the important changes. Use this structure when detail helps:

```text
DIRECTION
Internal logistics dashboard: dense, calm, utilitarian; operational data carries priority.

FINDINGS OR CHANGES
Location              | Rule    | Confidence | Evidence                    | Action
src/Form.tsx:31       | C4      | Confirmed  | gray text on blue surface   | use blue-tinted light text
src/Card.tsx:12       | V3      | Probable   | border-l-4 on status card   | replace with status dot
src/page.tsx:44       | L2/T2   | Probable   | six identical feature cards | use ranked comparison list

NEEDS RENDERED VERIFICATION
src/Popover.tsx:18    | L8      | Candidate  | clipped ancestor found      | verify open state at mobile width

EXEMPTIONS
src/Steps.tsx:9       | L5      | Exempted   | markers label a real sequence

VALIDATION
typecheck passed; mobile render checked; no horizontal overflow
```

Keep reports concise. Explain why a change belongs to this product. A list of removed classes provides
less value than the resulting design logic.
