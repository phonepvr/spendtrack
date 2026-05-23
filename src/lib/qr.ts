import QRCode from 'qrcode';

const APP_ORIGIN = 'https://phonepvr.github.io/spendtrack/';
const HASH_PREFIX = '#passphrase=';

export function buildPairingUrl(passphrase: string): string {
  return APP_ORIGIN + HASH_PREFIX + encodeURIComponent(passphrase);
}

export function parsePairingHash(hash: string): string | null {
  if (!hash.startsWith(HASH_PREFIX)) return null;
  try {
    return decodeURIComponent(hash.slice(HASH_PREFIX.length));
  } catch {
    return null;
  }
}

export async function renderQrToDataUrl(passphrase: string): Promise<string> {
  return QRCode.toDataURL(buildPairingUrl(passphrase), {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 320,
    color: { dark: '#0f172a', light: '#ffffff' },
  });
}

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
}

interface BarcodeDetectorCtor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?(): Promise<string[]>;
}

function getBarcodeDetector(): BarcodeDetectorCtor | null {
  const w = window as unknown as { BarcodeDetector?: BarcodeDetectorCtor };
  return w.BarcodeDetector ?? null;
}

export function isCameraScanSupported(): boolean {
  return (
    getBarcodeDetector() !== null &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

export interface ScanHandle {
  stop: () => void;
}

export async function startCameraScan(
  video: HTMLVideoElement,
  onDetected: (text: string) => void,
  onError: (err: Error) => void,
): Promise<ScanHandle> {
  const Detector = getBarcodeDetector();
  if (!Detector) throw new Error('BarcodeDetector unsupported on this device');

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' },
    audio: false,
  });
  video.srcObject = stream;
  video.setAttribute('playsinline', 'true');
  await video.play();

  const detector = new Detector({ formats: ['qr_code'] });
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      const codes = await detector.detect(video);
      if (codes.length > 0) {
        onDetected(codes[0].rawValue);
        return;
      }
    } catch (e) {
      onError(e instanceof Error ? e : new Error(String(e)));
    }
    if (!stopped) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  return {
    stop: () => {
      stopped = true;
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    },
  };
}

export function extractPassphraseFromScan(raw: string): string | null {
  const hashIdx = raw.indexOf('#');
  if (hashIdx >= 0) {
    const parsed = parsePairingHash(raw.slice(hashIdx));
    if (parsed) return parsed;
  }
  if (/^[a-z]+(?:[-\s][a-z]+){3,}$/i.test(raw.trim())) {
    return raw.trim();
  }
  return null;
}
