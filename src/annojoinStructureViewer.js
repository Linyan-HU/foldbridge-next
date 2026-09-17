const BIN_COLORS = {
  high: '#b54b3a',
  mid: '#d9a441',
  low: '#2f8f6b',
  missing: '#9aa5a0'
};

function text(value) {
  return String(value ?? '').trim();
}

function numberOrNull(value) {
  const parsed = Number(text(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function tokenizeCifLine(line) {
  const tokens = [];
  const pattern = /'([^']*)'|"([^"]*)"|(\S+)/g;
  let match;
  while ((match = pattern.exec(line))) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? '');
  }
  return tokens;
}

function atomField(row, headers, names) {
  for (const name of names) {
    const index = headers.indexOf(`_atom_site.${name}`);
    if (index >= 0) return row[index] ?? '';
  }
  return '';
}

export function parseMmcifAtomSites(mmcifText, { maxAtoms = 20000 } = {}) {
  const lines = String(mmcifText ?? '').replace(/\r\n/g, '\n').split('\n');
  const dataLine = lines.find((line) => line.startsWith('data_')) || '';
  const dataBlock = dataLine.replace(/^data_/, '').trim();
  const atoms = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() !== 'loop_') continue;
    const headers = [];
    let cursor = index + 1;
    while (cursor < lines.length && lines[cursor].trim().startsWith('_')) {
      headers.push(lines[cursor].trim());
      cursor += 1;
    }
    if (!headers.some((header) => header.startsWith('_atom_site.'))) continue;

    while (cursor < lines.length) {
      const line = lines[cursor].trim();
      if (!line || line === '#' || line === 'loop_' || line.startsWith('_')) break;
      const row = tokenizeCifLine(line);
      const x = numberOrNull(atomField(row, headers, ['Cartn_x']));
      const y = numberOrNull(atomField(row, headers, ['Cartn_y']));
      const z = numberOrNull(atomField(row, headers, ['Cartn_z']));
      if (x !== null && y !== null && z !== null) {
        atoms.push({
          atomId: text(atomField(row, headers, ['id'])),
          atomName: text(atomField(row, headers, ['label_atom_id', 'auth_atom_id'])),
          typeSymbol: text(atomField(row, headers, ['type_symbol'])),
          compId: text(atomField(row, headers, ['label_comp_id', 'auth_comp_id'])),
          chainId: text(atomField(row, headers, ['label_asym_id', 'auth_asym_id'])),
          seqId: text(atomField(row, headers, ['label_seq_id', 'auth_seq_id'])),
          x,
          y,
          z
        });
      }
      if (atoms.length >= maxAtoms) break;
      cursor += 1;
    }
  }

  return { dataBlock, atoms };
}

function residueKey(atom) {
  return `${atom.chainId}:${atom.seqId}:${atom.compId}`;
}

function residueLabel(atom) {
  return `${atom.chainId}:${atom.seqId} ${atom.compId}`.trim();
}

function representativeRank(atomName) {
  const name = text(atomName).toUpperCase();
  if (name === 'P') return 0;
  if (name === "C4'") return 1;
  if (name === "C1'") return 2;
  return 9;
}

function colorMatch(atom, pdbId, colorPoints) {
  const chainSeqComp = `|${atom.chainId}|${atom.seqId}|${atom.compId}`;
  const chainSeq = `|${atom.chainId}|${atom.seqId}|`;
  const label = `${atom.chainId}:${atom.seqId}`;
  return colorPoints.find((point) => {
    const key = text(point.coordinateKey);
    return key === `${pdbId}|${atom.chainId}|${atom.seqId}|${atom.compId}`
      || key.includes(chainSeqComp)
      || key.includes(chainSeq)
      || text(point.pdbResidue).startsWith(label);
  }) || null;
}

function emptyBounds() {
  return {
    min: { x: 0, y: 0, z: 0 },
    max: { x: 0, y: 0, z: 0 }
  };
}

