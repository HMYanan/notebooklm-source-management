# NotebookLM Source Management UI Guidelines

## 1. Purpose

This document is the UI source of truth for this extension.

It serves two roles:

1. Explain how the current UI is implemented.
2. Define the rules that all future UI changes must follow so the product does not become visually inconsistent.

When a new feature is added, its UI should match this document first and the existing code second. If the code and this document diverge, either:

1. Update the code to match this document, or
2. Intentionally revise this document and note the change in the PR.

Important: the CSS file currently contains some layered overrides and repeated selectors. The canonical values in this document reflect the final rendered intent, not the first occurrence in the stylesheet.

## 2. UI Architecture

### 2.1 Two UI surfaces

This extension has two separate UI surfaces:

- Content panel UI inside NotebookLM.
- Browser action popup UI used as a launcher/status page.

These two surfaces are intentionally different:

- The content panel is compact, utility-heavy, and embedded into NotebookLM.
- The popup is a small, branded launcher with a single primary action.

Do not mix the two styling systems casually.

### 2.2 Content panel implementation

The main manager UI is implemented by the content script and injected into the NotebookLM page.

Implementation flow:

1. `src/content/index.js` finds the NotebookLM source panel.
2. It creates `#sources-plus-root`.
3. It attaches an open Shadow DOM.
4. It injects one `<style>` tag using `NSM_CONTENT_STYLE_TEXT`.
5. It injects the initial shell using `NSM_CREATE_MANAGER_SHELL`.
6. It binds events.
7. It renders the list from extension state.

Relevant files:

- `src/content/index.js`
- `src/content/content-template.js`
- `src/content/content-style-text.js`

Important implementation characteristics:

- The content panel uses Shadow DOM to isolate styles from NotebookLM.
- DOM is built with the shared `el(...)` helper from `src/utils/index.js`.
- UI strings should come from `chrome.i18n` via `getMessage(...)`.
- Re-rendering is state-driven and uses fragment patching, not `innerHTML`.
- Event handling is largely delegated from container nodes.

### 2.3 Global overlay exception

Shadow DOM cannot style some NotebookLM-native Angular Material overlays, menus, or dialogs. Because of that, the extension also injects global overlay CSS into `document.head`.

This is handled through `NSM_GLOBAL_OVERLAY_STYLE_TEXT`.

Use this path only when a UI element lives outside the Shadow DOM tree, for example:

- Native Angular Material menu panels
- Native dialogs

If a new UI can be kept inside the Shadow DOM, keep it there.

### 2.4 Popup implementation

The popup is a normal extension page, not part of the Shadow DOM system.

Relevant files:

- `src/popup/popup.html`
- `src/popup/index.js`
- `src/popup/styles.css`

Popup characteristics:

- Fixed-width launcher layout
- One primary CTA
- Status copy driven by current tab context
- No dark mode-specific popup theme yet

## 3. Naming and Structure Rules

### 3.1 Class namespace

Use these namespaces consistently:

- `sp-` for content-panel UI classes
- `popup-` for popup UI classes

Do not introduce unscoped class names for new extension UI unless there is a very good reason.

### 3.2 DOM creation rules

All new content-panel UI should be created with the shared `el(...)` helper.

Reasons:

- Keeps DOM creation consistent
- Blocks insecure inline event attributes
- Avoids unsafe HTML injection patterns

Do not add raw `innerHTML` for new interactive UI.

### 3.3 Localization rules

All user-facing copy should use `chrome.i18n` keys.

Do not hardcode new English or Chinese strings in UI markup unless it is a true emergency fallback.

## 4. Design Principles

The current visual language is a hybrid of:

- Compact utility UI
- Apple-like glass and motion cues
- Low-chroma neutral surfaces
- Accent-driven state signaling

The panel should feel:

- Calm, not loud
- Dense, not cramped
- Tactile, not gimmicky
- Layered, not flat

Future additions should preserve these traits.

## 5. Core Design Tokens

## 5.1 Color tokens

Content panel tokens live on `:host` in `src/content/content-style-text.js`.

Light mode:

- `--sp-bg-primary: transparent`
- `--sp-bg-secondary: rgba(0,0,0,0.03)`
- `--sp-bg-hover: rgba(0,0,0,0.04)`
- `--sp-bg-button: #fff`
- `--sp-bg-button-hover: #f5f5f7`
- `--sp-bg-button-active: #ebebeb`
- `--sp-panel-bg: #f6f7f9`
- `--sp-text-primary: #1A1A1C`
- `--sp-text-secondary: #6E6E73`
- `--sp-accent: #007aff`
- `--sp-accent-danger: #ff3b30`
- `--sp-accent-success: #34c759`

