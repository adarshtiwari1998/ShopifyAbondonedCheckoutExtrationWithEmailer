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
import { Switch } from "@/components/ui/switch";
import DateRangePicker from "./date-range-picker";

const formSchema = z.object({
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  selectedDates: z.array(z.string()).optional(),
  useCustomDates: z.boolean().default(false),
  sheetId: z.string().min(1, "Sheet ID is required"),
  sheetName: z.string().optional(),
  recordLimit: z.string().default("1000"),
  // Basic information
  includeBasicInfo: z.boolean().default(true),
  includeCheckoutUrl: z.boolean().default(true),
  includeTimestamps: z.boolean().default(true),
  // Customer information
  includeCustomerInfo: z.boolean().default(true),
  includeCustomerContact: z.boolean().default(true),
  // Order details
  includeLineItems: z.boolean().default(true),
  includeItemDetails: z.boolean().default(true),
  includePricing: z.boolean().default(true),
  includeVariantInfo: z.boolean().default(false),
  includeVendorInfo: z.boolean().default(false),
  // Shipping and delivery
  includeShippingInfo: z.boolean().default(true),
  includeShippingAddress: z.boolean().default(true),
  includeBillingAddress: z.boolean().default(false),
  // Taxes and fees
  includeTaxInfo: z.boolean().default(true),
  includeDiscounts: z.boolean().default(true),
  // Additional fields
  includeNotes: z.boolean().default(false),
  includeCartToken: z.boolean().default(false),
});

interface CredentialsStatus {
  hasCredentials: boolean;
  hasGoogleCredentials: boolean;
  hasShopifyToken: boolean;
  allCredentialsReady: boolean;
}

interface VerificationResult {
  success: boolean;
  error?: string;
  shopName?: string;
  sheetName?: string;
}

interface VerificationStatus {
  google: 'idle' | 'testing' | 'success' | 'error';
  shopify: 'idle' | 'testing' | 'success' | 'error';
  sheet: 'idle' | 'testing' | 'success' | 'error';
  googleError?: string;
  shopifyError?: string;
  sheetError?: string;
  shopName?: string;
  sheetName?: string;
}

interface ExtractionFormProps {
  credentialsStatus?: CredentialsStatus;
  onExtractionStart: (extractionId: string) => void;
  onPreviewData: (data: any) => void;
}

