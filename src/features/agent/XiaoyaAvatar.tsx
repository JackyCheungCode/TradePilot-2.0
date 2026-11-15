import { useEffect, useRef, useState } from 'react';

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
          idle: { standbyAfter: number; sleepAfter: number };
          label: string;
        },
      ) => EmotionBallInstance;
    };
  }
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

  useEffect(() => {
    let active = true;
    void loadEmotionBall()
      .then(() => {
        if (!active || !hostRef.current || !window.EmotionBall) return;
        const instance = window.EmotionBall.create(hostRef.current, {
          emotion: '02',
          shape: 'blob',
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
      className={`tp-xiaoya-avatar${ready ? ' is-ready' : ''}`}
      style={{ width: size, height: size, display: 'inline-flex', flex: '0 0 auto' }}
      role="img"
      aria-label={`小雅状态：${emotion}`}
    >
      {!ready && <span className="tp-xiaoya-avatar__fallback">雅</span>}
    </span>
  );
}
