import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { EXPORT_PATH } from '@core/constants';

export type ShareOutcome = 'shared' | 'cancelled' | 'unavailable' | 'failed';

export interface ShareBlobParams {
  blob: Blob;
  filename: string;
  mimeType: string;
  title?: string;
  text?: string;
}

@Injectable({ providedIn: 'root' })
export class ShareService {
  async tryShareBlob(params: ShareBlobParams): Promise<{ outcome: ShareOutcome }> {
    if (Capacitor.isNativePlatform()) {
      const nativeResult = await this.tryNativeShareBlob(params);
      if (nativeResult.outcome === 'shared' || nativeResult.outcome === 'cancelled') {
        return nativeResult;
      }
      // Fall back to Web Share when native share is unavailable/fails.
      return this.tryWebShareBlob(params);
    }

    return this.tryWebShareBlob(params);
  }

  private async tryWebShareBlob(params: ShareBlobParams): Promise<{ outcome: ShareOutcome }> {
    if (typeof navigator === 'undefined' || typeof window === 'undefined') {
      return { outcome: 'unavailable' };
    }

    const file = new File([params.blob], params.filename, { type: params.mimeType });

    const canShareFiles =
      typeof navigator.share === 'function' &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [file] });

    if (!canShareFiles) {
      return { outcome: 'unavailable' };
    }

    try {
      await navigator.share({
        title: params.title,
        text: params.text,
        files: [file],
      });
      return { outcome: 'shared' };
    } catch (err) {
      if (this.isUserCancellation(err)) {
        return { outcome: 'cancelled' };
      }
      console.warn('[ShareService] Web share failed', err);
      return { outcome: 'failed' };
    }
  }

  private async tryNativeShareBlob(params: ShareBlobParams): Promise<{ outcome: ShareOutcome }> {
    try {
      const [{ Filesystem, Directory }, { Share }] = await Promise.all([
        import('@capacitor/filesystem'),
        import('@capacitor/share'),
      ]);

      const base64Data = await this.blobToBase64(params.blob);
      const path = this.joinPath(EXPORT_PATH, params.filename);

      await Filesystem.writeFile({
        path,
        data: base64Data,
        directory: Directory.Cache,
        recursive: true,
      });

      try {
        const uri = await Filesystem.getUri({ path, directory: Directory.Cache });
        await Share.share({
          title: params.title,
          text: params.text,
          url: uri.uri,
        });
        return { outcome: 'shared' };
      } catch (err) {
        if (this.isUserCancellation(err)) {
          return { outcome: 'cancelled' };
        }
        console.warn('[ShareService] Native share failed', err);
        return { outcome: 'failed' };
      } finally {
        try {
          await Filesystem.deleteFile({ path, directory: Directory.Cache });
        } catch (deleteErr) {
          console.warn('[ShareService] Failed to delete temp shared file', deleteErr);
        }
      }
    } catch (err) {
      console.warn('[ShareService] Native share unavailable', err);
      return { outcome: 'unavailable' };
    }
  }

  private async blobToBase64(blob: Blob): Promise<string> {
    const buffer = await blob.arrayBuffer();
    return this.arrayBufferToBase64(buffer);
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  }

  private isUserCancellation(err: unknown): boolean {
    if (typeof DOMException !== 'undefined' && err instanceof DOMException) {
      return err.name === 'AbortError';
    }
    const message = this.getErrorMessage(err).toLowerCase();
    return message.includes('cancel');
  }

  private getErrorMessage(err: unknown): string {
    if (!err) {
      return '';
    }
    if (typeof err === 'string') {
      return err;
    }
    if (typeof err === 'object' && 'message' in err && typeof (err as any).message === 'string') {
      return (err as any).message;
    }
    return '';
  }

  private joinPath(prefix: string, filename: string): string {
    const normalizedPrefix = (prefix ?? '').endsWith('/') ? prefix : `${prefix}/`;
    return `${normalizedPrefix}${(filename ?? '').replace(/^\/+/, '')}`;
  }
}

