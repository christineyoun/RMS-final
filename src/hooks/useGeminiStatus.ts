import { useState, useEffect } from 'react';
import { geminiController } from '../services/geminiController';

export function useGeminiStatus() {
  const [modelName, setModelName] = useState<string>('gemini-flash-latest');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  useEffect(() => {
    const unsubscribe = geminiController.subscribe((data) => {
      if (data?.modelVersion) {
        setModelName(data.modelVersion);
      }
    });
    return unsubscribe;
  }, []);

  return { modelName, isSyncing };
}
