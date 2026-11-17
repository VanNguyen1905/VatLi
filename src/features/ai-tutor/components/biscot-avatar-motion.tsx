import type { CSSProperties } from 'react';
import './biscot-avatar-motion.css';

export type BiscotMood = 'idle' | 'wave' | 'think' | 'speak' | 'point' | 'jump' | 'run' | 'dance' | 'warn' | 'success';
export function BiscotAvatar({mood,large=false,className='',style}:{mood:BiscotMood;large?:boolean;className?:string;style?:CSSProperties}) {
  return <img
    src={large ? '/ai-biscot-full-transparent.png' : '/ai-biscot-avatar-transparent.png'}
    alt="AI Biscot"
    draggable={false}
    style={style}
    className={`biscot-motion biscot-motion--${mood} object-contain ${className}`}
  />;
}
