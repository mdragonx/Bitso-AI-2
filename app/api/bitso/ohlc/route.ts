import { NextRequest, NextResponse } from 'next/server';
import { authMiddleware } from 'lyzr-architect';

async function handler(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const book = searchParams.get('book') || 'btc_mxn';
    const timeframe = searchParams.get('timeframe') || '1hour';

    // Trades/OHLC - public endpoint
    const response = await fetch(`https://bitso.com/api/v3/ohlc/?book=${book}&time_bucket=${timeframe}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await response.json();

    if (!data.success) {
      return NextResponse.json({ success: false, error: data.error?.message || 'Bitso API error' }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: data.payload });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Failed to fetch OHLC data' }, { status: 500 });
  }
}

const protectedHandler = authMiddleware(handler);
export const GET = protectedHandler;
