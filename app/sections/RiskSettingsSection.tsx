'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, CheckCircle, AlertTriangle } from 'lucide-react';

interface RiskSettingsProps {
  showSample: boolean;
}

const ALL_PAIRS = ['BTC/MXN', 'ETH/MXN', 'XRP/MXN', 'LTC/MXN'];

export default function RiskSettingsSection({ showSample }: RiskSettingsProps) {
  const [maxTradeAmount, setMaxTradeAmount] = useState('1000');
  const [dailyLimit, setDailyLimit] = useState('5000');
  const [stopLossPct, setStopLossPct] = useState('5');
  const [allowedPairs, setAllowedPairs] = useState<string[]>(['BTC/MXN', 'ETH/MXN', 'XRP/MXN', 'LTC/MXN']);
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
      const res = await fetch('/api/risk_settings');
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        const s = json.data[0];
        setSettingsId(s._id ?? null);
        setMaxTradeAmount(String(s.max_trade_amount ?? 1000));
        setDailyLimit(String(s.daily_limit ?? 5000));
        setStopLossPct(String(s.stop_loss_pct ?? 5));
        const pairs = (s.allowed_pairs ?? 'BTC/MXN,ETH/MXN,XRP/MXN,LTC/MXN').split(',').map((p: string) => p.trim());
        setAllowedPairs(pairs);
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
      };

      let res;
      if (settingsId) {
        res = await fetch('/api/risk_settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: settingsId, ...payload }),
        });
      } else {
        res = await fetch('/api/risk_settings', {
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

  return (
    <div className="space-y-6 max-w-xl">
      <h2 className="font-serif text-xl tracking-wider">Risk Settings</h2>

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
