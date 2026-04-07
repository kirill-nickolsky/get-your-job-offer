import { DailyStatsCacheDoc } from '../contracts';
import { applyActionsCollection, dailyStatsCacheCollection, jobsCollection, notificationsCollection } from '../firestore';
import { writeAnalyticsEvent } from '../event-sink';

function getDayKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(String(value || ''));
  if (!Number.isFinite(date.getTime())) {
    return '';
  }
  return date.toISOString().slice(0, 10);
}

function emptyStats(day: string): DailyStatsCacheDoc {
  return {
    day: day,
    generated_at: new Date().toISOString(),
    totals: {
      new_jobs: 0,
      rated_jobs: 0,
      apply_jobs: 0,
      delete_jobs: 0,
      notifications_sent: 0,
      apply_actions: 0
    },
    by_source: {}
  };
}

function touchSource(doc: DailyStatsCacheDoc, sourceId: string): void {
  if (!doc.by_source[sourceId]) {
    doc.by_source[sourceId] = {
      new_jobs: 0,
      apply_jobs: 0,
      delete_jobs: 0
    };
  }
}

export async function refreshDailyStats(day?: string): Promise<DailyStatsCacheDoc> {
  const targetDay = String(day || getDayKey(new Date())).trim() || getDayKey(new Date());
  const stats = emptyStats(targetDay);

  const jobsSnapshot = await jobsCollection().get();
  for (let i = 0; i < jobsSnapshot.docs.length; i++) {
    const job = jobsSnapshot.docs[i].data() || {};
    const sourceId = String(job.source_id || 'unknown').trim() || 'unknown';
    if (getDayKey(String(job.first_seen_at || '')) === targetDay) {
      stats.totals.new_jobs += 1;
      touchSource(stats, sourceId);
      stats.by_source[sourceId].new_jobs += 1;
    }
    if (getDayKey(String(job.last_seen_at || '')) === targetDay && Number(job.rate_num || 0) > 0) {
      stats.totals.rated_jobs += 1;
    }
    if (String(job.status || '') === '2Apply' && getDayKey(String(job.last_seen_at || '')) === targetDay) {
      touchSource(stats, sourceId);
      stats.totals.apply_jobs += 1;
      stats.by_source[sourceId].apply_jobs += 1;
    }
    if (String(job.status || '') === '2Delete' && getDayKey(String(job.last_seen_at || '')) === targetDay) {
      touchSource(stats, sourceId);
      stats.totals.delete_jobs += 1;
      stats.by_source[sourceId].delete_jobs += 1;
    }
  }

  const notificationsSnapshot = await notificationsCollection().get();
  for (let i = 0; i < notificationsSnapshot.docs.length; i++) {
    const notification = notificationsSnapshot.docs[i].data() || {};
    if (String(notification.status || '') === 'sent' && getDayKey(String(notification.sent_at || '')) === targetDay) {
      stats.totals.notifications_sent += 1;
    }
  }

  const applyActionsSnapshot = await applyActionsCollection().get();
  for (let i = 0; i < applyActionsSnapshot.docs.length; i++) {
    const action = applyActionsSnapshot.docs[i].data() || {};
    if (getDayKey(String(action.created_at || '')) === targetDay) {
      stats.totals.apply_actions += 1;
    }
  }

  stats.generated_at = new Date().toISOString();
  await dailyStatsCacheCollection().doc(targetDay).set(stats as unknown as Record<string, unknown>, { merge: true });
  await writeAnalyticsEvent('daily_stats_cache', {
    day: targetDay,
    totals: stats.totals
  });
  return stats;
}

export async function getDailyStats(day?: string): Promise<DailyStatsCacheDoc> {
  const targetDay = String(day || getDayKey(new Date())).trim() || getDayKey(new Date());
  const snapshot = await dailyStatsCacheCollection().doc(targetDay).get();
  if (snapshot.exists) {
    return snapshot.data() as unknown as DailyStatsCacheDoc;
  }
  return refreshDailyStats(targetDay);
}
