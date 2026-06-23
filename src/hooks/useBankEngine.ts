'use client';

import { useState, useRef, useCallback } from 'react';
import { BankEngine } from '@/audio/bankEngine';
import { Snapshot } from '@/audio/snapshot';

export interface BankState {
  id: number;
  name: string;
  state: 'EMPTY' | 'LIVE' | 'MUTED' | 'FADING';
  source: 'TONE' | 'FIELD' | null;
  fader: number;
  pan: number;
  snapshot: Snapshot | null;
}

const initialBanks: BankState[] = [
  { id:1, name:'Bank 1', state:'EMPTY', source:null, fader:80, pan:50, snapshot:null },
  { id:2, name:'Bank 2', state:'EMPTY', source:null, fader:80, pan:50, snapshot:null },
  { id:3, name:'Bank 3', state:'EMPTY', source:null, fader:80, pan:50, snapshot:null },
];

export function useBankEngine() {
  const [banks, setBanks]       = useState<BankState[]>(initialBanks);
  const engines                 = useRef<Map<number, BankEngine>>(new Map());
  const [editingBankId, setEditingBankId] = useState<number | null>(null);

  const updateBank = useCallback((id: number, updates: Partial<BankState>) => {
    setBanks(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
  }, []);

  // Store current sound to a bank
  const storeToBank = useCallback((bankId: number, snapshot: Snapshot) => {
    // Dispose existing engine if any
    const existing = engines.current.get(bankId);
    if (existing) {
      existing.dispose();
      engines.current.delete(bankId);
    }

    // Create new bank engine from snapshot
    const engine = new BankEngine(snapshot);
    engines.current.set(bankId, engine);

    updateBank(bankId, {
      state: 'LIVE',
      source: snapshot.source,
      fader: 80,
      pan: 50,
      snapshot: JSON.parse(JSON.stringify(snapshot)),
    });
  }, [updateBank]);

  // Load a bank's snapshot back into tone controls for editing
  const getEditSnapshot = useCallback((bankId: number): Snapshot | null => {
    const bank = banks.find(b => b.id === bankId);
    return bank?.snapshot ?? null;
  }, [banks]);

  const startEditing = useCallback((bankId: number) => {
    setEditingBankId(bankId);
  }, []);

  const stopEditing = useCallback(() => {
    setEditingBankId(null);
  }, []);

  // Update a live bank with new snapshot (after editing)
  const updateBankSound = useCallback((bankId: number, snapshot: Snapshot) => {
    const existing = engines.current.get(bankId);
    if (existing) {
      existing.dispose();
      engines.current.delete(bankId);
    }
    const engine = new BankEngine(snapshot);
    engines.current.set(bankId, engine);
    updateBank(bankId, { snapshot: JSON.parse(JSON.stringify(snapshot)) });
  }, [updateBank]);

  const setFader = useCallback((bankId: number, value: number) => {
    engines.current.get(bankId)?.setFader(value);
    updateBank(bankId, { fader: value });
  }, [updateBank]);

  const setPan = useCallback((bankId: number, value: number) => {
    engines.current.get(bankId)?.setPan(value);
    updateBank(bankId, { pan: value });
  }, [updateBank]);

  const muteBank = useCallback((bankId: number) => {
    engines.current.get(bankId)?.mute();
    updateBank(bankId, { state: 'MUTED' });
  }, [updateBank]);

  const unmuteBank = useCallback((bankId: number) => {
    engines.current.get(bankId)?.unmute();
    updateBank(bankId, { state: 'LIVE' });
  }, [updateBank]);

  const fadeBank = useCallback((bankId: number) => {
    updateBank(bankId, { state: 'FADING' });
    engines.current.get(bankId)?.fadeOut(() => {
      engines.current.delete(bankId);
      updateBank(bankId, { state:'EMPTY', source:null, fader:80, pan:50, snapshot:null });
    });
  }, [updateBank]);

  const clearBank = useCallback((bankId: number) => {
    engines.current.get(bankId)?.dispose();
    engines.current.delete(bankId);
    updateBank(bankId, { state:'EMPTY', source:null, fader:80, pan:50, snapshot:null });
    if (editingBankId === bankId) setEditingBankId(null);
  }, [updateBank, editingBankId]);

  const renameBank = useCallback((bankId: number, name: string) => {
    updateBank(bankId, { name });
  }, [updateBank]);

  const addBank = useCallback(() => {
    setBanks(prev => {
      if (prev.length >= 6) return prev;
      const id = Math.max(...prev.map(b => b.id)) + 1;
      return [...prev, { id, name:`Bank ${id}`, state:'EMPTY', source:null, fader:80, pan:50, snapshot:null }];
    });
  }, []);

  return {
    banks,
    editingBankId,
    storeToBank,
    getEditSnapshot,
    startEditing,
    stopEditing,
    updateBankSound,
    setFader,
    setPan,
    muteBank,
    unmuteBank,
    fadeBank,
    clearBank,
    renameBank,
    addBank,
  };
}
