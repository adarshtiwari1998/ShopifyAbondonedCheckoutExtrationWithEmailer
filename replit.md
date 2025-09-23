# Overview

This is an Abandoned Checkout Extractor application built for Foxx Life Sciences. The application allows users to extract abandoned checkout data from Shopify stores and export it to Google Sheets. It provides a web interface for configuring date ranges, uploading Google service account credentials, and monitoring extraction progress. The system fetches abandoned checkout data via Shopify's Admin API and automatically creates formatted Google Sheets with the extracted data.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **UI Library**: Shadcn/ui components built on Radix UI primitives with Tailwind CSS for styling
- **State Management**: TanStack Query (React Query) for server state management and caching
- **Routing**: Wouter for lightweight client-side routing
- **Form Handling**: React Hook Form with Zod validation for type-safe form validation
- **Component Structure**: Modular component architecture with reusable UI components in `/components/ui/`

## Backend Architecture
- **Framework**: Express.js server with TypeScript
- **API Design**: RESTful API endpoints under `/api/` prefix
- **Development Setup**: Vite middleware integration for hot module replacement in development
- **File Handling**: Multer for handling file uploads (Google service account credentials)
- **Error Handling**: Centralized error handling middleware with structured error responses

## Data Storage Solutions
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Connection**: Neon Database serverless PostgreSQL connection
- **Schema**: Three main entities:
  - `users`: User authentication data
  - `extractions`: Extraction job records with status tracking
  - `googleCredentials`: Google service account credentials storage
- **Storage Interface**: Abstracted storage layer with in-memory implementation for development

## Authentication and Authorization
- **Session Management**: PostgreSQL-backed sessions using connect-pg-simple
- **Credentials**: Google service account JSON credentials uploaded and stored securely
- **Access Control**: Shopify Admin API access token configured via environment variables

## External Dependencies

### Third-Party Services
- **Shopify Admin API**: For fetching abandoned checkout data with pagination support
- **Google Sheets API**: For creating and populating spreadsheets with extracted data
- **Google Drive API**: For managing spreadsheet permissions and sharing

### Database Services
- **Neon Database**: Serverless PostgreSQL hosting with connection pooling
- **Drizzle Kit**: Database migrations and schema management

### Development Tools
- **Replit Integration**: Development environment plugins for banner and cartographer
- **Font Awesome**: Icon library for UI components
- **Google Fonts**: Inter font family for typography

### Key Integrations
- **Shopify Store**: Configured to connect to shopfls.myshopify.com for data extraction
- **Google Workspace**: Service account integration for automated Google Sheets creation
- **File Upload**: Secure handling of Google service account credential files

The application follows a modern full-stack architecture with clear separation of concerns, type safety throughout the stack, and robust error handling for external API integrations.