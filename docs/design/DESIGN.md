# Glowing Spoon — Design Guidelines

> Single source of truth for all UI decisions. Every visual choice here exists for a reason.
> Read this before writing a single line of CSS or JSX.

---

## Design Philosophy

Mission Control is a **command interface**, not a marketing page. PMs are watching agents work in real time. The UI must communicate system state instantly, stay out of the way when things are running smoothly, and snap to attention when action is needed.

**Three principles that drive every decision:**
1. **Signal over noise.** White space is functional. Density is earned by importance.
2. **State is always visible.** A PM should know what every agent is doing without reading prose.
3. **Errors demand attention, not discovery.** Red is reserved exclusively for failure states.

---

## Color System

```
Baseline (background)     #FFFFFF   — bright white, primary surface
Surface elevated          #F7F7F5   — off-white, cards, panels, sidebars
Surface sunken            #F0F0ED   — inputs, code blocks, inactive tabs

Text primary              #0D0D0D   — near-black, headings and body
Text secondary            #6B6B6B   — labels, metadata, timestamps
Text disabled             #ADADAD   — placeholder, inactive items

Border default            #E3E3E0   — light grey, all dividers and input edges
Border focus              #0D0D0D   — black ring on focused inputs
Border subtle             #ECECEA   — very light, table rows, list separators

CTA / Primary action      #000000   — black, primary buttons and key links
CTA text                  #FFFFFF   — white text on black buttons

Error / Destructive       #C0392B   — red, error states, BLOCKING attention items
Error surface             #FDF0EF   — light red tint, error message backgrounds
Error border              #E8A09A   — muted red border for error containers

Warning                   #B45309   — amber, WARNING attention items
Warning surface           #FFFBEB   — light amber tint
Warning border            #FCD34D   — amber border

Success / Pass            #1A6B3C   — dark green, quality gate pass, complete states
Success surface           #F0FAF4   — light green tint

Agent status colors (used only in StatusDot and AgentCard badges):
  idle        #ADADAD   — grey
  running     #2563EB   — blue
  passed      #1A6B3C   — green
  retrying    #B45309   — amber
  escalated   #C0392B   — red
  complete    #0D0D0D   — black
```

**Rules:**
- Black and white are the only colors used on interactive chrome (buttons, nav, links).
- Red (`#C0392B`) appears ONLY for error states and BLOCKING attention items. Never decorative.
- Blue (`#2563EB`) appears ONLY as the "running" agent status dot. Never on buttons or backgrounds.
- No gradients. No shadows beyond `0 1px 3px rgba(0,0,0,0.06)` for card elevation.

---

## Typography

**Font family:** Inter — the same geometric sans-serif used on Claude.ai.
Load via Google Fonts:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
```

```css
font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif;
```

**Type scale:**

| Role              | Size     | Weight | Line height | Usage                          |
|-------------------|----------|--------|-------------|--------------------------------|
| Display           | 24px     | 600    | 1.25        | Page titles, session headers   |
| Heading           | 18px     | 600    | 1.3         | Section headings, panel titles |
| Subheading        | 14px     | 600    | 1.4         | Card labels, agent names       |
| Body              | 14px     | 400    | 1.6         | All general content            |
| Body small        | 13px     | 400    | 1.5         | Metadata, timestamps, scores   |
| Label             | 12px     | 500    | 1.4         | Input labels, nav items, tags  |
| Mono              | 13px     | 400    | 1.6         | Code, file paths, JSON output  |

```css
/* Mono stack */
font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace;
```

**Rules:**
- Never use font-weight 700 or bold. Max is 600 (semibold).
- Never use italic outside of code comments displayed in OutputViewer.
- Letter-spacing: `0` for all body text. `-0.01em` for Display only.

---

## Logo

```
Glowing Spoon
```

- Rendered in Inter 600, 16px, color `#0D0D0D`
- No icon, no symbol, no color — text only
- Always top-left of the top navigation bar
- Never truncated, never wrapped
- Clicking the logo navigates to WorkspaceSelector (home)

---

## Layout

### Grid

