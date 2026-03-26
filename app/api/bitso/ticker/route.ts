import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId, withAuth } from '@/lib/auth';
import { getBitsoBaseUrl } from '@/lib/config/runtime';

async function handler(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const book = searchParams.get('book') || 'btc_mxn';

    // Ticker is a public endpoint - no auth needed
    const response = await fetch(`${getBitsoBaseUrl()}/api/v3/ticker/?book=${book}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await response.json();

    if (!data.success) {
      return NextResponse.json({ success: false, error: data.error?.message || 'Bitso API error' }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: data.payload });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Failed to fetch ticker' }, { status: 500 });
  }
}

const protectedHandler = withAuth(handler);
export const GET = protectedHandler;
