import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import DateRangePicker from "./date-range-picker";

const formSchema = z.object({
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  sheetId: z.string().min(1, "Sheet ID is required"),
  sheetName: z.string().optional(),
  recordLimit: z.string().default("1000"),
  includeCustomerInfo: z.boolean().default(true),
  includeLineItems: z.boolean().default(true),
  includeShippingTax: z.boolean().default(true),
});

interface CredentialsStatus {
  hasCredentials: boolean;
  hasGoogleCredentials: boolean;
  hasShopifyToken: boolean;
  allCredentialsReady: boolean;
}

interface ExtractionFormProps {
  credentialsStatus?: CredentialsStatus;
  onExtractionStart: (extractionId: string) => void;
  onPreviewData: (data: any) => void;
}

export default function ExtractionForm({ credentialsStatus, onExtractionStart, onPreviewData }: ExtractionFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      startDate: "2025-09-01",
      endDate: "2025-09-30",
      sheetId: "",
      sheetName: "",
      recordLimit: "1000",
      includeCustomerInfo: true,
      includeLineItems: true,
      includeShippingTax: true,
    },
  });


  const createExtractionMutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      const response = await apiRequest('POST', '/api/extractions', {
        startDate: data.startDate,
        endDate: data.endDate,
        sheetId: data.sheetId,
        sheetName: data.sheetName || null,
      });
      return response.json();
    },
    onSuccess: (extraction) => {
      startExtractionMutation.mutate(extraction.id);
    },
  });

  const startExtractionMutation = useMutation({
    mutationFn: async (extractionId: string) => {
      await apiRequest('POST', `/api/extractions/${extractionId}/start`);
      return extractionId;
    },
    onSuccess: (extractionId) => {
      onExtractionStart(extractionId);
      toast({
        title: "Extraction Started",
        description: "Your abandoned checkout extraction is now in progress.",
      });
    },
  });

  const previewMutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      const response = await apiRequest('POST', '/api/extractions/preview', {
        startDate: data.startDate,
        endDate: data.endDate,
      });
      return response.json();
    },
    onSuccess: (data) => {
      onPreviewData(data);
    },
  });


  const setDatePreset = (preset: string) => {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    let startDate: Date;
    let endDate: Date;

    switch (preset) {
      case 'thisMonth':
        startDate = new Date(currentYear, currentMonth, 1);
        endDate = new Date(currentYear, currentMonth + 1, 0);
        break;
      case 'lastMonth':
        startDate = new Date(currentYear, currentMonth - 1, 1);
        endDate = new Date(currentYear, currentMonth, 0);
        break;
      case 'last30Days':
        endDate = new Date();
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        break;
      case 'last90Days':
        endDate = new Date();
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 90);
        break;
      default:
        return;
    }

    form.setValue('startDate', startDate.toISOString().split('T')[0]);
    form.setValue('endDate', endDate.toISOString().split('T')[0]);
  };

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    if (!credentialsStatus?.allCredentialsReady) {
      const missingCreds = [];
      if (!credentialsStatus?.hasGoogleCredentials) missingCreds.push("Google Service Account");
      if (!credentialsStatus?.hasShopifyToken) missingCreds.push("Shopify Admin Access Token");
      
      toast({
        title: "Credentials Required",
        description: `Please configure the following credentials: ${missingCreds.join(", ")}`,
        variant: "destructive",
      });
      return;
    }
    
    createExtractionMutation.mutate(data);
  };

  const handlePreview = () => {
    const data = form.getValues();
    previewMutation.mutate(data);
  };

  return (
    <Card className="extraction-card rounded-xl shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-center mb-6">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center mr-4">
            <i className="fas fa-calendar-alt text-primary-foreground"></i>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-foreground">Extract Abandoned Checkouts</h2>
            <p className="text-sm text-muted-foreground mt-1">Select date range and export data to Google Sheets</p>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Date Range Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input 
                          type="date" 
                          {...field}
                          data-testid="input-start-date"
                          className="pr-10"
                        />
                        <i className="fas fa-calendar-alt absolute right-3 top-2.5 text-muted-foreground pointer-events-none"></i>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Date</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input 
                          type="date" 
                          {...field}
                          data-testid="input-end-date"
                          className="pr-10"
                        />
                        <i className="fas fa-calendar-alt absolute right-3 top-2.5 text-muted-foreground pointer-events-none"></i>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Quick Date Presets */}
            <div className="space-y-2">
              <FormLabel>Quick Presets</FormLabel>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: 'thisMonth', label: 'This Month' },
                  { key: 'lastMonth', label: 'Last Month' },
                  { key: 'last30Days', label: 'Last 30 Days' },
                  { key: 'last90Days', label: 'Last 90 Days' },
                ].map((preset) => (
                  <Button
                    key={preset.key}
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setDatePreset(preset.key)}
                    data-testid={`button-preset-${preset.key}`}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Google Sheets Configuration */}
            <div className="space-y-4 border-t border-border pt-6">
              <h3 className="font-medium text-foreground flex items-center">
                <i className="fas fa-table text-chart-2 mr-2"></i>
                Google Sheets Export
              </h3>
              
              <FormField
                control={form.control}
                name="sheetId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Google Sheet ID *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
                        {...field}
                        data-testid="input-sheet-id"
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">The ID from your Google Sheet URL (the long string between /d/ and /edit)</p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="sheetName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sheet Name (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Abandoned Checkouts - September 2025"
                        {...field}
                        data-testid="input-sheet-name"
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">Leave empty to use the default sheet name</p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Credentials Status */}
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex items-center">
                    <div className={`w-2 h-2 ${credentialsStatus?.hasGoogleCredentials ? 'bg-chart-2' : 'bg-destructive'} rounded-full mr-3`}></div>
                    <span className="text-sm font-medium text-foreground">Google Service Account</span>
                  </div>
                  <span className={`text-xs font-medium ${credentialsStatus?.hasGoogleCredentials ? 'text-chart-2' : 'text-destructive'}`}>
                    {credentialsStatus?.hasGoogleCredentials ? 'Ready' : 'File Missing'}
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex items-center">
                    <div className={`w-2 h-2 ${credentialsStatus?.hasShopifyToken ? 'bg-chart-2' : 'bg-destructive'} rounded-full mr-3`}></div>
                    <span className="text-sm font-medium text-foreground">Shopify Admin Token</span>
                  </div>
                  <span className={`text-xs font-medium ${credentialsStatus?.hasShopifyToken ? 'text-chart-2' : 'text-destructive'}`}>
                    {credentialsStatus?.hasShopifyToken ? 'Configured' : 'Missing'}
                  </span>
                </div>

                {!credentialsStatus?.allCredentialsReady && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-800">
                      <i className="fas fa-info-circle mr-2"></i>
                      To complete setup, please add your credentials via server configuration.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Advanced Options */}
            <div className="space-y-4 border-t border-border pt-6">
              <details className="group">
                <summary className="flex items-center justify-between cursor-pointer text-sm font-medium text-foreground hover:text-primary">
                  <span className="flex items-center">
                    <i className="fas fa-cogs mr-2"></i>
                    Advanced Options
                  </span>
                  <i className="fas fa-chevron-down group-open:rotate-180 transition-transform"></i>
                </summary>
                <div className="mt-4 space-y-4 pl-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="recordLimit"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Record Limit</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-record-limit">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="100">100 records</SelectItem>
                              <SelectItem value="500">500 records</SelectItem>
                              <SelectItem value="1000">1000 records</SelectItem>
                              <SelectItem value="0">No limit</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <div className="space-y-2">
                      <FormLabel>Include Fields</FormLabel>
                      <div className="space-y-1">
                        <FormField
                          control={form.control}
                          name="includeCustomerInfo"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                              <FormControl>
                                <Checkbox
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  data-testid="checkbox-include-customer"
                                />
                              </FormControl>
                              <FormLabel className="text-sm">Customer Information</FormLabel>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="includeLineItems"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                              <FormControl>
                                <Checkbox
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  data-testid="checkbox-include-line-items"
                                />
                              </FormControl>
                              <FormLabel className="text-sm">Line Items</FormLabel>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="includeShippingTax"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                              <FormControl>
                                <Checkbox
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  data-testid="checkbox-include-shipping-tax"
                                />
                              </FormControl>
                              <FormLabel className="text-sm">Shipping & Tax</FormLabel>
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </details>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 pt-6">
              <Button
                type="submit"
                className="flex-1"
                disabled={createExtractionMutation.isPending || startExtractionMutation.isPending}
                data-testid="button-extract-export"
              >
                {createExtractionMutation.isPending || startExtractionMutation.isPending ? (
                  <><i className="fas fa-spinner fa-spin mr-2"></i>Extracting...</>
                ) : (
                  <><i className="fas fa-download mr-2"></i>Extract & Export to Sheets</>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handlePreview}
                disabled={previewMutation.isPending}
                data-testid="button-preview"
              >
                {previewMutation.isPending ? (
                  <><i className="fas fa-spinner fa-spin mr-2"></i>Loading...</>
                ) : (
                  <><i className="fas fa-eye mr-2"></i>Preview Data</>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
