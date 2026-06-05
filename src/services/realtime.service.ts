import { env } from "../config/env.js";
import { getSupabaseAdmin } from "../integrations/supabaseAdmin.js";
import { logger } from "../utils/logger.js";

const SUBSCRIBE_TIMEOUT_MS = 10_000;

export const realtimeService = {
  async publishReviewCreated(payload: { placeId: string; reviewId: string }) {
    try {
      if (process.env.NODE_ENV === "test") return;
      const client = getSupabaseAdmin();
      if (!client) return;

      const channel = client.channel(env.supabaseBroadcastChannel, {
        config: { broadcast: { self: false } },
      });
      const unsubscribe = () => {
        void channel.unsubscribe().catch((err) => {
          logger.warn({ err }, "realtime channel unsubscribe failed");
        });
      };

      await new Promise<void>((resolve, reject) => {
        let finished = false;
        const done = (fn: () => void) => {
          if (finished) return;
          finished = true;
          setImmediate(fn);
        };

        const timer = setTimeout(() => {
          unsubscribe();
          done(() => reject(new Error("REALTIME_SUBSCRIBE_TIMEOUT")));
        }, SUBSCRIBE_TIMEOUT_MS);

        channel.subscribe((status, err) => {
          if (status === "SUBSCRIBED") {
            void channel
              .send({
                type: "broadcast",
                event: "review_created",
                payload,
              })
              .then((result) => {
                if (result !== "ok" && process.env.NODE_ENV !== "production") {
                  logger.warn({ result }, "realtime broadcast send status");
                }
                return channel.unsubscribe();
              })
              .then(() => {
                clearTimeout(timer);
                done(() => resolve());
              })
              .catch((e) => {
                clearTimeout(timer);
                unsubscribe();
                done(() => reject(e instanceof Error ? e : new Error(String(e))));
              });
            return;
          }

          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            clearTimeout(timer);
            unsubscribe();
            done(() => reject(err ?? new Error(status)));
          }
        });
      });
    } catch (err) {
      logger.warn({ err, payload }, "realtime review_created publish failed");
    }
  },
};
