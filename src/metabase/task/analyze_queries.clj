(ns metabase.task.analyze-queries
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.public-settings :as public-settings]
   [metabase.query-analysis :as query-analysis]
   [metabase.task :as task]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import
   (org.quartz DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

(def ^:private max-cpu-usage-ratio 0.2)

(def ^:private wait-ratio
  (/ (- 1 max-cpu-usage-ratio) max-cpu-usage-ratio))

(def ^:private fail-wait-ms (* 2 1000))

(def ^:private min-wait-ms 5)

(def ^:private max-wait-ms (* 10 1000))

(defn- wait-proportional ^long [time-taken-ms]
  (->> time-taken-ms
       (* wait-ratio)
       (max min-wait-ms)
       (min max-wait-ms)))

(defn- wait-fail ^long [time-taken-ms]
  (max fail-wait-ms (wait-proportional time-taken-ms)))

(defn- analyzer-loop! []
  (while (public-settings/query-analysis-enabled)
    (let [card-id (query-analysis/next-card-id!)
          timer   (u/start-timer)]
      (try
        (query-analysis/analyze-card! card-id)
        (Thread/sleep (wait-proportional (u/since-ms timer)))
        (catch Exception e
          (log/errorf e "Error analysing and updating query for Card %" card-id)
          (Thread/sleep (wait-fail (u/since-ms timer))))))))

(jobs/defjob ^{DisallowConcurrentExecution true
               :doc                        "Analyze "}
  QueryAnalyzer [_ctx]
  (analyzer-loop!))

(defmethod task/init! ::BackfillQueryField [_]
  (let [job     (jobs/build
                 (jobs/of-type QueryAnalyzer)
                 (jobs/with-identity (jobs/key "metabase.task.analyze-queries.job")))
        trigger (triggers/build
                 (triggers/with-identity (triggers/key "metabase.task.analyze-queries.trigger"))
                 (triggers/with-schedule
                  (simple/schedule (simple/with-interval-in-minutes 1)))
                 (triggers/start-now))]
    (task/schedule-task! job trigger)))
