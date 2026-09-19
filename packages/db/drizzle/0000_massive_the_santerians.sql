CREATE TABLE `activity_log` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text,
	`actor_id` text,
	`action` text NOT NULL,
	`field` text,
	`old_val` text,
	`new_val` text,
	`at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_activity_task` ON `activity_log` (`task_id`,`at`);--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text,
	`user_id` text,
	`r2_key` text NOT NULL,
	`filename` text NOT NULL,
	`mime` text DEFAULT 'application/octet-stream' NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`thumb_key` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_attachments_task` ON `attachments` (`task_id`);--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`author_id` text,
	`content_md` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_comments_task` ON `comments` (`task_id`);--> statement-breakpoint
CREATE TABLE `dependencies` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`depends_on_id` text NOT NULL,
	`kind` text DEFAULT 'blocks' NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`depends_on_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_deps_task` ON `dependencies` (`task_id`,`depends_on_id`);--> statement-breakpoint
CREATE TABLE `device_registry` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`device_name` text DEFAULT 'Unknown device' NOT NULL,
	`platform` text DEFAULT 'web' NOT NULL,
	`last_seen_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`user_id` text NOT NULL,
	`seq` integer NOT NULL,
	`table` text NOT NULL,
	`op` text DEFAULT 'upsert' NOT NULL,
	`payload_json` text,
	`created_at` integer NOT NULL,
	`applied_at` integer
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`parent_id` text,
	`name` text NOT NULL,
	`color` text DEFAULT '#6366f1' NOT NULL,
	`icon` text DEFAULT '📁' NOT NULL,
	`is_inbox` integer DEFAULT false NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_projects_user` ON `projects` (`user_id`,`parent_id`);--> statement-breakpoint
CREATE TABLE `reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`trigger_at` integer NOT NULL,
	`kind` text DEFAULT 'due' NOT NULL,
	`channel` text DEFAULT 'push' NOT NULL,
	`fired_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_reminders_trigger` ON `reminders` (`trigger_at`,`fired_at`);--> statement-breakpoint
CREATE TABLE `repeat_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`rrule` text,
	`interval` integer DEFAULT 1 NOT NULL,
	`by_day` text DEFAULT '[]',
	`by_month_day` integer,
	`exceptions_json` text DEFAULT '[]',
	`end_on` integer,
	`generate_ahead_days` integer DEFAULT 90 NOT NULL,
	`time_of_day` text DEFAULT '09:00',
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `scheduled_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text,
	`kind` text NOT NULL,
	`run_at` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`last_error` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_jobs_run` ON `scheduled_jobs` (`run_at`,`status`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`refresh_hash` text NOT NULL,
	`device_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sync_state` (
	`id` text PRIMARY KEY NOT NULL,
	`table` text NOT NULL,
	`row_id` text NOT NULL,
	`user_id` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`last_synced_device_id` text,
	`deleted_at` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `task_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`title` text NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`repeated_from` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_steps_task` ON `task_steps` (`task_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`project_id` text,
	`parent_id` text,
	`repeat_rule_id` text,
	`template_id` text,
	`type` text DEFAULT 'one_time' NOT NULL,
	`title` text NOT NULL,
	`description_md` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`priority` text DEFAULT 'p3' NOT NULL,
	`progress_pct` integer DEFAULT 0 NOT NULL,
	`estimated_hours` integer,
	`actual_hours` integer DEFAULT 0 NOT NULL,
	`budget` integer,
	`start_on` integer,
	`due_on` integer,
	`starts_at` integer,
	`ends_at` integer,
	`duration_min` integer,
	`snooze_until` integer,
	`location_address` text,
	`location_lat` text,
	`location_lng` text,
	`contact_json` text,
	`tags_json` text DEFAULT '[]',
	`links_json` text DEFAULT '[]',
	`habit_goal_per_period` integer,
	`habit_streak` integer DEFAULT 0 NOT NULL,
	`mood` text,
	`created_by_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`repeat_rule_id`) REFERENCES `repeat_rules`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_tasks_user_status` ON `tasks` (`user_id`,`status`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `idx_tasks_project` ON `tasks` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_tasks_due` ON `tasks` (`due_on`);--> statement-breakpoint
CREATE INDEX `idx_tasks_parent` ON `tasks` (`parent_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`pass_hash` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`avatar_url` text,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`settings_json` text DEFAULT '{}',
	`verified_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `idx_users_email` ON `users` (`email`);