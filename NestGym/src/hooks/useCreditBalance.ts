import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { request } from '../api/api';
import { useAuth } from '../contexts/AuthContext';

export interface CreditBalance {
  metered: boolean;
  balance?: number;
  bonus?: number;
  bonusExpiresAt?: string | null;
  total?: number;
  low?: boolean;
  zero?: boolean;
  dailyCap?: number;
  ratePerMessage?: number;
  rates?: { reminder: number; birthday: number };
}

/** 3203 -> "3,203", 0.4 -> "0.4" */
export const fmtCredits = (n = 0) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

/** WhatsApp wallet for the gym owner / managers. Refetches whenever the screen regains focus (e.g. after topping up on the web). */
export function useCreditBalance() {
  const { user } = useAuth();
  const [credits, setCredits] = useState<CreditBalance | null>(null);
  const allowed = user?.role === 'gym_owner' || user?.role === 'branch_manager';

  const refresh = useCallback(async () => {
    if (!allowed) return setCredits(null);
    try {
      const res: any = await request('/credits/balance');
      if (res?.success) setCredits(res.data);
    } catch {
      // header simply shows no pill
    }
  }, [allowed]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return { credits, refresh };
}
