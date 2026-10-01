CREATE TABLE `album_media` (
	`album_id` integer NOT NULL,
	`media_id` integer NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`added_by` integer,
	`added_at` integer,
	PRIMARY KEY(`album_id`, `media_id`),
	FOREIGN KEY (`album_id`) REFERENCES `albums`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`added_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `album_media_position` ON `album_media` (`album_id`,`position`);--> statement-breakpoint
CREATE INDEX `album_media_media` ON `album_media` (`media_id`);--> statement-breakpoint
CREATE TABLE `albums` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_id` integer NOT NULL,
	`name` text NOT NULL,
	`name_folded` text,
	`description` text,
	`cover_media_id` integer,
	`visibility` text DEFAULT 'private' NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cover_media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `albums_owner` ON `albums` (`owner_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `albums_visibility` ON `albums` (`visibility`,`updated_at`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`action` text NOT NULL,
	`subject_type` text,
	`subject_id` integer,
	`ip` text,
	`result` text DEFAULT 'success' NOT NULL,
	`context` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_created` ON `audit_logs` (`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `audit_user` ON `audit_logs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_action` ON `audit_logs` (`action`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_subject` ON `audit_logs` (`subject_type`,`subject_id`);--> statement-breakpoint
CREATE TABLE `cache_entries` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`counter` integer DEFAULT 0 NOT NULL,
	`expires_at` integer
);
--> statement-breakpoint
CREATE INDEX `cache_expires_idx` ON `cache_entries` (`expires_at`);--> statement-breakpoint
CREATE TABLE `drive_folders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`drive_id` integer NOT NULL,
	`item_id` text NOT NULL,
	`parent_item_id` text,
	`name` text NOT NULL,
	`is_root` integer DEFAULT false NOT NULL,
	`is_deleted` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`drive_id`) REFERENCES `drives`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `drive_folders_drive_item` ON `drive_folders` (`drive_id`,`item_id`);--> statement-breakpoint
CREATE INDEX `drive_folders_parent` ON `drive_folders` (`drive_id`,`parent_item_id`);--> statement-breakpoint
CREATE TABLE `drive_sync_states` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`drive_id` integer NOT NULL,
	`delta_link` text,
	`resume_link` text,
	`status` text DEFAULT 'idle' NOT NULL,
	`last_started_at` integer,
	`last_completed_at` integer,
	`last_error` text,
	`items_seen` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`drive_id`) REFERENCES `drives`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `drive_sync_states_drive_id_unique` ON `drive_sync_states` (`drive_id`);--> statement-breakpoint
CREATE TABLE `drives` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`drive_id` text NOT NULL,
	`drive_type` text NOT NULL,
	`site_id` text,
	`name` text NOT NULL,
	`web_url` text,
	`owner_user_id` integer,
	`auth_mode` text DEFAULT 'app' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `drives_drive_id_unique` ON `drives` (`drive_id`);--> statement-breakpoint
CREATE TABLE `libraries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`visibility` text DEFAULT 'restricted' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`allow_public_links` integer DEFAULT false NOT NULL,
	`allow_writes` integer DEFAULT false NOT NULL,
	`allow_ai` integer DEFAULT false NOT NULL,
	`allow_faces` integer DEFAULT false NOT NULL,
	`created_by` integer,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `libraries_slug_unique` ON `libraries` (`slug`);--> statement-breakpoint
CREATE TABLE `library_access` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`library_id` integer NOT NULL,
	`principal_type` text NOT NULL,
	`principal_id` text NOT NULL,
	`display_name` text,
	`role` text DEFAULT 'viewer' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`library_id`) REFERENCES `libraries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `library_access_unique` ON `library_access` (`library_id`,`principal_type`,`principal_id`);--> statement-breakpoint
CREATE INDEX `library_access_principal` ON `library_access` (`principal_type`,`principal_id`);--> statement-breakpoint
CREATE TABLE `library_roots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`library_id` integer NOT NULL,
	`drive_id` integer NOT NULL,
	`root_item_id` text NOT NULL,
	`root_path` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`library_id`) REFERENCES `libraries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`drive_id`) REFERENCES `drives`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `library_roots_drive_item` ON `library_roots` (`drive_id`,`root_item_id`);--> statement-breakpoint
CREATE TABLE `media` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`library_id` integer,
	`drive_id` integer NOT NULL,
	`item_id` text NOT NULL,
	`parent_item_id` text,
	`name` text NOT NULL,
	`folder_path` text,
	`name_folded` text,
	`folder_folded` text,
	`place_folded` text,
	`media_type` text NOT NULL,
	`mime_type` text,
	`size` integer DEFAULT 0 NOT NULL,
	`width` integer,
	`height` integer,
	`duration_ms` integer,
	`taken_at` integer,
	`source_created_at` integer,
	`source_modified_at` integer,
	`sort_at` integer NOT NULL,
	`latitude` real,
	`longitude` real,
	`place_name` text,
	`place_region` text,
	`place_country` text,
	`place_distance_km` real,
	`location_source` text,
	`location_set_by` integer,
	`checksum` text,
	`etag` text,
	`ctag` text,
	`web_url` text,
	`metadata` text,
	`source_state` text DEFAULT 'active' NOT NULL,
	`metadata_extracted` integer DEFAULT false NOT NULL,
	`last_seen_sync_job_id` integer,
	`hidden_at` integer,
	`hidden_by` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`library_id`) REFERENCES `libraries`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`drive_id`) REFERENCES `drives`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_set_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`hidden_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_drive_item` ON `media` (`drive_id`,`item_id`);--> statement-breakpoint
CREATE INDEX `media_timeline_library` ON `media` (`library_id`,`source_state`,`hidden_at`,`sort_at`,`id`);--> statement-breakpoint
CREATE INDEX `media_timeline_global` ON `media` (`source_state`,`hidden_at`,`sort_at`,`id`);--> statement-breakpoint
CREATE INDEX `media_parent` ON `media` (`drive_id`,`parent_item_id`);--> statement-breakpoint
CREATE INDEX `media_place` ON `media` (`place_name`);--> statement-breakpoint
CREATE INDEX `media_checksum` ON `media` (`checksum`);--> statement-breakpoint
CREATE TABLE `media_tags` (
	`media_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	`source` text DEFAULT 'user' NOT NULL,
	`created_by` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`media_id`, `tag_id`, `source`),
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `oauth_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`provider` text DEFAULT 'microsoft' NOT NULL,
	`access_token` text NOT NULL,
	`refresh_token` text,
	`scopes` text,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_tokens_user_provider` ON `oauth_tokens` (`user_id`,`provider`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer,
	`ip` text,
	`user_agent` text,
	`expires_at` integer NOT NULL,
	`last_activity_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`updated_by` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `share_media` (
	`share_id` integer NOT NULL,
	`media_id` integer NOT NULL,
	PRIMARY KEY(`share_id`, `media_id`),
	FOREIGN KEY (`share_id`) REFERENCES `shares`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `share_recipients` (
	`share_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	PRIMARY KEY(`share_id`, `user_id`),
	FOREIGN KEY (`share_id`) REFERENCES `shares`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `share_recipients_user` ON `share_recipients` (`user_id`);--> statement-breakpoint
CREATE TABLE `shares` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token_hash` text NOT NULL,
	`created_by` integer NOT NULL,
	`shareable_type` text NOT NULL,
	`album_id` integer,
	`audience` text NOT NULL,
	`password_hash` text,
	`expires_at` integer,
	`revoked_at` integer,
	`view_count` integer DEFAULT 0 NOT NULL,
	`last_accessed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`album_id`) REFERENCES `albums`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shares_token_hash_unique` ON `shares` (`token_hash`);--> statement-breakpoint
CREATE INDEX `shares_creator` ON `shares` (`created_by`,`created_at`);--> statement-breakpoint
CREATE TABLE `sync_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`drive_id` integer NOT NULL,
	`library_id` integer,
	`type` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`total_estimate` integer,
	`processed` integer DEFAULT 0 NOT NULL,
	`created` integer DEFAULT 0 NOT NULL,
	`updated` integer DEFAULT 0 NOT NULL,
	`removed` integer DEFAULT 0 NOT NULL,
	`errors` integer DEFAULT 0 NOT NULL,
	`triggered_by` integer,
	`state` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`drive_id`) REFERENCES `drives`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`library_id`) REFERENCES `libraries`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`triggered_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `sync_jobs_status` ON `sync_jobs` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `sync_jobs_drive` ON `sync_jobs` (`drive_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `sync_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sync_job_id` integer,
	`level` text NOT NULL,
	`code` text NOT NULL,
	`message` text NOT NULL,
	`item_id` text,
	`context` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`sync_job_id`) REFERENCES `sync_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sync_logs_level` ON `sync_logs` (`level`,`created_at`);--> statement-breakpoint
CREATE INDEX `sync_logs_job` ON `sync_logs` (`sync_job_id`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_slug_unique` ON `tags` (`slug`);--> statement-breakpoint
CREATE TABLE `user_media` (
	`user_id` integer NOT NULL,
	`media_id` integer NOT NULL,
	`is_favourite` integer DEFAULT false NOT NULL,
	`favourited_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `media_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_media_fav` ON `user_media` (`user_id`,`is_favourite`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entra_oid` text,
	`tenant_id` text,
	`name` text NOT NULL,
	`email` text,
	`upn` text,
	`locale` text DEFAULT 'pt' NOT NULL,
	`role` text DEFAULT 'viewer' NOT NULL,
	`role_source` text DEFAULT 'entra' NOT NULL,
	`group_ids` text,
	`groups_synced_at` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`last_login_at` integer,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_entra_oid_unique` ON `users` (`entra_oid`);--> statement-breakpoint
CREATE INDEX `users_email_idx` ON `users` (`email`);