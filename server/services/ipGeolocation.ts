import fetch from 'node-fetch';

export interface IpGeolocationData {
  ip: string;
  country?: string;
  country_code?: string;
  region?: string;
  city?: string;
  zip_code?: string;
  latitude?: string;
  longitude?: string;
  timezone?: string;
  isp?: string;
  is_vpn?: boolean;
  is_proxy?: boolean;
  is_tor?: boolean;
  threat_level?: 'low' | 'medium' | 'high';
}

export interface IpValidationResult {
  ip: string;
  isValid: boolean;
  riskScore: number; // 0-100
  locationData: IpGeolocationData;
  riskFactors: string[];
  recommendation: 'allow' | 'challenge' | 'block';
}

export class IpGeolocationService {
  private apiKey: string;
  private apiUrl: string = 'https://ipgeolocation.abstractapi.com/v1/';
  
  constructor() {
    // In production, you would set this via environment variable
    // For demo purposes, we'll use a mock service
    this.apiKey = process.env.IP_GEOLOCATION_API_KEY || 'demo-key';
  }

  async getLocationData(ipAddress: string): Promise<IpGeolocationData> {
    try {
      // Use real AbstractAPI if key is available
      if (this.apiKey === 'demo-key' || !this.apiKey) {
        console.log('[IP Geolocation] Using mock data - no AbstractAPI key configured');
        return this.getMockLocationData(ipAddress);
      }

      console.log(`[IP Geolocation] Fetching real location data for IP: ${ipAddress}`);
      
      const response = await fetch(`${this.apiUrl}?api_key=${this.apiKey}&ip_address=${ipAddress}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[IP Geolocation] AbstractAPI error: ${response.status} - ${errorText}`);
        throw new Error(`IP Geolocation API error: ${response.status}`);
      }

      const data = await response.json();
      console.log(`[IP Geolocation] AbstractAPI response:`, JSON.stringify(data, null, 2));
      
      const transformedData = this.transformApiResponse(data);
      console.log(`[IP Geolocation] Real location result:`, JSON.stringify(transformedData, null, 2));
      
      return transformedData;
    } catch (error) {
      console.error('Error fetching IP geolocation:', error);
      // Return basic data for fallback
      return {
        ip: ipAddress,
        country: 'Unknown',
        threat_level: 'low'
      };
    }
  }

  async validateUserLocation(ipAddress: string, userAgent?: string): Promise<IpValidationResult> {
    const locationData = await this.getLocationData(ipAddress);
    const riskFactors: string[] = [];
    let riskScore = 0;

    // Check for VPN/Proxy usage
    if (locationData.is_vpn) {
      riskFactors.push('VPN detected');
      riskScore += 30;
    }
    
    if (locationData.is_proxy) {
      riskFactors.push('Proxy detected');
      riskScore += 25;
    }
    
    if (locationData.is_tor) {
      riskFactors.push('Tor network detected');
      riskScore += 50;
    }

    // Check for high-risk countries (example)
    const highRiskCountries = ['CN', 'RU', 'IR', 'KP'];
    if (locationData.country_code && highRiskCountries.includes(locationData.country_code)) {
      riskFactors.push('High-risk country');
      riskScore += 20;
    }

    // Check for datacenter IPs
    if (locationData.isp && this.isDatacenterIsp(locationData.isp)) {
      riskFactors.push('Datacenter IP');
      riskScore += 15;
    }

    // User agent analysis
    if (userAgent && this.isBot(userAgent)) {
      riskFactors.push('Bot user agent detected');
      riskScore += 40;
    }

    // Determine recommendation based on risk score
    let recommendation: 'allow' | 'challenge' | 'block';
    if (riskScore >= 70) {
      recommendation = 'block';
    } else if (riskScore >= 30) {
      recommendation = 'challenge';
    } else {
      recommendation = 'allow';
    }

    return {
      ip: ipAddress,
      isValid: riskScore < 70,
      riskScore: Math.min(riskScore, 100),
      locationData,
      riskFactors,
      recommendation
    };
  }

  private getMockLocationData(ipAddress: string): IpGeolocationData {
    // Mock data based on IP patterns for demo
    const ip = ipAddress;
    
    // Simulate different scenarios
    if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
      // Private IP
      return {
        ip,
        country: 'United States',
        country_code: 'US',
        region: 'Local Network',
        city: 'Local',
        isp: 'Private Network',
        is_vpn: false,
        is_proxy: false,
        is_tor: false,
        threat_level: 'low'
      };
    }
    
    if (ip.includes('5.5.5.') || ip.includes('9.9.9.')) {
      // Simulate VPN
      return {
        ip,
        country: 'Netherlands',
        country_code: 'NL',
        region: 'North Holland',
        city: 'Amsterdam',
        isp: 'VPN Service Provider',
        is_vpn: true,
        is_proxy: false,
        is_tor: false,
        threat_level: 'medium'
      };
    }
    
    // Default safe location
    return {
      ip,
      country: 'United States',
      country_code: 'US',
      region: 'California',
      city: 'San Francisco',
      isp: 'Residential ISP',
      is_vpn: false,
      is_proxy: false,
      is_tor: false,
      threat_level: 'low'
    };
  }

  private transformApiResponse(data: any): IpGeolocationData {
    return {
      ip: data.ip_address,
      country: data.country,
      country_code: data.country_code,
      region: data.region,
      city: data.city,
      zip_code: data.postal_code,
      latitude: data.latitude?.toString(),
      longitude: data.longitude?.toString(),
      timezone: data.timezone?.name,
      isp: data.connection?.isp_name,
      is_vpn: data.security?.is_vpn || false,
      is_proxy: data.security?.is_proxy || false,
      is_tor: data.security?.is_tor || false,
      threat_level: this.calculateThreatLevel(data.security)
    };
  }

  private calculateThreatLevel(security: any): 'low' | 'medium' | 'high' {
    if (!security) return 'low';
    
    if (security.is_tor || security.threat_score > 0.7) {
      return 'high';
    } else if (security.is_vpn || security.is_proxy || security.threat_score > 0.3) {
      return 'medium';
    }
    
    return 'low';
  }

  private isDatacenterIsp(isp: string): boolean {
    const datacenterKeywords = ['amazon', 'google', 'microsoft', 'digitalocean', 'linode', 'vultr', 'hetzner'];
    const ispLower = isp.toLowerCase();
    return datacenterKeywords.some(keyword => ispLower.includes(keyword));
  }

  private isBot(userAgent: string): boolean {
    const botPatterns = [
      /bot/i, /crawler/i, /spider/i, /scraper/i,
      /curl/i, /wget/i, /python/i, /php/i,
      /selenium/i, /phantomjs/i, /headless/i
    ];
    
    return botPatterns.some(pattern => pattern.test(userAgent));
  }
}