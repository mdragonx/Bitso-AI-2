import { NextRequest, NextResponse } from 'next/server';
import { authMiddleware } from 'lyzr-architect';
import getBitsoCredentialModel from '@/models/BitsoCredential';
import crypto from 'crypto';

function createBitsoAuthHeader(apiKey: string, apiSecret: string, method: string, path: string, body: string = '') {
  const nonce = Date.now().toString();
  const message = nonce + method.toUpperCase() + path + body;
  const signature = crypto.createHmac('sha256', apiSecret).update(message).digest('hex');
  return `Bitso ${apiKey}:${nonce}:${signature}`;
}

// Bitso fee tiers (as of current schedule)
const BITSO_FEE_TIERS = [
  { id: 'starter', label: 'Starter', volume: '< $100K MXN', maker: 0.005, taker: 0.0065 },
  { id: 'tier1', label: 'Tier 1', volume: '$100K - $500K MXN', maker: 0.004, taker: 0.005 },
  { id: 'tier2', label: 'Tier 2', volume: '$500K - $2M MXN', maker: 0.003, taker: 0.004 },
  { id: 'tier3', label: 'Tier 3', volume: '$2M - $10M MXN', maker: 0.002, taker: 0.003 },
  { id: 'tier4', label: 'Tier 4', volume: '$10M - $50M MXN', maker: 0.001, taker: 0.002 },
  { id: 'tier5', label: 'Tier 5', volume: '> $50M MXN', maker: 0.0005, taker: 0.001 },
];

async function handler(req: NextRequest) {
  try {
    // Try to fetch real fees from Bitso if credentials exist
    const Model = await getBitsoCredentialModel();
    const creds = await Model.find({});

    if (Array.isArray(creds) && creds.length > 0) {
      const apiKey = creds[0].api_key;
      const apiSecret = creds[0].api_secret;
      const path = '/api/v3/fees/';
      const authHeader = createBitsoAuthHeader(apiKey, apiSecret, 'GET', path);

      try {
        const response = await fetch('https://bitso.com/api/v3/fees/', {
          method: 'GET',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
        });
        const data = await response.json();
        if (data.success && data.payload) {
          return NextResponse.json({
            success: true,
            data: {
              live_fees: data.payload,
              fee_tiers: BITSO_FEE_TIERS,
            },
          });
        }
      } catch { /* fall through to return static tiers */ }
    }

    // Return static fee tiers if no credentials or API call fails
    return NextResponse.json({
      success: true,
      data: {
        live_fees: null,
        fee_tiers: BITSO_FEE_TIERS,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Failed to fetch fees' }, { status: 500 });
  }
}

const protectedHandler = authMiddleware(handler);
export const GET = protectedHandler;
