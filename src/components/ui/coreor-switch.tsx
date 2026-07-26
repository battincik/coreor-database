'use client';

import React from 'react';
import { Check } from 'lucide-react';

interface CoreorSwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
  compact?: boolean;
}

export function CoreorSwitch({
  checked,
  onCheckedChange,
  disabled = false,
  label,
  description,
  compact = false
}: CoreorSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={`group flex items-center gap-3 text-left outline-none disabled:cursor-not-allowed disabled:opacity-45 ${compact ? '' : 'min-w-0'}`}
    >
      <span
        className={`relative inline-flex shrink-0 items-center rounded-full border transition-all duration-200 focus-visible:ring-2 focus-visible:ring-cyan-400/50 ${
          checked
            ? 'border-cyan-400/50 bg-gradient-to-r from-cyan-500/80 to-emerald-500/80 shadow-[0_0_18px_rgba(34,211,238,0.18)]'
            : 'border-zinc-700 bg-zinc-900 group-hover:border-zinc-600'
        } ${compact ? 'h-5 w-9' : 'h-6 w-11'}`}
      >
        <span
          className={`flex items-center justify-center rounded-full bg-white text-zinc-950 shadow-lg transition-transform duration-200 ${
            compact ? 'h-4 w-4' : 'h-5 w-5'
          } ${checked ? (compact ? 'translate-x-4' : 'translate-x-5') : 'translate-x-0.5'}`}
        >
          {checked && <Check className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} strokeWidth={3} />}
        </span>
      </span>
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-[11px] font-medium text-zinc-200">{label}</span>}
          {description && <span className="mt-0.5 block text-[9px] leading-4 text-zinc-600">{description}</span>}
        </span>
      )}
    </button>
  );
}
