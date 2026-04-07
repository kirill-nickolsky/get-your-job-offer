import { config, requireConfig } from '../config';
import { jobsCollection, notificationsCollection } from '../firestore';
import { enqueueStatsRefreshTask } from '../tasks';
import { recordJobEvent } from './job-events';
import { isDailyCapExceededError, tryReserveDailyQuota } from './rollout-guards';
import { sendTelegramText } from './telegram-client';

function buildMessage(job: FirebaseFirestore.DocumentData): string {
  const lines = [
    'New good job',
    '',
    String(job.title || '').trim(),
    String(job.company || '').trim(),
    String(job.location || '').trim(),
    'Rate: ' + String(job.rate_num || ''),
    String(job.rate_reason || '').trim(),
    '',
    String(job.apply_url || job.canonical_url || '').trim()
  ];
  return lines.filter(Boolean).join('\n');
}

export async function notifyJob(jobId: string): Promise<{ ok: true; sent: boolean }> {
  const chatId = requireConfig(config.telegramChatId, 'TELEGRAM_CHAT_ID is required');
  const notificationId = jobId + '_' + chatId;
  const jobRef = jobsCollection().doc(jobId);
  const notificationRef = notificationsCollection().doc(notificationId);

  const existingNotification = await notificationRef.get();
  if (existingNotification.exists) {
    const existingData = existingNotification.data() || {};
    if (String(existingData.status || '') === 'sent') {
      return { ok: true, sent: false };
    }
  }

  const jobSnapshot = await jobRef.get();
  if (!jobSnapshot.exists) {
    throw new Error('Job not found: ' + jobId);
  }
  const job = jobSnapshot.data() || {};

  if (Number(job.rate_num || 0) < 4 || String(job.status || '') !== '2Apply') {
    return { ok: true, sent: false };
  }
  if (String(job.notified_at || '').trim()) {
    return { ok: true, sent: false };
  }

  const allowed = await tryReserveDailyQuota('notify_sends', config.notifyDailyCap, 1);
  if (!allowed) {
    await notificationRef.set({
      job_id: jobId,
      channel: 'telegram',
      target_chat_id: chatId,
      status: 'blocked',
      sent_at: '',
      message_id: '',
      error: 'Daily notify cap reached'
    }, { merge: true });
    await recordJobEvent(
      String(job.job_id || jobId),
      String(job.source_id || ''),
      String(job.scrape_run_id || ''),
      'notification_blocked',
      {
        channel: 'telegram',
        target_chat_id: chatId,
        reason: 'Daily notify cap reached'
      }
    );
    return { ok: true, sent: false };
  }

  await notificationRef.set({
    job_id: jobId,
    channel: 'telegram',
    target_chat_id: chatId,
    status: 'queued',
    sent_at: '',
    message_id: ''
  }, { merge: true });

  const messageId = await sendTelegramText(chatId, buildMessage(job));
  const nowIso = new Date().toISOString();

  await notificationRef.set({
    status: 'sent',
    sent_at: nowIso,
    message_id: messageId
  }, { merge: true });

  await jobRef.set({
    notified_at: nowIso
  }, { merge: true });

  await recordJobEvent(
    String(job.job_id || jobId),
    String(job.source_id || ''),
    String(job.scrape_run_id || ''),
    'notified',
    {
      channel: 'telegram',
      target_chat_id: chatId,
      message_id: messageId
    }
  );
  try {
    await enqueueStatsRefreshTask('notify');
  } catch (error) {
    if (!isDailyCapExceededError(error)) {
      throw error;
    }
  }

  return { ok: true, sent: true };
}
