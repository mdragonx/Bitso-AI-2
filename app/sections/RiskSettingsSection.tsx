'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, CheckCircle, AlertTriangle, Shield, Target, Zap } from 'lucide-react';
import { apiFetch, apiFetchJson } from '@/lib/apiClient';

interface RiskSettingsProps {
  showSample: boolean;
  onSettingsChanged?: () => void;
}

const ALL_PAIRS = ['BTC/MXN', 'ETH/MXN', 'XRP/MXN', 'LTC/MXN'];

const BEHAVIORAL_POSITIONS = [
  {
    id: 'conservative',
    label: 'Conservative',
    icon: Shield,
    description: 'Prioritize capital preservation. Only execute high-confidence signals (>75%). Smaller position sizes, tighter stop-losses, prefer HOLD over marginal signals.',
    color: 'text-blue-400',
    bgColor: 'bg-blue-600/10 border-blue-600/20',
  },
  {
    id: 'moderate',
    label: 'Moderate',
    icon: Target,
    description: 'Balanced risk/reward approach. Execute signals with >60% confidence. Standard position sizes, moderate stop-losses, follow market trends.',
    color: 'text-primary',
    bgColor: 'bg-primary/10 border-primary/20',
  },
  {
    id: 'aggressive',
    label: 'Aggressive',
    icon: Zap,
    description: 'Maximize returns with higher risk tolerance. Execute signals with >45% confidence. Larger position sizes, wider stop-losses, actively seek momentum plays.',
    color: 'text-red-400',
    bgColor: 'bg-red-600/10 border-red-600/20',
  },
];

const FEE_TIERS = [
  { id: 'starter', label: 'Starter (< $100K MXN)', maker: '0.50%', taker: '0.65%' },
  { id: 'tier1', label: 'Tier 1 ($100K - $500K)', maker: '0.40%', taker: '0.50%' },
  { id: 'tier2', label: 'Tier 2 ($500K - $2M)', maker: '0.30%', taker: '0.40%' },
  { id: 'tier3', label: 'Tier 3 ($2M - $10M)', maker: '0.20%', taker: '0.30%' },
  { id: 'tier4', label: 'Tier 4 ($10M - $50M)', maker: '0.10%', taker: '0.20%' },
  { id: 'tier5', label: 'Tier 5 (> $50M)', maker: '0.05%', taker: '0.10%' },
];

