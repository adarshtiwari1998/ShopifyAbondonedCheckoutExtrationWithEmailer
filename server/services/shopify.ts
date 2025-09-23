import fetch from 'node-fetch';

const options = {
  method: 'GET',
  headers: {
    'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || '',
    'Content-Type': 'application/json'
  }
};

interface ShopifyCheckout {
  id: string;
  updated_at: string;
  email: string;
  total_price: string;
  abandoned_checkout_url: string;
  customer?: {
    email: string;
    first_name: string;
    last_name: string;
  };
  shipping_lines?: Array<{
    title: string;
    price: string;
  }>;
  tax_lines?: Array<{
    title: string;
    price: string;
  }>;
  shipping_address?: {
    address1: string;
    city: string;
    country: string;
  };
  billing_address?: {
    address1: string;
    city: string;
    country: string;
  };
  line_items?: Array<{
    title: string;
    variant_id: string;
    price: string;
    compare_at_price: string;
    quantity: number;
    vendor: string;
  }>;
}

async function fetchAbandonedCheckouts(url: string, options: any, totalCheckouts: ShopifyCheckout[] = []): Promise<ShopifyCheckout[]> {
  try {
    const response = await fetch(url, options);
    const data = await response.json() as { checkouts: ShopifyCheckout[] };
    const checkouts = data.checkouts || [];
    totalCheckouts = totalCheckouts.concat(checkouts);
    
    if (checkouts.length === 100 && totalCheckouts.length < 1000) {
      const nextPageUrl = getNextPageUrl(response.headers.get('link'));
      if (nextPageUrl) {
        return fetchAbandonedCheckouts(nextPageUrl, options, totalCheckouts);
      }
    }
    return totalCheckouts;
  } catch (error) {
    throw error;
  }
}

function getNextPageUrl(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const links = linkHeader.split(',');
  for (let link of links) {
    const [url, rel] = link.split(';');
    if (rel.includes('next')) {
      return url.trim().slice(1, -1);
    }
  }
  return null;
}

export async function extractAbandonedCheckouts(startDate: string, endDate: string): Promise<ShopifyCheckout[]> {
  const baseUrl = `https://shopfls.myshopify.com/admin/api/2024-04/checkouts.json?created_at_min=${startDate}T00:00:00Z&created_at_max=${endDate}T23:59:59Z&limit=100`;
  return await fetchAbandonedCheckouts(baseUrl, options);
}

export type { ShopifyCheckout };
