ALTER TYPE "activity_origin" ADD VALUE IF NOT EXISTS 'organization_user_work';

UPDATE "activity_events"
SET "origin" = 'pach_work'
WHERE "subject_type" = 'newsletter_subscriber';
