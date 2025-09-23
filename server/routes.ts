import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage.js";
import { insertExtractionSchema, insertCredentialsSchema } from "@shared/schema.js";
import { extractAbandonedCheckouts } from "./services/shopify.js";
import { GoogleSheetsService } from "./services/googleSheets.js";
import multer from 'multer';

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

const upload = multer({ dest: 'uploads/' });

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Upload Google Service Account credentials
  app.post('/api/credentials', upload.single('credentials'), async (req: MulterRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No credentials file uploaded' });
      }

      const fs = await import('fs');
      const credentialsJson = JSON.parse(fs.readFileSync(req.file.path, 'utf8'));
      
      // Validate credentials structure
      const requiredFields = ['type', 'project_id', 'private_key', 'client_email'];
      for (const field of requiredFields) {
        if (!credentialsJson[field]) {
          return res.status(400).json({ error: `Invalid credentials: missing ${field}` });
        }
      }

      const result = insertCredentialsSchema.safeParse({ credentialsJson });
      if (!result.success) {
        return res.status(400).json({ error: 'Invalid credentials format' });
      }

      const credentials = await storage.createCredentials(result.data);
      
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      
      res.json({ success: true, id: credentials.id });
    } catch (error) {
      res.status(500).json({ error: 'Failed to upload credentials' });
    }
  });

  // Get active credentials status
  app.get('/api/credentials/status', async (req, res) => {
    try {
      const credentials = await storage.getActiveCredentials();
      res.json({ 
        hasCredentials: !!credentials,
        createdAt: credentials?.createdAt 
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
  try {
    const extraction = await storage.getExtraction(extractionId);
    if (!extraction) return;

    // Get credentials
    const credentials = await storage.getActiveCredentials();
    if (!credentials) {
      await storage.updateExtraction(extractionId, {
        status: 'failed',
        errorMessage: 'No Google credentials configured'
      });
      return;
    }

    // Extract data from Shopify
    const checkouts = await extractAbandonedCheckouts(extraction.startDate, extraction.endDate);
    
    // Export to Google Sheets
    const sheetsService = new GoogleSheetsService(credentials.credentialsJson as any);
    const sheetUrl = await sheetsService.exportCheckouts(checkouts, extraction.sheetName || undefined);

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
