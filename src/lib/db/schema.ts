import {
  pgTable,
  uuid,
  text,
  numeric,
  timestamp,
  integer,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    // USD balance, 8 decimal places so per-token deductions never round to zero
    balance: numeric("balance", { precision: 16, scale: 8 })
      .notNull()
      .default("0"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)]
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    keyHash: text("key_hash").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    name: text("name").notNull().default("default"),
    status: text("status", { enum: ["active", "revoked"] })
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("api_keys_hash_idx").on(t.keyHash),
    index("api_keys_user_idx").on(t.userId),
  ]
);

export const models = pgTable(
  "models",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // public slug exposed to customers, e.g. "deepseek-v3.2"
    slug: text("slug").notNull(),
    // upstream id on Vercel AI Gateway, e.g. "deepseek/deepseek-v3.2"
    upstreamId: text("upstream_id").notNull(),
    displayName: text("display_name").notNull(),
    // retail price in USD per 1M tokens
    inputPricePerM: numeric("input_price_per_m", {
      precision: 10,
      scale: 4,
    }).notNull(),
    outputPricePerM: numeric("output_price_per_m", {
      precision: 10,
      scale: 4,
    }).notNull(),
    contextLength: integer("context_length").notNull().default(128000),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("models_slug_idx").on(t.slug)]
);

export const usageLogs = pgTable(
  "usage_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    apiKeyId: uuid("api_key_id").references(() => apiKeys.id, {
      onDelete: "set null",
    }),
    modelSlug: text("model_slug").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    // USD charged for this call
    cost: numeric("cost", { precision: 16, scale: 8 }).notNull(),
    stream: boolean("stream").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("usage_logs_user_idx").on(t.userId),
    index("usage_logs_created_idx").on(t.createdAt),
  ]
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Null for guest purchases of digital downloads. Bound to an account later
    // by claimGuestOrders() when someone registers with the same email.
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    // Buyer email. Nullable only because rows predating guest checkout have
    // none; every new order writes it.
    email: text("email"),
    provider: text("provider", { enum: ["creem", "xunhupay"] })
      .notNull()
      .default("creem"),
    providerOrderId: text("provider_order_id"),
    checkoutId: text("checkout_id"),
    kind: text("kind", { enum: ["credits", "download"] })
      .notNull()
      .default("credits"),
    // Product identifier from src/lib/products.ts, e.g. "credits_5"
    sku: text("sku"),
    // USD paid by the customer - the single basis for accounting
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    // USD credited to balance (zero for downloads)
    credits: numeric("credits", { precision: 12, scale: 2 }).notNull(),
    // What was actually charged, which differs from `amount` on the domestic
    // rail where Alipay and WeChat Pay are CNY-native.
    payCurrency: text("pay_currency").notNull().default("USD"),
    payAmount: numeric("pay_amount", { precision: 12, scale: 2 }),
    status: text("status", {
      enum: ["pending", "paid", "failed", "refunded"],
    })
      .notNull()
      .default("pending"),
    // Bearer credential letting a guest re-access a purchased download.
    redeemCode: text("redeem_code"),
    downloadCount: integer("download_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => [
    index("orders_user_idx").on(t.userId),
    index("orders_email_idx").on(t.email),
    uniqueIndex("orders_checkout_idx").on(t.checkoutId),
    uniqueIndex("orders_redeem_idx").on(t.redeemCode),
  ]
);

// idempotent webhook processing
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull().default("creem"),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: text("payload").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("webhook_events_event_idx").on(t.provider, t.eventId)]
);
