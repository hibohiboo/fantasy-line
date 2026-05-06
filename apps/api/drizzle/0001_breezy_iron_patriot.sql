CREATE TABLE `villages` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`owner_id` varchar(255) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `villages_id` PRIMARY KEY(`id`)
);
