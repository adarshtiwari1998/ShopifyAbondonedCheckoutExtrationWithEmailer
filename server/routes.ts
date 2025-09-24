import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage.js";
import { insertExtractionSchema } from "@shared/schema.js";
import { extractAbandonedCheckouts } from "./services/shopify.js";
import { GoogleSheetsService } from "./services/googleSheets.js";
import { CredentialsManager } from "./services/credentialsManager.js";

export async function registerRoutes(app: Express): Promise<Server> {
  const credentialsManager = CredentialsManager.getInstance();

  // Get credentials status
  app.get('/api/credentials/status', async (req, res) => {
    try {
      const status = credentialsManager.getCredentialsStatus();
      res.json({ 
        hasCredentials: status.allCredentialsReady,
        hasGoogleCredentials: status.hasGoogleCredentials,
        hasShopifyToken: status.hasShopifyToken,
        allCredentialsReady: status.allCredentialsReady
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to check credentials status' });
    }
  });

  // Create extraction job
  app.post('/api/extractions', async (req, res) => {
    try {
      const result = insertExtractionSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: 'Invalid extraction parameters' });
      }

      const extraction = await storage.createExtraction(result.data);
      res.json(extraction);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create extraction job' });
    }
  });

  // Start extraction process
  app.post('/api/extractions/:id/start', async (req, res) => {
    try {
      const { id } = req.params;
      const extraction = await storage.getExtraction(id);
      
      if (!extraction) {
        return res.status(404).json({ error: 'Extraction not found' });
      }

      // Check if all credentials are ready
      const credentialsStatus = credentialsManager.getCredentialsStatus();
      if (!credentialsStatus.allCredentialsReady) {
        return res.status(400).json({ 
          error: 'Credentials not ready',
          details: {
            hasGoogleCredentials: credentialsStatus.hasGoogleCredentials,
            hasShopifyToken: credentialsStatus.hasShopifyToken
          }
        });
      }

      // Update status to processing
      await storage.updateExtraction(id, { status: 'processing' });

      // Process extraction in background
      processExtraction(id).catch(console.error);

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to start extraction' });
    }
  });

  // Get extraction status
  app.get('/api/extractions/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const extraction = await storage.getExtraction(id);
      
      if (!extraction) {
        return res.status(404).json({ error: 'Extraction not found' });
      }

      res.json(extraction);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get extraction status' });
    }
  });

  // Get recent extractions
  app.get('/api/extractions', async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const extractions = await storage.getExtractions(limit);
      res.json(extractions);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get extractions' });
    }
  });

  // Preview extraction data (without creating Google Sheet)
  app.post('/api/extractions/preview', async (req, res) => {
    try {
      // Check if Shopify token is available for preview
      if (!credentialsManager.validateShopifyToken()) {
        return res.status(400).json({ error: 'Shopify credentials not configured' });
      }

      const result = insertExtractionSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: 'Invalid extraction parameters' });
      }

      const { startDate, endDate } = result.data;
      const checkouts = await extractAbandonedCheckouts(startDate, endDate);
      
      // Return preview data (first 10 records)
      res.json({
        total: checkouts.length,
        preview: checkouts.slice(0, 10),
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to preview data' });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}

// Background processing function
async function processExtraction(extractionId: string) {
  const credentialsManager = CredentialsManager.getInstance();
  
  try {
    const extraction = await storage.getExtraction(extractionId);
    if (!extraction) return;

    // Get Google credentials from file
    const googleCredentials = credentialsManager.getGoogleCredentials();
    if (!googleCredentials) {
      await storage.updateExtraction(extractionId, {
        status: 'failed',
        errorMessage: 'Google credentials file not found or invalid'
      });
      return;
    }

    // Extract data from Shopify
    const checkouts = await extractAbandonedCheckouts(extraction.startDate, extraction.endDate);
    
    // Export to Google Sheets using existing sheet ID
    const sheetsService = new GoogleSheetsService(googleCredentials);
    const sheetUrl = await sheetsService.exportCheckoutsToExistingSheet(checkouts, extraction.sheetId, extraction.sheetName || undefined);

    // Update extraction with results
    await storage.updateExtraction(extractionId, {
      status: 'completed',
      recordsFound: checkouts.length,
      sheetUrl,
      extractionData: checkouts
    });

  } catch (error) {
    await storage.updateExtraction(extractionId, {
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
}
