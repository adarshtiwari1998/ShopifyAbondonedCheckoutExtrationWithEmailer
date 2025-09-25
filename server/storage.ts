import { type User, type InsertUser, type Extraction, type InsertExtraction, type GoogleCredentials, type InsertCredentials, type UserValidation, type InsertUserValidation, type IpGeolocation, type InsertIpGeolocation, type ValidationSettings, type InsertValidationSettings } from "@shared/schema";
import { randomUUID } from "crypto";

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

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private extractions: Map<string, Extraction>;
  private credentials: Map<string, GoogleCredentials>;
  private userValidations: Map<string, UserValidation>;
  private ipGeolocations: Map<string, IpGeolocation>;
  private validationSettings: Map<string, ValidationSettings>;

  constructor() {
    this.users = new Map();
    this.extractions = new Map();
    this.credentials = new Map();
    this.userValidations = new Map();
    this.ipGeolocations = new Map();
    this.validationSettings = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async createExtraction(insertExtraction: InsertExtraction): Promise<Extraction> {
    const id = randomUUID();
    const extraction: Extraction = {
      ...insertExtraction,
      id,
      status: "pending",
      recordsFound: 0,
      createdAt: new Date(),
      completedAt: null,
      errorMessage: null,
      extractionData: null,
      sheetUrl: null,
      sheetName: insertExtraction.sheetName || null,
    };
    this.extractions.set(id, extraction);
    return extraction;
  }

  async getExtraction(id: string): Promise<Extraction | undefined> {
    return this.extractions.get(id);
  }

  async updateExtraction(id: string, updates: Partial<Extraction>): Promise<Extraction> {
    const existing = this.extractions.get(id);
    if (!existing) {
      throw new Error(`Extraction with id ${id} not found`);
    }
    
    const updated: Extraction = { ...existing, ...updates };
    if (updates.status === "completed" || updates.status === "failed") {
      updated.completedAt = new Date();
    }
    
    this.extractions.set(id, updated);
    return updated;
  }

  async getExtractions(limit = 10): Promise<Extraction[]> {
    const allExtractions = Array.from(this.extractions.values());
    return allExtractions
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  async createCredentials(insertCredentials: InsertCredentials): Promise<GoogleCredentials> {
    const id = randomUUID();
    
    // Deactivate all existing credentials
    for (const [, creds] of this.credentials.entries()) {
      creds.isActive = false;
    }
    
    const credentials: GoogleCredentials = {
      ...insertCredentials,
      id,
      isActive: true,
      createdAt: new Date(),
    };
    
    this.credentials.set(id, credentials);
    return credentials;
  }

  async getActiveCredentials(): Promise<GoogleCredentials | undefined> {
    return Array.from(this.credentials.values()).find(creds => creds.isActive);
  }

  async updateCredentialsStatus(id: string, isActive: boolean): Promise<void> {
    const creds = this.credentials.get(id);
    if (creds) {
      creds.isActive = isActive;
    }
  }

  // User validation methods
  async createUserValidation(insertValidation: InsertUserValidation): Promise<UserValidation> {
    const id = randomUUID();
    const validation: UserValidation = {
      ...insertValidation,
      id,
      createdAt: new Date(),
    };
    this.userValidations.set(id, validation);
    return validation;
  }

  async getUserValidation(id: string): Promise<UserValidation | undefined> {
    return this.userValidations.get(id);
  }

  async getUserValidationsBySession(sessionId: string): Promise<UserValidation[]> {
    return Array.from(this.userValidations.values()).filter(
      validation => validation.sessionId === sessionId
    );
  }

  async updateUserValidation(id: string, updates: Partial<UserValidation>): Promise<UserValidation> {
    const existing = this.userValidations.get(id);
    if (!existing) {
      throw new Error(`User validation with id ${id} not found`);
    }
    
    const updated: UserValidation = { ...existing, ...updates };
    this.userValidations.set(id, updated);
    return updated;
  }

  async getValidationsByDateRange(startDate: Date, endDate: Date): Promise<UserValidation[]> {
    return Array.from(this.userValidations.values()).filter(
      validation => validation.createdAt >= startDate && validation.createdAt <= endDate
    );
  }

  async getValidationStats(): Promise<{ total: number; passed: number; failed: number; botCount: number; }> {
    const allValidations = Array.from(this.userValidations.values());
    return {
      total: allValidations.length,
      passed: allValidations.filter(v => v.validationResult === 'passed').length,
      failed: allValidations.filter(v => v.validationResult === 'failed').length,
      botCount: allValidations.filter(v => v.isBot).length,
    };
  }

  // IP Geolocation methods
  async createOrUpdateIpGeolocation(ipData: InsertIpGeolocation): Promise<IpGeolocation> {
    const existing = this.ipGeolocations.get(ipData.ipAddress);
    
    if (existing) {
      const updated: IpGeolocation = {
        ...existing,
        ...ipData,
        lastUpdated: new Date(),
      };
      this.ipGeolocations.set(ipData.ipAddress, updated);
      return updated;
    } else {
      const id = randomUUID();
      const geolocation: IpGeolocation = {
        ...ipData,
        id,
        lastUpdated: new Date(),
      };
      this.ipGeolocations.set(ipData.ipAddress, geolocation);
      return geolocation;
    }
  }

  async getIpGeolocation(ipAddress: string): Promise<IpGeolocation | undefined> {
    return this.ipGeolocations.get(ipAddress);
  }

  // Validation settings methods
  async createOrUpdateValidationSetting(setting: InsertValidationSettings): Promise<ValidationSettings> {
    const existing = this.validationSettings.get(setting.settingKey);
    
    if (existing) {
      const updated: ValidationSettings = {
        ...existing,
        ...setting,
        updatedAt: new Date(),
      };
      this.validationSettings.set(setting.settingKey, updated);
      return updated;
    } else {
      const id = randomUUID();
      const validationSetting: ValidationSettings = {
        ...setting,
        id,
        updatedAt: new Date(),
      };
      this.validationSettings.set(setting.settingKey, validationSetting);
      return validationSetting;
    }
  }

  async getValidationSetting(key: string): Promise<ValidationSettings | undefined> {
    return this.validationSettings.get(key);
  }

  async getAllValidationSettings(): Promise<ValidationSettings[]> {
    return Array.from(this.validationSettings.values());
  }
}

export const storage = new MemStorage();
