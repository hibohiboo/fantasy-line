CREATE TABLE `role_permissions` (
	`role_id` bigint unsigned NOT NULL,
	`resource` varchar(64) NOT NULL,
	`action` varchar(64) NOT NULL,
	CONSTRAINT `role_permissions_role_id_resource_action_pk` PRIMARY KEY(`role_id`,`resource`,`action`)
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(64) NOT NULL,
	CONSTRAINT `roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `roles_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`slug` varchar(32) NOT NULL,
	`name` varchar(255) NOT NULL,
	`status` enum('active','suspended','deleted') NOT NULL DEFAULT 'active',
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `tenants_id` PRIMARY KEY(`id`),
	CONSTRAINT `tenants_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `user_tenant_roles` (
	`user_id` bigint unsigned NOT NULL,
	`tenant_id` bigint unsigned NOT NULL,
	`role_id` bigint unsigned NOT NULL,
	CONSTRAINT `user_tenant_roles_user_id_tenant_id_role_id_pk` PRIMARY KEY(`user_id`,`tenant_id`,`role_id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`cognito_sub` varchar(128) NOT NULL,
	`email` varchar(255) NOT NULL,
	`user_type` enum('servicer_admin','servicer_delegate') NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_cognito_sub_unique` UNIQUE(`cognito_sub`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_role_id_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_tenant_roles` ADD CONSTRAINT `user_tenant_roles_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_tenant_roles` ADD CONSTRAINT `user_tenant_roles_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_tenant_roles` ADD CONSTRAINT `user_tenant_roles_role_id_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE no action ON UPDATE no action;