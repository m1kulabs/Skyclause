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
