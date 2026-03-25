'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle, AlertTriangle, Eye, EyeOff, Trash2, Key, ShieldCheck } from 'lucide-react';

interface ApiSettingsProps {
  onCredentialsSaved: () => void;
}

export default function ApiSettingsSection({ onCredentialsSaved }: ApiSettingsProps) {
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [hasCredentials, setHasCredentials] = useState(false);
  const [maskedSecret, setMaskedSecret] = useState('');
  const [savedKey, setSavedKey] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [statusType, setStatusType] = useState<'success' | 'error' | ''>('');
  const [testingConnection, setTestingConnection] = useState(false);

  useEffect(() => {
    loadCredentials();
  }, []);

  const loadCredentials = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/bitso_credentials');
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        const cred = json.data[0];
        setHasCredentials(true);
        setSavedKey(cred.api_key || '');
        setMaskedSecret(cred.api_secret_masked || '****');
      } else {
        setHasCredentials(false);
      }
    } catch {
      setStatusMsg('Failed to load credentials');
      setStatusType('error');
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!apiKey.trim() || !apiSecret.trim()) {
      setStatusMsg('Both API Key and API Secret are required');
      setStatusType('error');
      return;
    }
    setSaving(true);
    setStatusMsg('');
    try {
      const res = await fetch('/api/bitso_credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey.trim(), api_secret: apiSecret.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        setHasCredentials(true);
        setSavedKey(json.data.api_key);
        setMaskedSecret(json.data.api_secret_masked);
        setApiKey('');
        setApiSecret('');
        setStatusMsg('API credentials saved successfully');
        setStatusType('success');
        onCredentialsSaved();
      } else {
        setStatusMsg(json.error || 'Failed to save credentials');
        setStatusType('error');
      }
    } catch {
      setStatusMsg('Failed to save credentials');
      setStatusType('error');
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    setStatusMsg('');
    try {
      const res = await fetch('/api/bitso_credentials', { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        setHasCredentials(false);
        setSavedKey('');
        setMaskedSecret('');
        setStatusMsg('Credentials removed');
        setStatusType('success');
        onCredentialsSaved();
      } else {
        setStatusMsg(json.error || 'Failed to remove credentials');
        setStatusType('error');
      }
    } catch {
      setStatusMsg('Failed to remove credentials');
      setStatusType('error');
    }
    setDeleting(false);
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setStatusMsg('');
    try {
      const res = await fetch('/api/bitso/balance');
      const json = await res.json();
      if (json.success) {
        setStatusMsg('Connection successful — Bitso API is responding correctly');
        setStatusType('success');
      } else {
        setStatusMsg(`Connection failed: ${json.error || 'Unknown error'}`);
        setStatusType('error');
      }
    } catch {
      setStatusMsg('Connection test failed — could not reach the API');
      setStatusType('error');
    }
    setTestingConnection(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-3 text-sm text-muted-foreground tracking-wider">Loading API settings...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-xl">
      <h2 className="font-serif text-xl tracking-wider">Bitso API Settings</h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        Connect your Bitso account to enable real-time balance fetching and automated trade execution.
        Your API credentials are stored securely and only used server-side.
      </p>

      {hasCredentials ? (
        <Card className="bg-card border-border">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="font-serif tracking-wider text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                API Connected
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div>
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">API Key</Label>
                <p className="text-sm font-mono mt-1">{savedKey}</p>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">API Secret</Label>
                <p className="text-sm font-mono mt-1">{maskedSecret}</p>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                onClick={handleTestConnection}
                disabled={testingConnection}
                variant="outline"
                className="border-border tracking-wider text-xs uppercase"
              >
                {testingConnection ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Testing...</> : 'Test Connection'}
              </Button>
              <Button
                onClick={handleDelete}
                disabled={deleting}
                variant="outline"
                className="border-destructive/50 text-destructive hover:bg-destructive/10 tracking-wider text-xs uppercase"
              >
                {deleting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Removing...</> : <><Trash2 className="h-3.5 w-3.5 mr-1.5" />Remove Keys</>}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="font-serif tracking-wider text-base flex items-center gap-2">
              <Key className="h-4 w-4 text-primary" />
              Configure API Credentials
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">API Key</Label>
              <Input
                type="text"
                placeholder="Your Bitso API Key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="bg-input border-border font-mono text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">API Secret</Label>
              <div className="relative">
                <Input
                  type={showSecret ? 'text' : 'password'}
                  placeholder="Your Bitso API Secret"
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  className="bg-input border-border font-mono text-sm pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              onClick={handleSave}
              disabled={saving || !apiKey.trim() || !apiSecret.trim()}
              className="bg-primary text-primary-foreground hover:bg-primary/90 tracking-wider text-xs uppercase px-8"
            >
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : 'Save Credentials'}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="font-serif tracking-wider text-base">How to Get Your API Keys</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <ol className="list-decimal list-inside space-y-2">
            <li>Log in to your Bitso account at <span className="text-primary font-medium">bitso.com</span></li>
            <li>Navigate to <span className="text-foreground font-medium">Settings &gt; API Keys</span></li>
            <li>Click <span className="text-foreground font-medium">Create New API Key</span></li>
            <li>Enable the following permissions:
              <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                <li><span className="text-foreground">Account Balance</span> (read)</li>
                <li><span className="text-foreground">Trading</span> (read + write) for auto buy/sell</li>
              </ul>
            </li>
            <li>Copy and paste the API Key and Secret above</li>
          </ol>
          <div className="mt-4 p-3 bg-muted/50 border border-border text-xs">
            <p className="text-foreground font-medium mb-1">Security Note</p>
            <p>Your API secret is stored encrypted on the server and never exposed to the frontend. Only the last 4 characters are shown for verification.</p>
          </div>
        </CardContent>
      </Card>

      {statusMsg && (
        <div className={`flex items-center gap-2 p-3 text-sm ${statusType === 'success' ? 'text-emerald-400' : 'text-destructive'}`}>
          {statusType === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {statusMsg}
        </div>
      )}
    </div>
  );
}
