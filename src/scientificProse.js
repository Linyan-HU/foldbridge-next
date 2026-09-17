// Only call for editorial prose, never identifiers, attributes or citations.
export function renderScientificProse(value) {
  const escaped = String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  return escaped.replace(/\b(?:in vivo|in vitro|in situ|in silico|ex vivo|de novo|E\. coli|Escherichia coli|Arabidopsis thaliana|Saccharomyces cerevisiae)\b/gi,
    (term) => `<em>${term}</em>`);
}
