// PDB primary-literature loader. The citation index is generated at build time
// from the official RCSB PDB Data API, so the public static site never depends
// on a browser-side cross-origin request to RCSB.

export const DEFAULT_PDB_CITATION_ASSET = './src/assets/generated/pdb-primary-citations/index.json';

function text(value) {
  return String(value ?? '').trim();
}

function cleanDoi(value) {
  return text(value).replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '');
}

export function normalizePrimaryCitation(entry = {}) {
  const primary = entry?.rcsb_primary_citation
    || entry?.citation?.find((citation) => citation?.rcsb_is_primary === 'Y' || citation?.id === 'primary');
  if (!primary || !text(primary.title)) return null;

  const authors = Array.isArray(primary.rcsb_authors)
    ? primary.rcsb_authors.map(text).filter(Boolean)
    : [];
  const doi = cleanDoi(primary.pdbx_database_id_DOI);
  const pubmedId = text(primary.pdbx_database_id_PubMed);

  return {
    title: text(primary.title),
    authors,
    journal: text(primary.rcsb_journal_abbrev || primary.journal_abbrev),
    volume: text(primary.journal_volume),
    pageFirst: text(primary.page_first),
    pageLast: text(primary.page_last),
    year: text(primary.year),
    doi,
    pubmedId,
  };
}

function normalizeStaticCitation(citation = {}) {
  if (!text(citation.title)) return null;
  return {
    title: text(citation.title),
    authors: Array.isArray(citation.authors) ? citation.authors.map(text).filter(Boolean) : [],
    journal: text(citation.journal),
    volume: text(citation.volume),
    pageFirst: text(citation.pageFirst),
    pageLast: text(citation.pageLast),
    year: text(citation.year),
    doi: cleanDoi(citation.doi),
    pubmedId: text(citation.pubmedId),
  };
}

export function createPdbCitationStore({ assetUrl = DEFAULT_PDB_CITATION_ASSET, fetchImpl } = {}) {
  const doFetch = fetchImpl || ((...args) => fetch(...args));
  let indexPromise = null;

  function loadIndex() {
    if (!indexPromise) {
      indexPromise = doFetch(assetUrl)
        .then((response) => (response?.ok ? response.json() : null))
        .then((payload) => (payload && typeof payload.citations === 'object' ? payload.citations : {}))
        .catch(() => ({}));
    }
    return indexPromise;
  }

  async function loadPrimaryCitation(pdbId) {
    const normalizedPdbId = text(pdbId).toUpperCase();
    if (!normalizedPdbId) return null;
    const citations = await loadIndex();
    return normalizeStaticCitation(citations[normalizedPdbId]);
  }

  return { loadPrimaryCitation };
}