Dark mode overrides:

- `--sp-bg-secondary: rgba(255,255,255,0.05)`
- `--sp-bg-hover: rgba(255,255,255,0.08)`
- `--sp-bg-button: #1c1c1e`
- `--sp-bg-button-hover: #2c2c2e`
- `--sp-bg-button-active: #3a3a3c`
- `--sp-panel-bg: #272c33`
- `--sp-text-primary: #f5f5f7`
- `--sp-text-secondary: #98989d`
- `--sp-accent: #0a84ff`
- `--sp-accent-danger: #ff453a`
- `--sp-accent-success: #30d158`

Semantic usage:

- Accent blue: interactive focus, selected state, tag-active state, reorder hints.
- Danger red: destructive actions, failed imports, delete affordances.
- Success green: enabled group switch.
- Secondary neutrals: passive chrome, tags, badges, helper text.

Rules:

- New UI must use existing semantic tokens first.
- If a new color is needed, add a token before using a literal value.
- Avoid one-off colors in component rules.

## 5.2 Border tokens

Current shared borders:

- `--sp-border-light: rgba(...)`
- `--sp-border-medium: rgba(...)`
- `--sp-border-checkbox: rgba(...)`

Rules:

- Default container or quiet control border: `--sp-border-light`
- Hover-strength border or stronger separation: `--sp-border-medium`
- Custom checkbox outline: `--sp-border-checkbox`

## 5.3 Shadow tokens

Current shadow tokens:

- `--sp-shadow-button`
- `--sp-shadow-toast`
- `--sp-shadow-hover-item`
- `--sp-shadow-switch-thumb`
- `--sp-glass-shadow`

Usage:

- Buttons: soft ambient shadow
- Hovered rows: lift shadow
- Toasts and modals: stronger elevation
- Glass menus/dialogs: glass shadow token

Rules:

- Reuse these tokens for elevation first.
- Do not invent a new shadow just because one component feels special.
- If a new elevation level is necessary, define it as a token and document the intended layer.

## 5.4 Radius scale

The current UI consistently uses a small set of radius values.

Canonical radius scale:

- `3px`: resizer bar
- `6px`: checkbox, tree border tail
- `8px`: source rows, small utility buttons, popup icon corner family starts higher
- `10px`: option rows, tag inputs, tag row buttons
- `12px`: standard button, icon action button, badges, toasts
- `14px`: banners, popup notes, popup CTA, action menus
- `16px`: modal shell, batch action bar
- `18px`: toggle track
- `999px`: pills

Rules:

- Do not use arbitrary radii like `7px`, `9px`, `13px`, `15px`.
- Choose the nearest existing radius bucket.

## 5.5 Typography scale

Content panel typography:

- `11px`: badges, pills, section labels
- `12px`: banner labels, menu labels, small helper copy
- `13px`: default control text, titles, inputs, button labels
- `14px`: folder option text, empty states, toast text
- `16px`: modal title

Popup typography:

- `12px`: eyebrow
- `13px`: note/detail
- `14px`: body and button
- `20px`: title

Rules:

- Default text in the content panel should remain `13px`.
- Small metadata should stay in the `11px` to `12px` band.
- Only use `16px+` for true hierarchy shifts such as modal titles or popup headings.

## 5.6 Icon scale

Current icon sizes:

- `16px`: row icons, action buttons, tag row buttons, menu icons
- `18px`: toolbar icon buttons
- `20px`: caret, folder option icon

Rules:

- `16px` is the default for list-level action UI.
- `18px` is for toolbar-level icon buttons.
- `20px` is reserved for navigational or modal list items.

## 5.7 Motion system

Primary easing:

- `cubic-bezier(0.25, 1, 0.5, 1)`

Use this as the default for:

- Hover transitions
- Collapse/expand
- Reveal/hide
- Scale feedback
- Toast motion
- Modal motion

Current duration tiers:

- `160ms`: popup button hover/press
- `0.18s` to `0.2s`: micro interactions and opacity
- `0.25s` to `0.26s`: reveal/hide and search expand mechanics
- `0.3s`: standard content-panel motion
- `0.35s`: focus ring / container lift
- `0.4s`: modal polish and folder-entry animation

Rules:

- Use `0.2s` for small control feedback.
- Use `0.3s` for row, list, menu, and toast interactions.
- Use `0.4s` only for modal or entry/exit emphasis.
- Avoid mixing random easings like `ease-in-out`, `linear`, or spring-like curves unless the effect truly needs it.

