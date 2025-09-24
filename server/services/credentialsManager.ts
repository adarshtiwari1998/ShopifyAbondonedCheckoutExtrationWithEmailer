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
      // First try to get credentials from environment variable
      const envCredentials = process.env.GOOGLE_SERVICE_ACCOUNT;
      
      let credentialsContent: string;
      let source: string;

      if (envCredentials) {
        credentialsContent = envCredentials;
        source = 'environment variable';
        console.log('Using Google credentials from environment variable');
      } else if (fs.existsSync(this.googleCredentialsPath)) {
        credentialsContent = fs.readFileSync(this.googleCredentialsPath, 'utf8');
        source = 'file';
        console.log('Using Google credentials from file (fallback)');
      } else {
        console.error('Google credentials not found in environment variable GOOGLE_SERVICE_ACCOUNT or file');
        return false;
      }

      console.log(`Credentials ${source} content length:`, credentialsContent.length);
      
      // Just check if it's valid JSON and has basic required fields
      let credentials;
      try {
        credentials = JSON.parse(credentialsContent);
      } catch (parseError) {
        console.error(`Failed to parse Google credentials JSON from ${source}:`, parseError);
        return false;
      }

      // Only check if basic required fields exist (no validation of content)
      const requiredFields = ['type', 'project_id', 'private_key', 'client_email'];
      for (const field of requiredFields) {
        if (!credentials[field]) {
          console.error(`Invalid Google credentials: missing ${field}`);
          return false;
        }
      }

      console.log('Google credentials validation passed');
      return true;
    } catch (error) {
      console.error('Error validating Google credentials:', error);
      return false;
    }
  }

  fixPrivateKeyFormat(privateKey: string): string {
    // Replace escaped newlines with actual newlines
    let fixedKey = privateKey.replace(/\\n/g, '\n');
    
    // Ensure proper formatting around the key markers
    if (!fixedKey.startsWith('-----BEGIN PRIVATE KEY-----\n')) {
      fixedKey = fixedKey.replace('-----BEGIN PRIVATE KEY-----', '-----BEGIN PRIVATE KEY-----\n');
    }
    if (!fixedKey.endsWith('\n-----END PRIVATE KEY-----')) {
      fixedKey = fixedKey.replace('-----END PRIVATE KEY-----', '\n-----END PRIVATE KEY-----');
    }
    
    return fixedKey;
  }

  getGoogleCredentials(): GoogleCredentialsJson | null {
    try {
      // First try to get credentials from environment variable
      const envCredentials = process.env.GOOGLE_SERVICE_ACCOUNT;
      
      let credentialsContent: string;
      let source: string;

      if (envCredentials) {
        credentialsContent = envCredentials;
        source = 'environment variable';
        console.log('Loading Google credentials from environment variable');
      } else if (fs.existsSync(this.googleCredentialsPath)) {
        credentialsContent = fs.readFileSync(this.googleCredentialsPath, 'utf8');
        source = 'file';
        console.log('Loading Google credentials from file (fallback)');
      } else {
        console.error('Google credentials not found in environment variable GOOGLE_SERVICE_ACCOUNT or file');
        return null;
      }

      let credentials;
      
      try {
        credentials = JSON.parse(credentialsContent);
      } catch (parseError) {
        console.error(`Failed to parse Google credentials JSON from ${source}:`, parseError);
        return null;
      }

      // Only validate required fields exist (no content validation)
      const requiredFields = ['type', 'project_id', 'private_key', 'client_email'];
      for (const field of requiredFields) {
        if (!credentials[field]) {
          console.error(`Invalid Google credentials: missing ${field}`);
          return null;
        }
      }

      // Return credentials as-is, no normalization
      return credentials;
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
      errors.push(`Google service account credentials not found or invalid. Please set GOOGLE_SERVICE_ACCOUNT environment variable or place credentials file at: ${this.googleCredentialsPath}`);
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