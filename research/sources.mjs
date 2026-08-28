import fs from 'node:fs/promises';
import path from 'node:path';
import dns from 'node:dns/promises';
import net from 'node:net';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import pdf from 'pdf-parse/lib/pdf-parse.js';

const SUPPORTED = /\.(md|markdown|txt|json|csv|tsv|ya?ml|js|mjs|cjs|ts|tsx|jsx|html|css|py|go|rs|java|kt|sql|pdf)$/i;
const EXCLUDED_DIRS = new Set(['.git', 'node_modules', 'skills', 'tests', 'test', 'scripts', 'public', 'workspace', 'exports', 'graphify-out', '.opencode', '.codex', 'dist', 'build']);
const EXCLUDED_FILES = /^(AGENTS\.md|README\.md|package-lock\.json|\.env(?:\..*)?|.*\.(?:pem|key|p12|pfx))$/i;

export function isPrivateAddress(address) {
  if (net.isIPv4(address)) {
    const p = address.split('.').map(Number);
    return p[0] === 10 || p[0] === 127 || p[0] === 0 || (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) || p[0] >= 224;
  }
  const value = address.toLowerCase().split('%')[0];
  if (value.startsWith('::ffff:')) return isPrivateAddress(value.slice(7));
  return value === '::1' || value === '::' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb') || value.startsWith('ff');
}

async function assertPublicUrl(url) {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only HTTP(S) research sources are allowed');
  if (parsed.username || parsed.password) throw new Error('Credentials in research URL are forbidden');
  const records = await dns.lookup(parsed.hostname, { all: true });
  if (!records.length || records.some(record => isPrivateAddress(record.address))) throw new Error(`Blocked private research address: ${parsed.hostname}`);
  return parsed;
}

async function safeFetch(url, { signal, maxBytes = 2 * 1024 * 1024, redirects = 3, timeoutMs = 15000 } = {}) {
  let current = String(url);
  for (let redirect = 0; redirect <= redirects; redirect += 1) {
    await assertPublicUrl(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    try {
      const response = await fetch(current, { signal: controller.signal, redirect: 'manual', headers: { 'user-agent': 'PO-Agent-Suite-Research/1.0' } });
      if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
        if (redirect === redirects) throw new Error('Research redirect limit exceeded');
        current = new URL(response.headers.get('location'), current).href;
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${current}`);
      const declared = Number(response.headers.get('content-length') || 0);
      if (declared > maxBytes) throw new Error('Research response exceeds 2 MB');
      const reader = response.body.getReader();
      const chunks = []; let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) { await reader.cancel(); throw new Error('Research response exceeds 2 MB'); }
        chunks.push(value);
      }
      return { url: current, contentType: response.headers.get('content-type') || '', body: Buffer.concat(chunks).toString('utf8') };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }
  throw new Error('Research fetch failed');
}

function terms(query) {
  return [...new Set(String(query).toLowerCase().match(/[\p{L}\p{N}_-]{3,}/gu) || [])].slice(0, 16);
}

async function readLocal(file) {
  const raw = await fs.readFile(file);
  if (/\.pdf$/i.test(file)) return String((await pdf(raw)).text || '').slice(0, 180000);
  if (raw.includes(0)) return '';
  return raw.toString('utf8').slice(0, 180000);
}

async function walk(dir, root, out, limit) {
  if (out.length >= limit) return;
  for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (out.length >= limit || entry.name.startsWith('.') || EXCLUDED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) await walk(full, root, out, limit);
    else if (SUPPORTED.test(entry.name) && !EXCLUDED_FILES.test(entry.name)) {
      const stat = await fs.stat(full).catch(() => null);
      if (stat && stat.size <= 1024 * 1024) out.push({ file: full, relative: path.relative(root, full), size: stat.size });
    }
  }
}

export function createLocalSource({ roots, maxFiles = 200 } = {}) {
  let indexed;
  async function index() {
    if (indexed) return indexed;
    const files = [];
    for (const root of roots || []) await walk(root, root, files, maxFiles);
    indexed = await Promise.all(files.map(async item => ({ ...item, text: await readLocal(item.file).catch(() => '') })));
    return indexed;
  }
  return {
    id: 'local',
    async search({ query, limit = 8 }) {
      const needles = terms(query);
      return (await index()).map(item => {
        const haystack = `${item.relative}\n${item.text}`.toLowerCase();
        const score = needles.reduce((sum, word) => sum + (haystack.includes(word) ? 1 : 0), 0);
        return { ...item, score };
      }).filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.relative.localeCompare(b.relative)).slice(0, limit).map(item => ({
        sourceUri: `local://${item.relative}`,
        sourceTitle: item.relative,
        sourceKind: 'local',
        text: item.text.slice(0, 12000)
      }));
    }
  };
}

function cleanPage(html, url) {
  const dom = new JSDOM(html, { url });
  const article = new Readability(dom.window.document).parse();
  return { title: article?.title || dom.window.document.title || url, text: (article?.textContent || dom.window.document.body?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30000) };
}

export function createWebSource({ rateLimitMs = 1000 } = {}) {
  const cache = new Map(); let lastRequest = 0;
  async function throttled(url, options) {
    const wait = Math.max(0, rateLimitMs - (Date.now() - lastRequest));
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    lastRequest = Date.now();
    return safeFetch(url, options);
  }
  return {
    id: 'web',
    async search({ query, limit = 5, signal }) {
      const key = String(query).trim();
      if (cache.has(key)) return cache.get(key);
      const result = await throttled(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(key)}`, { signal });
      const dom = new JSDOM(result.body, { url: result.url });
      const candidates = [...dom.window.document.querySelectorAll('.result')].map(node => {
        const link = node.querySelector('.result__a');
        const href = link?.href;
        if (!href) return null;
        let target = href;
        try { const parsed = new URL(href, result.url); target = parsed.searchParams.get('uddg') || parsed.href; } catch {}
        return { url: target, title: link.textContent.trim(), snippet: node.querySelector('.result__snippet')?.textContent.trim() || '' };
      }).filter(Boolean).slice(0, limit);
      cache.set(key, candidates);
      return candidates;
    },
    async fetch(candidate, { signal } = {}) {
      const result = await throttled(candidate.url, { signal });
      const page = cleanPage(result.body, result.url);
      return { sourceUri: result.url, sourceTitle: page.title || candidate.title, sourceKind: 'web', text: page.text || candidate.snippet };
    }
  };
}

export { safeFetch };