export default function ExtractionForm({ credentialsStatus, onExtractionStart, onPreviewData }: ExtractionFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>({
    google: 'idle',
    shopify: 'idle', 
    sheet: 'idle'
  });
  const [selectedDates, setSelectedDates] = useState<string[]>([]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      startDate: "2025-09-01",
      endDate: "2025-09-30",
      selectedDates: [],
      useCustomDates: false,
      sheetId: "",
      sheetName: "",
      recordLimit: "1000",
      // Basic information defaults
      includeBasicInfo: true,
      includeCheckoutUrl: true,
      includeTimestamps: true,
      // Customer information defaults
      includeCustomerInfo: true,
      includeCustomerContact: true,
      // Order details defaults
      includeLineItems: true,
      includeItemDetails: true,
      includePricing: true,
      includeVariantInfo: false,
      includeVendorInfo: false,
      // Shipping and delivery defaults
      includeShippingInfo: true,
      includeShippingAddress: true,
      includeBillingAddress: false,
      // Taxes and fees defaults
      includeTaxInfo: true,
      includeDiscounts: true,
      // Additional fields defaults
      includeNotes: false,
      includeCartToken: false,
    },
  });

  const createExtractionMutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      // Prepare the payload based on whether custom dates are used
      const payload: any = {
        sheetId: data.sheetId,
        sheetName: data.sheetName || null,
      };
      
      if (data.useCustomDates && data.selectedDates && data.selectedDates.length > 0) {
        // Use custom selected dates
        payload.selectedDates = data.selectedDates;
        payload.useCustomDates = true;
      } else {
        // Use traditional date range
        payload.startDate = data.startDate;
        payload.endDate = data.endDate;
        payload.useCustomDates = false;
      }
      
      const response = await apiRequest('POST', '/api/extractions', payload);
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

  // Verification mutations
  const verifyGoogleMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/credentials/test-google');
      return response.json() as Promise<VerificationResult>;
    },
    onMutate: () => {
      setVerificationStatus(prev => ({ ...prev, google: 'testing' }));
    },
    onSuccess: (result) => {
      setVerificationStatus(prev => ({
        ...prev, 
        google: result.success ? 'success' : 'error',
        googleError: result.error
      }));
      if (result.success) {
        toast({ title: "Success", description: "Google Service Account verified successfully!" });
      } else {
        toast({ title: "Verification Failed", description: result.error, variant: "destructive" });
      }
    },
    onError: () => {
      setVerificationStatus(prev => ({ ...prev, google: 'error', googleError: 'Connection failed' }));
    }
  });

  const verifyShopifyMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/credentials/test-shopify');
      return response.json() as Promise<VerificationResult>;
    },
    onMutate: () => {
      setVerificationStatus(prev => ({ ...prev, shopify: 'testing' }));
    },
    onSuccess: (result) => {
      setVerificationStatus(prev => ({
        ...prev, 
        shopify: result.success ? 'success' : 'error',
        shopifyError: result.error,
        shopName: result.shopName
      }));
      if (result.success) {
        toast({ title: "Success", description: `Connected to ${result.shopName || 'Shopify store'}!` });
      } else {
        toast({ title: "Verification Failed", description: result.error, variant: "destructive" });
      }
    },
    onError: () => {
      setVerificationStatus(prev => ({ ...prev, shopify: 'error', shopifyError: 'Connection failed' }));
    }
  });

  const verifySheetMutation = useMutation({
    mutationFn: async (sheetId: string) => {
      const response = await apiRequest('POST', '/api/credentials/test-sheet', { sheetId });
      return response.json() as Promise<VerificationResult>;
    },
    onMutate: () => {
      setVerificationStatus(prev => ({ ...prev, sheet: 'testing' }));
    },
    onSuccess: (result) => {
      setVerificationStatus(prev => ({
        ...prev, 
        sheet: result.success ? 'success' : 'error',
        sheetError: result.error,
        sheetName: result.sheetName
      }));
      if (result.success) {
        toast({ title: "Success", description: `Sheet "${result.sheetName}" is accessible!` });
      } else {
        toast({ title: "Verification Failed", description: result.error, variant: "destructive" });
      }
    },
    onError: () => {
      setVerificationStatus(prev => ({ ...prev, sheet: 'error', sheetError: 'Connection failed' }));
    }
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

  const handlePreview = () => {
    const data = form.getValues();
    previewMutation.mutate(data);
  };

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    createExtractionMutation.mutate(data);
  };

  return (
    <Card className="w-full">
      <CardContent className="p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Date Range Selection */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-foreground flex items-center">
                  <i className="fas fa-calendar-alt text-primary mr-2"></i>
                  Date Selection
                </h3>
                <FormField
                  control={form.control}
                  name="useCustomDates"
                  render={({ field }) => (
                    <FormItem className="flex items-center space-x-2">
                      <FormLabel className="text-sm font-normal">Custom Date Selection</FormLabel>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-custom-dates"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              {form.watch('useCustomDates') ? (
                /* Custom Multi-Date Selection */
                <div className="space-y-4">
                  <div className="p-4 border border-border rounded-lg bg-muted/10">
                    <p className="text-sm text-muted-foreground mb-3">
                      Select specific dates from different months (e.g., Aug 18-19 and Sep 14-15)
                    </p>
                    <DateRangePicker
                      startDate={form.watch('startDate')}
                      endDate={form.watch('endDate')}
                      onStartDateChange={(date) => form.setValue('startDate', date)}
                      onEndDateChange={(date) => form.setValue('endDate', date)}
                      useMultiSelect={true}
                      selectedDates={selectedDates}
                      onSelectedDatesChange={(dates) => {
                        setSelectedDates(dates);
                        form.setValue('selectedDates', dates);
                      }}
                    />
                  </div>
                </div>
              ) : (
                /* Traditional Date Range Selection */
                <>
                  <DateRangePicker
                    startDate={form.watch('startDate')}
                    endDate={form.watch('endDate')}
                    onStartDateChange={(date) => form.setValue('startDate', date)}
                    onEndDateChange={(date) => form.setValue('endDate', date)}
                    useMultiSelect={false}
                  />

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
                </>
              )}
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
                  <div className="flex items-center flex-1">
                    <div className={`w-2 h-2 ${
                      verificationStatus.google === 'success' ? 'bg-chart-2' : 
                      verificationStatus.google === 'error' ? 'bg-destructive' :
                      credentialsStatus?.hasGoogleCredentials ? 'bg-yellow-500' : 'bg-destructive'
                    } rounded-full mr-3`}></div>
                    <div className="flex-1">
                      <span className="text-sm font-medium text-foreground">Google Service Account</span>
                      {verificationStatus.googleError && (
                        <p className="text-xs text-destructive mt-1">{verificationStatus.googleError}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${
                      verificationStatus.google === 'success' ? 'text-chart-2' :
                      verificationStatus.google === 'error' ? 'text-destructive' :
                      credentialsStatus?.hasGoogleCredentials ? 'text-yellow-600' : 'text-destructive'
                    }`}>
                      {verificationStatus.google === 'success' ? 'Verified' :
                       verificationStatus.google === 'error' ? 'Failed' :
                       credentialsStatus?.hasGoogleCredentials ? 'Ready' : 'File Missing'}
                    </span>
                    {credentialsStatus?.hasGoogleCredentials && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => verifyGoogleMutation.mutate()}
                        disabled={verifyGoogleMutation.isPending}
                        data-testid="button-verify-google"
                      >
                        {verifyGoogleMutation.isPending ? (
                          <i className="fas fa-spinner fa-spin mr-2"></i>
                        ) : (
                          <i className="fas fa-check-circle mr-2"></i>
                        )}
                        Verify
                      </Button>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex items-center flex-1">
                    <div className={`w-2 h-2 ${
                      verificationStatus.shopify === 'success' ? 'bg-chart-2' : 
                      verificationStatus.shopify === 'error' ? 'bg-destructive' :
                      credentialsStatus?.hasShopifyToken ? 'bg-yellow-500' : 'bg-destructive'
                    } rounded-full mr-3`}></div>
                    <div className="flex-1">
                      <span className="text-sm font-medium text-foreground">Shopify Admin Token</span>
                      {verificationStatus.shopName && (
                        <p className="text-xs text-chart-2 mt-1">Connected to {verificationStatus.shopName}</p>
                      )}
                      {verificationStatus.shopifyError && (
                        <p className="text-xs text-destructive mt-1">{verificationStatus.shopifyError}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${
                      verificationStatus.shopify === 'success' ? 'text-chart-2' :
                      verificationStatus.shopify === 'error' ? 'text-destructive' :
                      credentialsStatus?.hasShopifyToken ? 'text-yellow-600' : 'text-destructive'
                    }`}>
                      {verificationStatus.shopify === 'success' ? 'Verified' :
                       verificationStatus.shopify === 'error' ? 'Failed' :
                       credentialsStatus?.hasShopifyToken ? 'Configured' : 'Missing'}
                    </span>
                    {credentialsStatus?.hasShopifyToken && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => verifyShopifyMutation.mutate()}
                        disabled={verifyShopifyMutation.isPending}
                        data-testid="button-verify-shopify"
                      >
                        {verifyShopifyMutation.isPending ? (
                          <i className="fas fa-spinner fa-spin mr-2"></i>
                        ) : (
                          <i className="fas fa-check-circle mr-2"></i>
                        )}
                        Verify
                      </Button>
                    )}
                  </div>
                </div>

                {/* Sheet Verification */}
                {form.watch('sheetId') && (
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div className="flex items-center flex-1">
                      <div className={`w-2 h-2 ${
                        verificationStatus.sheet === 'success' ? 'bg-chart-2' : 
                        verificationStatus.sheet === 'error' ? 'bg-destructive' :
                        'bg-yellow-500'
                      } rounded-full mr-3`}></div>
                      <div className="flex-1">
                        <span className="text-sm font-medium text-foreground">Sheet Access</span>
                        {verificationStatus.sheetName && (
                          <p className="text-xs text-chart-2 mt-1">Sheet: {verificationStatus.sheetName}</p>
                        )}
                        {verificationStatus.sheetError && (
                          <p className="text-xs text-destructive mt-1">{verificationStatus.sheetError}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium ${
                        verificationStatus.sheet === 'success' ? 'text-chart-2' :
                        verificationStatus.sheet === 'error' ? 'text-destructive' :
                        'text-yellow-600'
                      }`}>
                        {verificationStatus.sheet === 'success' ? 'Accessible' :
                         verificationStatus.sheet === 'error' ? 'Failed' :
                         'Not Tested'}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => verifySheetMutation.mutate(form.getValues('sheetId'))}
                        disabled={verifySheetMutation.isPending || !form.watch('sheetId')}
                        data-testid="button-verify-sheet"
                      >
                        {verifySheetMutation.isPending ? (
                          <i className="fas fa-spinner fa-spin mr-2"></i>
                        ) : (
                          <i className="fas fa-check-circle mr-2"></i>
                        )}
                        Test Access
                      </Button>
                    </div>
                  </div>
                )}

                {!credentialsStatus?.allCredentialsReady && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-800">
                      <i className="fas fa-info-circle mr-2"></i>
                      To complete setup, please add your credentials via server configuration.
                    </p>
                  </div>
                )}
                
                {(verificationStatus.google === 'success' && verificationStatus.shopify === 'success') && (
                  <div className="p-3 bg-chart-2/10 border border-chart-2/20 rounded-lg">
                    <p className="text-sm text-chart-2">
                      <i className="fas fa-check-circle mr-2"></i>
                      All credentials verified and ready to use!
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
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Basic Information Group */}
                        <div className="space-y-3">
                          <h4 className="text-sm font-medium text-muted-foreground">Basic Information</h4>
                          <div className="space-y-2">
                            <FormField
                              control={form.control}
                              name="includeBasicInfo"
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value}
                                      onCheckedChange={field.onChange}
                                      data-testid="checkbox-include-basic-info"
                                    />
                                  </FormControl>
                                  <FormLabel className="text-sm font-normal cursor-pointer">
                                    Checkout ID & Date
                                  </FormLabel>
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="includeCheckoutUrl"
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value}
                                      onCheckedChange={field.onChange}
                                      data-testid="checkbox-include-checkout-url"
                                    />
                                  </FormControl>
                                  <FormLabel className="text-sm font-normal cursor-pointer">
                                    Recovery URL
                                  </FormLabel>
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="includePricing"
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value}
                                      onCheckedChange={field.onChange}
                                      data-testid="checkbox-include-pricing"
                                    />
                                  </FormControl>
                                  <FormLabel className="text-sm font-normal cursor-pointer">
                                    Total Price & Currency
                                  </FormLabel>
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>
                        
                        {/* Customer Information Group */}
                        <div className="space-y-3">
                          <h4 className="text-sm font-medium text-muted-foreground">Customer Information</h4>
                          <div className="space-y-2">
                            <FormField
                              control={form.control}
                              name="includeCustomerInfo"
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value}
                                      onCheckedChange={field.onChange}
                                      data-testid="checkbox-include-customer-info"
                                    />
                                  </FormControl>
                                  <FormLabel className="text-sm font-normal cursor-pointer">
                                    Customer Details
                                  </FormLabel>
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="includeCustomerContact"
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value}
                                      onCheckedChange={field.onChange}
                                      data-testid="checkbox-include-customer-contact"
                                    />
                                  </FormControl>
                                  <FormLabel className="text-sm font-normal cursor-pointer">
                                    Customer Contact
                                  </FormLabel>
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>
                        
                        {/* Product Information Group */}
                        <div className="space-y-3">
                          <h4 className="text-sm font-medium text-muted-foreground">Product Information</h4>
                          <div className="space-y-2">
                            <FormField
                              control={form.control}
                              name="includeLineItems"
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value}
                                      onCheckedChange={field.onChange}
                                      data-testid="checkbox-include-line-items"
                                    />
                                  </FormControl>
                                  <FormLabel className="text-sm font-normal cursor-pointer">
                                    Line Items
                                  </FormLabel>
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="includeItemDetails"
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value}
                                      onCheckedChange={field.onChange}
                                      data-testid="checkbox-include-item-details"
                                    />
                                  </FormControl>
                                  <FormLabel className="text-sm font-normal cursor-pointer">
                                    Item Details
                                  </FormLabel>
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="includeVariantInfo"
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value}
                                      onCheckedChange={field.onChange}
                                      data-testid="checkbox-include-variant-info"
                                    />
                                  </FormControl>
                                  <FormLabel className="text-sm font-normal cursor-pointer">
                                    Variant Information
                                  </FormLabel>
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="includeVendorInfo"
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value}
                                      onCheckedChange={field.onChange}
                                      data-testid="checkbox-include-vendor-info"
                                    />
                                  </FormControl>
                                  <FormLabel className="text-sm font-normal cursor-pointer">
                                    Vendor Information
                                  </FormLabel>
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>
                        
                        {/* Shipping & Tax Group */}
                        <div className="space-y-3">
                          <h4 className="text-sm font-medium text-muted-foreground">Shipping & Tax</h4>
                          <div className="space-y-2">
                            <FormField
                              control={form.control}
                              name="includeShippingInfo"
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value}
                                      onCheckedChange={field.onChange}
                                      data-testid="checkbox-include-shipping-info"
                                    />
                                  </FormControl>
                                  <FormLabel className="text-sm font-normal cursor-pointer">
                                    Shipping Lines
                                  </FormLabel>
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="includeShippingAddress"
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value}
                                      onCheckedChange={field.onChange}
                                      data-testid="checkbox-include-shipping-address"
                                    />
                                  </FormControl>
                                  <FormLabel className="text-sm font-normal cursor-pointer">
                                    Shipping Address
                                  </FormLabel>
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="includeBillingAddress"
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value}
                                      onCheckedChange={field.onChange}
                                      data-testid="checkbox-include-billing-address"
                                    />
                                  </FormControl>
                                  <FormLabel className="text-sm font-normal cursor-pointer">
                                    Billing Address
                                  </FormLabel>
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="includeTaxInfo"
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value}
                                      onCheckedChange={field.onChange}
                                      data-testid="checkbox-include-tax-info"
                                    />
                                  </FormControl>
                                  <FormLabel className="text-sm font-normal cursor-pointer">
                                    Tax Information
                                  </FormLabel>
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="includeDiscounts"
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value}
                                      onCheckedChange={field.onChange}
                                      data-testid="checkbox-include-discounts"
                                    />
                                  </FormControl>
                                  <FormLabel className="text-sm font-normal cursor-pointer">
                                    Discounts & Promotions
                                  </FormLabel>
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>
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