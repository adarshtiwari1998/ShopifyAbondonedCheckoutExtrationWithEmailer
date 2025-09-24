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

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Extraction = typeof extractions.$inferSelect;
export type InsertExtraction = z.infer<typeof insertExtractionSchema>;
export type GoogleCredentials = typeof googleCredentials.$inferSelect;
export type InsertCredentials = z.infer<typeof insertCredentialsSchema>;
