'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { BarChart3, History, Shield, Activity, Key, Target } from 'lucide-react';

interface SidebarProps {
  activeScreen: string;
  onNavigate: (screen: string) => void;
  activeAgentId: string | null;
  hasApiKeys?: boolean;
  behavioralPosition?: string;
}

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'history', label: 'Trade History', icon: History },
  { id: 'risk', label: 'Risk Settings', icon: Shield },
  { id: 'api-settings', label: 'API Settings', icon: Key },
];

const AGENTS = [
  { id: '69c440a030aebe1ba52aede0', name: 'Market Analysis Coordinator', role: 'Manager' },
  { id: '69c4408d967781c77f39ef10', name: 'Technical Analysis Agent', role: 'Sub-agent' },
  { id: '69c4408daced56c171490320', name: 'Market Research Agent', role: 'Sub-agent' },
  { id: '69c440b01b19ba3adafaf1d7', name: 'Trade Execution Agent', role: 'Independent' },
];

const BEHAVIOR_COLORS: Record<string, string> = {
  conservative: 'bg-blue-400',
  moderate: 'bg-amber-400',
  aggressive: 'bg-red-400',
};

export default function Sidebar({ activeScreen, onNavigate, activeAgentId, hasApiKeys, behavioralPosition }: SidebarProps) {
  return (
    <aside className="w-64 min-h-screen bg-card border-r border-border flex flex-col">
      <div className="p-6 border-b border-border">
        <h1 className="font-serif text-xl tracking-widest text-primary font-medium">BITSO</h1>
        <p className="text-xs text-muted-foreground tracking-wider mt-1">CRYPTO TRADING AGENT</p>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeScreen === item.id;
          return (
            <Button
              key={item.id}
              variant={isActive ? 'secondary' : 'ghost'}
              className={`w-full justify-start gap-3 tracking-wider text-xs uppercase ${isActive ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => onNavigate(item.id)}
            >
              <Icon className="h-4 w-4" />
              {item.label}
              {item.id === 'api-settings' && hasApiKeys && (
                <span className="ml-auto w-2 h-2 rounded-full bg-emerald-400" />
              )}
              {item.id === 'api-settings' && !hasApiKeys && (
                <span className="ml-auto w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              )}
            </Button>
          );
        })}
      </nav>

      {behavioralPosition && (
        <div className="px-4 pb-3">
          <div className="p-3 bg-muted/30 border border-border">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Active Strategy</p>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${BEHAVIOR_COLORS[behavioralPosition] ?? 'bg-amber-400'}`} />
              <span className="text-xs font-medium tracking-wider capitalize">{behavioralPosition}</span>
            </div>
          </div>
        </div>
      )}

      <div className="p-4 border-t border-border">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Agent Status</p>
        <div className="space-y-2">
          {AGENTS.map((agent) => (
            <div key={agent.id} className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${activeAgentId === agent.id ? 'bg-primary animate-pulse' : 'bg-muted-foreground/40'}`} />
              <div className="min-w-0">
                <p className="text-[10px] text-foreground/80 truncate">{agent.name}</p>
                <p className="text-[9px] text-muted-foreground">{agent.role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
