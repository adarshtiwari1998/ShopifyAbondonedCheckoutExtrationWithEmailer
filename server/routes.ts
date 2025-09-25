import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage.js";
import { insertExtractionSchema } from "@shared/schema.js";
import { extractAbandonedCheckouts, extractAbandonedCheckoutsForCustomDates } from "./services/shopify.js";
import fetch from 'node-fetch';
import { GoogleSheetsService } from "./services/googleSheets.js";
import { CredentialsManager } from "./services/credentialsManager.js";
import { IpGeolocationService } from "./services/ipGeolocation.js";
import { insertUserValidationSchema } from "@shared/schema.js";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  const credentialsManager = CredentialsManager.getInstance();
  const ipGeolocationService = new IpGeolocationService();

  // Helper function to get client IP
  const getClientIp = (req: any): string => {
    return req.headers['x-forwarded-for']?.split(',')[0] || 
           req.connection?.remoteAddress || 
           req.socket?.remoteAddress || 
           '127.0.0.1';
  };

  // Validation API Routes
  
  // Schema for user validation request
  const validateUserRequestSchema = z.object({
    sessionId: z.string().min(1, 'Session ID is required'),
    cartValue: z.number().int().min(0).optional(),
    cartItems: z.number().int().min(0).optional(),
    userAgent: z.string().optional(),
  });

  // Schema for CAPTCHA validation request
  const captchaRequestSchema = z.object({
    validationId: z.string().min(1, 'Validation ID is required'),
    captchaResponse: z.string().min(1, 'CAPTCHA response is required'),
    captchaType: z.string().optional(),
  });

  // Validate user before checkout
  app.post('/api/validation/validate-user', async (req, res) => {
    try {
      // Validate request schema
      const validationResult = validateUserRequestSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: 'Invalid request data',
          details: validationResult.error.issues
        });
      }

      const { sessionId, cartValue, cartItems, userAgent } = validationResult.data;
      const ipAddress = getClientIp(req);

      // Get IP validation
      const ipValidation = await ipGeolocationService.validateUserLocation(ipAddress, userAgent);
      
      // Create user validation record
      const validation = await storage.createUserValidation({
        sessionId,
        ipAddress,
        userAgent,
        cartValue: cartValue ? parseInt(cartValue) : null,
        cartItems: cartItems ? parseInt(cartItems) : null,
        validationType: 'ip_check',
        validationResult: ipValidation.isValid ? 'passed' : 'failed',
        riskScore: ipValidation.riskScore,
        locationData: ipValidation.locationData,
        captchaData: null,
        isBot: ipValidation.riskFactors.includes('Bot user agent detected'),
        proceedToCheckout: false,
        completedOrder: false,
      });

      // Store IP geolocation data
      await storage.createOrUpdateIpGeolocation({
        ipAddress,
        country: ipValidation.locationData.country || null,
        countryCode: ipValidation.locationData.country_code || null,
        region: ipValidation.locationData.region || null,
        city: ipValidation.locationData.city || null,
        zipCode: ipValidation.locationData.zip_code || null,
        latitude: ipValidation.locationData.latitude || null,
        longitude: ipValidation.locationData.longitude || null,
        timezone: ipValidation.locationData.timezone || null,
        isp: ipValidation.locationData.isp || null,
        isVpn: ipValidation.locationData.is_vpn || false,
        isProxy: ipValidation.locationData.is_proxy || false,
        isTor: ipValidation.locationData.is_tor || false,
        threatLevel: ipValidation.locationData.threat_level || null,
      });

      res.json({
        validationId: validation.id,
        isValid: ipValidation.isValid,
        riskScore: ipValidation.riskScore,
        recommendation: ipValidation.recommendation,
        riskFactors: ipValidation.riskFactors,
        requiresCaptcha: ipValidation.recommendation === 'challenge',
        blocked: ipValidation.recommendation === 'block',
        location: {
          country: ipValidation.locationData.country,
          city: ipValidation.locationData.city,
        }
      });
    } catch (error) {
      console.error('Validation error:', error);
      res.status(500).json({ error: 'Validation failed' });
    }
  });

  // Submit CAPTCHA validation
  app.post('/api/validation/captcha', async (req, res) => {
    try {
      // Validate request schema
      const validationResult = captchaRequestSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: 'Invalid request data',
          details: validationResult.error.issues
        });
      }

      const { validationId, captchaResponse, captchaType } = validationResult.data;

      // Verify the validation ID exists
      const existingValidation = await storage.getUserValidation(validationId);
      if (!existingValidation) {
        return res.status(404).json({ error: 'Validation record not found' });
      }

      // Enhanced CAPTCHA validation (demo implementation)
      // In production, integrate with real CAPTCHA service (reCAPTCHA, hCaptcha, etc.)
      const isValidCaptcha = await verifyCaptcha(captchaResponse, captchaType, existingValidation);

      // Update validation record
      const updatedValidation = await storage.updateUserValidation(validationId, {
        validationType: 'captcha',
        validationResult: isValidCaptcha ? 'passed' : 'failed',
        captchaData: { 
          type: captchaType || 'unknown', 
          timestamp: new Date().toISOString(),
          verified: isValidCaptcha 
        },
      });

      res.json({
        success: isValidCaptcha,
        message: isValidCaptcha ? 'CAPTCHA verified successfully' : 'CAPTCHA verification failed',
        validationId: updatedValidation.id
      });
    } catch (error) {
      console.error('CAPTCHA validation error:', error);
      res.status(500).json({ error: 'CAPTCHA validation failed' });
    }
  });

  // Real Google reCAPTCHA verification function
  async function verifyCaptcha(response: string, type: string = 'recaptcha', validation: any): Promise<boolean> {
    // Handle Google reCAPTCHA verification
    if (type === 'recaptcha' || type === 'google') {
      const secretKey = process.env.RECAPTCHA_SECRET_KEY;
      
      if (!secretKey) {
        console.error('RECAPTCHA_SECRET_KEY not configured');
        return false;
      }

      if (!response) {
        console.error('reCAPTCHA response token missing');
        return false;
      }

      try {
        const verifyUrl = 'https://www.google.com/recaptcha/api/siteverify';
        const verifyResponse = await fetch(verifyUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            secret: secretKey,
            response: response,
            remoteip: validation.ipAddress || '' // optional
          }).toString()
        });

        const result = await verifyResponse.json();
        
        if (result.success) {
          // For reCAPTCHA v3, check score threshold (0.5 is a common threshold)
          if (result.score !== undefined) {
            const threshold = 0.5;
            return result.score >= threshold;
          }
          // For reCAPTCHA v2, just check success
          return true;
        } else {
          console.error('reCAPTCHA verification failed:', result['error-codes']);
          return false;
        }
      } catch (error) {
        console.error('reCAPTCHA verification error:', error);
        return false;
      }
    }
    
    // Fallback for demo/mock CAPTCHA (for testing when reCAPTCHA keys aren't set)
    if (type === 'mock') {
      const hasValidFormat = response.startsWith('mock-captcha-response-');
      const hasValidLength = response.length >= 20 && response.length <= 100;
      return hasValidFormat && hasValidLength;
    }
    
    return false;
  }

  // Record checkout proceed action
  app.post('/api/validation/proceed-checkout', async (req, res) => {
    try {
      const { validationId, sessionId } = req.body;
      
      if (validationId) {
        await storage.updateUserValidation(validationId, {
          proceedToCheckout: true,
        });
      } else if (sessionId) {
        // Find validation by session ID
        const validations = await storage.getUserValidationsBySession(sessionId);
        if (validations.length > 0) {
          const latestValidation = validations[validations.length - 1];
          await storage.updateUserValidation(latestValidation.id, {
            proceedToCheckout: true,
          });
        }
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Proceed checkout tracking error:', error);
      res.status(500).json({ error: 'Failed to track checkout proceed' });
    }
  });

  // Get validation statistics
  app.get('/api/validation/stats', async (req, res) => {
    try {
      const stats = await storage.getValidationStats();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const recentValidations = await storage.getValidationsByDateRange(thirtyDaysAgo, new Date());
      
      const conversionRate = stats.total > 0 
        ? (recentValidations.filter(v => v.completedOrder).length / stats.total * 100).toFixed(2)
        : '0';

      res.json({
        ...stats,
        conversionRate: `${conversionRate}%`,
        recentValidations: recentValidations.length,
        proceedToCheckout: recentValidations.filter(v => v.proceedToCheckout).length,
      });
    } catch (error) {
      console.error('Stats error:', error);
      res.status(500).json({ error: 'Failed to get validation stats' });
    }
  });

  // Get recent validations
  app.get('/api/validation/recent', async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const days = req.query.days ? parseInt(req.query.days as string) : 7;
      
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const validations = await storage.getValidationsByDateRange(startDate, new Date());
      
      // Sort by creation date and limit
      const recentValidations = validations
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, limit);

      res.json(recentValidations);
    } catch (error) {
      console.error('Recent validations error:', error);
      res.status(500).json({ error: 'Failed to get recent validations' });
    }
  });

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

  // Test Google Service Account connection
  app.post('/api/credentials/test-google', async (req, res) => {
    try {
      // Use CredentialsManager to support both env var and file-based credentials
      const googleCredentials = credentialsManager.getGoogleCredentials();
      if (!googleCredentials) {
        return res.status(400).json({ 
          success: false, 
          error: 'Google credentials not found or invalid' 
        });
      }

      // Just verify credentials exist and have required fields - no actual API call
      res.json({ 
        success: true,
        message: 'Google credentials are present and valid',
        projectId: googleCredentials.project_id,
        clientEmail: googleCredentials.client_email
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  // Test sheet access
  app.post('/api/credentials/test-sheet', async (req, res) => {
    try {
      const { sheetId } = req.body;
      if (!sheetId) {
        return res.status(400).json({ 
          success: false, 
          error: 'Sheet ID is required' 
        });
      }

      // Basic validation of sheet ID format (Google Sheet IDs are typically 44 characters)
      if (typeof sheetId !== 'string' || sheetId.length < 20) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid sheet ID format. Please ensure you copied the full ID from the URL.' 
        });
      }

      // Validate it looks like a Google Sheets ID (alphanumeric with some special chars)
      const googleSheetIdPattern = /^[a-zA-Z0-9_-]+$/;
      if (!googleSheetIdPattern.test(sheetId)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid sheet ID format. Should only contain letters, numbers, underscores, and hyphens.' 
        });
      }

      // Get Google credentials and test actual sheet access
      const googleCredentials = credentialsManager.getGoogleCredentials();
      if (!googleCredentials) {
        return res.status(400).json({ 
          success: false, 
          error: 'Google credentials not found. Please configure your service account first.' 
        });
      }

      // Test actual sheet access using the GoogleSheetsService
      const sheetsService = new GoogleSheetsService(googleCredentials);
      const sheetAccess = await sheetsService.testSheetAccess(sheetId);

      if (!sheetAccess.success) {
        return res.status(400).json({
          success: false,
          error: `Cannot access sheet: ${sheetAccess.error}. Make sure you've shared the sheet with your service account email: ${googleCredentials.client_email}`
        });
      }

      res.json({
        success: true,
        message: 'Sheet access verified successfully!',
        sheetName: sheetAccess.sheetName,
        sheetUrl: `https://docs.google.com/spreadsheets/d/${sheetId}`,
        serviceAccountEmail: googleCredentials.client_email
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  // Test Shopify API connection
  app.post('/api/credentials/test-shopify', async (req, res) => {
    try {
      if (!credentialsManager.validateShopifyToken()) {
        return res.status(400).json({ 
          success: false, 
          error: 'Shopify access token not configured' 
        });
      }

      // Test with a simple API call - just get store info
      const testUrl = 'https://shopfls.myshopify.com/admin/api/2024-04/shop.json';
      const response = await fetch(testUrl, {
        method: 'GET',
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || '',
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        res.json({ 
          success: true, 
          shopName: data.shop?.name || 'Unknown'
        });
      } else {
        res.json({ 
          success: false, 
          error: `API returned ${response.status}: ${response.statusText}` 
        });
      }
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
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

      let checkouts;
      if (result.data.useCustomDates && result.data.selectedDates && result.data.selectedDates.length > 0) {
        // Handle custom selected dates
        checkouts = await extractAbandonedCheckoutsForCustomDates(result.data.selectedDates);
      } else if (result.data.startDate && result.data.endDate) {
        // Handle traditional date range
        checkouts = await extractAbandonedCheckouts(result.data.startDate, result.data.endDate);
      } else {
        return res.status(400).json({ error: 'Either provide startDate/endDate or selectedDates' });
      }
      
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

    console.log(`[processExtraction] Starting extraction ${extractionId}`);

    // Get Google credentials from file
    const googleCredentials = credentialsManager.getGoogleCredentials();
    if (!googleCredentials) {
      console.log(`[processExtraction] Google credentials not found for extraction ${extractionId}`);
      await storage.updateExtraction(extractionId, {
        status: 'failed',
        errorMessage: 'Google credentials file not found or invalid'
      });
      return;
    }

    // Update progress to indicate we're starting data extraction
    await storage.updateExtraction(extractionId, {
      status: 'processing',
      progressMessage: 'Connecting to Shopify API...'
    });

    console.log(`[processExtraction] Extracting data from Shopify for extraction ${extractionId}`);
    
    // Extract data from Shopify based on extraction type
    let checkouts;
    if (extraction.useCustomDates && extraction.selectedDates && extraction.selectedDates.length > 0) {
      console.log(`[processExtraction] Using custom selected dates: ${extraction.selectedDates.join(', ')}`);
      checkouts = await extractAbandonedCheckoutsForCustomDates(extraction.selectedDates);
    } else if (extraction.startDate && extraction.endDate) {
      console.log(`[processExtraction] Using date range: ${extraction.startDate} to ${extraction.endDate}`);
      checkouts = await extractAbandonedCheckouts(extraction.startDate, extraction.endDate);
    } else {
      throw new Error('Invalid extraction parameters: missing date criteria');
    }
    console.log(`[processExtraction] Found ${checkouts.length} checkouts for extraction ${extractionId}`);
    
    if (checkouts.length === 0) {
      await storage.updateExtraction(extractionId, {
        status: 'completed',
        recordsFound: 0,
        progressMessage: 'No abandoned checkouts found in the specified date range'
      });
      return;
    }

    // Update progress to indicate we're starting Google Sheets export
    await storage.updateExtraction(extractionId, {
      status: 'processing',
      progressMessage: 'Creating Google Sheet and formatting data...'
    });
    
    console.log(`[processExtraction] Starting Google Sheets export for extraction ${extractionId}`);
    
    // Export to Google Sheets using existing sheet ID
    const sheetsService = new GoogleSheetsService(googleCredentials);
    
    // Test sheet access (this is sufficient - no need for general connection test)
    const sheetAccess = await sheetsService.testSheetAccess(extraction.sheetId);
    if (!sheetAccess.success) {
      console.log(`[processExtraction] Sheet access failed for extraction ${extractionId}: ${sheetAccess.error}`);
      await storage.updateExtraction(extractionId, {
        status: 'failed',
        errorMessage: `Cannot access sheet: ${sheetAccess.error}`
      });
      return;
    }
    
    console.log(`[processExtraction] Sheet access verified successfully for extraction ${extractionId}`);
    
    console.log(`[processExtraction] Exporting ${checkouts.length} checkouts to sheet for extraction ${extractionId}`);
    const sheetUrl = await sheetsService.exportCheckoutsToExistingSheet(checkouts, extraction.sheetId, extraction.sheetName || undefined);
    
    console.log(`[processExtraction] Extraction ${extractionId} completed successfully`);

    // Update extraction with results
    await storage.updateExtraction(extractionId, {
      status: 'completed',
      recordsFound: checkouts.length,
      sheetUrl,
      extractionData: checkouts,
      progressMessage: 'Export completed successfully'
    });

  } catch (error) {
    console.error(`[processExtraction] Error in extraction ${extractionId}:`, error);
    await storage.updateExtraction(extractionId, {
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
}
