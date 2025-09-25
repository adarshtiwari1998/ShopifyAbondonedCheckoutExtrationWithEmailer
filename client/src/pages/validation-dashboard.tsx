import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { RefreshCw, Shield, AlertTriangle, CheckCircle, XCircle, Globe, Bot, Database } from "lucide-react";
import { type UserValidation } from "@shared/schema";

interface ValidationStats {
  total: number;
  passed: number;
  failed: number;
  botCount: number;
  conversionRate: string;
  recentValidations: number;
  proceedToCheckout: number;
}

export default function ValidationDashboard() {
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: validationStats, isLoading: statsLoading } = useQuery<ValidationStats>({
    queryKey: ['/api/validation/stats', refreshKey],
  });

  const { data: recentValidations, isLoading: validationsLoading } = useQuery<UserValidation[]>({
    queryKey: ['/api/validation/recent', refreshKey],
  });

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  const getRiskBadgeColor = (riskScore: number | null) => {
    if (!riskScore) return "secondary";
    if (riskScore >= 70) return "destructive";
    if (riskScore >= 30) return "default";
    return "secondary";
  };

  const getValidationIcon = (result: string) => {
    switch (result) {
      case 'passed': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed': return <XCircle className="h-4 w-4 text-red-500" />;
      default: return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    }
  };

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
                <h1 className="text-lg font-semibold text-foreground">User Validation Dashboard</h1>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Link href="/" data-testid="link-extraction">
                <Button variant="outline" size="sm">
                  <Database className="h-4 w-4 mr-2" />
                  Extraction Dashboard
                </Button>
              </Link>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleRefresh}
                data-testid="button-refresh"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card data-testid="card-total-validations">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Validations</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{validationStats?.total || 0}</div>
              <p className="text-xs text-muted-foreground">
                Last 30 days
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-success-rate">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {validationStats?.total ? Math.round((validationStats.passed / validationStats.total) * 100) : 0}%
              </div>
              <p className="text-xs text-muted-foreground">
                {validationStats?.passed || 0} passed validations
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-bot-detections">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Bot Detections</CardTitle>
              <Bot className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{validationStats?.botCount || 0}</div>
              <p className="text-xs text-muted-foreground">
                Automated traffic blocked
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-conversion-rate">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Checkout Conversion</CardTitle>
              <Globe className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {validationStats?.proceedToCheckout || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                Proceeded to checkout
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="recent" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="recent" data-testid="tab-recent">Recent Validations</TabsTrigger>
            <TabsTrigger value="analytics" data-testid="tab-analytics">Analytics</TabsTrigger>
            <TabsTrigger value="settings" data-testid="tab-settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="recent">
            <Card>
              <CardHeader>
                <CardTitle>Recent User Validations</CardTitle>
                <CardDescription>
                  Latest validation attempts with risk scores and geolocation data
                </CardDescription>
              </CardHeader>
              <CardContent>
                {validationsLoading ? (
                  <div className="flex items-center justify-center h-64">
                    <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {recentValidations && recentValidations.length > 0 ? (
                      recentValidations.map((validation, index) => (
                        <div 
                          key={validation.id}
                          className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                          data-testid={`validation-item-${index}`}
                        >
                          <div className="flex items-center space-x-4">
                            {getValidationIcon(validation.validationResult)}
                            <div>
                              <div className="font-medium">
                                {validation.ipAddress}
                                {validation.isBot && (
                                  <Badge variant="destructive" className="ml-2">BOT</Badge>
                                )}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {validation.locationData?.country && validation.locationData?.city
                                  ? `${validation.locationData.city}, ${validation.locationData.country}`
                                  : 'Location unknown'
                                }
                                {validation.locationData?.isVpn && (
                                  <Badge variant="outline" className="ml-2">VPN</Badge>
                                )}
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex items-center space-x-4">
                            <div className="text-right">
                              <div className="font-medium">
                                Risk Score: {validation.riskScore || 0}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                Cart: ${validation.cartValue ? (validation.cartValue / 100).toFixed(2) : '0.00'}
                              </div>
                            </div>
                            <Badge variant={getRiskBadgeColor(validation.riskScore)}>
                              {validation.riskScore && validation.riskScore >= 70 ? 'High Risk' :
                               validation.riskScore && validation.riskScore >= 30 ? 'Medium Risk' : 'Low Risk'}
                            </Badge>
                            {validation.proceedToCheckout && (
                              <Badge variant="secondary">Proceeded to Checkout</Badge>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        No recent validations found
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Validation Trends</CardTitle>
                  <CardDescription>
                    Analysis of validation patterns over time
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                      <span>Total Attempts</span>
                      <span className="font-semibold">{validationStats?.total || 0}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <span>Successful Validations</span>
                      <span className="font-semibold text-green-600">{validationStats?.passed || 0}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                      <span>Failed Validations</span>
                      <span className="font-semibold text-red-600">{validationStats?.failed || 0}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                      <span>Bot Traffic</span>
                      <span className="font-semibold text-orange-600">{validationStats?.botCount || 0}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Geographic Distribution</CardTitle>
                  <CardDescription>
                    Validation attempts by location
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8 text-muted-foreground">
                    Geographic analytics coming soon...
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="settings">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Validation Rules</CardTitle>
                  <CardDescription>
                    Configure risk scoring and validation thresholds
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center p-3 border rounded-lg">
                      <div>
                        <div className="font-medium">High Risk Threshold</div>
                        <div className="text-sm text-muted-foreground">Block users above this score</div>
                      </div>
                      <Badge variant="destructive">70</Badge>
                    </div>
                    <div className="flex justify-between items-center p-3 border rounded-lg">
                      <div>
                        <div className="font-medium">Challenge Threshold</div>
                        <div className="text-sm text-muted-foreground">Show CAPTCHA above this score</div>
                      </div>
                      <Badge variant="default">30</Badge>
                    </div>
                    <div className="flex justify-between items-center p-3 border rounded-lg">
                      <div>
                        <div className="font-medium">VPN Detection</div>
                        <div className="text-sm text-muted-foreground">Add risk for VPN usage</div>
                      </div>
                      <Badge variant="secondary">+30 points</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Integration Status</CardTitle>
                  <CardDescription>
                    Status of CAPTCHA and geolocation services
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center p-3 border rounded-lg">
                      <div>
                        <div className="font-medium">IP Geolocation Service</div>
                        <div className="text-sm text-muted-foreground">Location validation</div>
                      </div>
                      <Badge variant="secondary">Demo Mode</Badge>
                    </div>
                    <div className="flex justify-between items-center p-3 border rounded-lg">
                      <div>
                        <div className="font-medium">CAPTCHA Service</div>
                        <div className="text-sm text-muted-foreground">Human verification</div>
                      </div>
                      <Badge variant="secondary">Mock Validation</Badge>
                    </div>
                    <div className="flex justify-between items-center p-3 border rounded-lg">
                      <div>
                        <div className="font-medium">Shopify Integration</div>
                        <div className="text-sm text-muted-foreground">Cart validation</div>
                      </div>
                      <Badge variant="outline">Ready to Deploy</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}