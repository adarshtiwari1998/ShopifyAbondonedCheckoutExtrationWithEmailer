import fs from 'fs';
import path from 'path';

interface GoogleCredentialsJson {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

interface CredentialsStatus {
  hasGoogleCredentials: boolean;
  hasShopifyToken: boolean;
  allCredentialsReady: boolean;
}

export class CredentialsManager {
  private static instance: CredentialsManager;
  private googleCredentialsPath = path.join(process.cwd(), 'server/config/google-service-account.json');

  static getInstance(): CredentialsManager {
    if (!CredentialsManager.instance) {
      CredentialsManager.instance = new CredentialsManager();
    }
    return CredentialsManager.instance;
  }

  validateShopifyToken(): boolean {
    const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
    return !!(token && token.trim().length > 0);
  }

  validateGoogleCredentials(): boolean {
    try {
      if (!fs.existsSync(this.googleCredentialsPath)) {
        return false;
      }

      const credentialsContent = fs.readFileSync(this.googleCredentialsPath, 'utf8');
      const credentials = JSON.parse(credentialsContent);

      // Validate required fields
      const requiredFields = ['type', 'project_id', 'private_key', 'client_email'];
      for (const field of requiredFields) {
        if (!credentials[field]) {
          console.error(`Invalid Google credentials: missing ${field}`);
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('Error validating Google credentials:', error);
      return false;
    }
  }

  getGoogleCredentials(): GoogleCredentialsJson | null {
    try {
      if (!this.validateGoogleCredentials()) {
        return null;
      }

      const credentialsContent = fs.readFileSync(this.googleCredentialsPath, 'utf8');
      return JSON.parse(credentialsContent);
    } catch (error) {
      console.error('Error loading Google credentials:', error);
      return null;
    }
  }

  getCredentialsStatus(): CredentialsStatus {
    const hasGoogleCredentials = this.validateGoogleCredentials();
    const hasShopifyToken = this.validateShopifyToken();
    
    return {
      hasGoogleCredentials,
      hasShopifyToken,
      allCredentialsReady: hasGoogleCredentials && hasShopifyToken
    };
  }

  validateAllCredentials(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.validateShopifyToken()) {
      errors.push('SHOPIFY_ADMIN_ACCESS_TOKEN environment variable is missing or empty');
    }

    if (!this.validateGoogleCredentials()) {
      errors.push(`Google service account credentials file not found or invalid at: ${this.googleCredentialsPath}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  getGoogleCredentialsPath(): string {
    return this.googleCredentialsPath;
  }
}