## 5.8 Z-index layers

Current practical layer system:

- `5`: sticky batch bar
- `20`: sticky controls
- `9999`: toast
- `10000`: overlay backdrop
- `10001`: modal
- `10002`: source action menu layer

Rules:

- New in-panel floating UI must fit this stack.
- Do not jump to `999999`.
- If a new overlay is needed, place it intentionally relative to backdrop, modal, and action menus.

## 6. Content Panel Shell Specification

The content panel root is `.sp-container`.

Current traits:

- Vertical flex layout
- Embedded panel surface
- `max-height: calc(100vh - 220px)`
- `min-height: 150px`
- system font stack
- background: `--sp-panel-bg`

Focus/highlight state:

- `.sp-container.sp-focus-ring`
- Uses accent-colored dual shadow
- Slight upward translate

Rules:

- New shell-level emphasis should use `sp-focus-ring` style language, not a new border treatment.
- Do not add busy backgrounds or gradients inside the content panel shell.

## 7. Sticky Toolbar and Search

### 7.1 Toolbar layout

`.sp-controls` is the sticky toolbar.

Characteristics:

- `position: sticky`
- top aligned
- compact horizontal layout
- bottom border for separation
- no heavy visual chrome

Toolbar actions live in `.sp-toolbar-actions`.

Rules:

- Top-level actions should remain in a single horizontal strip.
- New top-level actions must be justified as "frequently used, global, and not row-scoped".
- Do not overload the toolbar with low-frequency actions.

### 7.2 Search behavior

The search UI uses an expandable container:

- Default compact icon state
- Expanded on interaction
- Collapses the toolbar action width when open
- Uses `focus-within` ring on the container

Search implementation details:

- Container: `.sp-search-container`
- Input: `#sp-search`
- Icon button: `#sp-search-btn`
- Search is debounced at `300ms`
- Enter triggers immediate search

Rules:

- Any future inline filter should visually integrate with this expandable-search model.
- Do not add a second unrelated search field elsewhere in the panel.

## 8. Buttons

## 8.1 Primary panel button: `.sp-button`

Canonical style:

- Border radius: `12px`
- Padding: `6px 12px`
- Background: `--sp-bg-button`
- Border: `1px solid --sp-border-light`
- Font size: `13px`
- Font weight: `500`
- Shadow: `--sp-shadow-button`

Feedback:

- Hover: brighter surface + stronger border
- Active: `scale(0.95)`
- Decorative sweep: pseudo-element shimmer on hover

Use for:

- Toolbar buttons
- Banner CTA
- Confirm/save actions
- Batch action buttons after variant styling

Rules:

- Default action buttons should extend `.sp-button`.
- If a button needs a stronger semantic state, restyle color tokens on top of `.sp-button`.
- Do not build new button styles from scratch unless the role is fundamentally different.

## 8.2 Icon button: `.sp-icon-button`

Canonical style:

- Padding: `4px`
- Radius: `8px`
- No border
- Default secondary text color
- Hover: hover-surface background + `scale(1.08)`
- Active: `scale(0.85)`

Use for:

- Search toggle
- Compact chrome actions

Rules:

- Icon-only controls must have `title` and `aria-label`.
- Do not use `.sp-icon-button` for destructive actions without an explicit semantic override.

## 8.3 Row action button family

Classes:

- `.sp-source-actions-button`
- `.sp-add-subgroup-button`
- `.sp-isolate-button`
- `.sp-edit-button`
- `.sp-delete-button`

Shared traits:

- 24 x 24
- Radius `12px`
- Icon size `16px`
- No border
- Neutral by default

Feedback:

- Hover: hover-surface background
- Hover scale: `1.1`
- Active scale: `0.85`

Special behavior:

- Source action button defaults to partial opacity and becomes fully visible on row hover.
- Group secondary actions stay hidden until hover and reveal with opacity + translate + scale.
- Delete hover uses red tint and danger color.
- Isolate active state uses accent tint.

Rules:

- Row actions should not always be fully visible unless the action is critical.
- Reveal-on-hover is the default for row-scope secondary actions.

## 8.4 Popup button

Popup uses a separate CTA style:

- Full width
- Radius `14px`
- Blue gradient fill
- Stronger shadow
- Hover: `translateY(-1px)`
- Disabled: lower opacity and flatter shadow

Rules:

