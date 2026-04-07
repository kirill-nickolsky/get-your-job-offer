import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config';

interface AnalyticsEventRecord {
  event_type: string;
  created_at: string;
  payload: Record<string, unknown>;
}

async function appendJsonl(record: AnalyticsEventRecord): Promise<void> {
  const filePath = path.resolve(config.analyticsJsonlPath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, JSON.stringify(record) + '\n', 'utf8');
}

export async function writeAnalyticsEvent(eventType: string, payload: Record<string, unknown>): Promise<void> {
  const record: AnalyticsEventRecord = {
    event_type: eventType,
    created_at: new Date().toISOString(),
    payload: payload
  };

  if (config.analyticsSinkMode === 'noop') {
    return;
  }
  if (config.analyticsSinkMode === 'jsonl') {
    await appendJsonl(record);
    return;
  }
  if (config.analyticsSinkMode === 'bigquery') {
    await appendJsonl(record);
    return;
  }
}
