import { boolean, index, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * All tables are prefixed `renkei_` so renkei can share a database with the
 * application (or with Supabase's own schema) without collisions.
 */

export const identity = pgTable('renkei_identity', {
  sub: text('sub').primaryKey(),
  email: text('email'),
  emailVerified: boolean('email_verified'),
  displayName: text('display_name'),
  pictureUrl: text('picture_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lineAccount = pgTable(
  'renkei_line_account',
  {
    identitySub: text('identity_sub')
      .notNull()
      .references(() => identity.sub, { onDelete: 'cascade' }),
    channelId: text('channel_id').notNull(),
    lineUserId: text('line_user_id').notNull(),
    kind: text('kind').notNull(),
    friend: boolean('friend'),
    friendCheckedAt: timestamp('friend_checked_at', { withTimezone: true }),
    rawProfile: jsonb('raw_profile'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.channelId, t.lineUserId] }),
    index('renkei_line_account_identity_idx').on(t.identitySub),
  ],
);

/** Expiring payloads for oidc-provider models and renkei's own short-lived state. */
export const payload = pgTable(
  'renkei_payload',
  {
    model: text('model').notNull(),
    id: text('id').notNull(),
    payload: jsonb('payload').notNull(),
    uid: text('uid'),
    userCode: text('user_code'),
    grantId: text('grant_id'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.model, t.id] }),
    index('renkei_payload_uid_idx').on(t.model, t.uid),
    index('renkei_payload_user_code_idx').on(t.model, t.userCode),
    index('renkei_payload_grant_idx').on(t.model, t.grantId),
    index('renkei_payload_expires_idx').on(t.expiresAt),
  ],
);
