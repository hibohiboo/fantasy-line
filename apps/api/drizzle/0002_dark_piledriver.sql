CREATE TABLE `residents` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`name_kana` varchar(128) NOT NULL,
	`birth_date` date NOT NULL,
	`village_id` bigint NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `residents_id` PRIMARY KEY(`id`)
);
