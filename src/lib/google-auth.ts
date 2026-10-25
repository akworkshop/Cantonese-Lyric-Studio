import { supabase } from './supabase';
import { GoogleCredentialResponse } from '@/types/google';

export const GOOGLE_CLIENT_ID_STORAGE_KEY = 'cls_google_client_id';

/**
 * 取得 Google OAuth Client ID (優先使用環境變數 NEXT_PUBLIC_GOOGLE_CLIENT_ID，次選本機 LocalStorage)
 */
export function getGoogleClientId(): string {
  if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_GOOGLE_CLIENT_ID) {
    return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID.trim();
  }
  if (typeof window !== 'undefined') {
    const local = localStorage.getItem(GOOGLE_CLIENT_ID_STORAGE_KEY);
    if (local && local.trim()) return local.trim();
  }
  return '';
}

/**
 * 儲存 Google OAuth Client ID 至本機 LocalStorage
 */
export function saveGoogleClientId(clientId: string): void {
  if (typeof window !== 'undefined') {
    if (clientId.trim()) {
      localStorage.setItem(GOOGLE_CLIENT_ID_STORAGE_KEY, clientId.trim());
    } else {
      localStorage.removeItem(GOOGLE_CLIENT_ID_STORAGE_KEY);
    }
  }
}

/**
 * 透過 Google Identity Services 回傳的 ID Token 登入 Supabase
 */
export async function signInWithGoogleIdToken(credential: string) {
  if (!supabase) {
    throw new Error('Supabase 尚未初始化');
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: credential,
  });

  if (error) {
    throw error;
  }

  return data;
}

/**
 * 初始化 Google One Tap 與原生登入服務
 */
export function initializeGoogleIdentity(
  onSuccess: (credential: string) => void,
  onError?: (err: Error) => void
): boolean {
  if (typeof window === 'undefined') return false;

  const clientId = getGoogleClientId();
  if (!clientId) {
    return false;
  }

  if (!window.google?.accounts?.id) {
    return false;
  }

  try {
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response: GoogleCredentialResponse) => {
        if (response.credential) {
          onSuccess(response.credential);
        } else {
          onError?.(new Error('未收到有效的 Google 憑證'));
        }
      },
      auto_select: false,
      cancel_on_tap_outside: true,
      context: 'signin',
    });
    return true;
  } catch (err) {
    console.error('Failed to initialize Google Identity Services:', err);
    onError?.(err instanceof Error ? err : new Error(String(err)));
    return false;
  }
}

/**
 * 觸發 Google One Tap 浮動提示視窗
 */
export function promptGoogleOneTap(): void {
  if (typeof window === 'undefined' || !window.google?.accounts?.id) return;
  try {
    window.google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed()) {
        console.log('Google One Tap not displayed:', notification.getNotDisplayedReason());
      } else if (notification.isSkippedMoment()) {
        console.log('Google One Tap skipped:', notification.getSkippedReason());
      } else if (notification.isDismissedMoment()) {
        console.log('Google One Tap dismissed:', notification.getDismissedReason());
      }
    });
  } catch (err) {
    console.warn('Google One Tap prompt warning:', err);
  }
}

/**
 * 在指定 DOM 節點渲染 Google 原生標準按鈕
 */
export function renderGoogleNativeButton(elementId: string): boolean {
  if (typeof window === 'undefined' || !window.google?.accounts?.id) return false;
  const container = document.getElementById(elementId);
  if (!container) return false;

  try {
    container.innerHTML = '';
    window.google.accounts.id.renderButton(container, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'continue_with',
      shape: 'rectangular',
      logo_alignment: 'left',
      width: 320,
    });
    return true;
  } catch (err) {
    console.error('Failed to render Google button:', err);
    return false;
  }
}
