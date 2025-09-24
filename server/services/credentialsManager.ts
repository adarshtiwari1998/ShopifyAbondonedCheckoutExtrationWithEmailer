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
    // Handle different private key formats that might come from environment variables
    let fixedKey = privateKey;
    
    console.log('Original private key length:', privateKey.length);
    console.log('Private key starts with:', privateKey.substring(0, 50));
    
    // Replace escaped newlines with actual newlines
    if (fixedKey.includes('\\n')) {
      fixedKey = fixedKey.replace(/\\n/g, '\n');
      console.log('Replaced escaped newlines');
    }
    
    // If the key is already properly formatted, return it as-is
    if (fixedKey.includes('\n') && fixedKey.includes('-----BEGIN PRIVATE KEY-----') && fixedKey.includes('-----END PRIVATE KEY-----')) {
      console.log('Private key already properly formatted');
      return fixedKey;
    }
    
    // Remove any existing newlines and start fresh
    fixedKey = fixedKey.replace(/\n/g, '');
    
    // Remove the BEGIN and END markers temporarily to extract the actual key content
    const beginMarker = '-----BEGIN PRIVATE KEY-----';
    const endMarker = '-----END PRIVATE KEY-----';
    
    let keyContent = fixedKey;
    if (fixedKey.includes(beginMarker)) {
      keyContent = keyContent.replace(beginMarker, '');
    }
    if (fixedKey.includes(endMarker)) {
      keyContent = keyContent.replace(endMarker, '');
    }
    
    // Clean up any remaining spaces or special characters
    keyContent = keyContent.trim();
    console.log('Cleaned key content length:', keyContent.length);
    
    // Reconstruct the private key with proper formatting
    const lines = [];
    lines.push(beginMarker);
    
    // Split the key content into 64-character lines
    for (let i = 0; i < keyContent.length; i += 64) {
      lines.push(keyContent.substring(i, i + 64));
    }
    
    lines.push(endMarker);
    
    const result = lines.join('\n');
    console.log('Fixed private key length:', result.length);
    return result;
  }

  getGoogleCredentials(): GoogleCredentialsJson | null {
    try {
      let credentialsContent: string;
      let source: string;

      // First try to load from file (this avoids formatting issues)
      if (fs.existsSync(this.googleCredentialsPath)) {
        credentialsContent = fs.readFileSync(this.googleCredentialsPath, 'utf8');
        source = 'file';
        console.log('Loading Google credentials from file');
        
        // Check if it's just the template file
        if (credentialsContent.includes('your-project-id') || credentialsContent.includes('YOUR_PRIVATE_KEY_HERE')) {
          console.log('File contains template values, trying environment variable');
          const envCredentials = process.env.GOOGLE_SERVICE_ACCOUNT;
          if (envCredentials) {
            credentialsContent = envCredentials;
            source = 'environment variable';
            console.log('Using environment variable credentials instead');
          } else {
            console.error('Both file and environment variable contain placeholder/empty credentials');
            return null;
          }
        }
      } else {
        // Fallback to environment variable
        const envCredentials = process.env.GOOGLE_SERVICE_ACCOUNT;
        if (envCredentials) {
          credentialsContent = envCredentials;
          source = 'environment variable';
          console.log('Loading Google credentials from environment variable (file not found)');
        } else {
          console.error('Google credentials not found in file or environment variable GOOGLE_SERVICE_ACCOUNT');
          return null;
        }
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

      // Only fix private key format if using environment variables (files should be properly formatted)
      if (source === 'environment variable' && credentials.private_key) {
        try {
          credentials.private_key = this.fixPrivateKeyFormat(credentials.private_key);
          console.log('Private key format fixed for environment variable');
        } catch (keyError) {
          console.error('Error fixing private key format:', keyError);
          // Continue with original key if fixing fails
        }
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