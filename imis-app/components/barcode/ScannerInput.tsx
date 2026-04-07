"use client";

import { useRef, useCallback, forwardRef, useImperativeHandle } from "react";

interface ScannerInputProps {
  onScan: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export interface ScannerInputHandle {
  focus: () => void;
  clear: () => void;
}

/**
 * Detects barcode scanner input vs manual typing.
 * Rule: 8+ characters arriving within 100ms = scanner → auto-submits via onScan().
 * Manual typing falls through as a normal controlled text input.
 */
const ScannerInput = forwardRef<ScannerInputHandle, ScannerInputProps>(
  ({ onScan, placeholder = "Scan barcode or type manually…", className }, ref) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const keystrokeTimestamps = useRef<number[]>([]);
    const inputValue = useRef<string>("");

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
      clear: () => {
        if (inputRef.current) inputRef.current.value = "";
        inputValue.current = "";
        keystrokeTimestamps.current = [];
      },
    }));

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        const now = Date.now();
        keystrokeTimestamps.current.push(now);

        // Keep only timestamps from the last 200ms
        keystrokeTimestamps.current = keystrokeTimestamps.current.filter(
          (t) => now - t < 200
        );

        if (e.key === "Enter") {
          const value = inputRef.current?.value ?? "";
          if (!value) return;

          // Check if this looks like scanner input:
          // ≥8 characters arrived within 100ms of the Enter key
          const recentKeystrokes = keystrokeTimestamps.current.filter(
            (t) => now - t <= 100
          );
          const isScanner = recentKeystrokes.length >= 8;

          if (isScanner) {
            e.preventDefault();
            onScan(value);
            if (inputRef.current) inputRef.current.value = "";
            keystrokeTimestamps.current = [];
          }
          // If manual typing, let the Enter propagate normally (form submit, etc.)
        }
      },
      [onScan]
    );

    return (
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        spellCheck={false}
        className={
          className ??
          "w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
        }
      />
    );
  }
);

ScannerInput.displayName = "ScannerInput";

export default ScannerInput;
