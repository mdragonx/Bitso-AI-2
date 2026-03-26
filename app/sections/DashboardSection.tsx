'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

interface AnalysisResult {
  signal?: string;
  confidence?: number;
  technical_summary?: string;
  market_summary?: string;
  risk_assessment?: string;
  recommended_entry_price?: string;
  recommended_exit_price?: string;
  stop_loss_price?: string;
  position_size_suggestion?: string;
  reasoning?: string;
}

interface TradeResult {
  status?: string;
  order_id?: string;
  pair?: string;
  side?: string;
  amount?: string;
  price?: string;
  total_value?: string;
  risk_check_passed?: boolean;
  risk_check_details?: string;
  message?: string;
}

interface RecentSignal {
  _id?: string;
  pair?: string;
  signal_type?: string;
  confidence?: number;
  status?: string;
  createdAt?: string;
}

interface BalanceItem {
  currency: string;
  available: string;
  locked: string;
  total: string;
}

interface TickerData {
  last: string;
  high: string;
  low: string;
  volume: string;
  book: string;
}

interface FeeTierInfo {
  maker: number;
  taker: number;
}

interface DashboardProps {
  selectedPair: string;
  onPairChange: (pair: string) => void;
  analysisResult: AnalysisResult | null;
  tradeResult: TradeResult | null;
  analyzing: boolean;
  executing: boolean;
  onRunAnalysis: () => void;
  onExecuteTrade: (amount: string) => void;
  onRejectSignal: () => void;
  recentSignals: RecentSignal[];
  error: string;
  showSample: boolean;
  balances: BalanceItem[];
  ticker: TickerData | null;
  balanceLoading: boolean;
  hasApiKeys: boolean;
  feeTier: FeeTierInfo;
  behavioralPosition: string;
  riskViolation?: {
    risk_violation_code: string;
    details?: Record<string, any>;
  } | null;
}

const PAIRS = ['btc_mxn', 'eth_mxn', 'xrp_mxn', 'ltc_mxn'];

const SAMPLE_ANALYSIS: AnalysisResult = {
  signal: 'BUY',
  confidence: 78,
  technical_summary: '**RSI** at 42.3 (neutral-oversold). **MACD** showing bullish crossover with histogram turning positive. **SMA-50** above **SMA-200** confirming long-term uptrend. Bollinger Bands narrowing, suggesting imminent breakout.',
  market_summary: 'Bitcoin dominance at 52.1% with increasing institutional inflows. MXN/USD stable at 17.2. Regulatory environment positive after recent Banxico statements on crypto framework.',
  risk_assessment: 'Moderate risk. Volatility index at 28.5 (below average). Key support at $1,580,000 MXN. Resistance at $1,650,000 MXN. Favorable risk/reward ratio of 2.3:1.',
  recommended_entry_price: '$1,595,000 MXN',
  recommended_exit_price: '$1,650,000 MXN',
  stop_loss_price: '$1,570,000 MXN',
  position_size_suggestion: '0.015 BTC (~$23,925 MXN)',
  reasoning: 'Technical indicators align with bullish momentum. The MACD crossover combined with RSI recovery from oversold territory suggests a high-probability entry point. Market fundamentals support the position with stable MXN and positive regulatory sentiment.',
};

const SAMPLE_SIGNALS: RecentSignal[] = [
  { _id: '1', pair: 'btc_mxn', signal_type: 'BUY', confidence: 78, status: 'approved', createdAt: '2026-03-25T10:30:00Z' },
  { _id: '2', pair: 'eth_mxn', signal_type: 'HOLD', confidence: 55, status: 'pending', createdAt: '2026-03-25T09:15:00Z' },
  { _id: '3', pair: 'xrp_mxn', signal_type: 'SELL', confidence: 82, status: 'approved', createdAt: '2026-03-24T16:45:00Z' },
];

function renderMarkdown(text: string) {
  if (!text) return null;
  return (
    <div className="space-y-1.5">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### ')) return <h4 key={i} className="font-semibold text-sm mt-3 mb-1">{line.slice(4)}</h4>;
        if (line.startsWith('## ')) return <h3 key={i} className="font-semibold text-base mt-3 mb-1">{line.slice(3)}</h3>;
        if (line.startsWith('# ')) return <h2 key={i} className="font-bold text-lg mt-4 mb-2">{line.slice(2)}</h2>;
        if (line.startsWith('- ') || line.startsWith('* ')) return <li key={i} className="ml-4 list-disc text-sm leading-relaxed">{formatInline(line.slice(2))}</li>;
        if (/^\d+\.\s/.test(line)) return <li key={i} className="ml-4 list-decimal text-sm leading-relaxed">{formatInline(line.replace(/^\d+\.\s/, ''))}</li>;
        if (!line.trim()) return <div key={i} className="h-1" />;
        return <p key={i} className="text-sm leading-relaxed">{formatInline(line)}</p>;
      })}
    </div>
  );
}

