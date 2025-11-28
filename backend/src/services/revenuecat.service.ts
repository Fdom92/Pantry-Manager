import fetch from 'node-fetch';
import { revenuecatConfig } from '../config/revenuecat.js';

interface ProCacheEntry {
  pro: boolean;
  expiry: number;
}

const cache = new Map<string, ProCacheEntry>(); // userId -> { pro: boolean, expiry: number }
const TTL_MS = 60 * 60 * 1000;

export async function getUserInfo(userId: string): Promise<any> {
  if (!revenuecatConfig.apiKey) {
    throw new Error('REVENUECAT_SECRET_KEY is not set');
  }
  const url = `${revenuecatConfig.baseUrl}/subscribers/${encodeURIComponent(userId)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${revenuecatConfig.apiKey}`,
    },
  });
  if (!res.ok) {
    throw new Error(`RevenueCat request failed: ${res.status}`);
  }
  return await res.json();
}

export function isPro(userInfo: any): boolean {
  const entitlements = userInfo?.subscriber?.entitlements;
  if (!entitlements) return false;
  const pro = entitlements['pro'] || entitlements['premium'];
  if (!pro) return false;
  if (pro.expires_date && new Date(pro.expires_date).getTime() < Date.now()) {
    return false;
  }
  return true;
}

export async function getCachedPro(userId: string): Promise<boolean> {
  const cached = cache.get(userId);
  if (cached && cached.expiry > Date.now()) {
    return cached.pro;
  }
  const info = await getUserInfo(userId);
  const pro = isPro(info);
  cache.set(userId, { pro, expiry: Date.now() + TTL_MS });
  return pro;
}
