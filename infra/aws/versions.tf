terraform {
  required_version = "~> 1.17"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.72"
    }
  }

  # The bucket is made once with the AWS CLI (infra/README.md).
  backend "s3" {
    bucket       = "skyclause-tfstate-776566309118"
    key          = "production.tfstate"
    region       = "ap-southeast-2"
    use_lockfile = true
  }
}

provider "aws" {
  region              = local.region
  allowed_account_ids = [local.account_id]
}
