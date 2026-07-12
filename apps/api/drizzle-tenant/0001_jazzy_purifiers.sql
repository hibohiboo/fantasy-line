CREATE TABLE `items` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`owner_id` bigint unsigned NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `residents` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`name_kana` varchar(128) NOT NULL,
	`birth_date` date NOT NULL,
	`village_id` bigint unsigned NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `residents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `villages` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`owner_id` bigint unsigned NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `villages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `items` ADD CONSTRAINT `items_owner_id_users_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `residents` ADD CONSTRAINT `residents_village_id_villages_id_fk` FOREIGN KEY (`village_id`) REFERENCES `villages`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `villages` ADD CONSTRAINT `villages_owner_id_users_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;