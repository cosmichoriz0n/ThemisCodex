"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import ScannerInput from "./ScannerInput";

interface MobileScanProps {
  onScan: (decodedText: string) => void;
  onError?: (error: string) => void;
}

type ScanState = "idle" | "requesting" | "scanning" | "denied";

/**
 * Mobile camera barcode/QR scanner using html5-qrcode.
 * Dynamically imported to avoid SSR issues.
 * Falls back to ScannerInput if camera permission is denied.
 */
export default function MobileScan({ onScan, onError }: MobileScanProps) {
  const [state, setState] = useState<ScanState>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      scannerRef.current?.stop().catch(() => {});
    };
  }, []);

  const startScanning = useCallback(async () => {
    setState("requesting");
    setErrorMsg("");

    try {
      const { Html5Qrcode } = await import("html5-qrcode");

      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;

      if (!mountedRef.current) return;
      setState("scanning");

      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          onScan(decodedText);
          scanner.stop().catch(() => {});
          if (mountedRef.current) setState("idle");
        },
        () => {
          // per-frame errors are normal — ignore
        }
      );
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      const message = err instanceof Error ? err.message : String(err);

      if (message.toLowerCase().includes("permission") || message.toLowerCase().includes("denied")) {
        setState("denied");
      } else {
        setState("idle");
        setErrorMsg("Camera unavailable. Use manual input below.");
        onError?.(message);
      }
    }
  }, [onScan, onError]);

  const stopScanning = useCallback(async () => {
    await scannerRef.current?.stop().catch(() => {});
    scannerRef.current = null;
    setState("idle");
  }, []);

  if (state === "denied") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-amber-600">
          Camera permission denied. Use the scanner or type the barcode manually.
        </p>
        <ScannerInput onScan={onScan} />
      </div>
    );
  }

  const isIdle = state === "idle";
  const isRequesting = state === "requesting";
  const isScanning = state === "scanning";

  return (
    <div className="space-y-3">
      <div
        id="qr-reader"
        className={isScanning ? "block w-full max-w-sm mx-auto rounded-lg overflow-hidden" : "hidden"}
      />

      {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

      <div className="flex gap-2">
        {isIdle && (
          <button
            type="button"
            onClick={startScanning}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <CameraIcon />
            Scan with Camera
          </button>
        )}
        {isRequesting && (
          <button
            type="button"
            disabled
            className="flex items-center gap-2 rounded-md bg-gray-400 px-4 py-2 text-sm font-medium text-white cursor-not-allowed"
          >
            Requesting camera…
          </button>
        )}
        {isScanning && (
          <button
            type="button"
            onClick={stopScanning}
            className="flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            Stop Camera
          </button>
        )}
      </div>

      <div className="border-t pt-3">
        <p className="text-xs text-gray-500 mb-1">Or type / paste barcode manually:</p>
        <ScannerInput onScan={onScan} />
      </div>
    </div>
  );
}

function CameraIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}
