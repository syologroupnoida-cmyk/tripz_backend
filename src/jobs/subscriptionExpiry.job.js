import { env } from '../config/env.js';
import * as subscriptionRepo from '../repositories/subscription.repository.js';

let timer = null;
let running = false;

export const runSubscriptionExpirySweep = async () => {
  // Avoid overlapping sweeps if a database call takes longer than the chosen
  // interval. Multiple application instances remain safe because the update
  // itself only targets rows that are still ACTIVE.
  if (running) return 0;

  running = true;
  try {
    const expiredCount = await subscriptionRepo.expireStaleSubscriptions();
    if (expiredCount > 0) {
      console.log(`[subscription-expiry] Marked ${expiredCount} subscription(s) EXPIRED.`);
    }
    return expiredCount;
  } catch (error) {
    // A background cleanup failure must not crash the API. Request-time
    // expiresAt filters continue to prevent expired subscription access.
    console.error('[subscription-expiry] Sweep failed:', error);
    return 0;
  } finally {
    running = false;
  }
};

export const startSubscriptionExpiryJob = () => {
  if (timer) return;

  void runSubscriptionExpirySweep();
  timer = setInterval(
    () => void runSubscriptionExpirySweep(),
    env.SUBSCRIPTION_EXPIRY_INTERVAL_MS,
  );
  timer.unref();

  console.log(
    `[subscription-expiry] Job started (interval=${env.SUBSCRIPTION_EXPIRY_INTERVAL_MS}ms).`,
  );
};

export const stopSubscriptionExpiryJob = () => {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
};