```
┌─────────────────────────────────────────────────────┐
│  TOP NAV (56px fixed height)                        │
├──────────────┬──────────────────────────────────────┤
│              │                                      │
│  LEFT SIDE   │   MAIN CONTENT AREA                  │
│  NAV         │                                      │
│  (240px      │   max-width: 1200px                  │
│  fixed)      │   padding: 0 32px                    │
│              │                                      │
│              │                                      │
├──────────────┴──────────────────────────────────────┤
│  FOOTER (40px fixed height)                         │
└─────────────────────────────────────────────────────┘
```

**Rules:**
- `overflow-x: hidden` on `<body>` — no horizontal scrolling ever.
- Top nav: `position: fixed`, `z-index: 100`, `width: 100%`.
- Left nav: `position: fixed`, `top: 56px`, `height: calc(100vh - 96px)`, `overflow-y: auto`.
- Main content: `margin-left: 240px`, `margin-top: 56px`, `margin-bottom: 40px`.
- Footer: `position: fixed`, `bottom: 0`, `width: 100%`.
- Never set `min-width` on any layout container.

### Spacing scale (8px base)

```
4px   — xs   (tight label gaps, icon padding)
8px   — sm   (inline element spacing)
16px  — md   (component internal padding)
24px  — lg   (between related components)
32px  — xl   (section breaks, page padding)
48px  — 2xl  (major section separation)
```

---

## Navigation

### Top Navigation Bar

```
┌──────────────────────────────────────────────────────────┐
│  Glowing Spoon    [Project Name ▾]    [● $1.23]  │
└──────────────────────────────────────────────────────────┘
height: 56px | background: #FFFFFF | border-bottom: 1px solid #E3E3E0
```

- Left: Logo text
- Center: Active project selector (dropdown, 14px, weight 500)
- Right: Live session cost badge (greyed until session starts, amber at 80%, red at 100%)
- No other items in the top nav

### Left Sidebar Navigation

```
width: 240px | background: #F7F7F5 | border-right: 1px solid #E3E3E0

  ─── SESSION ────────────────────
  ○  Agent Feed
  ○  Attention Queue          [2]   ← red badge when items present
  ○  Plan Review

  ─── OUTPUT ─────────────────────
  ○  Output Viewer
  ○  Quality Panel
  ○  Context Vault

  ─── WORKSPACE ──────────────────
  ○  Workspace Settings
```

- Section labels: 11px, weight 600, `#ADADAD`, uppercase, `letter-spacing: 0.06em`
- Nav items: 14px, weight 400, `#0D0D0D`
- Active item: weight 500, left border `3px solid #000000`, background `#ECECEA`
- Hover: background `#ECECEA`
- Badge: 18px × 18px circle, `#C0392B` background, white 11px text — attention count only
- Padding per item: `10px 16px`
- No icons in MVP — text labels only, clean and readable

---

## Buttons

### Primary CTA (Black Rectangle)

```css
background:    #000000;
color:         #FFFFFF;
font-family:   Inter, sans-serif;
font-size:     14px;
font-weight:   500;
padding:       10px 20px;
border-radius: 0;           /* rectangle — no rounding */
border:        none;
cursor:        pointer;
letter-spacing: 0;
```

Hover: `background: #222222`
Active: `background: #444444`
Disabled: `background: #ADADAD`, `cursor: not-allowed`

### Secondary Button

```css
background:    #FFFFFF;
color:         #0D0D0D;
border:        1px solid #0D0D0D;
border-radius: 0;
font-size:     14px;
font-weight:   500;
padding:       10px 20px;
```

Hover: `background: #F7F7F5`

### Destructive Button

```css
background:    #C0392B;
color:         #FFFFFF;
border-radius: 0;
font-size:     14px;
font-weight:   500;
padding:       10px 20px;
```

Hover: `background: #A93226`

### Ghost / Text Button

```css
background:    transparent;
color:         #6B6B6B;
border:        none;
font-size:     13px;
font-weight:   400;
padding:       6px 12px;
```

Hover: `color: #0D0D0D`

**Button rules:**
- All buttons are rectangles. `border-radius: 0` always.
- No box-shadow on buttons.
- Minimum touch target: 36px height.
- Never center-align a primary CTA inside a large empty space — left-align or inline with its context.

---

## Form Inputs

```css
background:    #FFFFFF;
border:        1px solid #E3E3E0;
border-radius: 0;
font-size:     14px;
font-family:   Inter, sans-serif;
padding:       9px 12px;
color:         #0D0D0D;
width:         100%;
```

