resource "google_bigquery_dataset" "mart" {
  dataset_id = var.bigquery_dataset_id
  location   = var.region
}

resource "google_bigquery_table" "scrape_runs" {
  dataset_id = google_bigquery_dataset.mart.dataset_id
  table_id   = "scrape_runs"
  schema = jsonencode([
    { name = "run_id", type = "STRING", mode = "REQUIRED" },
    { name = "source_id", type = "STRING", mode = "REQUIRED" },
    { name = "success", type = "BOOL", mode = "NULLABLE" },
    { name = "jobs_received", type = "INTEGER", mode = "NULLABLE" },
    { name = "jobs_new", type = "INTEGER", mode = "NULLABLE" },
    { name = "created_at", type = "TIMESTAMP", mode = "NULLABLE" }
  ])
}

resource "google_bigquery_table" "job_events" {
  dataset_id = google_bigquery_dataset.mart.dataset_id
  table_id   = "job_events"
  schema = jsonencode([
    { name = "event_id", type = "STRING", mode = "REQUIRED" },
    { name = "job_id", type = "STRING", mode = "REQUIRED" },
    { name = "source_id", type = "STRING", mode = "NULLABLE" },
    { name = "event_type", type = "STRING", mode = "REQUIRED" },
    { name = "created_at", type = "TIMESTAMP", mode = "NULLABLE" },
    { name = "payload_json", type = "STRING", mode = "NULLABLE" }
  ])
}

resource "google_bigquery_table" "notifications" {
  dataset_id = google_bigquery_dataset.mart.dataset_id
  table_id   = "notifications"
  schema = jsonencode([
    { name = "job_id", type = "STRING", mode = "REQUIRED" },
    { name = "target_chat_id", type = "STRING", mode = "NULLABLE" },
    { name = "status", type = "STRING", mode = "NULLABLE" },
    { name = "sent_at", type = "TIMESTAMP", mode = "NULLABLE" }
  ])
}

resource "google_bigquery_table" "apply_actions" {
  dataset_id = google_bigquery_dataset.mart.dataset_id
  table_id   = "apply_actions"
  schema = jsonencode([
    { name = "action_id", type = "STRING", mode = "REQUIRED" },
    { name = "job_id", type = "STRING", mode = "REQUIRED" },
    { name = "action", type = "STRING", mode = "REQUIRED" },
    { name = "source", type = "STRING", mode = "NULLABLE" },
    { name = "telegram_user_id", type = "STRING", mode = "NULLABLE" },
    { name = "created_at", type = "TIMESTAMP", mode = "NULLABLE" }
  ])
}

resource "google_bigquery_table" "daily_aggregates" {
  dataset_id = google_bigquery_dataset.mart.dataset_id
  table_id   = "daily_aggregates"
  schema = jsonencode([
    { name = "day", type = "DATE", mode = "REQUIRED" },
    { name = "new_jobs", type = "INTEGER", mode = "NULLABLE" },
    { name = "rated_jobs", type = "INTEGER", mode = "NULLABLE" },
    { name = "apply_jobs", type = "INTEGER", mode = "NULLABLE" },
    { name = "notifications_sent", type = "INTEGER", mode = "NULLABLE" },
    { name = "apply_actions", type = "INTEGER", mode = "NULLABLE" }
  ])
}