- Popup CTA is the only clearly promotional/branded button style in the project.
- Do not reuse popup button styling inside the content panel.

## 9. Selection Controls

## 9.1 Source checkbox: `.sp-checkbox`

Canonical style:

- `18 x 18`
- Radius `6px`
- Thick border
- Accent fill on checked
- Custom-drawn checkmark with pseudo-element

Feedback:

- Hover: accent border + `scale(1.05)`
- Active selection animation:
  - spring on box
  - delayed organic checkmark draw

Rules:

- New checkbox-like controls should reuse `.sp-checkbox` unless there is a very strong reason not to.
- Avoid native browser checkbox visuals for in-panel controls.

## 9.2 Group switch

Classes:

- `.sp-toggle-switch`
- `.sp-group-toggle-checkbox`
- `.sp-toggle-slider`

Canonical style:

- Track: `36 x 20`
- Knob: `16 x 16`
- Checked state: success green
- Slight scale reduction on overall switch for density

Rules:

- Use the switch only for persistent enabled/disabled state.
- Use checkboxes for multi-select or item inclusion.

## 10. Source Row and Group Row Specification

## 10.1 Source row

Class: `.source-item`

Canonical layout:

- Horizontal flex row
- Padding left `12px`
- Vertical rhythm with `2px` gaps between rows
- Final radius `8px`
- Border kept transparent until needed

Structure:

1. Icon
2. Optional source action trigger
3. Title and tags
4. Right-side checkbox

Feedback:

- Hover: `scale(1.015)`, background hover tint, hover shadow, elevated z-index
- Active: `scale(1.008)`
- Hover should feel lifted, not shoved sideways

State variants:

- `gated`: reduced opacity + grayscale
- `failed-source`: danger color treatment, disabled affordance
- `loading-source`: wait cursor, spinner, pulsing title, hidden checkbox
- `selected-for-batch`: tinted selection + dashed accent border
- `dragging`: larger scale, accent border, stronger shadow

Rules:

- New row-level visuals must respect the same density and feedback language.
- Do not add permanent heavy borders around normal rows.
- The title area should remain the primary click target.

## 10.2 Group row

Classes:

- `.group-container`
- `.group-header`
- `.group-children`

Canonical traits:

- Same motion language as source rows
- Heavier emphasis through weight and hierarchy, not loud color
- Indentation driven by inline `padding-left: level * 20px`
- Tree line via left border on `.group-children`

Group header contents:

1. Caret
2. Enable switch
3. Group title
4. Count badge
5. Secondary hover actions

Feedback:

- Same lift behavior as row hover
- Caret rotates on collapse
- Child tree line turns accent on group hover

Rules:

- Group UI must feel structurally related to source rows, not like a separate product.
- Future nested controls must not break indentation rhythm or tree-line clarity.

## 10.3 Drag and drop feedback

Existing cues:

- Dragged item scales up and lifts
- Drop target group gets accent-tinted background
- Top/bottom insertion markers use accent border lines with circular endpoints
- Empty drop zones enlarge slightly and tint on valid target hover

Rules:

- All drag affordances should use accent blue and subtle scaling.
- Do not introduce unrelated colors or large shake animations.

## 11. Titles, Tags, Badges, and Metadata

## 11.1 Title blocks

Classes:

- `.title-container`
- `.source-title-text`
- `.group-title`

Canonical behavior:

- Default text size `13px`
- Tight letter spacing
- Two-line clamp for title text
- Keep metadata below or beside the title, not mixed into the same line

Rules:

- New source metadata should sit below the main title if it can wrap.
- Do not exceed two lines for row titles without a very good reason.

## 11.2 Tag pills

Class: `.sp-tag-pill`

Canonical style:

- Pill radius
- Small secondary text
- Quiet neutral background
- Accent-tinted active state

Feedback:

- Hover: slightly stronger surface and text
- Active filter: accent tint + accent text

Rules:

- Tags should remain visually lightweight.
- Avoid using full-solid accent fills for idle tags.

## 11.3 Badges

Class: `.badge`

Use for:

- Group counts
- Small numeric summaries

Rules:

- Keep badges compact and quiet.
- Badges are metadata, not actions.

## 11.4 Tag color editor

Classes:

- `.sp-tag-color-group`
- `.sp-tag-color-presets`
- `.sp-tag-color-swatch`
- `.sp-tag-color-trigger`
- `.sp-tag-color-hex`

Canonical style:

