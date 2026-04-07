import { runtimeCountersCollection } from '../firestore';

function toDayKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export class DailyCapExceededError extends Error {
  readonly counterName: string;
  readonly current: number;
  readonly limit: number;
  readonly requested: number;

  constructor(counterName: string, current: number, limit: number, requested: number) {
    super(
      'Daily cap reached for ' + counterName +
        ': current=' + current +
        ', requested=' + requested +
        ', limit=' + limit
    );
    this.name = 'DailyCapExceededError';
    this.counterName = counterName;
    this.current = current;
    this.limit = limit;
    this.requested = requested;
  }
}

export function isDailyCapExceededError(error: unknown): error is DailyCapExceededError {
  return error instanceof DailyCapExceededError;
}

export async function reserveDailyQuota(counterName: string, limit: number, amount?: number): Promise<void> {
  const safeLimit = Number(limit || 0);
  if (safeLimit < 1) {
    return;
  }

  const requested = Math.max(1, Number(amount || 1));
  const now = new Date();
  const dayKey = toDayKey(now);
  const ref = runtimeCountersCollection().doc(dayKey + ':' + counterName);
  const snapshot = await ref.get();
  const current = snapshot.exists ? Number((snapshot.data() || {}).count || 0) : 0;

  if ((current + requested) > safeLimit) {
    throw new DailyCapExceededError(counterName, current, safeLimit, requested);
  }

  await ref.set({
    counter_name: counterName,
    day_key: dayKey,
    count: current + requested,
    limit: safeLimit,
    updated_at: now.toISOString()
  }, { merge: true });
}

export async function tryReserveDailyQuota(counterName: string, limit: number, amount?: number): Promise<boolean> {
  try {
    await reserveDailyQuota(counterName, limit, amount);
    return true;
  } catch (error) {
    if (isDailyCapExceededError(error)) {
      return false;
    }
    throw error;
  }
}
