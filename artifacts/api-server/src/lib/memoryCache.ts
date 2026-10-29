class MemoryCache {
  private store = new Map<string, { data: unknown; expiresAt: number }>();

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.data as T;
  }

  set(key: string, data: unknown, ttlMs = 120_000): void {
    this.store.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  invalidate(prefixOrPattern: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefixOrPattern) || key.includes(prefixOrPattern)) {
        this.store.delete(key);
      }
    }
  }

  invalidateAll(): void {
    this.store.clear();
  }
}

export const memoryCache = new MemoryCache();
