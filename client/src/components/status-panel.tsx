import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { type Extraction } from "@shared/schema";
import { Button } from "@/components/ui/button";

interface StatusPanelProps {
  extractionId: string | null;
  recentExtractions: Extraction[];
}

export default function StatusPanel({ extractionId, recentExtractions }: StatusPanelProps) {
  const { data: currentExtraction } = useQuery<Extraction>({
    queryKey: ['/api/extractions', extractionId],
    enabled: !!extractionId,
    refetchInterval: extractionId && ['pending', 'processing'].includes(
      recentExtractions.find(e => e.id === extractionId)?.status || ''
    ) ? 2000 : false,
  });

  const getProgressPercent = (status: string) => {
    switch (status) {
      case 'pending': return 10;
      case 'processing': return 60;
      case 'completed': return 100;
      case 'failed': return 100;
      default: return 0;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return 'Connecting to Shopify...';
      case 'processing': return 'Extracting data...';
      case 'completed': return 'Complete';
      case 'failed': return 'Failed';
      default: return 'Ready';
    }
  };

  const activeExtraction = currentExtraction || (extractionId ? recentExtractions.find(e => e.id === extractionId) : null);
  const progress = activeExtraction ? getProgressPercent(activeExtraction.status) : 0;
  const statusText = activeExtraction ? getStatusText(activeExtraction.status) : 'Ready';

  const totalExtractions = recentExtractions.length;
  const successRate = recentExtractions.length > 0 
    ? Math.round((recentExtractions.filter(e => e.status === 'completed').length / recentExtractions.length) * 100)
    : 0;

  return (
    <>
      {/* Current Status */}
      <Card>
        <CardContent className="p-6">
          <h3 className="font-semibold text-foreground mb-4 flex items-center">
            <i className="fas fa-info-circle text-primary mr-2"></i>
            Extraction Status
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <span className="text-sm font-medium text-muted-foreground" data-testid="text-current-status">
                {statusText}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Progress</span>
              <span className="text-sm font-medium text-muted-foreground" data-testid="text-progress-percent">
                {progress}%
              </span>
            </div>
            <Progress value={progress} className="w-full" data-testid="progress-extraction" />
            
            {activeExtraction?.status === 'failed' && activeExtraction.errorMessage && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="text-sm text-destructive font-medium">Error Details:</p>
                <p className="text-sm text-destructive mt-1">{activeExtraction.errorMessage}</p>
              </div>
            )}

            {activeExtraction?.status === 'completed' && activeExtraction.sheetUrl && (
              <div className="p-3 bg-chart-2/10 border border-chart-2/20 rounded-lg">
                <p className="text-sm text-foreground font-medium mb-2">Export Complete!</p>
                <Button
                  size="sm"
                  onClick={() => window.open(activeExtraction.sheetUrl!, '_blank')}
                  data-testid="button-open-sheet"
                >
                  <i className="fas fa-external-link-alt mr-2"></i>
                  Open Google Sheet
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recent Extractions */}
      <Card>
        <CardContent className="p-6">
          <h3 className="font-semibold text-foreground mb-4 flex items-center">
            <i className="fas fa-history text-chart-1 mr-2"></i>
            Recent Extractions
          </h3>
          <div className="space-y-3">
            {recentExtractions.slice(0, 5).map((extraction) => (
              <div key={extraction.id} className="flex items-center justify-between py-2 border-b border-border">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {new Date(extraction.startDate).toLocaleDateString()} - {new Date(extraction.endDate).toLocaleDateString()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {extraction.recordsFound || 0} checkouts exported
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`text-xs font-medium ${
                    extraction.status === 'completed' ? 'text-chart-2' : 
                    extraction.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'
                  }`}>
                    {extraction.status === 'completed' ? 'Success' : 
                     extraction.status === 'failed' ? 'Failed' : 'Processing'}
                  </span>
                  {extraction.sheetUrl && (
                    <button
                      onClick={() => window.open(extraction.sheetUrl!, '_blank')}
                      className="text-muted-foreground hover:text-foreground"
                      data-testid={`button-open-sheet-${extraction.id}`}
                    >
                      <i className="fas fa-external-link-alt"></i>
                    </button>
                  )}
                </div>
              </div>
            ))}
            
            {recentExtractions.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No extractions yet. Start your first extraction above.
              </p>
            )}
          </div>
          
          {recentExtractions.length > 5 && (
            <Button variant="ghost" className="w-full mt-4 text-sm text-primary hover:text-primary/80">
              View All Extractions
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <Card>
        <CardContent className="p-6">
          <h3 className="font-semibold text-foreground mb-4 flex items-center">
            <i className="fas fa-chart-bar text-chart-3 mr-2"></i>
            Quick Stats
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-primary" data-testid="text-total-extractions">
                {totalExtractions}
              </p>
              <p className="text-xs text-muted-foreground">Total Extractions</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-chart-2" data-testid="text-success-rate">
                {successRate}%
              </p>
              <p className="text-xs text-muted-foreground">Success Rate</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
