resource "google_cloud_scheduler_job" "sync_source_configs" {
  count       = var.service_base_url != "" ? 1 : 0
  name        = "hrscrape-sync-source-configs"
  description = "Refresh source_configs in Firestore from GAS ScrapeSources"
  schedule    = "*/30 * * * *"
  time_zone   = var.scheduler_timezone
  region      = var.region

  http_target {
    uri         = "${var.service_base_url}/internal/sync-source-configs"
    http_method = "POST"
    headers = {
      "Content-Type" = "application/json"
      "x-task-token" = var.internal_task_token
    }
    body = base64encode("{}")
  }
}

resource "google_cloud_scheduler_job" "refresh_daily_stats" {
  count       = var.service_base_url != "" ? 1 : 0
  name        = "hrscrape-refresh-daily-stats"
  description = "Refresh daily_stats_cache in Cloud Run"
  schedule    = "5 0 * * *"
  time_zone   = var.scheduler_timezone
  region      = var.region

  http_target {
    uri         = "${var.service_base_url}/tasks/stats-refresh"
    http_method = "POST"
    headers = {
      "Content-Type" = "application/json"
      "x-task-token" = var.internal_task_token
    }
    body = base64encode("{\"reason\":\"scheduler\"}")
  }
}
