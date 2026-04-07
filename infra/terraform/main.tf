terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

variable "project_id" {
  type = string
}

variable "region" {
  type    = string
  default = "europe-west1"
}

variable "service_name" {
  type    = string
  default = "hrscrape2mart-cloud"
}

variable "runtime_service_account_id" {
  type    = string
  default = "hrscrape2mart-runtime"
}

variable "cloud_build_service_account_email" {
  type    = string
  default = ""
}

variable "gas_webapp_url" {
  type    = string
  default = ""
}

variable "service_base_url" {
  type    = string
  default = ""
}

variable "scheduler_timezone" {
  type    = string
  default = "Etc/UTC"
}

variable "bigquery_dataset_id" {
  type    = string
  default = "hrscrape_mart"
}

variable "billing_account_id" {
  type    = string
  default = ""
}

variable "budget_currency_code" {
  type    = string
  default = "USD"
}

variable "budget_amount_units" {
  type    = number
  default = 5
}

variable "budget_alert_emails" {
  type    = list(string)
  default = []
}

variable "default_poll_seconds" {
  type    = number
  default = 300
}

variable "scrape_lease_minutes" {
  type    = number
  default = 15
}

variable "addon_shared_token" {
  type      = string
  sensitive = true
}

variable "addon_hmac_secret" {
  type      = string
  sensitive = true
}

variable "internal_task_token" {
  type      = string
  sensitive = true
}

variable "telegram_bot_token" {
  type      = string
  sensitive = true
}

variable "telegram_chat_id" {
  type      = string
  sensitive = true
}

variable "mini_app_session_secret" {
  type      = string
  sensitive = true
}

variable "telegram_webhook_secret" {
  type      = string
  sensitive = true
}
