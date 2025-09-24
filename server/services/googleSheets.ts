import { GoogleAuth } from 'google-auth-library';
import { sheets_v4, google } from 'googleapis';
import { type ShopifyCheckout } from './shopify.js';

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

export class GoogleSheetsService {
  private auth: GoogleAuth;
  private sheets: sheets_v4.Sheets;

  constructor(credentials: GoogleCredentialsJson) {
    try {
      // Ensure private key has proper newline formatting
      const fixedCredentials = {
        ...credentials,
        private_key: this.fixPrivateKey(credentials.private_key)
      };

      console.log('Initializing GoogleAuth with fixed credentials');
      
      this.auth = new GoogleAuth({
        credentials: fixedCredentials,
        scopes: [
          'https://www.googleapis.com/auth/spreadsheets',
          'https://www.googleapis.com/auth/drive.file'
        ],
      });

      this.sheets = google.sheets({ version: 'v4', auth: this.auth });
      console.log('GoogleSheetsService initialized successfully');
    } catch (error) {
      console.error('Error initializing GoogleSheetsService:', error);
      throw error;
    }
  }

  private fixPrivateKey(privateKey: string): string {
    let key = privateKey;
    
    // Replace escaped newlines with real newlines
    if (key.includes('\\n')) {
      key = key.replace(/\\n/g, '\n');
    }
    
    // If it already has proper newlines and markers, return as-is
    if (key.includes('\n') && key.startsWith('-----BEGIN') && key.endsWith('-----')) {
      return key;
    }
    
    // Otherwise, ensure proper formatting
    const beginMarker = '-----BEGIN PRIVATE KEY-----';
    const endMarker = '-----END PRIVATE KEY-----';
    
    // Extract just the key content
    let keyContent = key;
    if (keyContent.includes(beginMarker)) {
      keyContent = keyContent.replace(beginMarker, '');
    }
    if (keyContent.includes(endMarker)) {
      keyContent = keyContent.replace(endMarker, '');
    }
    
    // Remove all whitespace and newlines
    keyContent = keyContent.replace(/[\s\n\r]/g, '');
    
    // Rebuild with proper formatting
    const lines = [beginMarker];
    for (let i = 0; i < keyContent.length; i += 64) {
      lines.push(keyContent.substring(i, i + 64));
    }
    lines.push(endMarker);
    
    return lines.join('\n');
  }

  async createSpreadsheet(title: string): Promise<{ spreadsheetId: string; url: string }> {
    try {
      const response = await this.sheets.spreadsheets.create({
        requestBody: {
          properties: {
            title,
          },
        },
      });

      const spreadsheetId = response.data.spreadsheetId!;
      const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

      return { spreadsheetId, url };
    } catch (error) {
      throw new Error(`Failed to create spreadsheet: ${error}`);
    }
  }

  private formatCheckoutData(checkouts: ShopifyCheckout[]): string[][] {
    const headers = [
      'Checkout ID',
      'Date',
      'Customer Email',
      'Customer Name',
      'Total Price',
      'Currency',
      'Items Count',
      'Line Items',
      'Shipping Address',
      'Billing Address',
      'Shipping Lines',
      'Tax Lines',
      'Checkout URL'
    ];

    const rows = checkouts.map(checkout => [
      checkout.id,
      new Date(checkout.updated_at).toLocaleDateString(),
      checkout.email || checkout.customer?.email || '',
      checkout.customer ? `${checkout.customer.first_name} ${checkout.customer.last_name}` : '',
      checkout.total_price,
      'USD', // Assuming USD, could be extracted from API
      checkout.line_items?.length.toString() || '0',
      checkout.line_items?.map(item => `${item.title} (${item.quantity}x ${item.price})`).join('; ') || '',
      checkout.shipping_address ? `${checkout.shipping_address.address1}, ${checkout.shipping_address.city}, ${checkout.shipping_address.country}` : '',
      checkout.billing_address ? `${checkout.billing_address.address1}, ${checkout.billing_address.city}, ${checkout.billing_address.country}` : '',
      checkout.shipping_lines?.map(line => `${line.title}: ${line.price}`).join('; ') || '',
      checkout.tax_lines?.map(line => `${line.title}: ${line.price}`).join('; ') || '',
      checkout.abandoned_checkout_url
    ]);

    return [headers, ...rows];
  }

  // Test Google Sheets API connection by testing basic API access
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      // Instead of creating/deleting spreadsheets, just test basic API access
      // This requires much fewer permissions
      const testResponse = await this.auth.getAccessToken();
      if (!testResponse || !testResponse.token) {
        throw new Error('Failed to obtain access token');
      }
      
      console.log('Google Sheets API connection test successful');
      return { success: true };
    } catch (error) {
      console.log('Google Sheets API connection test failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Test access to a specific sheet
  async testSheetAccess(sheetId: string): Promise<{ success: boolean; error?: string; sheetName?: string }> {
    try {
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId: sheetId,
      });
      
      return {
        success: true,
        sheetName: response.data.properties?.title || 'Unknown'
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Sheet not accessible'
      };
    }
  }

  async populateSheet(spreadsheetId: string, checkouts: ShopifyCheckout[], tabName?: string): Promise<void> {
    try {
      const data = this.formatCheckoutData(checkouts);
      const range = tabName ? `${tabName}!A1` : 'A1';
      
      // Clear existing data first
      await this.sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: tabName || 'Sheet1',
      });
      
      // Add new data
      await this.sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: 'RAW',
        requestBody: {
          values: data,
        },
      });

      // Format the header row
      const formatRange = tabName ? {
        sheetId: await this.getSheetIdByName(spreadsheetId, tabName),
        startRowIndex: 0,
        endRowIndex: 1,
      } : {
        startRowIndex: 0,
        endRowIndex: 1,
      };

      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              repeatCell: {
                range: formatRange,
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 },
                    textFormat: { bold: true },
                  },
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat)',
              },
            },
          ],
        },
      });

    } catch (error) {
      throw new Error(`Failed to populate sheet: ${error}`);
    }
  }

  private async getSheetIdByName(spreadsheetId: string, sheetName: string): Promise<number> {
    try {
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId,
      });
      
      const sheet = response.data.sheets?.find(sheet => 
        sheet.properties?.title === sheetName
      );
      
      return sheet?.properties?.sheetId || 0;
    } catch (error) {
      return 0; // Default to first sheet
    }
  }

  async exportCheckoutsToExistingSheet(checkouts: ShopifyCheckout[], sheetId: string, sheetName?: string): Promise<string> {
    try {
      // Determine which sheet tab to use
      const tabName = sheetName || 'Sheet1';
      
      // Clear existing data and populate with new data
      await this.populateSheet(sheetId, checkouts, tabName);
      
      const url = `https://docs.google.com/spreadsheets/d/${sheetId}`;
      return url;
    } catch (error) {
      throw new Error(`Failed to export to existing sheet: ${error}`);
    }
  }

  async exportCheckouts(checkouts: ShopifyCheckout[], sheetName?: string): Promise<string> {
    const title = sheetName || `Abandoned Checkouts - ${new Date().toLocaleDateString()}`;
    
    const { spreadsheetId, url } = await this.createSpreadsheet(title);
    await this.populateSheet(spreadsheetId, checkouts);
    
    return url;
  }
}
