import crypto from 'node:crypto';
import { jobEventsCollection } from '../firestore';
import { writeAnalyticsEvent } from '../event-sink';

export async function recordJobEvent(
  jobId: string,
  sourceId: string,
  runId: string,
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> {
  const createdAt = new Date().toISOString();
  const eventId = crypto.randomUUID();
  await jobEventsCollection().doc(eventId).set({
    event_id: eventId,
    job_id: jobId,
    source_id: sourceId,
    run_id: runId,
    event_type: eventType,
    created_at: createdAt,
    payload: payload
  }, { merge: true });
  await writeAnalyticsEvent('job_event', {
    job_id: jobId,
    source_id: sourceId,
    run_id: runId,
    event_type: eventType,
    created_at: createdAt,
    payload: payload
  });
}
