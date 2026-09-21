/**
 * Stylesheet for the composer's markdown decoration.
 *
 * The composer is a Lexical contenteditable holding one <p> per line, and the
 * draft that actually gets submitted is the plain text of those lines. So this
 * is decoration in the strict sense: the source marks stay in the document and
 * in the submitted text, and only their appearance changes.
 *
 * How each mark is handled, and why:
 *
 *   - Unordered lists keep their `- ` / `* ` / `+ ` in the text, but the
 *     bullet glyph is drawn over the first character by an absolutely
 *     positioned ::before. Its background is the composer's own surface token,
 *     which is what lets it cover the mark rather than sit beside it — the
 *     glyph only needs to hide one character, so the box is a fraction of an
 *     em wide and cannot reach the item text behind it.
 *   - Ordered lists need no glyph: `1. ` already reads as a list number, so
 *     they only take the indent.
 *   - The indent uses the standard hanging pair — `padding-left` for wrapped
 *     lines, a matching negative `text-indent` to pull the first line back to
 *     the margin — so the mark starts where the reader typed it and a wrapped
 *     item aligns under the text rather than under the bullet.
 *   - Fenced code keeps both fence lines, dimmed, so the reader can still see
 *     and edit the delimiters; only the body takes the surface and the
 *     monospace face. Paragraphs carry no margin in this surface, so the body
 *     lines stack into one continuous block.
 *
 * @module dsh-chat-ux/client/composer-markdown-styles
 */

/** Attribute the scanner writes; its value is the block kind. */
export const MD_ATTR = 'data-dsh-chat-ux-md'

/** The monospace stack, matching the platform's own fallback order. */
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace'

/** The composer's decoration sheet. */
export const COMPOSER_MARKDOWN_CSS = `
/* ── lists ──────────────────────────────────────────────────────────────── */

[${MD_ATTR}='ul'],
[${MD_ATTR}='ol'] {
  position: relative;
  /* Hanging indent: the mark keeps its typed position, wrapped lines align
     under the item text. */
  padding-left: 1.5em;
  text-indent: -1.5em;
}

[${MD_ATTR}='ul']::before {
  content: '•';
  position: absolute;
  left: 0;
  /* One character wide, no more: the box must cover the mark and stop before
     the item text. Absolute positioning keeps it out of the flow, so it
     neither shifts the text nor participates in the hanging indent. */
  width: 0.55em;
  background: var(--dsw-specific-input-major);
  color: var(--dsw-alias-label-secondary);
  z-index: 1;
}

/* ── block quote ───────────────────────────────────────────────────────── */

[${MD_ATTR}='quote'] {
  position: relative;
  padding-left: 1.5em;
  text-indent: -1.5em;
  color: var(--dsw-alias-label-secondary);
}

[${MD_ATTR}='quote']::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  border-radius: 1px;
  background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2));
}

/* ── fenced code ───────────────────────────────────────────────────────── */

[${MD_ATTR}='fence'] {
  font-family: ${MONO};
  font-size: 0.85em;
  color: var(--dsw-alias-label-caption);
}

[${MD_ATTR}='fence-body'] {
  font-family: ${MONO};
  font-size: 0.9em;
  background: var(--dsw-alias-interactive-bg-hover);
  padding: 0 0.5em;
}

/* ── headings ──────────────────────────────────────────────────────────── */

[${MD_ATTR}='heading-1'] { font-size: 1.45em; font-weight: 600; line-height: 1.4; }
[${MD_ATTR}='heading-2'] { font-size: 1.3em; font-weight: 600; line-height: 1.4; }
[${MD_ATTR}='heading-3'] { font-size: 1.15em; font-weight: 600; line-height: 1.4; }
[${MD_ATTR}='heading-4'],
[${MD_ATTR}='heading-5'],
[${MD_ATTR}='heading-6'] { font-weight: 600; }
`
