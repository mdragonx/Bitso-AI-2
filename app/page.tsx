'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { callAIAgent } from '@/lib/aiAgent';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import Sidebar from './sections/Sidebar';
import DashboardSection from './sections/DashboardSection';
import TradeHistorySection from './sections/TradeHistorySection';
import RiskSettingsSection from './sections/RiskSettingsSection';
import ApiSettingsSection from './sections/ApiSettingsSection';
import SchedulerSection from './sections/SchedulerSection';
import { clientFeatureFlags } from '@/lib/featureFlags';
import { AUTH_EVENT, apiFetch, apiFetchJson } from '@/lib/apiClient';

const MARKET_ANALYSIS_AGENT = '69c440a030aebe1ba52aede0';

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

const FEE_TIER_MAP: Record<string, { maker: number; taker: number }> = {
  starter: { maker: 0.005, taker: 0.0065 },
  tier1: { maker: 0.004, taker: 0.005 },
  tier2: { maker: 0.003, taker: 0.004 },
  tier3: { maker: 0.002, taker: 0.003 },
  tier4: { maker: 0.001, taker: 0.002 },
  tier5: { maker: 0.0005, taker: 0.001 },
};

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

function AuthProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function LoginForm({ onSwitchToRegister }: { onSwitchToRegister: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || 'Login failed');
        return;
      }
      window.location.reload();
    } catch {
      setError('Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input className="w-full rounded border border-border bg-background px-3 py-2 text-sm" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input className="w-full rounded border border-border bg-background px-3 py-2 text-sm" placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button disabled={loading} className="w-full rounded bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-60">{loading ? 'Signing in...' : 'Sign in'}</button>
      <button type="button" onClick={onSwitchToRegister} className="w-full text-xs text-muted-foreground underline">Create account</button>
    </form>
  );
}

function RegisterForm({ onSwitchToLogin }: { onSwitchToLogin: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || 'Register failed');
        return;
      }
      window.location.reload();
    } catch {
      setError('Register failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input className="w-full rounded border border-border bg-background px-3 py-2 text-sm" placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
      <input className="w-full rounded border border-border bg-background px-3 py-2 text-sm" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input className="w-full rounded border border-border bg-background px-3 py-2 text-sm" placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button disabled={loading} className="w-full rounded bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-60">{loading ? 'Creating...' : 'Create account'}</button>
      <button type="button" onClick={onSwitchToLogin} className="w-full text-xs text-muted-foreground underline">Back to login</button>
    </form>
  );
}

