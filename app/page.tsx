'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AuthProvider, ProtectedRoute, LoginForm, RegisterForm, UserMenu } from 'lyzr-architect/client';
import { callAIAgent } from '@/lib/aiAgent';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import Sidebar from './sections/Sidebar';
import DashboardSection from './sections/DashboardSection';
import TradeHistorySection from './sections/TradeHistorySection';
import RiskSettingsSection from './sections/RiskSettingsSection';
import ApiSettingsSection from './sections/ApiSettingsSection';

const MARKET_ANALYSIS_AGENT = '69c440a030aebe1ba52aede0';
const TRADE_EXECUTION_AGENT = '69c440b01b19ba3adafaf1d7';

const THEME_VARS = {
  '--background': '30 8% 6%',
  '--foreground': '30 10% 90%',
  '--card': '30 6% 9%',
  '--card-foreground': '30 10% 90%',
  '--primary': '40 50% 55%',
  '--primary-foreground': '30 8% 6%',
  '--secondary': '30 5% 14%',
  '--secondary-foreground': '30 10% 85%',
  '--accent': '40 60% 60%',
  '--muted': '30 5% 18%',
  '--muted-foreground': '30 8% 55%',
  '--border': '30 6% 20%',
  '--input': '30 5% 25%',
  '--ring': '40 50% 55%',
  '--destructive': '0 50% 50%',
  '--radius': '0rem',
} as React.CSSProperties;

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
          <div className="text-center p-8 max-w-md">
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground mb-4 text-sm">{this.state.error}</p>
            <button onClick={() => this.setState({ hasError: false, error: '' })} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm">Try again</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  return (
    <div style={THEME_VARS} className="min-h-screen bg-background text-foreground flex items-center justify-center">
      <div className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <h1 className="font-serif text-3xl tracking-widest text-primary font-medium">BITSO</h1>
          <p className="text-xs text-muted-foreground tracking-wider mt-2">CRYPTO TRADING AGENT</p>
        </div>
        {mode === 'login' ? (
          <LoginForm onSwitchToRegister={() => setMode('register')} />
        ) : (
          <RegisterForm onSwitchToLogin={() => setMode('login')} />
        )}
      </div>
    </div>
  );
}

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

