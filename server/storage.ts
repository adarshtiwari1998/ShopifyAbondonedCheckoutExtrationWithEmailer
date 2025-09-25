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

export class MemStorage implements IStorage {
  private users: Map<string, User> = new Map();
  private extractions: Map<string, Extraction> = new Map();
  private credentials: Map<string, GoogleCredentials> = new Map();
  private validations: Map<string, UserValidation> = new Map();
  private geolocations: Map<string, IpGeolocation> = new Map();
  private settings: Map<string, ValidationSettings> = new Map();

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    for (const user of this.users.values()) {
      if (user.username === username) return user;
    }
    return undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const user: User = {
      id: randomUUID(),
      ...insertUser,
    };
    this.users.set(user.id, user);
    return user;
  }

  async createExtraction(insertExtraction: InsertExtraction): Promise<Extraction> {
    const extraction: Extraction = {
      id: randomUUID(),
      ...insertExtraction,
      status: "pending",
      recordsFound: 0,
      createdAt: new Date(),
      completedAt: null,
      errorMessage: null,
      progressMessage: null,
      extractionData: null,
    };
    this.extractions.set(extraction.id, extraction);
    return extraction;
  }

  async getExtraction(id: string): Promise<Extraction | undefined> {
    return this.extractions.get(id);
  }

  async updateExtraction(id: string, updates: Partial<Extraction>): Promise<Extraction> {
    const extraction = this.extractions.get(id);
    if (!extraction) {
      throw new Error(`Extraction with id ${id} not found`);
    }
    
    const updateData = { ...updates };
    if (updates.status === "completed" || updates.status === "failed") {
      updateData.completedAt = new Date();
    }
    
    const updated = { ...extraction, ...updateData };
    this.extractions.set(id, updated);
    return updated;
  }

  async getExtractions(limit = 10): Promise<Extraction[]> {
    const all = Array.from(this.extractions.values());
    return all
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  async createCredentials(insertCredentials: InsertCredentials): Promise<GoogleCredentials> {
    // Deactivate all existing credentials
    for (const cred of this.credentials.values()) {
      cred.isActive = false;
    }
    
    const credentials: GoogleCredentials = {
      id: randomUUID(),
      ...insertCredentials,
      isActive: true,
      createdAt: new Date(),
    };
    this.credentials.set(credentials.id, credentials);
    return credentials;
  }

  async getActiveCredentials(): Promise<GoogleCredentials | undefined> {
    for (const cred of this.credentials.values()) {
      if (cred.isActive) return cred;
    }
    return undefined;
  }

  async updateCredentialsStatus(id: string, isActive: boolean): Promise<void> {
    const cred = this.credentials.get(id);
    if (cred) {
      cred.isActive = isActive;
    }
  }

  async createUserValidation(insertValidation: InsertUserValidation): Promise<UserValidation> {
    const validation: UserValidation = {
      id: randomUUID(),
      ...insertValidation,
      createdAt: new Date(),
    };
    this.validations.set(validation.id, validation);
    return validation;
  }

  async getUserValidation(id: string): Promise<UserValidation | undefined> {
    return this.validations.get(id);
  }

  async getUserValidationsBySession(sessionId: string): Promise<UserValidation[]> {
    return Array.from(this.validations.values())
      .filter(v => v.sessionId === sessionId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async updateUserValidation(id: string, updates: Partial<UserValidation>): Promise<UserValidation> {
    const validation = this.validations.get(id);
    if (!validation) {
      throw new Error(`User validation with id ${id} not found`);
    }
    
    const updated = { ...validation, ...updates };
    this.validations.set(id, updated);
    return updated;
  }

  async getValidationsByDateRange(startDate: Date, endDate: Date): Promise<UserValidation[]> {
    return Array.from(this.validations.values())
      .filter(v => {
        const created = new Date(v.createdAt);
        return created >= startDate && created <= endDate;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getValidationStats(): Promise<{ total: number; passed: number; failed: number; botCount: number; }> {
    const all = Array.from(this.validations.values());
    return {
      total: all.length,
      passed: all.filter(v => v.validationResult === 'passed').length,
      failed: all.filter(v => v.validationResult === 'failed').length,
      botCount: all.filter(v => v.isBot).length,
    };
  }

  async createOrUpdateIpGeolocation(ipData: InsertIpGeolocation): Promise<IpGeolocation> {
    const existing = this.geolocations.get(ipData.ipAddress);
    
    if (existing) {
      const updated = { ...existing, ...ipData, lastUpdated: new Date() };
      this.geolocations.set(ipData.ipAddress, updated);
      return updated;
    } else {
      const geolocation: IpGeolocation = {
        id: randomUUID(),
        ...ipData,
        lastUpdated: new Date(),
      };
      this.geolocations.set(ipData.ipAddress, geolocation);
      return geolocation;
    }
  }

  async getIpGeolocation(ipAddress: string): Promise<IpGeolocation | undefined> {
    return this.geolocations.get(ipAddress);
  }

  async createOrUpdateValidationSetting(setting: InsertValidationSettings): Promise<ValidationSettings> {
    const existing = this.settings.get(setting.settingKey);
    
    if (existing) {
      const updated = { ...existing, ...setting, updatedAt: new Date() };
      this.settings.set(setting.settingKey, updated);
      return updated;
    } else {
      const validationSetting: ValidationSettings = {
        id: randomUUID(),
        ...setting,
        updatedAt: new Date(),
      };
      this.settings.set(setting.settingKey, validationSetting);
      return validationSetting;
    }
  }

  async getValidationSetting(key: string): Promise<ValidationSettings | undefined> {
    for (const setting of this.settings.values()) {
      if (setting.settingKey === key) return setting;
    }
    return undefined;
  }

  async getAllValidationSettings(): Promise<ValidationSettings[]> {
    return Array.from(this.settings.values());
  }
}

// Create a storage wrapper that fallbacks to MemStorage if database fails
class StorageWrapper implements IStorage {
  private actualStorage: IStorage | null = null;
  private isInitialized = false;

  private async initializeStorage(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      // Test the database connection by attempting a simple query
      await db.select().from(users).limit(1);
      this.actualStorage = new DatabaseStorage();
      console.log('Using DatabaseStorage');
    } catch (error) {
      console.log('Database connection failed, falling back to MemStorage:', error.message);
      this.actualStorage = new MemStorage();
    }
    
    this.isInitialized = true;
  }

  private async getStorage(): Promise<IStorage> {
    await this.initializeStorage();
    return this.actualStorage!;
  }

  async getUser(id: string): Promise<User | undefined> {
    const storage = await this.getStorage();
    return storage.getUser(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const storage = await this.getStorage();
    return storage.getUserByUsername(username);
  }

  async createUser(user: InsertUser): Promise<User> {
    const storage = await this.getStorage();
    return storage.createUser(user);
  }

  async createExtraction(extraction: InsertExtraction): Promise<Extraction> {
    const storage = await this.getStorage();
    return storage.createExtraction(extraction);
  }

  async getExtraction(id: string): Promise<Extraction | undefined> {
    const storage = await this.getStorage();
    return storage.getExtraction(id);
  }

  async updateExtraction(id: string, updates: Partial<Extraction>): Promise<Extraction> {
    const storage = await this.getStorage();
    return storage.updateExtraction(id, updates);
  }

  async getExtractions(limit?: number): Promise<Extraction[]> {
    const storage = await this.getStorage();
    return storage.getExtractions(limit);
  }

  async createCredentials(credentials: InsertCredentials): Promise<GoogleCredentials> {
    const storage = await this.getStorage();
    return storage.createCredentials(credentials);
  }

  async getActiveCredentials(): Promise<GoogleCredentials | undefined> {
    const storage = await this.getStorage();
    return storage.getActiveCredentials();
  }

  async updateCredentialsStatus(id: string, isActive: boolean): Promise<void> {
    const storage = await this.getStorage();
    return storage.updateCredentialsStatus(id, isActive);
  }

  async createUserValidation(validation: InsertUserValidation): Promise<UserValidation> {
    const storage = await this.getStorage();
    return storage.createUserValidation(validation);
  }

  async getUserValidation(id: string): Promise<UserValidation | undefined> {
    const storage = await this.getStorage();
    return storage.getUserValidation(id);
  }

  async getUserValidationsBySession(sessionId: string): Promise<UserValidation[]> {
    const storage = await this.getStorage();
    return storage.getUserValidationsBySession(sessionId);
  }

  async updateUserValidation(id: string, updates: Partial<UserValidation>): Promise<UserValidation> {
    const storage = await this.getStorage();
    return storage.updateUserValidation(id, updates);
  }

  async getValidationsByDateRange(startDate: Date, endDate: Date): Promise<UserValidation[]> {
    const storage = await this.getStorage();
    return storage.getValidationsByDateRange(startDate, endDate);
  }

  async getValidationStats(): Promise<{ total: number; passed: number; failed: number; botCount: number; }> {
    const storage = await this.getStorage();
    return storage.getValidationStats();
  }

  async createOrUpdateIpGeolocation(ipData: InsertIpGeolocation): Promise<IpGeolocation> {
    const storage = await this.getStorage();
    return storage.createOrUpdateIpGeolocation(ipData);
  }

  async getIpGeolocation(ipAddress: string): Promise<IpGeolocation | undefined> {
    const storage = await this.getStorage();
    return storage.getIpGeolocation(ipAddress);
  }

  async createOrUpdateValidationSetting(setting: InsertValidationSettings): Promise<ValidationSettings> {
    const storage = await this.getStorage();
    return storage.createOrUpdateValidationSetting(setting);
  }

  async getValidationSetting(key: string): Promise<ValidationSettings | undefined> {
    const storage = await this.getStorage();
    return storage.getValidationSetting(key);
  }

  async getAllValidationSettings(): Promise<ValidationSettings[]> {
    const storage = await this.getStorage();
    return storage.getAllValidationSettings();
  }
}

export const storage = new StorageWrapper();
