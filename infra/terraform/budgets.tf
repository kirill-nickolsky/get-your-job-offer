data "google_project" "current" {
  project_id = var.project_id
}

resource "google_monitoring_notification_channel" "budget_email" {
  for_each = var.billing_account_id != "" ? toset(var.budget_alert_emails) : toset([])

  project      = var.project_id
  display_name = "get-your-offer budget ${each.value}"
  type         = "email"

  labels = {
    email_address = each.value
  }
}

resource "google_billing_budget" "project_budget" {
  count = var.billing_account_id != "" ? 1 : 0

  billing_account = var.billing_account_id
  display_name    = "get-your-offer budget guardrail"

  budget_filter {
    calendar_period = "MONTH"
    projects        = ["projects/${data.google_project.current.number}"]
  }

  amount {
    specified_amount {
      currency_code = var.budget_currency_code
      units         = tostring(var.budget_amount_units)
    }
  }

  threshold_rules {
    threshold_percent = 0.5
  }

  threshold_rules {
    threshold_percent = 0.8
  }

  threshold_rules {
    threshold_percent = 1.0
  }

  all_updates_rule {
    disable_default_iam_recipients = false
    monitoring_notification_channels = [
      for channel in google_monitoring_notification_channel.budget_email : channel.name
    ]
    schema_version = "1.0"
  }
}

output "budget_notification_channels" {
  value = [
    for channel in google_monitoring_notification_channel.budget_email : channel.name
  ]
}
