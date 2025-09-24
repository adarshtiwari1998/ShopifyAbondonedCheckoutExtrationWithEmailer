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
    this.auth = new GoogleAuth({
      credentials,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.file'
      ],
    });

    this.sheets = google.sheets({ version: 'v4', auth: this.auth });
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

  // Test Google Sheets API connection
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      // Try to create a minimal test spreadsheet
      const response = await this.sheets.spreadsheets.create({
        requestBody: {
          properties: {
            title: 'API Connection Test - ' + new Date().toISOString(),
          },
        },
      });
      
      const spreadsheetId = response.data.spreadsheetId!;
      
      // Immediately delete the test spreadsheet
      const drive = google.drive({ version: 'v3', auth: this.auth });
      await drive.files.delete({ fileId: spreadsheetId });
      
      return { success: true };
    } catch (error) {
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
