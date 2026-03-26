'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

interface TradeRecord {
  _id?: string;
  signal_id?: string;
  pair?: string;
  side?: string;
  amount?: string;
  price?: string;
  total_value?: string;
  bitso_order_id?: string;
  result_status?: string;
  risk_check_details?: string;
  createdAt?: string;
}

interface SignalRecord {
  _id?: string;
  pair?: string;
  signal_type?: string;
  confidence?: number;
  status?: string;
  createdAt?: string;
}

interface TradeHistoryProps {
  trades: TradeRecord[];
  signals: SignalRecord[];
  loading: boolean;
  showSample: boolean;
  error?: string;
}

const SAMPLE_TRADES: TradeRecord[] = [
  { _id: '1', pair: 'btc_mxn', side: 'buy', amount: '0.015', price: '1595000', total_value: '23925', bitso_order_id: 'ORD-2026-001', result_status: 'success', createdAt: '2026-03-25T10:35:00Z' },
  { _id: '2', pair: 'eth_mxn', side: 'sell', amount: '0.5', price: '45200', total_value: '22600', bitso_order_id: 'ORD-2026-002', result_status: 'success', createdAt: '2026-03-24T14:20:00Z' },
  { _id: '3', pair: 'xrp_mxn', side: 'buy', amount: '500', price: '12.5', total_value: '6250', bitso_order_id: 'ORD-2026-003', result_status: 'failed', createdAt: '2026-03-23T09:10:00Z' },
];

const SAMPLE_SIGNALS: SignalRecord[] = [
  { _id: '1', pair: 'btc_mxn', signal_type: 'BUY', confidence: 78, status: 'approved', createdAt: '2026-03-25T10:30:00Z' },
  { _id: '2', pair: 'eth_mxn', signal_type: 'SELL', confidence: 65, status: 'approved', createdAt: '2026-03-24T14:15:00Z' },
  { _id: '3', pair: 'xrp_mxn', signal_type: 'BUY', confidence: 82, status: 'rejected', createdAt: '2026-03-23T09:05:00Z' },
];