- Lives inside the tag modal/editor flow, not as a standalone panel control
- Uses the same compact density as inputs and list rows
- Preset swatches are circular, low-noise, and rely on border/ring state instead of large motion
- Custom color trigger reuses `.sp-button`
- Hex input reuses `.sp-tag-input`

Feedback:

- Swatch hover uses the same shared panel easing as other controls
- Active swatch uses the standard accent focus ring language
- Text input focus uses the same soft accent focus ring as other modal inputs

Rules:

- New tag-color affordances should extend this editor, not introduce a second color-picker pattern
- If color presets change, keep the interaction model the same: presets, custom trigger, and editable hex field
- Do not use loud animations or independent color-picker chrome inside the modal

## 12. Menus, Overlays, and Modals

## 12.1 Source action menu

Classes:

- `.sp-source-actions-layer`
- `.sp-source-actions-menu`
- `.sp-source-actions-menu-item`

Canonical style:

- Glass background
- Blur and saturation
- Radius `14px`
- Menu item radius `10px`
- Compact item padding

Feedback:

- Hover: menu row tint + `translateX(2px)`
- Icons brighten with hover

Rules:

- Small contextual menus should follow this glass popover pattern.
- Do not create solid opaque dropdowns for content-panel context menus.

## 12.2 Modal system

Classes:

- `.sp-overlay-backdrop`
- `.sp-folder-modal`
- `.sp-folder-modal-header`
- `.sp-folder-modal-content`
- `.sp-folder-modal-footer`

Canonical style:

- Centered fixed modal
- Width `320px`
- Max height `80vh`
- Radius `16px`
- Frosted glass effect
- Dark-mode adjusted background and border

Motion:

- Backdrop fades in
- Modal scales and settles in from slightly above
- Exit reverses with slight upward drift

Rules:

- New panel-owned modal dialogs should reuse this shell.
- Footer actions should be right-aligned.
- Backdrop click may dismiss only when safe.

## 12.3 Option lists inside modals

Classes:

- `.sp-folder-option`
- `.sp-tag-option`
- `.sp-tag-row`

Canonical style:

- Radius `10px`
- Dense rows
- Clear icon/title separation
- Hover scale slightly down to feel pressable, not floating

Rules:

- Use list-row interaction language, not card-grid language, for modal choice lists.

## 13. Temporary and Informational Surfaces

## 13.1 View state banners

Class: `.sp-view-banner`

Used for:

- Active isolation mode
- Active tag filter

Canonical style:

- Quiet contextual surface
- Border + gentle background
- Compact CTA on the right

Rules:

- View-state banners are for temporary mode context only.
- Do not use them for permanent settings.

## 13.2 Toast

Class: `.sp-toast`

Canonical behavior:

- Bottom center
- Blurred dark or light surface depending on theme
- Entrance from below with opacity + blur cleanup

Rules:

- Use toast for short confirmation only.
- Do not use toast for workflows that require decision-making.

## 13.3 Empty states

Class: `.sp-empty-state`

Canonical style:

- Dashed border
- Centered text
- Subtle neutral background
- Slight scale-up when used as a drop target

Rules:

- Empty states should be quiet and actionable.
- Prefer one clear message over illustration-heavy placeholders.

## 14. Batch Mode

Batch mode adds a temporary command surface while preserving the base visual language.

Key elements:

- Source row selection state
- Batch checkbox variant
- Sticky batch action bar at the bottom
- Add-to-folder and delete CTA variants

Batch action bar style:

- Glass background
- Radius `16px`
- Sticky to bottom
- Compact horizontal layout

Rules:

- Temporary mode UI should layer on top of the system, not replace it.
- When introducing a new mode, prefer banner + sticky action area rather than rebuilding the whole screen.

## 15. Popup UI Specification

The popup is intentionally simpler and more branded than the content panel.

Canonical popup traits:

- Width `340px`
- Internal padding `20px`
- Soft blue gradient page background
- Icon with strong shadow
- Uppercase eyebrow
- Clear title/body/note hierarchy
- One strong full-width CTA

Popup status blocks:

- `.popup-note`: neutral helper surface
- `.popup-detail`: warning/detail surface

Rules:

- The popup should stay task-focused and concise.
- It is a launcher and status view, not a second control center.
- Avoid mirroring the full content-panel complexity in the popup.

## 16. Accessibility and UX Rules

The current UI already hints at several accessibility expectations. Future UI should preserve and improve them.

Required rules:

- Icon-only buttons must have `title` and `aria-label`.
- Keyboard-focusable controls must show a clear focus treatment.
- New UI copy must go through i18n.
- Disabled states must change both visuals and pointer behavior.
- Loading states must block interaction when the action cannot succeed.
- Empty, loading, error, and disabled states should exist for any non-trivial flow.

