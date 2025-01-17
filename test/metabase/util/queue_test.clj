(ns metabase.util.queue-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.queue :as queue])
  (:import
   (java.util Set)
   (metabase.util.queue DeduplicatingArrayTransferQueue)))

(set! *warn-on-reflection* true)

(defn- simulate-queue! [queue &
                        {:keys [realtime-threads realtime-events backfill-events]
                         :or   {realtime-threads 5}}]
  (let [sent          (atom 0)
        dropped       (atom 0)
        skipped       (atom 0)
        realtime-fn   (fn []
                        (let [id (rand-int 1000)]
                          (doseq [e realtime-events]
                            (case (queue/maybe-put! queue {:thread (str "real-" id) :payload e})
                              true  (swap! sent inc)
                              false (swap! dropped inc)
                              nil   (swap! skipped inc)))))
        background-fn (fn []
                        (doseq [e backfill-events]
                          (queue/blocking-put! queue {:thread "back", :payload e})))
        run!          (fn [f]
                        (future (f)))]

    (run! background-fn)
    (future
     (dotimes [_ realtime-threads]
       (run! realtime-fn)))

    (let [processed (volatile! [])]
      (try
        (while true
          ;; Stop the consumer once we are sure that there are no more events coming.
          (u/with-timeout 100
            (vswap! processed conj (:payload (queue/blocking-take! queue)))
            ;; Sleep to provide some backpressure
            (Thread/sleep 1)))
        (assert false "this is never reached")
        (catch Exception _
          {:processed @processed
           :sent      @sent
           :dropped   @dropped
           :skipped   @skipped})))))

(deftest deduplicating-bounded-blocking-queue-test
  (doseq [dedupe? [true false]]
    (let [realtime-event-count 500
          backfill-event-count 1000
          capacity             (- realtime-event-count 100)
          ;; Enqueue background events from oldest to newest
          backfill-events      (range backfill-event-count)
          ;; Enqueue realtime events from newest to oldest
          realtime-events      (take realtime-event-count (reverse backfill-events))
          queue                (queue/bounded-transfer-queue capacity :sleep-ms 10 :block-ms 10 :dedupe? dedupe?)

          {:keys [processed sent dropped skipped] :as _result}
          (simulate-queue! queue
                           :backfill-events backfill-events
                           :realtime-events realtime-events)]

      (testing "We processed all the events that were enqueued"
        (is (= (+ (count backfill-events) sent)
               (count processed))))

      (if dedupe?
        (testing "Some items are deduplicated"
          (is (pos? skipped)))
        (testing "No items are skipped"
          (is (zero? skipped))))

      (testing "Some items are dropped"
        (is (pos? dropped)))

      (testing "Every item is processed"
        (is (= (set (concat backfill-events realtime-events)) (set processed))))

      (testing "The realtime events are processed in order"
        (mt/ordered-subset? realtime-events processed))

      (when dedupe?
        (testing "No phantom items are left in the set"
          (is (zero? (.size ^Set (.-queued-set ^DeduplicatingArrayTransferQueue queue)))))))))