function UserMenu() {
  const [loading, setLoading] = useState(false);
  const onLogout = async () => {
    setLoading(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.reload();
  };

  return <button onClick={onLogout} disabled={loading} className="text-xs text-muted-foreground underline">{loading ? 'Signing out...' : 'Sign out'}</button>;
}

function ProtectedRoute({ unauthenticatedFallback, children }: { unauthenticatedFallback: React.ReactNode; children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    apiFetch('/api/auth/me', { cache: 'no-store' })
      .then(() => {
        setAuthenticated(true);
      })
      .catch(() => setAuthenticated(false))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;
  return authenticated ? <>{children}</> : <>{unauthenticatedFallback}</>;
}

function AuthScreen({ message }: { message?: string }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  return (
    <div style={THEME_VARS} className="min-h-screen bg-background text-foreground flex items-center justify-center">
      <div className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <h1 className="font-serif text-3xl tracking-widest text-primary font-medium">BITSO</h1>
          <p className="text-xs text-muted-foreground tracking-wider mt-2">CRYPTO TRADING AGENT</p>
        </div>
        {message ? <p className="mb-4 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">{message}</p> : null}
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
  confidence?: number | { score?: number; explanation?: string };
  confidence_explanation?: string;
  technical_summary?: string;
  market_summary?: string;
  indicator_summary?: {
    technical_analysis?: string;
    market_research?: string;
  };
  risk_assessment?: string;
  recommended_entry_price?: string;
  recommended_exit_price?: string;
  stop_loss_price?: string;
  position_size_suggestion?: string;
  reasoning?: string;
  reasoning_trace?: string;
}

interface TradeResult {
  status?: string;
  order_id?: string;
  idempotency_key?: string;
  pair?: string;
  side?: string;
  amount?: string;
  price?: string;
  total_value?: string;
  risk_check_passed?: boolean;
  risk_check_details?: string;
  message?: string;
  backend_action?: string;
}

interface RiskViolation {
  risk_violation_code: string;
  details?: Record<string, any>;
}

interface MarketContextItem {
  type: 'news' | 'sentiment';
  source: string;
  title: string;
  summary: string;
  url: string;
  published_at: string;
}

interface MarketContextPayload {
  approved_sources?: {
    news?: string[];
    sentiment?: string[];
  };
  items?: MarketContextItem[];
  generated_at?: string;
}

export default function Page() {
  const getConfidenceScore = (confidence: AnalysisResult['confidence']): number => {
    if (typeof confidence === 'number') return confidence;
    if (confidence && typeof confidence === 'object' && typeof confidence.score === 'number') return confidence.score;
    return 0;
  };

  const [activeScreen, setActiveScreen] = useState('dashboard');
  const [selectedPair, setSelectedPair] = useState('btc_mxn');
  const [showSample, setShowSample] = useState(false);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState('');

  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [tradeResult, setTradeResult] = useState<TradeResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState('');
  const [riskViolation, setRiskViolation] = useState<RiskViolation | null>(null);

  const [recentSignals, setRecentSignals] = useState<any[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [balances, setBalances] = useState<any[]>([]);
  const [ticker, setTicker] = useState<any>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [hasApiKeys, setHasApiKeys] = useState(false);
  const [behavioralPosition, setBehavioralPosition] = useState('moderate');
  const [feeTier, setFeeTier] = useState({ maker: 0.005, taker: 0.0065 });

  const fetchSignals = useCallback(async () => {
    try {
      const json = await apiFetchJson<any>('/api/trade_signals');
      if (json.success && Array.isArray(json.data)) {
        setRecentSignals(json.data.slice(-5).reverse());
      }
    } catch { /* silent */ }
  }, []);

  const fetchTrades = useCallback(async () => {
    try {
      const json = await apiFetchJson<any>('/api/trades');
      if (json.success && Array.isArray(json.data)) {
        setTrades(json.data.reverse());
      }
    } catch { /* silent */ }
  }, []);

  const loadRiskSettings = useCallback(async () => {
    try {
      const json = await apiFetchJson<any>('/api/risk_settings');
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
      const json = await apiFetchJson<any>('/api/bitso_credentials');
      const has = json.success && Array.isArray(json.data) && json.data.length > 0;
      setHasApiKeys(has);
      return has;
    } catch { return false; }
  }, []);

  const fetchBalances = useCallback(async () => {
    setBalanceLoading(true);
    try {
      const json = await apiFetchJson<any>('/api/bitso/balance');
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
      const json = await apiFetchJson<any>(`/api/bitso/ticker?book=${pair}`);
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
    setRiskViolation(null);
    setActiveAgentId(MARKET_ANALYSIS_AGENT);

    try {
      const pairLabel = selectedPair.replace('_', '/').toUpperCase();

      // Fetch market context and OHLC in parallel before analysis
      let ohlcContext = '';
      let marketContextPayload: MarketContextPayload = {};
      let candles: any[] = [];

      const [marketContextResult, ohlcResult] = await Promise.all([
        apiFetch('/api/market-context', { cache: 'no-store' })
          .then((res) => res.json())
          .catch(() => ({ success: false })),
        hasApiKeys
          ? apiFetch(`/api/bitso/ohlc?book=${selectedPair}&timeframe=1hour`)
            .then((res) => res.json())
            .catch(() => ({ success: false }))
          : Promise.resolve({ success: false }),
      ]);

      if (marketContextResult?.success && marketContextResult?.data) {
        marketContextPayload = marketContextResult.data as MarketContextPayload;
      }

      if (ohlcResult?.success && ohlcResult?.data) {
        candles = Array.isArray(ohlcResult.data) ? ohlcResult.data.slice(-50) : [];
        ohlcContext = `

Here is the latest OHLC data (last 50 1-hour candles) from the Bitso exchange:
${JSON.stringify(candles)}`;
      }

      if (hasApiKeys && balances.length > 0) {
        ohlcContext += `

Current portfolio balances: ${JSON.stringify(
          balances.filter((b) => parseFloat(b.total) > 0).map((b) => ({ currency: b.currency, available: b.available }))
        )}`;
      }

      const contextItems = Array.isArray(marketContextPayload.items) ? marketContextPayload.items : [];
      const marketContextPrompt = contextItems.length > 0
        ? `

Approved market context sources (news + sentiment) for audit-safe reasoning:
${JSON.stringify(contextItems)}`
        : `

Approved market context sources were unavailable for this run.`;

      const behaviorInstruction = behavioralPosition === 'conservative'
        ? 'INVESTMENT STRATEGY: Conservative. Only recommend BUY/SELL on high-confidence signals (>75%). Prefer HOLD for uncertain conditions. Suggest smaller position sizes and tighter stop-losses. Prioritize capital preservation.'
        : behavioralPosition === 'aggressive'
        ? 'INVESTMENT STRATEGY: Aggressive. Act on signals with >45% confidence. Suggest larger position sizes and wider stop-losses. Actively seek momentum plays and breakout opportunities. Higher risk tolerance.'
        : 'INVESTMENT STRATEGY: Moderate. Act on signals with >60% confidence. Standard position sizes with balanced stop-losses. Follow market trends with measured risk/reward.';

      const result = await callAIAgent(
        `${behaviorInstruction}\n\nAnalyze the current market conditions for ${pairLabel}. Provide a buy/sell/hold recommendation with confidence score, technical analysis summary, market research summary, risk assessment, recommended entry price, exit price, stop-loss price, and position size suggestion. Explicitly incorporate the provided market-context sources in your market summary and reasoning sections.${ohlcContext}${marketContextPrompt}`,
        MARKET_ANALYSIS_AGENT,
        {
          metadata: {
            selected_pair: selectedPair,
            timeframe: '1hour',
            ohlc: candles,
            market_context_items: contextItems,
          },
        }
      );

      if (result.success) {
        const parsed = result?.response?.result ?? result?.response ?? {};
        const data: AnalysisResult = typeof parsed === 'string' ? (() => { try { return JSON.parse(parsed); } catch { return { reasoning: parsed }; } })() : parsed;
        setAnalysisResult(data);

        await apiFetch('/api/trade_signals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pair: selectedPair,
            signal_type: (data.signal ?? 'HOLD').toUpperCase(),
            confidence: getConfidenceScore(data.confidence),
            indicators: {
              technical_summary: data.technical_summary ?? data.indicator_summary?.technical_analysis,
              market_summary: data.market_summary ?? data.indicator_summary?.market_research,
            },
            market_context: {
              generated_at: marketContextPayload.generated_at ?? new Date().toISOString(),
              summary: data.market_summary ?? '',
              approved_sources: marketContextPayload.approved_sources ?? {},
              items: contextItems.map((item) => ({
                type: item.type,
                source: item.source,
                title: item.title,
                summary: item.summary,
                url: item.url,
                published_at: item.published_at,
              })),
            },
            risk_assessment: data.risk_assessment ?? '',
            reasoning: data.reasoning_trace ?? data.reasoning ?? '',
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
    setRiskViolation(null);

    try {
      const side = (analysisResult.signal ?? 'BUY').toLowerCase();
      const lastSignal = recentSignals[0];
      const idempotencyKey = `trade-${Date.now()}-${crypto.randomUUID()}`;

      const orderRes = await apiFetch('/api/bitso/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          book: selectedPair,
          side,
          type: 'market',
          major: amount,
          idempotency_key: idempotencyKey,
        }),
      });
      const orderJson = await orderRes.json();

      if (!orderJson.success) {
        if (orderJson.risk_violation_code) {
          setRiskViolation({
            risk_violation_code: orderJson.risk_violation_code,
            details: orderJson.details ?? {},
          });
          setError(orderJson.error || 'Trade rejected by risk settings.');
          setExecuting(false);
          return;
        }

        setError(orderJson.error || 'Trade execution failed.');
        setExecuting(false);
        return;
      }

      const orderPayload = orderJson.data ?? {};
      const orderId = String(orderPayload.oid ?? orderPayload.order_id ?? '');

      if (lastSignal?._id) {
        await apiFetch('/api/trade_signals', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: lastSignal._id, status: 'approved' }),
        });
      }

      await apiFetch('/api/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signal_id: lastSignal?._id ?? '',
          pair: selectedPair,
          side,
          amount,
          price: orderPayload.price ?? analysisResult.recommended_entry_price ?? '',
          total_value: orderPayload.minor ?? '',
          bitso_order_id: orderId,
          result_status: orderPayload.idempotent_replay ? 'replayed' : 'success',
          risk_check_details: orderPayload.idempotent_replay
            ? 'Existing order returned via idempotency key replay.'
            : 'Executed once via /api/bitso/order.',
          idempotency_key: idempotencyKey,
        }),
      });

      setTradeResult({
        status: 'success',
        order_id: orderId,
        idempotency_key: idempotencyKey,
        pair: selectedPair.replace('_', '/').toUpperCase(),
        side,
        amount,
        price: String(orderPayload.price ?? analysisResult.recommended_entry_price ?? ''),
        total_value: String(orderPayload.minor ?? ''),
        risk_check_passed: true,
        risk_check_details: orderPayload.idempotent_replay
          ? 'Order was replay-safe: existing order id returned.'
          : 'Order was executed exactly once by backend order route.',
        backend_action: 'POST /api/bitso/order',
        message: orderPayload.idempotent_replay
          ? 'Order already existed for this action. Existing order id returned.'
          : 'Trade submitted successfully with one backend execution.',
      });

      await fetchSignals();
      await fetchTrades();
      if (hasApiKeys) {
        fetchBalances();
      }
    } catch (err: any) {
      setError(err?.message ?? 'An error occurred during trade execution.');
    }
    setExecuting(false);
  };

  const handleRejectSignal = async () => {
    const lastSignal = recentSignals[0];
    if (lastSignal?._id) {
      await apiFetch('/api/trade_signals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: lastSignal._id, status: 'rejected' }),
      });
      await fetchSignals();
    }
    setAnalysisResult(null);
  };


  const disabledFeatures = [
    !clientFeatureFlags.rag ? 'RAG knowledge base' : null,
    !clientFeatureFlags.upload ? 'file upload' : null,
    !clientFeatureFlags.scheduler ? 'scheduler' : null,
  ].filter(Boolean) as string[];

  useEffect(() => {
    const handleAuthRequired = (event: Event) => {
      const authEvent = event as CustomEvent<{ code?: string }>;
      const code = authEvent.detail?.code;
      setAuthMessage(code === 'SESSION_EXPIRED' ? 'Your session expired. Please sign in again.' : 'Please sign in to continue.');
      setAnalysisResult(null);
      setTradeResult(null);
    };

    window.addEventListener(AUTH_EVENT, handleAuthRequired as EventListener);
    return () => window.removeEventListener(AUTH_EVENT, handleAuthRequired as EventListener);
  }, []);

  useEffect(() => {
    if (activeScreen === 'history') {
      setHistoryLoading(true);
      Promise.all([fetchSignals(), fetchTrades()]).finally(() => setHistoryLoading(false));
    }
  }, [activeScreen, fetchSignals, fetchTrades]);

  return (
    <AuthProvider>
      <ErrorBoundary>
        <ProtectedRoute unauthenticatedFallback={<AuthScreen message={authMessage} />}>
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
                {disabledFeatures.length > 0 && (
                  <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                    Disabled backend features: {disabledFeatures.join(', ')}.
                  </div>
                )}
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
                    riskViolation={riskViolation}
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
                {activeScreen === 'scheduler' && (
                  <SchedulerSection />
                )}
              </main>
            </div>
          </div>
        </ProtectedRoute>
      </ErrorBoundary>
    </AuthProvider>
  );
}
