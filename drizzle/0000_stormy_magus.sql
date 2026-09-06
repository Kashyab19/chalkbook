CREATE TABLE `body_weights` (
	`date` text PRIMARY KEY NOT NULL,
	`weight_kg` real NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `program` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`data` text NOT NULL
);