function formatInline(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) => i % 2 === 1 ? <strong key={i} className="font-semibold text-foreground">{part}</strong> : part);
}

function SignalBadge({ signal }: { signal?: string }) {
  const s = (signal ?? '').toUpperCase();
  if (s === 'BUY') return <Badge className="bg-emerald-600/20 text-emerald-400 border-emerald-600/30 tracking-wider text-xs"><TrendingUp className="h-3 w-3 mr-1" />BUY</Badge>;
  if (s === 'SELL') return <Badge className="bg-red-600/20 text-red-400 border-red-600/30 tracking-wider text-xs"><TrendingDown className="h-3 w-3 mr-1" />SELL</Badge>;
  return <Badge className="bg-amber-600/20 text-amber-400 border-amber-600/30 tracking-wider text-xs"><Minus className="h-3 w-3 mr-1" />HOLD</Badge>;
}

const SAMPLE_BALANCES: BalanceItem[] = [
  { currency: 'btc', available: '0.04521', locked: '0.00000', total: '0.04521' },
  { currency: 'eth', available: '1.25000', locked: '0.00000', total: '1.25000' },
  { currency: 'mxn', available: '45230.50', locked: '0.00', total: '45230.50' },
  { currency: 'xrp', available: '500.000', locked: '0.000', total: '500.000' },
];

const SAMPLE_TICKER: TickerData = {
  last: '1,598,450.00',
  high: '1,625,000.00',
  low: '1,570,200.00',
  volume: '42.35',
  book: 'btc_mxn',
};

const BEHAVIOR_LABELS: Record<string, { label: string; color: string }> = {
  conservative: { label: 'Conservative', color: 'text-blue-400' },
  moderate: { label: 'Moderate', color: 'text-primary' },
  aggressive: { label: 'Aggressive', color: 'text-red-400' },
};

