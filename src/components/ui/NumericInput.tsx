'use client';

import { useEffect, useState } from 'react';
import { sanitizeIntegerInput } from '@/lib/ui-helpers';

interface NumericInputProps {
  value: number;
  onValueChange: (next: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  'aria-label'?: string;
  className?: string;
}

export function NumericInput({
  value,
  onValueChange,
  min = 0,
  max = 999_999_999,
  disabled = false,
  required = false,
  placeholder,
  'aria-label': ariaLabel,
  className = '',
}: NumericInputProps) {
  const [text, setText] = useState<string>(() => String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    setText((prev) => {
      if (!focused) return String(value);
      if (prev === '') return prev;
      return Number.parseInt(prev, 10) === value ? prev : String(value);
    });
  }, [value, focused]);

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setFocused(true);
    e.currentTarget.select();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = sanitizeIntegerInput(e.target.value, max);
    setText(parsed.text);
    if (parsed.value !== null) {
      onValueChange(parsed.value);
    } else if (min === 0) {
      onValueChange(0);
    }
  };

  const handleBlur = () => {
    setFocused(false);
    const parsed = sanitizeIntegerInput(text, max);
    const rawVal = parsed.value ?? min;
    const finalVal = Math.max(min, Math.min(max, rawVal));
    setText(String(finalVal));
    if (finalVal !== value) {
      onValueChange(finalVal);
    }
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      disabled={disabled}
      required={required}
      placeholder={placeholder}
      aria-label={ariaLabel}
      value={text}
      onFocus={handleFocus}
      onChange={handleChange}
      onBlur={handleBlur}
      className={className}
    />
  );
}