Recommended rules:

- Preserve contrast between primary and secondary text in both themes.
- Keep critical action text readable without relying on color alone.
- Avoid hover-only discoverability for destructive actions if keyboard users also need them.

## 17. Motion and Feedback Rules by State

Use this as the default state matrix.

### Hover

- Slight background tint
- Small scale or reveal
- No large travel distance
- No dramatic bounce

### Active / pressed

- Scale down slightly
- Keep duration short
- Do not combine with large positional movement

### Focus

- Accent ring or accent-tinted container ring
- Prefer shadow/ring over heavy outline replacement unless necessary

### Disabled

- Lower opacity
- Remove misleading hover transforms
- Use not-allowed cursor only when appropriate

### Loading

- Show spinner or pulse
- Suppress controls that should not be interactive
- Preserve layout stability

### Selected

- Use accent tint and sometimes border
- Avoid full saturated fills unless semantic role demands it

### Destructive

- Danger tint on hover
- Danger color on icon/text
- Do not make all destructive actions red by default when idle

## 18. Implementation Rules for New Features

When adding new UI, follow this order.

1. Decide whether the UI belongs to the content panel or popup.
2. Reuse an existing token set.
3. Reuse an existing component class if the role matches.
4. If only a variant is needed, extend the base class.
5. Only create a new component class when the interaction model is actually different.

Practical rules:

- Prefer `sp-` classes and the Shadow DOM for content-panel UI.
- Add styles to `src/content/content-style-text.js`.
- Add structure via `src/content/content-template.js` only for shell-level elements.
- For list items, menus, banners, modals, and mode bars, render from `src/content/index.js`.
- Reuse `patchChildren(...)` and fragment-based rendering.
- Reuse the shared easing curve unless there is a documented reason not to.
- Reuse the radius scale.
- Reuse semantic colors through tokens.
- Keep z-index within the documented layer system.

## 19. Anti-Chaos Rules

These rules exist specifically to keep the plugin from drifting.

### 19.1 No one-off styling

Do not add:

- random border radii
- random transition durations
- ad hoc shadows
- hardcoded colors for convenience

If a new visual value is needed, promote it to a token first.

### 19.2 No duplicate component concepts

Do not create:

- a second primary button style in the content panel
- a second tag style
- a second modal shell style
- a second action-menu pattern

If the component is conceptually the same, extend the existing one.

### 19.3 No new visual language without intent

Avoid introducing:

- loud gradients in the content panel
- neon/glow-heavy affordances
- oversized cards
- different interaction grammar in one isolated feature

If the product direction changes, change it deliberately across the system.

### 19.4 Avoid CSS cascade confusion

The current stylesheet already has some layered overrides.

For future work:

- Prefer editing the canonical rule instead of stacking another override later.
- If you must override, leave a short comment explaining why.
- If a selector already exists twice, consolidate it when touching that area.

## 20. Recommended PR Checklist for UI Work

Before merging a UI change, check:

- Does it use existing `sp-` or `popup-` naming?
- Does it reuse existing tokens?
- Does it match the documented radius scale?
- Does it use the standard easing curve and duration tier?
- Does it define hover, active, focus, disabled, and loading states when applicable?
- Does it work in both light and dark mode?
- Does it keep toolbar, row, and modal density consistent with existing UI?
- Does it use i18n strings?
- Does it stay inside the documented z-index system?
- Does it visually look like the same product?

## 21. Recommended Future Cleanup

This section is not mandatory for feature work, but it is worth doing over time.

1. Split content-panel tokens, components, overlays, and state styles into clearer sections or modules.
2. Consolidate duplicate selectors in `src/content/content-style-text.js`.
3. Introduce explicit token names for typography and spacing if the system grows.
4. Consider replacing the inline folder emoji in group titles with a formal icon element for stricter consistency.
5. Add a popup dark theme if popup usage grows.

## 22. Canonical File Map

Use this map when updating UI.

- `src/content/content-style-text.js`: content-panel tokens, components, motion, overlays
- `src/content/content-template.js`: shell structure
- `src/content/index.js`: rendering, state transitions, event binding, modals, menus
- `src/popup/styles.css`: popup styling
- `src/popup/index.js`: popup state and copy logic
- `src/utils/index.js`: safe DOM helper, debounce, i18n helper

If a future feature touches UI and does not clearly fit into this map, stop and decide the ownership before implementing it.
