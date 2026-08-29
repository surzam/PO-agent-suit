import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const ARTIFACT_FILES = {
  data: 'data.json',
  csv: 'data.csv',
  narrative: 'narrative.md',
  slides: 'slides.html',
  pptx: 'legacy.pptx',
  research: 'research.json',
  manifest: 'manifest.json'
};

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function dataCsv(data) {
  return [data.columns || [], ...(data.rows || [])].map(row => row.map(csvCell).join(',')).join('\n');
}

async function atomicWrite(file, value) {
  const temporary = `${file}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`;
  await fs.writeFile(temporary, value);
  await fs.rename(temporary, file);
}

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function createArtifactStore(exportDir) {
  const manifests = new Map();
  const indexFile = path.join(exportDir, 'index.json');

  async function cleanupTemps(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await cleanupTemps(file);
      else if (entry.name.includes('.tmp-')) await fs.unlink(file).catch(() => {});
    }
  }

  async function writeIndex() {
    await atomicWrite(indexFile, JSON.stringify([...manifests.keys()], null, 2));
  }

  async function initialize() {
    await fs.mkdir(exportDir, { recursive: true });
    await cleanupTemps(exportDir);
    const ids = await fs.readFile(indexFile, 'utf8').then(JSON.parse).catch(() => []);
    for (const generationId of Array.isArray(ids) ? ids : []) {
      const manifest = await fs.readFile(path.join(exportDir, generationId, ARTIFACT_FILES.manifest), 'utf8').then(JSON.parse).catch(() => null);
      if (manifest?.generationId) {
        if (!['complete', 'failed', 'cancelled', 'needs-context'].includes(manifest.state)) {
          manifest.state = 'failed'; manifest.error = 'Application restarted before research completed'; manifest.updatedAt = new Date().toISOString();
          await atomicWrite(path.join(exportDir, generationId, ARTIFACT_FILES.manifest), JSON.stringify(manifest, null, 2));
        }
        manifests.set(manifest.generationId, manifest);
      }
    }
    return manifests;
  }

  async function begin(generationId, meta = {}) {
    const folder = path.join(exportDir, generationId);
    await fs.mkdir(folder, { recursive:true });
    const manifest = { generationId, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), state:'active', ...meta, files:ARTIFACT_FILES };
    await atomicWrite(path.join(folder, ARTIFACT_FILES.manifest), JSON.stringify(manifest, null, 2));
    manifests.set(generationId, manifest); await writeIndex(); return manifest;
  }

  async function mark(generationId, state, error) {
    const manifest = manifests.get(generationId); if (!manifest) return null;
    Object.assign(manifest, { state, error, updatedAt:new Date().toISOString() });
    await atomicWrite(path.join(exportDir, generationId, ARTIFACT_FILES.manifest), JSON.stringify(manifest, null, 2));
    return manifest;
  }

  async function save(payload) {
    const folder = path.join(exportDir, payload.generationId);
    await fs.mkdir(folder, { recursive: true });
    const values = {
      data: JSON.stringify(payload.data, null, 2),
      csv: dataCsv(payload.data),
      narrative: payload.narrative,
      slides: payload.slides,
      pptx: payload.pptx,
      research: JSON.stringify(payload.research, null, 2)
    };
    const hashes = {};
    for (const [kind, value] of Object.entries(values)) {
      await atomicWrite(path.join(folder, ARTIFACT_FILES[kind]), value);
      hashes[kind] = digest(value);
    }
    const manifest = {
      generationId: payload.generationId,
      createdAt: new Date().toISOString(),
      state: 'complete',
      ...payload.meta,
      files: ARTIFACT_FILES,
      hashes
    };
    await atomicWrite(path.join(folder, ARTIFACT_FILES.manifest), JSON.stringify(manifest, null, 2));
    manifests.set(payload.generationId, manifest);
    await writeIndex();
    return manifest;
  }

  function artifact(generationId, kind) {
    const manifest = manifests.get(generationId);
    const filename = manifest?.files?.[kind];
    if (!filename || !Object.values(ARTIFACT_FILES).includes(filename)) return null;
    return { manifest, file: path.join(exportDir, generationId, filename) };
  }

  return { initialize, begin, mark, save, artifact, manifests };
}

export { ARTIFACT_FILES };
