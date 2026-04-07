resource "google_cloud_tasks_queue" "vacancy_rate" {
  name     = "vacancy-rate"
  location = var.region

  rate_limits {
    max_dispatches_per_second = 1
    max_concurrent_dispatches = 1
  }

  retry_config {
    max_attempts       = 3
    min_backoff        = "10s"
    max_backoff        = "300s"
    max_doublings      = 4
    max_retry_duration = "0s"
  }
}

resource "google_cloud_tasks_queue" "vacancy_normalize" {
  name     = "vacancy-normalize"
  location = var.region

  rate_limits {
    max_dispatches_per_second = 1
    max_concurrent_dispatches = 1
  }

  retry_config {
    max_attempts       = 3
    min_backoff        = "10s"
    max_backoff        = "300s"
    max_doublings      = 4
    max_retry_duration = "0s"
  }
}

resource "google_cloud_tasks_queue" "vacancy_enrich" {
  name     = "vacancy-enrich"
  location = var.region

  rate_limits {
    max_dispatches_per_second = 1
    max_concurrent_dispatches = 1
  }

  retry_config {
    max_attempts       = 3
    min_backoff        = "10s"
    max_backoff        = "300s"
    max_doublings      = 4
    max_retry_duration = "0s"
  }
}

resource "google_cloud_tasks_queue" "vacancy_notify" {
  name     = "vacancy-notify"
  location = var.region

  rate_limits {
    max_dispatches_per_second = 1
    max_concurrent_dispatches = 1
  }

  retry_config {
    max_attempts       = 5
    min_backoff        = "30s"
    max_backoff        = "1800s"
    max_doublings      = 6
    max_retry_duration = "0s"
  }
}

resource "google_cloud_tasks_queue" "sync_sheets" {
  name     = "sync-sheets"
  location = var.region

  rate_limits {
    max_dispatches_per_second = 1
    max_concurrent_dispatches = 1
  }

  retry_config {
    max_attempts       = 4
    min_backoff        = "30s"
    max_backoff        = "900s"
    max_doublings      = 6
    max_retry_duration = "0s"
  }
}

resource "google_cloud_tasks_queue" "stats_refresh" {
  name     = "stats-refresh"
  location = var.region

  rate_limits {
    max_dispatches_per_second = 1
    max_concurrent_dispatches = 1
  }

  retry_config {
    max_attempts       = 3
    min_backoff        = "30s"
    max_backoff        = "900s"
    max_doublings      = 6
    max_retry_duration = "0s"
  }
}

output "queue_names" {
  value = {
    vacancy_rate      = google_cloud_tasks_queue.vacancy_rate.name
    vacancy_normalize = google_cloud_tasks_queue.vacancy_normalize.name
    vacancy_enrich    = google_cloud_tasks_queue.vacancy_enrich.name
    vacancy_notify    = google_cloud_tasks_queue.vacancy_notify.name
    sync_sheets       = google_cloud_tasks_queue.sync_sheets.name
    stats_refresh     = google_cloud_tasks_queue.stats_refresh.name
  }
}
