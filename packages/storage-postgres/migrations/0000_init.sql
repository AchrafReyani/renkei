CREATE TABLE "renkei_identity" (
	"sub" text PRIMARY KEY NOT NULL,
	"email" text,
	"email_verified" boolean,
	"display_name" text,
	"picture_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "renkei_line_account" (
	"identity_sub" text NOT NULL,
	"channel_id" text NOT NULL,
	"line_user_id" text NOT NULL,
	"kind" text NOT NULL,
	"friend" boolean,
	"friend_checked_at" timestamp with time zone,
	"raw_profile" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "renkei_line_account_channel_id_line_user_id_pk" PRIMARY KEY("channel_id","line_user_id")
);
--> statement-breakpoint
CREATE TABLE "renkei_payload" (
	"model" text NOT NULL,
	"id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"uid" text,
	"user_code" text,
	"grant_id" text,
	"expires_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "renkei_payload_model_id_pk" PRIMARY KEY("model","id")
);
--> statement-breakpoint
ALTER TABLE "renkei_line_account" ADD CONSTRAINT "renkei_line_account_identity_sub_renkei_identity_sub_fk" FOREIGN KEY ("identity_sub") REFERENCES "public"."renkei_identity"("sub") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "renkei_line_account_identity_idx" ON "renkei_line_account" USING btree ("identity_sub");--> statement-breakpoint
CREATE INDEX "renkei_payload_uid_idx" ON "renkei_payload" USING btree ("model","uid");--> statement-breakpoint
CREATE INDEX "renkei_payload_user_code_idx" ON "renkei_payload" USING btree ("model","user_code");--> statement-breakpoint
CREATE INDEX "renkei_payload_grant_idx" ON "renkei_payload" USING btree ("model","grant_id");--> statement-breakpoint
CREATE INDEX "renkei_payload_expires_idx" ON "renkei_payload" USING btree ("expires_at");