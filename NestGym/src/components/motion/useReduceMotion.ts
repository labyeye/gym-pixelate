import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** True when the OS "reduce motion" setting is on — ported from NestLeads. */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(
      v => mounted && setReduce(v),
    );
    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduce,
    );
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
  return reduce;
}
