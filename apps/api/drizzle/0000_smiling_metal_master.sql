CREATE TABLE `items` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` varchar(1000),
	`rarity` varchar(50) NOT NULL DEFAULT 'common',
	`price` int NOT NULL DEFAULT 0,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `items_id` PRIMARY KEY(`id`)
);
