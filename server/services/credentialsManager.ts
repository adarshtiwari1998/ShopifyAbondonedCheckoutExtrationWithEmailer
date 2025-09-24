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
        console.error('Google credentials file does not exist');
        return false;
      }

      const credentialsContent = fs.readFileSync(this.googleCredentialsPath, 'utf8');
      console.log('Credentials file content length:', credentialsContent.length);
      
      let credentials;
      try {
        credentials = JSON.parse(credentialsContent);
      } catch (parseError) {
        console.error('Failed to parse Google credentials JSON:', parseError);
        return false;
      }

      // Validate required fields
      const requiredFields = ['type', 'project_id', 'private_key', 'client_email'];
      for (const field of requiredFields) {
        if (!credentials[field]) {
          console.error(`Invalid Google credentials: missing ${field}`);
          return false;
        }
      }

      // Validate private key format
      if (!credentials.private_key.includes('-----BEGIN PRIVATE KEY-----') || 
          !credentials.private_key.includes('-----END PRIVATE KEY-----')) {
        console.error('Invalid private key format: missing BEGIN/END markers');
        return false;
      }

      // Check for common private key issues
      const privateKey = credentials.private_key;
      if (privateKey.includes('\\n')) {
        console.error('Private key contains escaped newlines (\\\\n) - needs proper formatting');
        return false;
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
      if (!fs.existsSync(this.googleCredentialsPath)) {
        console.error('Google credentials file does not exist');
        return null;
      }

      const credentialsContent = fs.readFileSync(this.googleCredentialsPath, 'utf8');
      let credentials;
      
      try {
        credentials = JSON.parse(credentialsContent);
      } catch (parseError) {
        console.error('Failed to parse Google credentials JSON:', parseError);
        return null;
      }

      // Validate required fields
      const requiredFields = ['type', 'project_id', 'private_key', 'client_email'];
      for (const field of requiredFields) {
        if (!credentials[field]) {
          console.error(`Invalid Google credentials: missing ${field}`);
          return null;
        }
      }

      // Fix private key format if needed
      if (credentials.private_key.includes('\\n')) {
        console.log('Fixing private key format...');
        credentials.private_key = this.fixPrivateKeyFormat(credentials.private_key);
        
        // Save the fixed credentials back to file
        fs.writeFileSync(this.googleCredentialsPath, JSON.stringify(credentials, null, 2));
        console.log('Private key format fixed and saved');
      }
      
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