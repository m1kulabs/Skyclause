terraform {
  required_version = "~> 1.17"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.10"
    }
    # Community provider Neon sponsors; pinned exactly, since Neon's docs warn that schema
    # changes on upgrade can replace resources.
    neon = {
      source  = "kislerdm/neon"
      version = "0.18.0"
    }
    postgresql = {
      source  = "cyrilgdn/postgresql"
      version = "~> 1.27"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.9"
    }
  }

  # Created by the owner before infra/bootstrap runs (infra/README.md).
  backend "gcs" {
    bucket = "skyclause-production-tfstate"
    prefix = "production"
  }
}

provider "google" {
  project = local.project_id
  region  = local.region
}

# Reads the API key from NEON_API_KEY.
provider "neon" {}

# Connects as `migrator` to create the other logins. A sleeping compute wakes on connect.
provider "postgresql" {
  host            = neon_project.main.database_host
  database        = local.database
  username        = "migrator"
  password        = neon_project.main.database_password
  sslmode         = "verify-full"
  superuser       = false
  connect_timeout = 30
}
