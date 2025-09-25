import { useState } from "react";
import { Link, useLocation } from "wouter";
import ExtractionForm from "@/components/extraction-form";
import StatusPanel from "@/components/status-panel";
import ResultsPreview from "@/components/results-preview";
import { useQuery } from "@tanstack/react-query";
import { type Extraction } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Database, Shield } from "lucide-react";

export default function ExtractionDashboard() {
  const [currentExtraction, setCurrentExtraction] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);

  const { data: credentialsStatus } = useQuery({
    queryKey: ['/api/credentials/status'],
  });

  const { data: recentExtractions } = useQuery<Extraction[]>({
    queryKey: ['/api/extractions'],
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="bg-card border-b border-border shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <div className="flex-shrink-0">
                <img 
                  src="https://www.foxxlifesciences.com/cdn/shop/t/37/assets/logo.png?v=149756107581828300611700623519" 
                  alt="Foxx Life Sciences" 
                  className="h-8"
                />
              </div>
              <div className="hidden md:block">
                <h1 className="text-lg font-semibold text-foreground">Abandoned Checkout Extractor</h1>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Link href="/validation" data-testid="link-validation">
                <Button variant="outline" size="sm">
                  <Shield className="h-4 w-4 mr-2" />
                  Validation Dashboard
                </Button>
              </Link>
              <button 
                className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
                data-testid="button-settings"
              >
                <i className="fas fa-cog w-5 h-5"></i>
              </button>
              <button 
                className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
                data-testid="button-help"
              >
                <i className="fas fa-question-circle w-5 h-5"></i>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          <div className="lg:col-span-2">
            <ExtractionForm
              credentialsStatus={credentialsStatus}
              onExtractionStart={setCurrentExtraction}
              onPreviewData={(data: any) => {
                setPreviewData(data);
                setShowResults(true);
              }}
            />
          </div>
          
          <div className="space-y-6">
            <StatusPanel 
              extractionId={currentExtraction}
              recentExtractions={recentExtractions || []}
            />
          </div>
        </div>

        {showResults && (
          <ResultsPreview
            data={previewData}
            onClose={() => setShowResults(false)}
          />
        )}
      </main>
    </div>
  );
}
