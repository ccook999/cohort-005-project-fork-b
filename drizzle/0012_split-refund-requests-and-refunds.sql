-- Split the old `refunds` table into Refund Requests and Refunds. See
-- docs/adr/0005-refund-requests-and-refunds-are-separate-records.md.
CREATE TABLE `refund_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`purchase_id` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`reason` text NOT NULL,
	`requested_at` text NOT NULL,
	`decided_at` text,
	`decided_by_user_id` integer,
	`decision_note` text,
	FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`decided_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `refund_requests` (`id`, `purchase_id`, `status`, `reason`, `requested_at`, `decided_at`, `decided_by_user_id`, `decision_note`)
SELECT `id`, `purchase_id`, `status`, `reason`, `requested_at`, `resolved_at`, `resolved_by_user_id`, `decision_note` FROM `refunds`;
--> statement-breakpoint
CREATE INDEX `refund_requests_purchase_idx` ON `refund_requests` (`purchase_id`);
--> statement-breakpoint
CREATE TABLE `__new_refunds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`refund_request_id` integer NOT NULL,
	`amount` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`status_changed_at` text,
	`status_changed_by_user_id` integer,
	FOREIGN KEY (`refund_request_id`) REFERENCES `refund_requests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`status_changed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
-- Nothing recorded whether money was sent for an already-approved request, so
-- each one starts as a Pending Refund.
INSERT INTO `__new_refunds` (`refund_request_id`, `amount`, `status`, `created_at`)
SELECT `id`, COALESCE(`amount_refunded`, (SELECT `amount_paid` FROM `purchases` WHERE `purchases`.`id` = `refunds`.`purchase_id`)), 'pending', COALESCE(`resolved_at`, `requested_at`)
FROM `refunds` WHERE `status` = 'approved';
--> statement-breakpoint
DROP TABLE `refunds`;
--> statement-breakpoint
ALTER TABLE `__new_refunds` RENAME TO `refunds`;
--> statement-breakpoint
CREATE UNIQUE INDEX `refunds_refund_request_id_unique` ON `refunds` (`refund_request_id`);