export default function RiskSettingsSection({ showSample, onSettingsChanged }: RiskSettingsProps) {
  const [maxTradeAmount, setMaxTradeAmount] = useState('1000');
  const [dailyLimit, setDailyLimit] = useState('5000');
  const [stopLossPct, setStopLossPct] = useState('5');
  const [allowedPairs, setAllowedPairs] = useState<string[]>(['BTC/MXN', 'ETH/MXN', 'XRP/MXN', 'LTC/MXN']);
  const [behavioralPosition, setBehavioralPosition] = useState('moderate');
  const [feeTier, setFeeTier] = useState('starter');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [statusType, setStatusType] = useState<'success' | 'error' | ''>('');

  useEffect(() => {
    if (!showSample) {
      loadSettings();
    }
  }, [showSample]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const json = await apiFetchJson<any>('/api/risk_settings');
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        const s = json.data[0];
        setSettingsId(s._id ?? null);
        setMaxTradeAmount(String(s.max_trade_amount ?? 1000));
        setDailyLimit(String(s.daily_limit ?? 5000));
        setStopLossPct(String(s.stop_loss_pct ?? 5));
        const pairs = (s.allowed_pairs ?? 'BTC/MXN,ETH/MXN,XRP/MXN,LTC/MXN').split(',').map((p: string) => p.trim());
        setAllowedPairs(pairs);
        setBehavioralPosition(s.behavioral_position ?? 'moderate');
        setFeeTier(s.fee_tier ?? 'starter');
      }
    } catch {
      setStatusMsg('Failed to load settings');
      setStatusType('error');
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setStatusMsg('');
    try {
      const payload = {
        max_trade_amount: Number(maxTradeAmount),
        daily_limit: Number(dailyLimit),
        stop_loss_pct: Number(stopLossPct),
        allowed_pairs: allowedPairs.join(','),
        behavioral_position: behavioralPosition,
        fee_tier: feeTier,
      };

      let res;
      if (settingsId) {
        res = await apiFetch('/api/risk_settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: settingsId, ...payload }),
        });
      } else {
        res = await apiFetch('/api/risk_settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      const json = await res.json();
      if (json.success) {
        if (json.data?._id) setSettingsId(json.data._id);
        setStatusMsg('Settings saved successfully');
        setStatusType('success');
        if (onSettingsChanged) onSettingsChanged();
      } else {
        setStatusMsg(json.error ?? 'Failed to save settings');
        setStatusType('error');
      }
    } catch {
      setStatusMsg('Failed to save settings');
      setStatusType('error');
    }
    setSaving(false);
  };

  const togglePair = (pair: string) => {
    setAllowedPairs((prev) =>
      prev.includes(pair) ? prev.filter((p) => p !== pair) : [...prev, pair]
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-3 text-sm text-muted-foreground tracking-wider">Loading settings...</span>
      </div>
    );
  }

  const selectedBehavior = BEHAVIORAL_POSITIONS.find(b => b.id === behavioralPosition);
  const selectedFeeTier = FEE_TIERS.find(f => f.id === feeTier);

  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="font-serif text-xl tracking-wider">Risk Settings</h2>

      {/* Behavioral Position / Investment Strategy */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="font-serif tracking-wider text-base">Investment Behavioral Position</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">Defines how aggressively the agent trades and which signals it acts on</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {BEHAVIORAL_POSITIONS.map((pos) => {
            const Icon = pos.icon;
            const isSelected = behavioralPosition === pos.id;
            return (
              <button
                key={pos.id}
                onClick={() => setBehavioralPosition(pos.id)}
                className={`w-full text-left p-4 border transition-all ${
                  isSelected
                    ? `${pos.bgColor} border-2`
                    : 'bg-muted/20 border-border hover:border-muted-foreground/30'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <Icon className={`h-5 w-5 ${isSelected ? pos.color : 'text-muted-foreground'}`} />
                  <span className={`text-sm font-medium tracking-wider uppercase ${isSelected ? pos.color : 'text-foreground'}`}>
                    {pos.label}
                  </span>
                  {isSelected && (
                    <CheckCircle className={`h-4 w-4 ml-auto ${pos.color}`} />
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed ml-8">{pos.description}</p>
              </button>
            );
          })}
        </CardContent>
      </Card>

      {/* Fee Tier / Commission Configuration */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="font-serif tracking-wider text-base">Bitso Fee Tier</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">Select your Bitso fee tier based on your 30-day trading volume. This is used to calculate accurate commission costs per transaction.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={feeTier} onValueChange={setFeeTier}>
            <SelectTrigger className="bg-input border-border">
              <SelectValue placeholder="Select your fee tier" />
            </SelectTrigger>
            <SelectContent>
              {FEE_TIERS.map((tier) => (
                <SelectItem key={tier.id} value={tier.id}>{tier.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedFeeTier && (
            <div className="grid grid-cols-2 gap-4 p-3 bg-muted/30 border border-border">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Maker Fee</p>
                <p className="text-lg font-medium text-primary">{selectedFeeTier.maker}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Taker Fee</p>
                <p className="text-lg font-medium text-primary">{selectedFeeTier.taker}</p>
              </div>
            </div>
          )}

          <div className="p-3 bg-muted/20 border border-border text-xs text-muted-foreground">
            <p className="text-foreground font-medium text-[10px] uppercase tracking-widest mb-1">How Fees Apply</p>
            <p className="leading-relaxed">Market orders use the <span className="text-foreground font-medium">taker</span> fee rate. Limit orders use the <span className="text-foreground font-medium">maker</span> fee rate when they add liquidity. The commission cost is calculated and shown before you confirm any trade.</p>
          </div>
        </CardContent>
      </Card>

      {/* Trading Limits */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="font-serif tracking-wider text-base">Trading Limits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Max Trade Amount (MXN)</Label>
            <Input type="number" value={maxTradeAmount} onChange={(e) => setMaxTradeAmount(e.target.value)} className="bg-input border-border" />
            <p className="text-[10px] text-muted-foreground">Maximum value per individual trade</p>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Daily Transaction Limit (MXN)</Label>
            <Input type="number" value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} className="bg-input border-border" />
            <p className="text-[10px] text-muted-foreground">Maximum total trading volume per day</p>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Stop-Loss Percentage (%)</Label>
            <Input type="number" min="0" max="100" step="0.5" value={stopLossPct} onChange={(e) => setStopLossPct(e.target.value)} className="bg-input border-border" />
            <p className="text-[10px] text-muted-foreground">Automatic stop-loss threshold</p>
          </div>
        </CardContent>
      </Card>

      {/* Allowed Pairs */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="font-serif tracking-wider text-base">Allowed Trading Pairs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {ALL_PAIRS.map((pair) => (
            <div key={pair} className="flex items-center gap-3">
              <Checkbox
                id={pair}
                checked={allowedPairs.includes(pair)}
                onCheckedChange={() => togglePair(pair)}
              />
              <Label htmlFor={pair} className="text-sm cursor-pointer">{pair}</Label>
            </div>
          ))}
        </CardContent>
      </Card>

      {statusMsg && (
        <div className={`flex items-center gap-2 p-3 text-sm ${statusType === 'success' ? 'text-emerald-400' : 'text-destructive'}`}>
          {statusType === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {statusMsg}
        </div>
      )}

      <Button onClick={handleSave} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90 tracking-wider text-xs uppercase px-8">
        {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : 'Save Settings'}
      </Button>
    </div>
  );
}
