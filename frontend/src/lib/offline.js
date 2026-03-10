import { get, set } from "idb-keyval";

export const cacheData = async (key, value) => {
  await set(key, {
    value,
    cachedAt: new Date().toISOString(),
  });
};

export const readCachedData = async (key) => {
  const cached = await get(key);
  return cached?.value ?? null;
};