import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ResultsPreviewProps {
  data: {
    total: number;
    preview: any[];
  } | null;
  onClose: () => void;
}

export default function ResultsPreview({ data, onClose }: ResultsPreviewProps) {
  if (!data) return null;

  return (
    <Card className="shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <i className="fas fa-table text-chart-1 mr-3"></i>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Extraction Preview</h3>
              <p className="text-sm text-muted-foreground">Preview of abandoned checkout data</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <Badge variant="secondary" data-testid="badge-result-count">
              {data.total} records found
            </Badge>
            <Button variant="ghost" size="sm" onClick={onClose} data-testid="button-close-preview">
              <i className="fas fa-times mr-1"></i>
              Close
            </Button>
          </div>
        </div>

        {data.preview.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Checkout ID</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Date</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Customer Email</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Total Price</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Items</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.preview.map((checkout, index) => (
                  <tr key={checkout.id || index} className="border-b border-border hover:bg-muted/50">
                    <td className="py-3 px-4" data-testid={`cell-checkout-id-${index}`}>
                      <span className="font-mono text-xs">{checkout.id}</span>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground" data-testid={`cell-date-${index}`}>
                      {new Date(checkout.updated_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4" data-testid={`cell-email-${index}`}>
                      <div>
                        <span className="font-medium">
                          {checkout.email || checkout.customer?.email || 'N/A'}
                        </span>
                        {checkout.customer && (
                          <div className="text-xs text-muted-foreground">
                            {checkout.customer.first_name} {checkout.customer.last_name}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-medium" data-testid={`cell-price-${index}`}>
                      ${checkout.total_price}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground" data-testid={`cell-items-${index}`}>
                      {checkout.line_items?.length || 0} items
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant="destructive" className="text-xs">
                        Abandoned
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8">
            <i className="fas fa-inbox text-muted-foreground text-4xl mb-4"></i>
            <p className="text-muted-foreground">No abandoned checkouts found for the selected date range.</p>
          </div>
        )}

        {data.total > data.preview.length && (
          <div className="mt-6 pt-4 border-t border-border">
            <p className="text-sm text-muted-foreground text-center">
              Showing first {data.preview.length} of {data.total} results. 
              Run full extraction to export all data to Google Sheets.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