export default function Page() {
  const [activeScreen, setActiveScreen] = useState('dashboard');
  const [selectedPair, setSelectedPair] = useState('btc_mxn');
  const [showSample, setShowSample] = useState(false);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);

  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [tradeResult, setTradeResult] = useState<TradeResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState('');

  const [recentSignals, setRecentSignals] = useState<any[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [balances, setBalances] = useState<any[]>([]);
  const [ticker, setTicker] = useState<any>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [hasApiKeys, setHasApiKeys] = useState(false);
  const [behavioralPosition, setBehavioralPosition] = useState('moderate');
  const [feeTier, setFeeTier] = useState({ maker: 0.005, taker: 0.0065 });

  const FEE_TIER_MAP: Record<string, { maker: number; taker: number }> = {
    starter: { maker: 0.005, taker: 0.0065 },
    tier1: { maker: 0.004, taker: 0.005 },
    tier2: { maker: 0.003, taker: 0.004 },
    tier3: { maker: 0.002, taker: 0.003 },
    tier4: { maker: 0.001, taker: 0.002 },
    tier5: { maker: 0.0005, taker: 0.001 },
  };

  const fetchSignals = useCallback(async () => {
    try {
      const res = await fetch('/api/trade_signals');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setRecentSignals(json.data.slice(-5).reverse());
      }
    } catch { /* silent */ }
  }, []);

  const fetchTrades = useCallback(async () => {
    try {
      const res = await fetch('/api/trades');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setTrades(json.data.reverse());
      }
    } catch { /* silent */ }
  }, []);

  const loadRiskSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/risk_settings');
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        const s = json.data[0];
        setBehavioralPosition(s.behavioral_position ?? 'moderate');
        const tierKey = s.fee_tier ?? 'starter';
        setFeeTier(FEE_TIER_MAP[tierKey] ?? FEE_TIER_MAP.starter);
      }
    } catch { /* silent */ }
  }, []);

  const checkApiKeys = useCallback(async () => {
    try {
      const res = await fetch('/api/bitso_credentials');
      const json = await res.json();
      const has = json.success && Array.isArray(json.data) && json.data.length > 0;
      setHasApiKeys(has);
      return has;
    } catch { return false; }
  }, []);

  const fetchBalances = useCallback(async () => {
    setBalanceLoading(true);
    try {
      const res = await fetch('/api/bitso/balance');
      const json = await res.json();
      if (json.success && Array.isArray(json.data?.balances)) {
        setBalances(json.data.balances);
      } else if (json.success && Array.isArray(json.data)) {
        setBalances(json.data);
      }
    } catch { /* silent */ }
    setBalanceLoading(false);
  }, []);

  const fetchTicker = useCallback(async (pair: string) => {
    try {
      const res = await fetch(`/api/bitso/ticker?book=${pair}`);
      const json = await res.json();
      if (json.success && json.data) {
        setTicker(json.data);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchSignals();
    fetchTrades();
    loadRiskSettings();
    checkApiKeys().then((has) => {
      if (has) {
        fetchBalances();
        fetchTicker(selectedPair);
      }
    });
  }, [fetchSignals, fetchTrades, checkApiKeys, fetchBalances, fetchTicker, loadRiskSettings, selectedPair]);

  const handleRunAnalysis = async () => {
    setAnalyzing(true);
    setError('');
    setAnalysisResult(null);
    setTradeResult(null);
    setActiveAgentId(MARKET_ANALYSIS_AGENT);

    try {
      const pairLabel = selectedPair.replace('_', '/').toUpperCase();

      // Fetch real OHLC data from Bitso if API keys are configured
      let ohlcContext = '';
      if (hasApiKeys) {
        try {
          const ohlcRes = await fetch(`/api/bitso/ohlc?book=${selectedPair}&timeframe=1hour`);
          const ohlcJson = await ohlcRes.json();
          if (ohlcJson.success && ohlcJson.data) {
            const candles = Array.isArray(ohlcJson.data) ? ohlcJson.data.slice(-50) : [];
            ohlcContext = `\n\nHere is the latest OHLC data (last 50 1-hour candles) from the Bitso exchange:\n${JSON.stringify(candles)}`;
          }
        } catch { /* continue without OHLC data */ }

        // Also include current balances for position sizing context
        if (balances.length > 0) {
          ohlcContext += `\n\nCurrent portfolio balances: ${JSON.stringify(balances.filter(b => parseFloat(b.total) > 0).map(b => ({ currency: b.currency, available: b.available })))}`;
        }
      }

      const behaviorInstruction = behavioralPosition === 'conservative'
        ? 'INVESTMENT STRATEGY: Conservative. Only recommend BUY/SELL on high-confidence signals (>75%). Prefer HOLD for uncertain conditions. Suggest smaller position sizes and tighter stop-losses. Prioritize capital preservation.'
        : behavioralPosition === 'aggressive'
        ? 'INVESTMENT STRATEGY: Aggressive. Act on signals with >45% confidence. Suggest larger position sizes and wider stop-losses. Actively seek momentum plays and breakout opportunities. Higher risk tolerance.'
        : 'INVESTMENT STRATEGY: Moderate. Act on signals with >60% confidence. Standard position sizes with balanced stop-losses. Follow market trends with measured risk/reward.';

      const result = await callAIAgent(
        `${behaviorInstruction}\n\nAnalyze the current market conditions for ${pairLabel}. Provide a buy/sell/hold recommendation with confidence score, technical analysis summary, market research summary, risk assessment, recommended entry price, exit price, stop-loss price, and position size suggestion.${ohlcContext}`,
        MARKET_ANALYSIS_AGENT
      );

      if (result.success) {
        const parsed = result?.response?.result ?? result?.response ?? {};
        const data: AnalysisResult = typeof parsed === 'string' ? (() => { try { return JSON.parse(parsed); } catch { return { reasoning: parsed }; } })() : parsed;
        setAnalysisResult(data);

        await fetch('/api/trade_signals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pair: selectedPair,
            signal_type: (data.signal ?? 'HOLD').toUpperCase(),
            confidence: data.confidence ?? 0,
            indicators: { technical_summary: data.technical_summary, market_summary: data.market_summary },
            market_context: data.market_summary ?? '',
            risk_assessment: data.risk_assessment ?? '',
            reasoning: data.reasoning ?? '',
            recommended_entry_price: data.recommended_entry_price ?? '',
            recommended_exit_price: data.recommended_exit_price ?? '',
            stop_loss_price: data.stop_loss_price ?? '',
            position_size_suggestion: data.position_size_suggestion ?? '',
            status: 'pending',
          }),
        });
        await fetchSignals();
      } else {
        setError('Analysis failed. Please try again.');
      }
    } catch (err: any) {
      setError(err?.message ?? 'An error occurred during analysis.');
    }
    setActiveAgentId(null);
    setAnalyzing(false);
  };

  const handleExecuteTrade = async (amount: string) => {
    if (!analysisResult) return;
    setExecuting(true);
    setError('');
    setActiveAgentId(TRADE_EXECUTION_AGENT);

    try {
      const pairLabel = selectedPair.replace('_', '/').toUpperCase();
      const side = (analysisResult.signal ?? 'BUY').toLowerCase();

      // If API keys are available, also execute the order via our proxy
      let directTradeResult = '';
      if (hasApiKeys) {
        try {
          const orderRes = await fetch('/api/bitso/order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              book: selectedPair,
              side: side,
              type: 'market',
              major: amount,
            }),
          });
          const orderJson = await orderRes.json();
          if (orderJson.success) {
            directTradeResult = `\n\nThe order has been placed successfully on Bitso. Order response: ${JSON.stringify(orderJson.data)}`;
          } else {
            directTradeResult = `\n\nBitso API order attempt result: ${orderJson.error || 'Failed'}. Please report the actual outcome.`;
          }
        } catch (orderErr: any) {
          directTradeResult = `\n\nDirect Bitso API order attempt failed: ${orderErr.message}`;
        }
      }

      const result = await callAIAgent(
        `Execute a ${side} order for ${pairLabel}. Amount: ${amount}. Entry price: ${analysisResult.recommended_entry_price ?? 'market'}. Stop-loss: ${analysisResult.stop_loss_price ?? 'none'}. This trade has been approved by the user.${directTradeResult}`,
        TRADE_EXECUTION_AGENT
      );

      if (result.success) {
        const parsed = result?.response?.result ?? result?.response ?? {};
        const data: TradeResult = typeof parsed === 'string' ? (() => { try { return JSON.parse(parsed); } catch { return { message: parsed }; } })() : parsed;
        setTradeResult(data);

        const lastSignal = recentSignals[0];
        if (lastSignal?._id) {
          await fetch('/api/trade_signals', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: lastSignal._id, status: 'approved' }),
          });
        }

        await fetch('/api/trades', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            signal_id: lastSignal?._id ?? '',
            pair: selectedPair,
            side: data.side ?? side,
            amount: data.amount ?? amount,
            price: data.price ?? '',
            total_value: data.total_value ?? '',
            bitso_order_id: data.order_id ?? '',
            result_status: data.status ?? 'unknown',
            risk_check_details: data.risk_check_details ?? '',
          }),
        });
        await fetchSignals();
        await fetchTrades();
        // Refresh balances after trade
        if (hasApiKeys) { fetchBalances(); }
      } else {
        setError('Trade execution failed. Please try again.');
      }
    } catch (err: any) {
      setError(err?.message ?? 'An error occurred during trade execution.');
    }
    setActiveAgentId(null);
    setExecuting(false);
  };

  const handleRejectSignal = async () => {
    const lastSignal = recentSignals[0];
    if (lastSignal?._id) {
      await fetch('/api/trade_signals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: lastSignal._id, status: 'rejected' }),
      });
      await fetchSignals();
    }
    setAnalysisResult(null);
  };

  useEffect(() => {
    if (activeScreen === 'history') {
      setHistoryLoading(true);
      Promise.all([fetchSignals(), fetchTrades()]).finally(() => setHistoryLoading(false));
    }
  }, [activeScreen, fetchSignals, fetchTrades]);

  return (
    <AuthProvider>
      <ErrorBoundary>
        <ProtectedRoute unauthenticatedFallback={<AuthScreen />}>
          <div style={THEME_VARS} className="min-h-screen bg-background text-foreground flex">
            <Sidebar activeScreen={activeScreen} onNavigate={setActiveScreen} activeAgentId={activeAgentId} hasApiKeys={hasApiKeys} behavioralPosition={behavioralPosition} />

            <div className="flex-1 flex flex-col min-h-screen">
              <header className="h-14 border-b border-border flex items-center justify-between px-6">
                <div className="flex items-center gap-4">
                  <span className="text-sm text-muted-foreground tracking-wider">{selectedPair.replace('_', '/').toUpperCase()}</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch id="sample-toggle" checked={showSample} onCheckedChange={setShowSample} />
                    <Label htmlFor="sample-toggle" className="text-xs text-muted-foreground tracking-wider cursor-pointer">Sample Data</Label>
                  </div>
                  <UserMenu />
                </div>
              </header>

              <main className="flex-1 p-6 overflow-y-auto">
                {activeScreen === 'dashboard' && (
                  <DashboardSection
                    selectedPair={selectedPair}
                    onPairChange={setSelectedPair}
                    analysisResult={analysisResult}
                    tradeResult={tradeResult}
                    analyzing={analyzing}
                    executing={executing}
                    onRunAnalysis={handleRunAnalysis}
                    onExecuteTrade={handleExecuteTrade}
                    onRejectSignal={handleRejectSignal}
                    recentSignals={recentSignals}
                    error={error}
                    showSample={showSample}
                    balances={balances}
                    ticker={ticker}
                    balanceLoading={balanceLoading}
                    hasApiKeys={hasApiKeys}
                    feeTier={feeTier}
                    behavioralPosition={behavioralPosition}
                  />
                )}
                {activeScreen === 'history' && (
                  <TradeHistorySection
                    trades={trades}
                    signals={recentSignals}
                    loading={historyLoading}
                    showSample={showSample}
                  />
                )}
                {activeScreen === 'risk' && (
                  <RiskSettingsSection showSample={showSample} onSettingsChanged={loadRiskSettings} />
                )}
                {activeScreen === 'api-settings' && (
                  <ApiSettingsSection onCredentialsSaved={() => {
                    checkApiKeys().then((has) => {
                      if (has) { fetchBalances(); fetchTicker(selectedPair); }
                      else { setBalances([]); setTicker(null); }
                    });
                  }} />
                )}
              </main>
            </div>
          </div>
        </ProtectedRoute>
      </ErrorBoundary>
    </AuthProvider>
  );
}