export function buildColoredStructurePointCloud({ atoms = [], pdbId = '', colorPoints = [] } = {}) {
  const representatives = new Map();
  for (const atom of atoms) {
    if (!atom.chainId || !atom.seqId) continue;
    const key = residueKey(atom);
    const current = representatives.get(key);
    if (!current || representativeRank(atom.atomName) < representativeRank(current.atomName)) {
      representatives.set(key, atom);
    }
  }

  const points = [...representatives.values()]
    .sort((a, b) => a.chainId.localeCompare(b.chainId) || Number(a.seqId) - Number(b.seqId))
    .map((atom) => {
      const match = colorMatch(atom, pdbId, colorPoints);
      return {
        x: atom.x,
        y: atom.y,
        z: atom.z,
        label: residueLabel(atom),
        chainId: atom.chainId,
        seqId: atom.seqId,
        compId: atom.compId,
        coordinateKey: match?.coordinateKey || '',
        colorBin: match?.colorBin || 'missing',
        reactivityValue: match?.reactivityValue ?? null
      };
    });

  if (!points.length) return { points, bounds: emptyBounds() };
  const bounds = points.reduce((acc, point) => ({
    min: {
      x: Math.min(acc.min.x, point.x),
      y: Math.min(acc.min.y, point.y),
      z: Math.min(acc.min.z, point.z)
    },
    max: {
      x: Math.max(acc.max.x, point.x),
      y: Math.max(acc.max.y, point.y),
      z: Math.max(acc.max.z, point.z)
    }
  }), {
    min: { x: points[0].x, y: points[0].y, z: points[0].z },
    max: { x: points[0].x, y: points[0].y, z: points[0].z }
  });

  return { points, bounds };
}

function projectPoint(point, bounds, width, height, rotation) {
  const center = {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
    z: (bounds.min.z + bounds.max.z) / 2
  };
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const dz = point.z - center.z;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const rx = (dx * cos) - (dz * sin);
  const rz = (dx * sin) + (dz * cos);
  const span = Math.max(
    bounds.max.x - bounds.min.x,
    bounds.max.y - bounds.min.y,
    bounds.max.z - bounds.min.z,
    1
  );
  const scale = Math.min(width, height) * 0.78 / span;
  return {
    x: (width / 2) + (rx * scale),
    y: (height / 2) - (dy * scale),
    z: rz
  };
}

function drawPointCloud(canvas, cloud, rotation = 0) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#fbfdfb';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#d6e0d8';
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

  const projected = cloud.points
    .map((point) => ({ point, projected: projectPoint(point, cloud.bounds, width, height, rotation) }))
    .sort((a, b) => a.projected.z - b.projected.z);

  for (const item of projected) {
    ctx.beginPath();
    ctx.fillStyle = BIN_COLORS[item.point.colorBin] || BIN_COLORS.missing;
    ctx.arc(item.projected.x, item.projected.y, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function readColorPoints(host) {
  const script = host.querySelector('[data-annojoin-structure-colors]');
  if (!script) return [];
  try {
    const parsed = JSON.parse(script.textContent || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function initAnnojointStructureViewers({
  root = document,
  fetcher = globalThis.fetch?.bind(globalThis)
} = {}) {
  if (!fetcher) return;
  const hosts = [...root.querySelectorAll('[data-annojoin-structure-viewer]')];
  await Promise.all(hosts.map(async (host) => {
    if (host.dataset.loaded === 'true') return;
    host.dataset.loaded = 'true';
    const canvas = host.querySelector('canvas');
    const status = host.querySelector('[data-annojoin-structure-status]');
    const url = host.getAttribute('data-structure-url');
    if (!canvas || !url) return;
    try {
      const response = await fetcher(url);
      if (!response?.ok) throw new Error(`HTTP ${response?.status || 'no-response'}`);
      const parsed = parseMmcifAtomSites(await response.text());
      const cloud = buildColoredStructurePointCloud({
        atoms: parsed.atoms,
        pdbId: parsed.dataBlock,
        colorPoints: readColorPoints(host)
      });
      let rotation = -0.4;
      drawPointCloud(canvas, cloud, rotation);
      if (status) status.textContent = `${cloud.points.length} residue coordinates loaded`;
      let dragging = false;
      let lastX = 0;
      canvas.addEventListener('pointerdown', (event) => {
        dragging = true;
        lastX = event.clientX;
        canvas.setPointerCapture?.(event.pointerId);
      });
      canvas.addEventListener('pointermove', (event) => {
        if (!dragging) return;
        rotation += (event.clientX - lastX) / 120;
        lastX = event.clientX;
        drawPointCloud(canvas, cloud, rotation);
      });
      canvas.addEventListener('pointerup', () => {
        dragging = false;
      });
    } catch (error) {
      if (status) status.textContent = `Structure viewer unavailable: ${error.message}`;
    }
  }));
}
