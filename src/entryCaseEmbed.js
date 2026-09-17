export const ENTRY_CASE_HEIGHT_MESSAGE = 'foldbridge-case-height';

const MIN_ENTRY_CASE_HEIGHT = 320;
const MAX_ENTRY_CASE_HEIGHT = 100_000;
const FRAME_HEIGHT_PADDING = 2;

export function parseEntryCaseMatrixFamily(queryString = '') {
  const params = new URLSearchParams(queryString);
  const families = params.getAll('family');
  if (families.length === 0) return null;
  if (families.length !== 1) throw new Error('Case matrix family must appear exactly once');
  const [family] = families;
  if (family !== 'E' && family !== 'F') throw new Error(`Invalid Case matrix family "${family}"`);
  return family;
}

export function normalizeEntryCaseHeight(value) {
  const height = Number(value);
  if (!Number.isFinite(height) || height < MIN_ENTRY_CASE_HEIGHT || height > MAX_ENTRY_CASE_HEIGHT) {
    return null;
  }
  return Math.ceil(height) + FRAME_HEIGHT_PADDING;
}

export function applyEntryCaseHeightMessage({ event, frame, expectedOrigin }) {
  if (!frame || !expectedOrigin) return false;
  if (event?.origin !== expectedOrigin) return false;
  if (event?.source !== frame.contentWindow) return false;
  if (event?.data?.type !== ENTRY_CASE_HEIGHT_MESSAGE) return false;

  const height = normalizeEntryCaseHeight(event.data.height);
  if (height === null) return false;

  frame.style.height = `${height}px`;
  frame.setAttribute('scrolling', 'no');
  return true;
}

export function mountEntryCaseHeightListener({ windowObject, frame, expectedOrigin }) {
  if (!windowObject || typeof windowObject.addEventListener !== 'function' || !frame) {
    return () => {};
  }

  const handler = (event) => {
    applyEntryCaseHeightMessage({ event, frame, expectedOrigin });
  };
  let mounted = true;
  windowObject.addEventListener('message', handler);

  return () => {
    if (!mounted) return;
    mounted = false;
    windowObject.removeEventListener('message', handler);
  };
}

export function mountEntryCaseLoadingIndicator({ frame, indicator }) {
  if (!frame || typeof frame.addEventListener !== 'function' || !indicator) {
    return () => {};
  }

  indicator.hidden = false;
  const handleLoad = () => {
    indicator.hidden = true;
  };
  frame.addEventListener('load', handleLoad, { once: true });

  return () => {
    frame.removeEventListener('load', handleLoad);
  };
}