Focus: `border-color: #0D0D0D`, `outline: none`
Error: `border-color: #C0392B`, `background: #FDF0EF`
Disabled: `background: #F7F7F5`, `color: #ADADAD`

Labels: 12px, weight 500, `#0D0D0D`, `margin-bottom: 6px`, block display.
Helper text: 12px, weight 400, `#6B6B6B`, `margin-top: 4px`.
Error message: 12px, weight 400, `#C0392B`, `margin-top: 4px`.

---

## Cards and Panels

```css
background:    #FFFFFF;
border:        1px solid #E3E3E0;
border-radius: 0;
padding:       20px 24px;
```

Elevated card (e.g. AttentionQueue items):
```css
box-shadow: 0 1px 3px rgba(0,0,0,0.06);
```

Panel section header:
```css
font-size:     12px;
font-weight:   600;
color:         #6B6B6B;
text-transform: uppercase;
letter-spacing: 0.06em;
padding-bottom: 12px;
border-bottom:  1px solid #E3E3E0;
margin-bottom:  16px;
```

---

## Status Dot

Small inline indicator of agent state.

```css
width:         8px;
height:        8px;
border-radius: 50%;
display:       inline-block;
```

Colors map directly to agent status colors defined in the Color System section.
Always accompanied by a text label — never used alone as the sole status signal.

---

## Agent Feed (AgentFeed.jsx)

Each feed item:

```
┌──────────────────────────────────────────────────────────┐
│  ● spec-agent    refining story 3/8      10:42:01 AM     │
│  Analyzing acceptance criteria for login flow...         │
└──────────────────────────────────────────────────────────┘
border-bottom: 1px solid #ECECEA
padding: 12px 16px
background: #FFFFFF
```

- Agent name: 13px, weight 600, `#0D0D0D`
- Step description: 13px, weight 400, `#6B6B6B`
- Timestamp: 12px, weight 400, `#ADADAD`, right-aligned
- Streaming output (agent:thinking): monospace 13px, `#0D0D0D`, indented `16px`, `#F7F7F5` background
- Feed scrolls vertically within its panel — never causes page scroll
- Newest item at bottom. Auto-scroll to bottom while streaming, pause on manual scroll up.

---

## Attention Queue (AttentionQueue.jsx)

BLOCKING items only. Pipeline is paused. PM must act.

```
┌──────────────────────────────────────────────────────────┐
│  ▲  BLOCKING — Quality Gate Failed                       │ ← red left border (4px)
│  dev-agent scored 58/100 on pattern_compliance           │
│  Issues: Missing TypeScript types on 3 props             │
│                                                          │
│  [Retry with Feedback]    [Escalate]                     │
└──────────────────────────────────────────────────────────┘
border-left: 4px solid #C0392B
background: #FDF0EF
padding: 16px 20px
margin-bottom: 12px
```

WARNING items (non-blocking):
```
border-left: 4px solid #FCD34D
background: #FFFBEB
```

- Header: 13px, weight 600, `#C0392B` for BLOCKING / `#B45309` for WARNING
- Body: 14px, weight 400, `#0D0D0D`
- Actions: primary CTA button + ghost button, left-aligned, `margin-top: 16px`
- Empty state: "No items requiring attention" in 14px `#ADADAD`, centered

---

## Token Budget Bar (TokenBudgetBar.jsx)

```
Session Budget  ████████░░░░░░░░░░░░  $1.23 / $5.00  (24%)
```

```css
/* Track */
background: #E3E3E0;
height: 6px;
width: 100%;

/* Fill */
background: #0D0D0D;   /* default */
background: #B45309;   /* ≥ 80% */
background: #C0392B;   /* ≥ 100% */
```

- Label: 12px, weight 500, `#6B6B6B`
- Cost text: 12px, weight 600, `#0D0D0D`
- No animation on the bar. Update in place.
- Displayed in the left sidebar beneath nav items, always visible during a session.

---

## Quality Scores (QualityPanel.jsx)

Each score dimension rendered as a labeled number:

```
spec_compliance       87   ✓
pattern_compliance    62   ✗   ← red when < 75
guardrail_compliance  100  ✓
completeness          79   ✓

Overall               82   PASS
```

