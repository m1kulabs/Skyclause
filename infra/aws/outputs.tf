# The #79 §6 TF values, for #89's app_config in infra/environments/production/terraform.tfvars.
output "app_config" {
  value = {
    SES_REGION               = local.region
    SES_CONFIGURATION_SET    = aws_sesv2_configuration_set.this.configuration_set_name
    SES_EVENTS_SNS_TOPIC_ARN = aws_sns_topic.ses_events.arn
    EMAIL_FROM_AUTH          = "Skyclause <sign-in@${local.sending_domain}>"
    EMAIL_FROM_NOTICES       = "Skyclause <notices@${local.sending_domain}>"
    AWS_ROLE_ARN             = aws_iam_role.email.arn
    INBOUND_DOMAIN           = local.inbound_domain
    INBOUND_BUCKET           = aws_s3_bucket.inbound.id
    INBOUND_SNS_TOPIC_ARN    = aws_sns_topic.inbound.arn
  }
}

# Records to enter in Cloudflare under skyclause.m1ku.tech (#118). DKIM values assume SES's
# signing zone is dkim.amazonses.com; the provider can't read SigningHostedZone yet
# (hashicorp/terraform-provider-aws#48568), so the README checks it before they're entered.
output "dns_records" {
  value = concat(
    flatten([
      for identity in [aws_sesv2_email_identity.notices, aws_sesv2_email_identity.inbound] : [
        for token in identity.dkim_signing_attributes[0].tokens : {
          name  = "${token}._domainkey.${identity.email_identity}"
          type  = "CNAME"
          value = "${token}.dkim.amazonses.com"
        }
      ]
    ]),
    [
      { name = local.mail_from_domain, type = "MX", value = "10 feedback-smtp.${local.region}.amazonses.com" },
      { name = local.mail_from_domain, type = "TXT", value = "v=spf1 include:amazonses.com ~all" },
      { name = "_dmarc.${local.sending_domain}", type = "TXT", value = "v=DMARC1; p=quarantine; rua=mailto:${local.dmarc_address}" },
      { name = local.inbound_domain, type = "MX", value = "10 inbound-smtp.${local.region}.amazonaws.com" },
    ],
  )
}
