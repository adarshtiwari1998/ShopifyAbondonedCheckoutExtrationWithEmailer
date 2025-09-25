import { type User, type InsertUser, type Extraction, type InsertExtraction, type GoogleCredentials, type InsertCredentials, type UserValidation, type InsertUserValidation, type IpGeolocation, type InsertIpGeolocation, type ValidationSettings, type InsertValidationSettings, users, extractions, googleCredentials, userValidations, ipGeolocations, validationSettings } from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db.js";
import { eq, gte, lte, and, desc } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  createExtraction(extraction: InsertExtraction): Promise<Extraction>;
  getExtraction(id: string): Promise<Extraction | undefined>;
  updateExtraction(id: string, updates: Partial<Extraction>): Promise<Extraction>;
  getExtractions(limit?: number): Promise<Extraction[]>;
  
  createCredentials(credentials: InsertCredentials): Promise<GoogleCredentials>;
  getActiveCredentials(): Promise<GoogleCredentials | undefined>;
  updateCredentialsStatus(id: string, isActive: boolean): Promise<void>;
  
  // User validation methods
  createUserValidation(validation: InsertUserValidation): Promise<UserValidation>;
  getUserValidation(id: string): Promise<UserValidation | undefined>;
  getUserValidationsBySession(sessionId: string): Promise<UserValidation[]>;
  updateUserValidation(id: string, updates: Partial<UserValidation>): Promise<UserValidation>;
  getValidationsByDateRange(startDate: Date, endDate: Date): Promise<UserValidation[]>;
  getValidationStats(): Promise<{ total: number; passed: number; failed: number; botCount: number; }>;
  
  // IP Geolocation methods
  createOrUpdateIpGeolocation(ipData: InsertIpGeolocation): Promise<IpGeolocation>;
  getIpGeolocation(ipAddress: string): Promise<IpGeolocation | undefined>;
  
  // Validation settings methods
  createOrUpdateValidationSetting(setting: InsertValidationSettings): Promise<ValidationSettings>;
  getValidationSetting(key: string): Promise<ValidationSettings | undefined>;
  getAllValidationSettings(): Promise<ValidationSettings[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async createExtraction(insertExtraction: InsertExtraction): Promise<Extraction> {
    const [extraction] = await db.insert(extractions).values({
      ...insertExtraction,
      status: "pending",
      recordsFound: 0,
    }).returning();
    return extraction;
  }

  async getExtraction(id: string): Promise<Extraction | undefined> {
    const [extraction] = await db.select().from(extractions).where(eq(extractions.id, id));
    return extraction || undefined;
  }

  async updateExtraction(id: string, updates: Partial<Extraction>): Promise<Extraction> {
    const updateData = { ...updates };
    if (updates.status === "completed" || updates.status === "failed") {
      updateData.completedAt = new Date();
    }
    
    const [extraction] = await db
      .update(extractions)
      .set(updateData)
      .where(eq(extractions.id, id))
      .returning();
      
    if (!extraction) {
      throw new Error(`Extraction with id ${id} not found`);
    }
    
    return extraction;
  }

  async getExtractions(limit = 10): Promise<Extraction[]> {
    return await db
      .select()
      .from(extractions)
      .orderBy(desc(extractions.createdAt))
      .limit(limit);
  }

  async createCredentials(insertCredentials: InsertCredentials): Promise<GoogleCredentials> {
    // Deactivate all existing credentials
    await db.update(googleCredentials).set({ isActive: false });
    
    const [credentials] = await db
      .insert(googleCredentials)
      .values({ ...insertCredentials, isActive: true })
      .returning();
    
    return credentials;
  }

  async getActiveCredentials(): Promise<GoogleCredentials | undefined> {
    const [credentials] = await db
      .select()
      .from(googleCredentials)
      .where(eq(googleCredentials.isActive, true));
    
    return credentials || undefined;
  }

  async updateCredentialsStatus(id: string, isActive: boolean): Promise<void> {
    await db
      .update(googleCredentials)
      .set({ isActive })
      .where(eq(googleCredentials.id, id));
  }

  // User validation methods
  async createUserValidation(insertValidation: InsertUserValidation): Promise<UserValidation> {
    const [validation] = await db
      .insert(userValidations)
      .values(insertValidation)
      .returning();
    
    return validation;
  }

  async getUserValidation(id: string): Promise<UserValidation | undefined> {
    const [validation] = await db
      .select()
      .from(userValidations)
      .where(eq(userValidations.id, id));
    
    return validation || undefined;
  }

  async getUserValidationsBySession(sessionId: string): Promise<UserValidation[]> {
    return await db
      .select()
      .from(userValidations)
      .where(eq(userValidations.sessionId, sessionId))
      .orderBy(desc(userValidations.createdAt));
  }

  async updateUserValidation(id: string, updates: Partial<UserValidation>): Promise<UserValidation> {
    const [validation] = await db
      .update(userValidations)
      .set(updates)
      .where(eq(userValidations.id, id))
      .returning();
      
    if (!validation) {
      throw new Error(`User validation with id ${id} not found`);
    }
    
    return validation;
  }

  async getValidationsByDateRange(startDate: Date, endDate: Date): Promise<UserValidation[]> {
    return await db
      .select()
      .from(userValidations)
      .where(
        and(
          gte(userValidations.createdAt, startDate),
          lte(userValidations.createdAt, endDate)
        )
      )
      .orderBy(desc(userValidations.createdAt));
  }

  async getValidationStats(): Promise<{ total: number; passed: number; failed: number; botCount: number; }> {
    const allValidations = await db.select().from(userValidations);
    
    return {
      total: allValidations.length,
      passed: allValidations.filter(v => v.validationResult === 'passed').length,
      failed: allValidations.filter(v => v.validationResult === 'failed').length,
      botCount: allValidations.filter(v => v.isBot).length,
    };
  }

  // IP Geolocation methods
  async createOrUpdateIpGeolocation(ipData: InsertIpGeolocation): Promise<IpGeolocation> {
    const [existing] = await db
      .select()
      .from(ipGeolocations)
      .where(eq(ipGeolocations.ipAddress, ipData.ipAddress));
    
    if (existing) {
      const [updated] = await db
        .update(ipGeolocations)
        .set({ ...ipData, lastUpdated: new Date() })
        .where(eq(ipGeolocations.ipAddress, ipData.ipAddress))
        .returning();
      
      return updated;
    } else {
      const [geolocation] = await db
        .insert(ipGeolocations)
        .values(ipData)
        .returning();
      
      return geolocation;
    }
  }

  async getIpGeolocation(ipAddress: string): Promise<IpGeolocation | undefined> {
    const [geolocation] = await db
      .select()
      .from(ipGeolocations)
      .where(eq(ipGeolocations.ipAddress, ipAddress));
    
    return geolocation || undefined;
  }

  // Validation settings methods
  async createOrUpdateValidationSetting(setting: InsertValidationSettings): Promise<ValidationSettings> {
    const [existing] = await db
      .select()
      .from(validationSettings)
      .where(eq(validationSettings.settingKey, setting.settingKey));
    
    if (existing) {
      const [updated] = await db
        .update(validationSettings)
        .set({ ...setting, updatedAt: new Date() })
        .where(eq(validationSettings.settingKey, setting.settingKey))
        .returning();
      
      return updated;
    } else {
      const [validationSetting] = await db
        .insert(validationSettings)
        .values(setting)
        .returning();
      
      return validationSetting;
    }
  }

  async getValidationSetting(key: string): Promise<ValidationSettings | undefined> {
    const [setting] = await db
      .select()
      .from(validationSettings)
      .where(eq(validationSettings.settingKey, key));
    
    return setting || undefined;
  }

  async getAllValidationSettings(): Promise<ValidationSettings[]> {
    return await db.select().from(validationSettings);
  }
}

export const storage = new DatabaseStorage();
