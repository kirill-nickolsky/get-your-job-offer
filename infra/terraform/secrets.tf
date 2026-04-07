resource "google_secret_manager_secret" "telegram_bot_token" {
  secret_id = "telegram-bot-token"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "telegram_bot_token" {
  secret      = google_secret_manager_secret.telegram_bot_token.id
  secret_data = var.telegram_bot_token
}

resource "google_secret_manager_secret" "telegram_chat_id" {
  secret_id = "telegram-chat-id"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "telegram_chat_id" {
  secret      = google_secret_manager_secret.telegram_chat_id.id
  secret_data = var.telegram_chat_id
}

resource "google_secret_manager_secret" "addon_shared_token" {
  secret_id = "addon-shared-token"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "addon_shared_token" {
  secret      = google_secret_manager_secret.addon_shared_token.id
  secret_data = var.addon_shared_token
}

resource "google_secret_manager_secret" "addon_hmac_secret" {
  secret_id = "addon-hmac-secret"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "addon_hmac_secret" {
  secret      = google_secret_manager_secret.addon_hmac_secret.id
  secret_data = var.addon_hmac_secret
}

resource "google_secret_manager_secret" "internal_task_token" {
  secret_id = "internal-task-token"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "internal_task_token" {
  secret      = google_secret_manager_secret.internal_task_token.id
  secret_data = var.internal_task_token
}

resource "google_secret_manager_secret" "mini_app_session_secret" {
  secret_id = "mini-app-session-secret"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "mini_app_session_secret" {
  secret      = google_secret_manager_secret.mini_app_session_secret.id
  secret_data = var.mini_app_session_secret
}

resource "google_secret_manager_secret" "telegram_webhook_secret" {
  secret_id = "telegram-webhook-secret"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "telegram_webhook_secret" {
  secret      = google_secret_manager_secret.telegram_webhook_secret.id
  secret_data = var.telegram_webhook_secret
}
