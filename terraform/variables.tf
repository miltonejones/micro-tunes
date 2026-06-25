variable "aws_region" {
  description = "AWS region for all resources (us-east-1 required for CloudFront-attached ACM certs)"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Name used to prefix/tag resources"
  type        = string
  default     = "micro-tunes"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
}

variable "domain_name" {
  description = "Fully-qualified domain the site is served on"
  type        = string
  default     = "micro.skytunes.nl"
}

variable "hosted_zone_name" {
  description = "Route53 hosted zone that owns domain_name"
  type        = string
  default     = "skytunes.nl."
}

variable "price_class" {
  description = "CloudFront price class"
  type        = string
  default     = "PriceClass_100"
}
