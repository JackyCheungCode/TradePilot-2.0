import { useEffect, useRef, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';

type EmotionBallInstance = {
  setEmotion: (id: string) => void;
  destroy: () => void;
};

declare global {
  interface Window {
    EmotionBall?: {
      create: (
        target: HTMLElement,
        options: {
          emotion: string;
          shape: 'blob' | 'wedge' | 'gem';
          color?: string;
          eyeColor?: string;
          eyeScale?: number;
          idle: { standbyAfter: number; sleepAfter: number };
          label: string;
        },
      ) => EmotionBallInstance;
    };
  }
}

const AVATAR_COLORS: Record<string,string> = {
  cream:'#F3F0EA', ivory:'#F3F0EA', black:'#292929', brown:'#8B5E3C', red:'#D94B4B', orange:'#E98A3A',
  yellow:'#E8C84A', green:'#4F9D69', cyan:'#42A9B8', blue:'#4D83C6', violet:'#8064B8',
  magenta:'#B84D91', pink:'#E58BAA', gray:'#8B929A', sage:'#9AAE91', clay:'#B87861',
  navy:'#354B70', mauve:'#A47F9B', night:'#41465A', cocoa:'#795548', sky:'#86B9D8',
  blush:'#E8B5B1', lilac:'#B7A2D8', butter:'#E6D58B', meadow:'#7EAA79',
};
type AvatarAppearance = { shape?:string; color?:string; eyeColor?:string; eyeScale?:number };
async function loadAvatarAppearance(): Promise<AvatarAppearance | null> {
  try {
    const client = await getSupabaseClient();
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    const response = await fetch('/api/v1/agent/appearance', { headers:{ Authorization:'Bearer ' + token } });
    if (!response.ok) return null;
    const payload = await response.json() as { data?:{ default?:AvatarAppearance } };
    return payload.data?.default ?? null;
  } catch { return null; }
}

const SCRIPT_PATHS = [
  '/vendor/emotion-ball/rings.js',
  '/vendor/emotion-ball/emotions.js',
  '/vendor/emotion-ball/ball.js',
  '/vendor/emotion-ball/engine.js',
];

let engineLoad: Promise<void> | null = null;

function loadEmotionBall(): Promise<void> {
  if (window.EmotionBall) return Promise.resolve();
  if (!engineLoad) {
    engineLoad = SCRIPT_PATHS.reduce(
      (chain, src) => chain.then(() => new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Emotion Ball 引擎加载失败：${src}`));
        document.head.appendChild(script);
      })),
      Promise.resolve(),
    ).catch((error) => {
      engineLoad = null;
      throw error;
    });
  }
  return engineLoad;
}

const EMOTION_IDS: Record<string, string> = {
  idle: '02',
  listening: '31',
  thinking: '30',
  working: '32',
  success: '33',
  warning: '34',
  error: '34',
  awaiting_confirmation: '35',
  sleeping: '00',
};

type XiaoyaAvatarProps = {
  emotion?: keyof typeof EMOTION_IDS;
  size?: number;
};



export function XiaoyaAvatar({ emotion = 'idle', size = 30 }: XiaoyaAvatarProps) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const instanceRef = useRef<EmotionBallInstance | null>(null);
  const [ready, setReady] = useState(false);
  const normalizedSize = Number.isFinite(size) ? Math.max(16, Math.min(192, size)) : 30;

  useEffect(() => {
    let active = true;
    void Promise.all([loadEmotionBall(), loadAvatarAppearance()])
      .then(([, appearance]) => {
        if (!active || !hostRef.current || !window.EmotionBall) return;
        const requestedShape = appearance?.shape || 'blob';
        const shape = (['blob','wedge','gem'].includes(requestedShape) ? requestedShape : 'blob') as 'blob' | 'wedge' | 'gem';
        const eyeColor = appearance?.eyeColor && /^#[0-9a-f]{6}$/i.test(appearance.eyeColor) ? appearance.eyeColor : '#1A1A1A';
        const eyeScale = typeof appearance?.eyeScale === 'number' ? Math.max(0.7, Math.min(1.4, appearance.eyeScale)) : 1;
        const instance = window.EmotionBall.create(hostRef.current, {
          emotion: '02',
          shape,
          color: AVATAR_COLORS[appearance?.color || 'ivory'] || AVATAR_COLORS.ivory,
          eyeColor,
          eyeScale,
          idle: { standbyAfter: 60000, sleepAfter: 180000 },
          label: '小雅',
        });
        instanceRef.current = instance;
        setReady(true);
      })
      .catch((error) => {
        console.error('[Xiaoya] Emotion Ball initialization failed', error);
      });
    return () => {
      active = false;
      instanceRef.current?.destroy();
      instanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    const id = EMOTION_IDS[emotion] || EMOTION_IDS.idle;
    instanceRef.current?.setEmotion(id);
  }, [emotion, ready]);

  return (
    <span
      ref={hostRef}
      className={`tp-xiaoya-avatar tp-xiaoya-avatar--${normalizedSize}${ready ? ' is-ready' : ''}`}
      style={{ width: normalizedSize, height: normalizedSize, display: 'block', flex: '0 0 auto' }}
      role="img"
      aria-label={`小雅状态：${emotion}`}
    >
      {!ready && <span className="tp-xiaoya-avatar__fallback">雅</span>}
    </span>
  );
}