export default function DashboardSection({
  selectedPair, onPairChange, analysisResult, tradeResult, analyzing, executing,
  onRunAnalysis, onExecuteTrade, onRejectSignal, recentSignals, error, showSample,
  balances, ticker, balanceLoading, hasApiKeys, feeTier, behavioralPosition, riskViolation,
}: DashboardProps) {
  const [tradeAmount, setTradeAmount] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  const data = showSample ? SAMPLE_ANALYSIS : analysisResult;
  const signals = showSample ? SAMPLE_SIGNALS : recentSignals;
  const displayBalances = showSample ? SAMPLE_BALANCES : balances;
  const displayTicker = showSample ? SAMPLE_TICKER : ticker;
  const signalUpper = (data?.signal ?? '').toUpperCase();
  const canExecute = signalUpper === 'BUY' || signalUpper === 'SELL';

  const pairBase = selectedPair.split('_')[0]?.toUpperCase() || '';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="w-48">
          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Trading Pair</Label>
          <Select value={selectedPair} onValueChange={onPairChange}>
            <SelectTrigger className="bg-card border-border"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAIRS.map((p) => <SelectItem key={p} value={p}>{p.replace('_', '/').toUpperCase()}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="mt-5">
          <Button onClick={onRunAnalysis} disabled={analyzing} className="bg-primary text-primary-foreground hover:bg-primary/90 tracking-wider text-xs uppercase px-8">
            {analyzing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analyzing Market...</> : 'Run Analysis'}
          </Button>
        </div>
        <div className="mt-5 flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Strategy:</span>
          <Badge className={`tracking-wider text-xs ${BEHAVIOR_LABELS[behavioralPosition]?.color ?? 'text-primary'} bg-muted/40 border-border`}>
            {BEHAVIOR_LABELS[behavioralPosition]?.label ?? 'Moderate'}
          </Badge>
        </div>
      </div>

      {/* Live Ticker */}
      {displayTicker && (
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Last Price</p>
                <p className="text-2xl font-serif font-medium text-primary tracking-wider">${displayTicker.last}</p>
              </div>
              <div className="flex gap-6">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">24h High</p>
                  <p className="text-sm font-medium text-emerald-400">${displayTicker.high}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">24h Low</p>
                  <p className="text-sm font-medium text-red-400">${displayTicker.low}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Volume</p>
                  <p className="text-sm font-medium">{displayTicker.volume} {pairBase}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Portfolio Balances */}
      {(displayBalances.length > 0 || balanceLoading) && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="font-serif tracking-wider text-base">Portfolio Balances</CardTitle>
          </CardHeader>
          <CardContent>
            {balanceLoading ? (
              <div className="flex items-center gap-2 py-4">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Loading balances...</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {displayBalances.filter((b: BalanceItem) => parseFloat(b.total) > 0.01).map((b: BalanceItem) => (
                  <div key={b.currency} className="p-3 bg-muted/30 border border-border">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{b.currency.toUpperCase()}</p>
                    <p className="text-lg font-medium mt-1">{parseFloat(b.available).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })}</p>
                    {parseFloat(b.locked) > 0 && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">Locked: {b.locked}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
            {!hasApiKeys && !showSample && (
              <p className="text-xs text-muted-foreground mt-2">Connect your Bitso API keys in API Settings to see live balances.</p>
            )}
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="p-4 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {data && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="font-serif tracking-wider text-lg">Market Recommendation</CardTitle>
              <div className="flex items-center gap-3">
                <SignalBadge signal={data.signal} />
                <span className="text-sm text-muted-foreground">{data.confidence ?? 0}% confidence</span>
              </div>
            </div>
            <div className="w-full bg-muted h-1.5 mt-2">
              <div className="h-1.5 bg-primary transition-all duration-500" style={{ width: `${data.confidence ?? 0}%` }} />
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Entry Price</p>
                <p className="text-sm font-medium">{data.recommended_entry_price ?? '--'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Exit Price</p>
                <p className="text-sm font-medium">{data.recommended_exit_price ?? '--'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Stop Loss</p>
                <p className="text-sm font-medium text-destructive">{data.stop_loss_price ?? '--'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Position Size</p>
                <p className="text-sm font-medium">{data.position_size_suggestion ?? '--'}</p>
              </div>
            </div>

            <div className="border-t border-border pt-4 space-y-3">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Technical Summary</p>
                {renderMarkdown(data.technical_summary ?? '')}
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Market Summary</p>
                {renderMarkdown(data.market_summary ?? '')}
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Risk Assessment</p>
                {renderMarkdown(data.risk_assessment ?? '')}
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Reasoning</p>
                {renderMarkdown(data.reasoning ?? '')}
              </div>
            </div>

            {canExecute && !showSample && (
              <div className="border-t border-border pt-4 flex items-center gap-3">
                <Button onClick={() => setShowConfirm(true)} className="bg-primary text-primary-foreground hover:bg-primary/90 tracking-wider text-xs uppercase">Execute Trade</Button>
                <Button variant="outline" onClick={onRejectSignal} className="tracking-wider text-xs uppercase border-border">Reject Signal</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {showConfirm && (() => {
        // Commission calculation
        const entryPriceStr = data?.recommended_entry_price ?? '0';
        const entryPriceNum = parseFloat(entryPriceStr.replace(/[^0-9.]/g, '')) || 0;
        const amountNum = parseFloat(tradeAmount) || 0;
        const estimatedTotal = amountNum * entryPriceNum;
        const takerFeeRate = feeTier.taker;
        const makerFeeRate = feeTier.maker;
        const takerFee = estimatedTotal * takerFeeRate;
        const makerFee = estimatedTotal * makerFeeRate;
        const totalWithTakerFee = estimatedTotal + takerFee;

        return (
          <Card className="bg-card border-primary/30">
            <CardHeader>
              <CardTitle className="font-serif tracking-wider text-base">Confirm Trade Execution</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Pair:</span> <span className="ml-2">{selectedPair.replace('_', '/').toUpperCase()}</span></div>
                <div><span className="text-muted-foreground">Signal:</span> <span className="ml-2">{data?.signal}</span></div>
                <div><span className="text-muted-foreground">Entry:</span> <span className="ml-2">{data?.recommended_entry_price}</span></div>
                <div><span className="text-muted-foreground">Stop Loss:</span> <span className="ml-2">{data?.stop_loss_price}</span></div>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Trade Amount ({pairBase})</Label>
                <Input type="text" placeholder={`e.g. 0.015 ${pairBase}`} value={tradeAmount} onChange={(e) => setTradeAmount(e.target.value)} className="bg-input border-border mt-1" />
              </div>
              {riskViolation && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs">
                  <p className="font-medium text-destructive mb-1">Risk constraint violation: {riskViolation.risk_violation_code}</p>
                  {riskViolation.details?.requested_book && (
                    <p className="text-destructive/90">Requested pair: {String(riskViolation.details.requested_book).toUpperCase().replace('_', '/')}</p>
                  )}
                  {riskViolation.details?.allowed_pairs && (
                    <p className="text-destructive/90">Allowed pairs: {Array.isArray(riskViolation.details.allowed_pairs) ? riskViolation.details.allowed_pairs.map((p: string) => String(p).toUpperCase().replace('_', '/')).join(', ') : ''}</p>
                  )}
                  {typeof riskViolation.details?.requested_notional === 'number' && (
                    <p className="text-destructive/90">Requested notional: ${riskViolation.details.requested_notional.toLocaleString(undefined, { maximumFractionDigits: 2 })} MXN</p>
                  )}
                  {typeof riskViolation.details?.max_trade_amount === 'number' && (
                    <p className="text-destructive/90">Max per trade: ${riskViolation.details.max_trade_amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} MXN</p>
                  )}
                  {typeof riskViolation.details?.todays_notional === 'number' && typeof riskViolation.details?.daily_limit === 'number' && (
                    <p className="text-destructive/90">Used today: ${riskViolation.details.todays_notional.toLocaleString(undefined, { maximumFractionDigits: 2 })} / ${riskViolation.details.daily_limit.toLocaleString(undefined, { maximumFractionDigits: 2 })} MXN</p>
                  )}
                </div>
              )}

              {/* Commission / Cost Breakdown */}
              {amountNum > 0 && entryPriceNum > 0 && (
                <div className="p-4 bg-muted/30 border border-border space-y-3">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Transaction Cost Breakdown</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subtotal ({amountNum} {pairBase} x ${entryPriceNum.toLocaleString()})</span>
                      <span>${estimatedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Taker Fee ({(takerFeeRate * 100).toFixed(2)}%) — market order</span>
                      <span className="text-amber-400">${takerFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Maker Fee ({(makerFeeRate * 100).toFixed(2)}%) — if limit order</span>
                      <span>${makerFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN</span>
                    </div>
                    <div className="border-t border-border pt-2 flex justify-between font-medium">
                      <span>Estimated Total (market order)</span>
                      <span className="text-primary">${totalWithTakerFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <Button onClick={() => { onExecuteTrade(tradeAmount); setShowConfirm(false); }} disabled={executing || !tradeAmount} className="bg-primary text-primary-foreground hover:bg-primary/90 tracking-wider text-xs uppercase">
                  {executing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Executing...</> : 'Confirm & Execute'}
                </Button>
                <Button variant="outline" onClick={() => setShowConfirm(false)} className="border-border tracking-wider text-xs uppercase">Cancel</Button>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {tradeResult && (
        <Card className={`border ${tradeResult.status === 'success' ? 'border-emerald-600/30 bg-emerald-900/10' : 'border-destructive/30 bg-destructive/10'}`}>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              {tradeResult.status === 'success' ? <CheckCircle className="h-5 w-5 text-emerald-400" /> : <XCircle className="h-5 w-5 text-destructive" />}
              <p className="font-medium text-sm">{tradeResult.message ?? (tradeResult.status === 'success' ? 'Trade executed successfully' : 'Trade failed')}</p>
            </div>
            {tradeResult.order_id && <p className="text-xs text-muted-foreground">Order ID: {tradeResult.order_id}</p>}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              {tradeResult.pair && <div><span className="text-muted-foreground">Pair:</span> {tradeResult.pair}</div>}
              {tradeResult.side && <div><span className="text-muted-foreground">Side:</span> {tradeResult.side}</div>}
              {tradeResult.amount && <div><span className="text-muted-foreground">Amount:</span> {tradeResult.amount}</div>}
              {tradeResult.total_value && <div><span className="text-muted-foreground">Total:</span> {tradeResult.total_value}</div>}
            </div>
            {tradeResult.risk_check_details && <p className="text-xs text-muted-foreground mt-1">{tradeResult.risk_check_details}</p>}
          </CardContent>
        </Card>
      )}

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="font-serif tracking-wider text-base">Recent Signals</CardTitle>
        </CardHeader>
        <CardContent>
          {(signals?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No recent signals. Run an analysis to generate your first recommendation.</p>
          ) : (
            <div className="space-y-2">
              {Array.isArray(signals) && signals.map((sig, idx) => (
                <div key={sig?._id ?? idx} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-3">
                    <SignalBadge signal={sig?.signal_type} />
                    <span className="text-sm font-medium">{(sig?.pair ?? '').replace('_', '/').toUpperCase()}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
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
