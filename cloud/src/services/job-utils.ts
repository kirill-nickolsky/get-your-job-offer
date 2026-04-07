import crypto from 'node:crypto';
import { ScrapeJobInput } from '../contracts';

export function normalizeString(value: unknown): string {
  return String(value || '').trim();
}

export function normalizeTags(value: string[] | string | undefined): string[] {
  if (Array.isArray(value)) {
    return value.map(normalizeString).filter(Boolean);
  }
  const raw = normalizeString(value);
  if (!raw) {
    return [];
  }
  return raw
    .split(/[,\n|]/)
    .map(normalizeString)
    .filter(Boolean);
}

export function normalizeKey(value: unknown): string {
  return normalizeString(value)
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function buildJobId(sourceId: string, job: ScrapeJobInput): string {
  const externalId = normalizeString(job.external_job_id);
  const canonical = normalizeString(job.job_url).toLowerCase();
  const key = sourceId + '|' + (externalId || canonical);
  return crypto.createHash('sha256').update(key).digest('hex');
}

export function buildDedupeKey(title: string, company: string, location: string, applyUrl: string): string {
  const key = [
    normalizeKey(title),
    normalizeKey(company),
    normalizeKey(location),
    normalizeKey(applyUrl)
  ].join('|');
  return crypto.createHash('sha256').update(key).digest('hex');
}

export function inferWorkMode(location: string, description: string): string {
  const haystack = [location, description].join(' ').toLowerCase();
  if (haystack.includes('remote')) {
    return 'Remote';
  }
  if (haystack.includes('hybrid')) {
    return 'Hybrid';
  }
  if (haystack.includes('onsite') || haystack.includes('on-site')) {
    return 'Onsite';
  }
  return 'Unknown';
}
