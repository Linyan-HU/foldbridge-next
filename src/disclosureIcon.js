// Shared vector glyph for expandable rows. Keeping the plus and minus in the
// same 24 × 24 viewBox guarantees that their visual centre never shifts.
export function renderDisclosureIcon(expanded) {
  const mark = expanded
    ? '<path d="M3 10.5h18v3H3z"/>'
    : '<path d="M3 10.5h7.5V3h3v7.5H21v3h-7.5V21h-3v-7.5H3z"/>';
  return `<svg class="disclosure-toggle-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${mark}</svg>`;
}
