import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const extractions = pgTable("extractions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  startDate: text("start_date"),
  endDate: text("end_date"),
  selectedDates: text("selected_dates").array(),
  useCustomDates: boolean("use_custom_dates").default(false),
  sheetId: text("sheet_id").notNull(),
  sheetName: text("sheet_name"),
  recordsFound: integer("records_found").default(0),
  sheetUrl: text("sheet_url"),
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed
  errorMessage: text("error_message"),
  progressMessage: text("progress_message"),
  extractionData: jsonb("extraction_data"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const googleCredentials = pgTable("google_credentials", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  credentialsJson: jsonb("credentials_json").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// User validation tracking tables
export const userValidations = pgTable("user_validations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: text("session_id").notNull(),
  ipAddress: text("ip_address").notNull(),
  userAgent: text("user_agent"),
  cartValue: integer("cart_value"), // in cents
  cartItems: integer("cart_items"),
  validationType: text("validation_type").notNull(), // 'captcha', 'ip_check', 'risk_score'
  validationResult: text("validation_result").notNull(), // 'passed', 'failed', 'pending'
  riskScore: integer("risk_score"), // 0-100
  locationData: jsonb("location_data"), // IP geolocation info
  captchaData: jsonb("captcha_data"), // CAPTCHA response data
  isBot: boolean("is_bot").default(false),
  proceedToCheckout: boolean("proceed_to_checkout").default(false),
  completedOrder: boolean("completed_order").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const ipGeolocations = pgTable("ip_geolocations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ipAddress: text("ip_address").notNull().unique(),
  country: text("country"),
  countryCode: text("country_code"),
  region: text("region"),
  city: text("city"),
  zipCode: text("zip_code"),
  latitude: text("latitude"),
  longitude: text("longitude"),
  timezone: text("timezone"),
  isp: text("isp"),
  isVpn: boolean("is_vpn").default(false),
  isProxy: boolean("is_proxy").default(false),
  isTor: boolean("is_tor").default(false),
  threatLevel: text("threat_level"), // 'low', 'medium', 'high'
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
});

export const validationSettings = pgTable("validation_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  settingKey: text("setting_key").notNull().unique(),
  settingValue: jsonb("setting_value").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertExtractionSchema = createInsertSchema(extractions).omit({
  id: true,
  createdAt: true,
  completedAt: true,
  recordsFound: true,
  status: true,
  errorMessage: true,
  extractionData: true,
}).extend({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  selectedDates: z.array(z.string()).optional(),
  useCustomDates: z.boolean().optional(),
}).refine(
  (data) => {
    if (data.useCustomDates) {
      return data.selectedDates && data.selectedDates.length > 0;
    } else {
      return data.startDate && data.endDate;
    }
  },
  {
    message: "Either provide startDate and endDate for regular range, or selectedDates for custom selection",
  }
);

export const insertCredentialsSchema = createInsertSchema(googleCredentials).omit({
  id: true,
  createdAt: true,
  isActive: true,
});

export const insertUserValidationSchema = createInsertSchema(userValidations).omit({
  id: true,
  createdAt: true,
});

export const insertIpGeolocationSchema = createInsertSchema(ipGeolocations).omit({
  id: true,
  lastUpdated: true,
});

export const insertValidationSettingsSchema = createInsertSchema(validationSettings).omit({
  id: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Extraction = typeof extractions.$inferSelect;
export type InsertExtraction = z.infer<typeof insertExtractionSchema>;
export type GoogleCredentials = typeof googleCredentials.$inferSelect;
export type InsertCredentials = z.infer<typeof insertCredentialsSchema>;
export type UserValidation = typeof userValidations.$inferSelect;
export type InsertUserValidation = z.infer<typeof insertUserValidationSchema>;
export type IpGeolocation = typeof ipGeolocations.$inferSelect;
export type InsertIpGeolocation = z.infer<typeof insertIpGeolocationSchema>;
export type ValidationSettings = typeof validationSettings.$inferSelect;
export type InsertValidationSettings = z.infer<typeof insertValidationSettingsSchema>;
