import React, { useEffect, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';

interface QRScannerProps {
  onScan: (decodedText: string) => void;
  onError?: (error: any) => void;
}

export function QRScanner({ onScan, onError }: QRScannerProps) {
  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      'reader',
      { fps: 10, qrbox: { width: 250, height: 250 } },
      false
    );

    scanner.render(onScan, onError);

    return () => {
      scanner.clear().catch(error => console.error('Failed to clear scanner', error));
    };
  }, [onScan, onError]);

  return <div id="reader" className="w-full max-w-sm mx-auto overflow-hidden rounded-2xl border-4 border-slate-100 shadow-inner" />;
}
