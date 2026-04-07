export type RateTaskStatus = 'queued' | 'running' | 'done' | 'failed';
export type JobStatus = 'new' | '2Apply' | '2Delete' | 'Applied';
export type JobRateStatus = 'pending' | 'done' | 'failed';
export type NotificationStatus = 'queued' | 'sent' | 'failed';
export type PipelineStage =
  | 'ingested'
  | 'normalized'
  | 'enriched'
  | 'rated'
  | 'notified'
  | 'synced'
  | 'applied';
export type ScrapeCommandStatus = 'leased' | 'completed' | 'failed';
export type ApplyActionType = 'apply' | 'delete' | 'later';
export type SyncSheetsTaskKind = 'stage-run' | 'job-state';

export interface SourceConfigDoc {
  source_id: string;
  name: string;
  enabled: boolean;
  scrape_page_urls: string[];
  scrape_page_id?: string;
  priority: number;
  min_interval_min: number;
  retry_limit: number;
  retry_backoff_min: number;
  daily_success_cap?: number;
  max_tabs_per_site?: number;
  leased_until: string;
  last_started_at: string;
  last_success_at: string;
  last_failure_at: string;
  consecutive_failures: number;
}

export interface ScrapeCommandDoc {
  lease_id: string;
  source_id: string;
  addon_instance_id: string;
  status: ScrapeCommandStatus;
  issued_at: string;
  leased_until: string;
  completed_at: string;
  run_id: string;
  error_code: string;
  error_message: string;
}

export interface ScrapePlanRequest {
  addon_instance_id: string;
  addon_version: string;
  supported_sources: string[];
  max_commands?: number;
}

export interface ScrapePlanCommand {
  lease_id: string;
  source_id: string;
  scrape_page_url: string;
  mode: 'list';
}

export interface ScrapePlanResponse {
  poll_after_sec: number;
  commands: ScrapePlanCommand[];
}

export interface ScrapeJobInput {
  external_job_id?: string;
  job_url: string;
  job_apply_url?: string;
  job_title: string;
  job_company: string;
  job_location?: string;
  job_tags?: string[] | string;
  job_description?: string;
}

export interface ScrapeResultRequest {
  lease_id: string;
  run_id?: string;
  source_id: string;
  addon_instance_id: string;
  started_at: string;
  finished_at: string;
  success: boolean;
  error_code?: string;
  error_message?: string;
  jobs: ScrapeJobInput[];
}

export interface ScrapeResultResponse {
  accepted: boolean;
  jobs_new: number;
  rate_tasks_enqueued: number;
}

export interface ScrapeRunDoc {
  run_id: string;
  source_id: string;
  lease_id: string;
  addon_instance_id: string;
  started_at: string;
  finished_at: string;
  success: boolean;
  jobs_received: number;
  jobs_new: number;
  error_code: string;
  error_message: string;
  sheets_sync_status?: 'queued' | 'done' | 'failed' | '';
  sheets_sync_at?: string;
  sheets_sync_error?: string;
  request_id?: string;
}

export interface JobDoc {
  job_id: string;
  source_id: string;
  external_job_id: string;
  canonical_url: string;
  apply_url: string;
  title: string;
  company: string;
  location: string;
  tags: string[];
  description: string;
  scrape_run_id: string;
  first_seen_at: string;
  last_seen_at: string;
  is_new: boolean;
  pipeline_stage: PipelineStage;
  pipeline_version: number;
  normalize_version: number;
  enrich_version: number;
  rate_version: number;
  sheet_sync_version: number;
  normalized_title: string;
  normalized_company: string;
  normalized_location: string;
  normalized_apply_url: string;
  dedupe_key: string;
  enrich_summary: string;
  enrich_keywords: string[];
  work_mode_hint: string;
  rate_status: JobRateStatus;
  rate_num: number;
  rate_reason: string;
  rate_provider?: string;
  rated_model?: string;
  status: JobStatus;
  notified_at: string;
}

export interface RateTaskDoc {
  job_id: string;
  status: RateTaskStatus;
  attempt: number;
  created_at: string;
  updated_at: string;
  error: string;
}

export interface NotificationDoc {
  job_id: string;
  channel: 'telegram';
  target_chat_id: string;
  status: NotificationStatus;
  sent_at: string;
  message_id: string;
}

export interface JobEventDoc {
  event_id: string;
  job_id: string;
  source_id: string;
  run_id: string;
  event_type: string;
  created_at: string;
  payload: Record<string, unknown>;
}

export interface BotUserDoc {
  telegram_user_id: string;
  username: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  notify_min_rate: number;
  created_at: string;
  last_seen_at: string;
}

export interface ApplyActionDoc {
  action_id: string;
  job_id: string;
  action: ApplyActionType;
  note: string;
  source: 'miniapp' | 'telegram-bot' | 'api';
  telegram_user_id: string;
  created_at: string;
}

export interface DailyStatsCacheDoc {
  day: string;
  generated_at: string;
  totals: {
    new_jobs: number;
    rated_jobs: number;
    apply_jobs: number;
    delete_jobs: number;
    notifications_sent: number;
    apply_actions: number;
  };
  by_source: Record<string, {
    new_jobs: number;
    apply_jobs: number;
    delete_jobs: number;
  }>;
}

export interface RateTaskRequest {
  job_id: string;
  version?: number;
}

export interface NotifyTaskRequest {
  job_id: string;
}

export interface NormalizeTaskRequest {
  job_id: string;
  version: number;
}

export interface EnrichTaskRequest {
  job_id: string;
  version: number;
}

export interface StatsRefreshTaskRequest {
  day?: string;
  reason?: string;
}

export interface EnqueueRateRequest {
  job_ids: string[];
  reason?: string;
}

export interface SyncSheetsTaskRequest {
  kind: SyncSheetsTaskKind;
  run_id?: string;
  source_id?: string;
  job_id?: string;
  status?: string;
  rate_num?: number;
  rate_reason?: string;
  rate_provider?: string;
}

export interface TelegramSessionRequest {
  mode?: 'fake' | 'telegram';
  user_id?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  init_data?: string;
}

export interface TelegramSessionResponse {
  ok: true;
  session_token: string;
  user: {
    telegram_user_id: string;
    username: string;
    first_name: string;
  };
}

export interface BotJobsResponse {
  ok: true;
  items: Array<{
    job_id: string;
    title: string;
    company: string;
    location: string;
    rate_num: number;
    rate_reason: string;
    status: string;
    apply_url: string;
  }>;
}

export interface ApplyActionRequest {
  job_id: string;
  action: ApplyActionType;
  note?: string;
}

export interface SyncSourceConfigsResponse {
  ok: true;
  synced: number;
}
