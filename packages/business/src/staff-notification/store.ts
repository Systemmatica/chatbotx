import { cacheConnections } from "@chatbotx.io/redis"

/**
 * The two atomic primitives the notifier needs from Redis, behind an
 * interface so the code/claim logic is unit-testable with an in-memory fake.
 */
export type StaffNotifierStore = {
  /** SET key value EX ttl NX — true when this call created the key. */
  setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean>
  /** Atomically read and delete (single use). */
  take(key: string): Promise<string | null>
  delete(key: string): Promise<void>
}

export const redisStaffNotifierStore: StaffNotifierStore = {
  async setIfAbsent(key, value, ttlSeconds) {
    const redis = await cacheConnections.useExisting()
    const result = await redis.set(key, value, "EX", ttlSeconds, "NX")
    return result === "OK"
  },

  async take(key) {
    const redis = await cacheConnections.useExisting()
    // MULTI keeps GET+DEL atomic without requiring Redis 6.2 GETDEL.
    const results = await redis.multi().get(key).del(key).exec()
    const [getResult] = results ?? []
    if (!getResult) {
      return null
    }
    const [error, value] = getResult
    if (error) {
      throw error
    }
    return typeof value === "string" ? value : null
  },

  async delete(key) {
    const redis = await cacheConnections.useExisting()
    await redis.del(key)
  },
}
