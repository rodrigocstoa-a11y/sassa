'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Um único <audio> compartilhado: tocar outro item pausa o anterior. */
export function useSinglePlayer() {
  const el = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = useRef<string | null>(null);

  const ensure = useCallback(() => {
    if (!el.current) {
      const a = new Audio();
      a.preload = 'none';
      a.onended = () => setPlayingId(null);
      a.onpause = () => setPlayingId(null);
      a.onplay = () => setPlayingId(current.current);
      a.onerror = () => { setPlayingId(null); setError('Não foi possível reproduzir este arquivo.'); };
      el.current = a;
    }
    return el.current;
  }, []);

  const toggle = useCallback((id: string, url: string) => {
    const a = ensure();
    setError(null);
    if (current.current === id && !a.paused) { a.pause(); return; }
    if (current.current !== id) { a.pause(); a.src = url; current.current = id; }
    void a.play().catch(() => setError('Não foi possível reproduzir este arquivo.'));
  }, [ensure]);

  useEffect(() => () => { el.current?.pause(); el.current = null; }, []);

  return { playingId, toggle, error };
}
