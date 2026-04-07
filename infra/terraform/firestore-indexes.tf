resource "google_firestore_index" "jobs_status_rate_seen" {
  project    = var.project_id
  database   = "(default)"
  collection = "jobs"

  fields {
    field_path = "status"
    order      = "ASCENDING"
  }

  fields {
    field_path = "rate_num"
    order      = "DESCENDING"
  }

  fields {
    field_path = "last_seen_at"
    order      = "DESCENDING"
  }
}

resource "google_firestore_index" "notifications_chat_sent" {
  project    = var.project_id
  database   = "(default)"
  collection = "notifications"

  fields {
    field_path = "target_chat_id"
    order      = "ASCENDING"
  }

  fields {
    field_path = "sent_at"
    order      = "DESCENDING"
  }
}