- Score number: 24px, weight 600. Green (`#1A6B3C`) if ≥ 75, red (`#C0392B`) if < 75.
- Dimension label: 13px, weight 400, `#6B6B6B`
- PASS / FAIL badge: 12px, weight 600, uppercase. Black background for PASS, red for FAIL. Rectangle.
- Version tabs (v1 / v2 / v3): flat tabs, black underline on active, `border-bottom: 2px solid #000000`

---

## Version Diff (VersionDiff.jsx)

Side-by-side code diff, shown when a retry produces a new version.

```
v1  (failed)                    v2  (current)
─────────────────────────────────────────────
- const foo = () => {           + const foo = (): void => {
-   return bar                  +   return bar;
- }                             + }
```

- Removed lines: background `#FDF0EF`, text `#C0392B`, prefix `−`
- Added lines: background `#F0FAF4`, text `#1A6B3C`, prefix `+`
- Unchanged lines: `#F7F7F5`, text `#6B6B6B`
- Monospace 13px throughout
- No syntax highlighting in MVP — plain diff colors only
- Version headers: 13px weight 600, left-aligned above each column

---

## Plan Review (PlanReview.jsx)

Agent PM's execution plan, presented for PM approval.

```
┌──────────────────────────────────────────────────────────┐
│  Execution Plan — Session 3                              │
│  8 stories selected · Est. cost $1.20                   │
├──────────────────────────────────────────────────────────┤
│  Step 1  spec-agent    Refine login + signup stories     │
│  Step 2  dev-agent     Implement auth components (3)     │
│  Step 3  review-agent  Code review pass                  │
│  Step 4  qa-agent      Generate unit tests               │
│  Step 5  docs-agent    Update component docs             │
├──────────────────────────────────────────────────────────┤
│  [Approve Plan]    or type feedback below                │
│  ┌──────────────────────────────────────────────────┐   │
│  │ e.g. "Skip the docs step for now"               │   │
│  └──────────────────────────────────────────────────┘   │
│  [Send Feedback]                                         │
└──────────────────────────────────────────────────────────┘
```

- Plan steps: numbered list, 14px, `#0D0D0D`
- Agent name in each step: weight 600
- Approve Plan: primary CTA (black rectangle), left-aligned
- Feedback input: full-width textarea, same input styles as Form Inputs above
- Send Feedback: secondary button

---

## Footer

```
┌──────────────────────────────────────────────────────────┐
│  Glowing Spoon  ·  Phase 1 MVP  ·  Local Mode   │
└──────────────────────────────────────────────────────────┘
height: 40px | background: #F7F7F5 | border-top: 1px solid #E3E3E0
font-size: 12px | color: #ADADAD | text-align: center | line-height: 40px
```

No links, no navigation, no interactivity. Status information only.

---

## Empty States

Used when a panel has no content yet (e.g. AgentFeed before session starts).

```
         ○

  Waiting for session to start.
  Select a workspace to begin.

        [Select Workspace]
```

- Icon: a simple 24px circle outline in `#E3E3E0`
- Message: 14px, `#6B6B6B`, centered
- Optional CTA: primary button if there's a clear next action
- Padding: `48px 32px`

---

## Loading States

No spinners. Use a pulsing text placeholder:

```css
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}
.loading {
  animation: pulse 1.5s ease-in-out infinite;
  background: #E3E3E0;
  border-radius: 0;
}
```

Skeleton lines: `height: 14px`, `border-radius: 0`, varying widths (`60%`, `80%`, `45%`).
Never use a spinner. Never use "Loading..." text.

---

## Scrollbars

```css
::-webkit-scrollbar       { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #E3E3E0; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #ADADAD; }
```

Thin, unobtrusive. Only visible on hover over the scroll container.

---

## What NOT to Do

- No rounded corners anywhere (buttons, inputs, cards, badges). `border-radius: 0` everywhere.
- No drop shadows beyond `0 1px 3px rgba(0,0,0,0.06)`.
- No color used decoratively — every color has a semantic meaning defined above.
- No horizontal scroll — ever. `overflow-x: hidden` on body.
- No font weight above 600 (no bold, no black).
- No icons in MVP navigation — text labels only.
- No animations except the loading pulse and status dot transitions.
- No marketing copy in the UI. This is a command interface.
- No toast notifications — all status goes into the feed or attention queue.
