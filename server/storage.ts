import { type User, type InsertUser, type Extraction, type InsertExtraction, type GoogleCredentials, type InsertCredentials } from "@shared/schema";
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
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private extractions: Map<string, Extraction>;
  private credentials: Map<string, GoogleCredentials>;

  constructor() {
    this.users = new Map();
    this.extractions = new Map();
    this.credentials = new Map();
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
}

export const storage = new MemStorage();
