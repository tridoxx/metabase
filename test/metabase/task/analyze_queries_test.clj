(ns metabase.task.analyze-queries-test
  (:require
   [clojure.test :refer :all]
   [metabase.query-analysis :as query-analysis]
   [metabase.task.analyze-queries :as task.analyze-queries]
   [metabase.task.setup.query-analysis-setup :as setup]
   [metabase.util :as u]
   [metabase.util.queue :as queue]
   [toucan2.core :as t2]))

;; This cannot be run in parallel due to its use of the global queue.
;; Perhaps we should fix that...
(deftest ^:synchronized analyzer-loop-test
  (setup/with-test-setup! [c1 c2 c3 c4 arch]
    (let [card-ids (map :id [c1 c2 c3 c4 arch])]

      ;; Make sure there is *no* pre-existing analysis.
      (queue/clear! @#'query-analysis/queue)
      (t2/delete! :model/QueryField :card_id [:in card-ids])

      (let [get-count #(t2/select-one-fn :cnt [:model/QueryField [[:count :id] :cnt]] :card_id %)]
        (testing "QueryField is empty - queries weren't analyzed"
          (is (every? zero? (map get-count card-ids))))

        ;; queue the cards
        (query-analysis/with-queued-analysis
         (run! query-analysis/analyze-async! card-ids))

        ;; run the analysis for 2s
        (try
          (u/with-timeout 2000
            (#'task.analyze-queries/analyzer-loop!))
          (catch Exception _))

        (testing "QueryField is filled now"
          (testing "for a native query"
            (is (pos? (get-count (:id c1)))))
          (testing "for a native query with template tags"
            (is (pos? (get-count (:id c2)))))
          (testing "for an MBQL"
            (is (pos? (get-count (:id c3)))))
          (testing "for an MLv2"
            (is (pos? (get-count (:id c4)))))
          (testing "but not for an archived card"
            (is (zero? (get-count (:id arch))))))))))
