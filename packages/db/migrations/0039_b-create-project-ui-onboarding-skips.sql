ALTER TABLE auth.organization ALTER COLUMN onboarding_skipped DROP DEFAULT;--> statement-breakpoint
ALTER TABLE auth.organization
  ALTER COLUMN onboarding_skipped TYPE jsonb
  USING CASE
    WHEN onboarding_skipped THEN '["organisation", "project", "sources", "window", "rota", "channel"]'::jsonb
    ELSE '[]'::jsonb
  END;--> statement-breakpoint
ALTER TABLE auth.organization ALTER COLUMN onboarding_skipped SET DEFAULT '[]'::jsonb;--> statement-breakpoint
GRANT UPDATE (onboarding_skipped) ON auth.organization TO app, "system";