export default function TradeHistorySection({ trades, signals, loading, showSample, error }: TradeHistoryProps) {
  const [filterPair, setFilterPair] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const displayTrades = showSample ? SAMPLE_TRADES : trades;
  const displaySignals = showSample ? SAMPLE_SIGNALS : signals;

  const filtered = Array.isArray(displayTrades)
    ? displayTrades.filter((t) => {
      const pairMatch = filterPair === 'all' || t?.pair === filterPair;
      const date = t.createdAt ? new Date(t.createdAt) : null;
      const fromMatch = fromDate ? (date ? date >= new Date(`${fromDate}T00:00:00`) : false) : true;
      const toMatch = toDate ? (date ? date <= new Date(`${toDate}T23:59:59`) : false) : true;
      return pairMatch && fromMatch && toMatch;
    })
    : [];

  const exportCsv = () => {
    if (filtered.length === 0) return;
    const header = ['Date', 'Pair', 'Side', 'Amount', 'Price', 'Total', 'Order ID', 'Status'];
    const rows = filtered.map((trade) => [
      trade.createdAt ? new Date(trade.createdAt).toISOString() : '',
      trade.pair ?? '',
      trade.side ?? '',
      trade.amount ?? '',
      trade.price ?? '',
      trade.total_value ?? '',
      trade.bitso_order_id ?? '',
      trade.result_status ?? '',
    ]);
    const csv = [header, ...rows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trade-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-3 text-sm text-muted-foreground tracking-wider">Loading trade history...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-xl tracking-wider">Trade History</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div className="w-40">
          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Filter by Pair</Label>
          <Select value={filterPair} onValueChange={setFilterPair}>
            <SelectTrigger className="bg-card border-border text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Pairs</SelectItem>
              <SelectItem value="btc_mxn">BTC/MXN</SelectItem>
              <SelectItem value="eth_mxn">ETH/MXN</SelectItem>
              <SelectItem value="xrp_mxn">XRP/MXN</SelectItem>
              <SelectItem value="ltc_mxn">LTC/MXN</SelectItem>
            </SelectContent>
          </Select>
        </div>
          <div>
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">From</Label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-10 rounded border border-border bg-card px-2 text-sm w-full" />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">To</Label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-10 rounded border border-border bg-card px-2 text-sm w-full" />
          </div>
          <button
            type="button"
            onClick={exportCsv}
            disabled={filtered.length === 0}
            className="h-10 rounded border border-border px-3 text-xs uppercase tracking-wider disabled:opacity-50"
          >
            Export CSV
          </button>
        </div>
      </div>

      {error ? (
        <Card className="border-destructive/40 bg-destructive/10">
          <CardContent className="p-3 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      <Card className="bg-card border-border">
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">No trades recorded yet. Execute a trade from the Dashboard to see it here.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 text-[10px] uppercase tracking-widest text-muted-foreground font-normal">Date</th>
                    <th className="text-left p-3 text-[10px] uppercase tracking-widest text-muted-foreground font-normal">Pair</th>
                    <th className="text-left p-3 text-[10px] uppercase tracking-widest text-muted-foreground font-normal">Side</th>
                    <th className="text-left p-3 text-[10px] uppercase tracking-widest text-muted-foreground font-normal">Amount</th>
                    <th className="text-left p-3 text-[10px] uppercase tracking-widest text-muted-foreground font-normal">Price</th>
                    <th className="text-left p-3 text-[10px] uppercase tracking-widest text-muted-foreground font-normal">Total</th>
                    <th className="text-left p-3 text-[10px] uppercase tracking-widest text-muted-foreground font-normal">Order ID</th>
                    <th className="text-left p-3 text-[10px] uppercase tracking-widest text-muted-foreground font-normal">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((trade, idx) => (
                    <tr key={trade?._id ?? idx} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                      <td className="p-3 text-muted-foreground">{trade?.createdAt ? new Date(trade.createdAt).toLocaleDateString() : '--'}</td>
                      <td className="p-3 font-medium">{(trade?.pair ?? '').replace('_', '/').toUpperCase()}</td>
                      <td className="p-3">
                        <Badge className={`text-[10px] tracking-wider uppercase ${trade?.side === 'buy' ? 'bg-emerald-600/20 text-emerald-400 border-emerald-600/30' : 'bg-red-600/20 text-red-400 border-red-600/30'}`}>
                          {trade?.side ?? '--'}
                        </Badge>
                      </td>
                      <td className="p-3">{trade?.amount ?? '--'}</td>
                      <td className="p-3">{trade?.price ? `$${Number(trade.price).toLocaleString()}` : '--'}</td>
                      <td className="p-3">{trade?.total_value ? `$${Number(trade.total_value).toLocaleString()}` : '--'}</td>
                      <td className="p-3 text-muted-foreground text-xs">{trade?.bitso_order_id ?? '--'}</td>
                      <td className="p-3">
                        <Badge variant="outline" className={`text-[10px] tracking-wider uppercase border-border ${trade?.result_status === 'success' ? 'text-emerald-400' : 'text-destructive'}`}>
                          {trade?.result_status ?? '--'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="font-serif tracking-wider text-base">Signal History</CardTitle>
        </CardHeader>
        <CardContent>
          {(!Array.isArray(displaySignals) || displaySignals.length === 0) ? (
            <p className="text-sm text-muted-foreground">No signal history available.</p>
          ) : (
            <div className="space-y-2">
              {displaySignals.map((sig, idx) => (
                <div key={sig?._id ?? idx} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <div className="flex items-center gap-3">
                    <Badge className={`text-[10px] tracking-wider ${(sig?.signal_type ?? '') === 'BUY' ? 'bg-emerald-600/20 text-emerald-400 border-emerald-600/30' : (sig?.signal_type ?? '') === 'SELL' ? 'bg-red-600/20 text-red-400 border-red-600/30' : 'bg-amber-600/20 text-amber-400 border-amber-600/30'}`}>
                      {sig?.signal_type ?? '--'}
                    </Badge>
                    <span className="text-sm">{(sig?.pair ?? '').replace('_', '/').toUpperCase()}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{sig?.confidence ?? 0}%</span>
                    <Badge variant="outline" className="text-[10px] tracking-wider uppercase border-border">{sig?.status ?? 'pending'}</Badge>
                    {sig?.createdAt && <span>{new Date(sig.createdAt).toLocaleDateString()}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
