(ns metabase.metabot.util
  "Functions for denormalizing input, prompt input generation, and sql handing.
  If this grows much, we might want to split these out into separate nses."
  (:require
    [cheshire.core :as json]
    [clojure.core.memoize :as memoize]
    [clojure.string :as str]
    [honey.sql :as sql]
    [metabase.db.query :as mdb.query]
    [metabase.mbql.util :as mbql.u]
    [metabase.metabot.inference-ws-client :as inference-ws-client]
    [metabase.metabot.settings :as metabot-settings]
    [metabase.models :refer [Card Field FieldValues Table]]
    [metabase.query-processor :as qp]
    [metabase.query-processor.reducible :as qp.reducible]
    [metabase.query-processor.util.add-alias-info :as add]
    [metabase.util :as u]
    [metabase.util.log :as log]
    [toucan2.core :as t2]))

(defn supported?
  "Is metabot supported for the given database."
  [db-id]
  (let [q "SELECT 1 FROM (SELECT 1 AS ONE) AS TEST"]
    (try
      (some?
       (qp/process-query {:database db-id
                          :type     "native"
                          :native   {:query q}}))
      (catch Exception _ false))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;; Input Denormalization ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn normalize-name
  "Normalize model and column names to SLUG_CASE.
  The current bot responses do a terrible job of creating all kinds of SQL from a table or column name.
  Example: 'Created At', CREATED_AT, \"created at\" might all come back in the response.
  Standardization of names produces dramatically better results."
  [s]
  (some-> s
          u/upper-case-en
          (str/replace #"[^\p{Alnum}]+" " ")
          str/trim
          (str/replace #" " "_")))

(defn- add-qp-column-aliases
  "Add the aliases generated by the query processor to each results metadata field."
  [{:keys [dataset_query] :as model}]
  (let [fields           (let [qp (qp.reducible/combine-middleware
                                   (vec qp/around-middleware)
                                   (fn [query _rff _context]
                                     (add/add-alias-info
                                      (#'qp/preprocess* query))))]
                           (get-in (qp dataset_query nil nil) [:query :fields]))
        field-ref->alias (reduce
                          (fn [acc [_f _id-or-name m :as field-ref]]
                            (if-let [alias (::add/desired-alias m)]
                              (assoc acc (mbql.u/remove-namespaced-options field-ref) alias)
                              acc))
                          {}
                          fields)]
    (update model :result_metadata
            (fn [result_metadata]
              (map
               (fn [{:keys [field_ref] :as rsmd}]
                 (assoc rsmd :qp_column_name (field-ref->alias field_ref)))
               result_metadata)))))

(defn- add-field-values
  "Add enumerated values (if a low-cardinality field) to a field."
  ([{:keys [id base_type] :as field} enum-cardinality-threshold]
   (let [field-vals (when
                     (and
                      (not= :type/Boolean base_type)
                      (< 0
                         (get-in field [:fingerprint :global :distinct-count] 0)
                         (inc enum-cardinality-threshold)))
                      (t2/select-one-fn :values FieldValues :field_id id))]
     (-> (cond-> field
           (seq field-vals)
           (assoc :possible_values (vec field-vals))))))
  ([field]
   (add-field-values
    field
    (metabot-settings/enum-cardinality-threshold))))

(defn- add-low-cardinality-field-values
  "Add low cardinality field values to the model's result_metadata.
  This can be useful data for downstream inferencers."
  ([field enum-cardinality-threshold]
   (add-field-values field enum-cardinality-threshold))
  ([field]
   (add-low-cardinality-field-values
    field
    (metabot-settings/enum-cardinality-threshold))))

(defn enrich-model
  "Add data to the model that may be useful for the inferencers
  that is not available to a backend without db access.

  Also remove values that are not considered useful for inferencing."
  [model]
  (-> model
      add-qp-column-aliases
      (update :result_metadata #(mapv add-low-cardinality-field-values %))
      (dissoc :creator_id :dataset_query :table_id :collection_position)))

(defn- models->json-summary
  "Convert a map of {:models ...} to a json string summary of these models.
  This is used as a summary of the database in prompt engineering."
  [{:keys [models]}]
  (let [json-str (json/generate-string
                  {:tables
                   (for [{model-name :name model-id :id :keys [result_metadata] :as _model} models]
                     {:table-id     model-id
                      :table-name   model-name
                      :column-names (mapv :display_name result_metadata)})}
                  {:pretty true})
        nchars   (count json-str)]
    (log/debugf "Database json string descriptor contains %s chars (~%s tokens)."
                nchars
                (quot nchars 4))
    json-str))

(defn- add-model-json-summary [database]
  (assoc database :model_json_summary (models->json-summary database)))

(defn- field->pseudo-enums
  "For a field, create a potential enumerated type string.
  Returns nil if there are no field values or the cardinality is too high."
  ([{table-name :name} {field-name :name field-id :id :keys [base_type]} enum-cardinality-threshold]
   (when-let [values (and
                      (not= :type/Boolean base_type)
                      (t2/select-one-fn :values FieldValues :field_id field-id))]
     (when (<= (count values) enum-cardinality-threshold)
       (let [ddl-str (format "create type %s_%s_t as enum %s;"
                             table-name
                             field-name
                             (str/join ", " (map (partial format "'%s'") values)))
             nchars  (count ddl-str)]
         (log/debugf "Pseudo-ddl for field enum %s describes %s values and contains %s chars (~%s tokens)."
                     field-name
                     (count values)
                     nchars
                     (quot nchars 4))
         ddl-str))))
  ([table field]
   (field->pseudo-enums table field (metabot-settings/enum-cardinality-threshold))))

(defn table->pseudo-ddl
  "Create an 'approximate' ddl to represent how this table might be created as SQL.
  This can be very expensive if performed over an entire database, so memoization is recommended.
  Memoization currently happens in create-table-embedding."
  ([{table-name :name schema-name :schema table-id :id :as table} enum-cardinality-threshold]
   (let [fields       (t2/select [Field
                                  :base_type
                                  :database_required
                                  :database_type
                                  :fk_target_field_id
                                  :id
                                  :name
                                  :semantic_type]
                        :table_id table-id)
         enums        (reduce
                       (fn [acc {field-name :name :as field}]
                         (if-some [enums (field->pseudo-enums table field enum-cardinality-threshold)]
                           (assoc acc field-name enums)
                           acc))
                       {}
                       fields)
         columns      (vec
                       (for [{column-name :name :keys [database_required database_type]} fields]
                         (cond-> [column-name
                                  (if (enums column-name)
                                    (format "%s_%s_t" table-name column-name)
                                    database_type)]
                           database_required
                           (conj [:not nil]))))
         primary-keys [[(into [:primary-key]
                              (comp (filter (comp #{:type/PK} :semantic_type))
                                    (map :name))
                              fields)]]
         foreign-keys (for [{field-name :name :keys [semantic_type fk_target_field_id]} fields
                            :when (= :type/FK semantic_type)
                            :let [{fk-field-name :name fk-table-id :table_id} (t2/select-one [Field :name :table_id]
                                                                                :id fk_target_field_id)
                                  {fk-table-name :name fk-table-schema :schema} (t2/select-one [Table :name :schema]
                                                                                  :id fk-table-id)]]
                        [[:foreign-key field-name]
                         [:references (cond->>
                                       fk-table-name
                                        fk-table-schema
                                        (format "%s.%s" fk-table-schema))
                          fk-field-name]])
         create-sql   (->
                       (sql/format
                        {:create-table (keyword schema-name table-name)
                         :with-columns (reduce into columns [primary-keys foreign-keys])}
                        {:dialect :ansi :pretty true})
                       first
                       mdb.query/format-sql)
         ddl-str      (str/join "\n\n" (conj (vec (vals enums)) create-sql))
         nchars       (count ddl-str)]
     (log/debugf "Pseudo-ddl for table '%s.%s'(%s) describes %s fields, %s enums, and contains %s chars (~%s tokens)."
                 schema-name
                 table-name
                 table-id
                 (count fields)
                 (count enums)
                 nchars
                 (quot nchars 4))
     ddl-str))
  ([table]
   (table->pseudo-ddl table (metabot-settings/enum-cardinality-threshold))))

(defn denormalize-database
  "Create a 'denormalized' version of the database which is optimized for querying.
  Adds in denormalized models, sql-friendly names, and a json summary of the models
  appropriate for prompt engineering."
  [{database-name :name db_id :id :as database}]
  (let [models (t2/select Card :database_id db_id :dataset true)]
    (-> database
        (assoc :sql_name (normalize-name database-name))
        (assoc :models (mapv enrich-model models))
        add-model-json-summary)))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;; Prompt Input ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn- prompt-template->messages
  "Given a prompt template and a context, fill the template messages in with
  the appropriate values to create the actual submitted messages."
  [{:keys [messages]} context]
  (letfn [(update-contents [s]
            (str/replace s #"%%([^%]+)%%"
                         (fn [[_ path]]
                           (let [kw (->> (str/split path #":")
                                         (mapv (comp keyword u/lower-case-en)))]
                             (or (get-in context kw)
                                 (let [message (format "No value found in context for key path '%s'" kw)]
                                   (throw (ex-info
                                           message
                                           {:message     message
                                            :status-code 400}))))))))]
    (map (fn [prompt] (update prompt :content update-contents)) messages)))

(defn- default-prompt-templates
  "Retrieve prompt templates from the metabot-get-prompt-templates-url."
  []
  (log/info "Refreshing metabot prompt templates.")
  (let [all-templates (-> (metabot-settings/metabot-get-prompt-templates-url)
                          slurp
                          (json/parse-string keyword))]
    (-> (group-by (comp keyword :prompt_template) all-templates)
        (update-vals
         (fn [templates]
           (let [ordered (vec (sort-by :version templates))]
             {:latest    (peek ordered)
              :templates ordered}))))))

(def ^:private ^:dynamic *prompt-templates*
  "Return a map of prompt templates with keys of template type and values
  which are objects containing keys 'latest' (the latest template version)
   and 'templates' (all template versions)."
  (memoize/ttl
   default-prompt-templates
    ;; Check for updates every hour
   :ttl/threshold (* 1000 60 60)))

(defn create-prompt
  "Create a prompt by looking up the latest template for the prompt_task type
   of the context interpolating all values from the template. The returned
   value is the template object with the prompt contained in the ':prompt' key."
  [{:keys [prompt_task] :as context}]
  (if-some [{:keys [messages] :as template} (get-in (*prompt-templates*) [prompt_task :latest])]
    (let [prompt (assoc template
                        :message_templates messages
                        :messages (prompt-template->messages template context))]
      (let [nchars (count (mapcat :content messages))]
        (log/debugf "Prompt running with %s chars (~%s tokens)." nchars (quot nchars 4)))
      prompt)
    (throw
     (ex-info
      (format "No prompt inference template found for prompt type: %s" prompt_task)
      {:prompt_type prompt_task}))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;; Results Processing ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn select-all?
  "Is this a simple SELECT * query?"
  [sql]
  (some? (re-find #"(?i)^select\s*\*" sql)))

(defn find-result
  "Given a set of choices returned from the bot, find the first one returned by
   the supplied message-fn."
  [message-fn {:keys [choices]}]
  (or
   (some
    (fn [{:keys [message]}]
      (when-some [res (message-fn (:content message))]
        res))
    choices)
   (log/infof
    "Unable to find appropriate result for user prompt in responses:\n\t%s"
    (str/join "\n\t" (map (fn [m] (get-in m [:message :content])) choices)))))

(defn extract-sql
  "Search a provided string for a SQL block"
  [s]
  (let [sql (if (str/starts-with? (u/upper-case-en (str/trim s)) "SELECT")
              ;; This is just a raw SQL statement
              s
              ;; It looks like markdown
              (let [[_pre sql _post] (str/split s #"```(sql|SQL)?")]
                sql))]
    (mdb.query/format-sql sql)))

(defn extract-json
  "Search a provided string for a JSON block"
  [s]
  (let [json (if (and
                  (str/starts-with? s "{")
                  (str/ends-with? s "}"))
               ;; Assume this is raw json
               s
               ;; It looks like markdown
               (let [[_pre json _post] (str/split s #"```(json|JSON)?")]
                 json))]
    (json/parse-string json keyword)))

(defn bot-sql->final-sql
  "Produce the final query usable by the UI but converting the model to a CTE
  and calling the bot sql on top of it."
  [{:keys [inner_query sql_name] :as _denormalized-model} outer-query]
  (format "WITH %s AS (%s) %s" sql_name inner_query outer-query))

(defn response->viz
  "Given a response from the LLM, map this to visualization settings. Default to a table."
  [{:keys [display description visualization_settings]}]
  (let [display (keyword display)
        {:keys [x-axis y-axis]} visualization_settings]
    (case display
      (:line :bar :area :waterfall) {:display                display
                                     :name                   description
                                     :visualization_settings {:graph.dimensions [x-axis]
                                                              :graph.metrics    y-axis}}
      :scalar {:display                display
               :name                   description
               :visualization_settings {:graph.metrics    y-axis
                                        :graph.dimensions []}}
      {:display                :table
       :name                   description
       :visualization_settings {:title description}})))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;; Inference WS/IL Methods ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn model->context
  "Convert a model to a 'context', the representation used to tell the LLM
  about what is stored in the model.

  The context contains the table name and id as well as field names and ids.
  This is what the LLMs are currently trained on, so modifying this context
  will likely require retraining as well. We probably _should_ remove ids since
  they add no value when we replace them in the prompts and we should add model
  descriptions for fields."
  [{model-name :name model-id :id :keys [result_metadata]}]
  {:table_name model-name
   :table_id   model-id
   ;; todo: aggregations may behave differently (ie referenced by position not name)
   :fields     (for [{col-name :name field-name :display_name :as field} result_metadata
                     :let [typee (or (:effective_type field) (:base_type field))]]
                 {:clause [:field col-name {:base-type (str (namespace typee) "/" (name typee))}]
                  :field_name field-name
                  :field_type typee})})

(defn model->summary
  "Create a summary description appropriate for embedding.

  The embeddings created here will be compared to the embedding for the prompt
  and the closest match(es) will be used for inferencing. This summary should
  contain terms that relate well to the user prompt. The summary should be
  word-oriented rather than data oriented (provide a sentence, not json) as the
  comparison will be sentence to sentence."
  [{model-name :name model-description :description :keys [result_metadata]}]
  (let [fields-str (str/join "," (map :display_name result_metadata))]
    (if (seq model-description)
      (format "%s: %s: %s" model-name model-description fields-str)
      (format "%s: %s" model-name fields-str))))

(defn rank-data-by-prompt
  "Return the ranked datasets by the provided prompt.

  The prompt is a string and the datasets are a map of any set of keyed objects
   to the embedding representing this dataset. Note that values need not be a
   direct embedding of the keys. The keys can be anything and should be the
   desired output type to be used when doing rank selection on the dataset."
  [prompt dataset->embeddings]
  (letfn [(dot [u v] (reduce + (map * u v)))]
    (let [embeddings       (inference-ws-client/call-bulk-embeddings-endpoint {prompt prompt})
          prompt-embedding (get embeddings prompt)]
      (->> dataset->embeddings
           (map (fn [[k e]] {:object k :cosine-similarity (dot prompt-embedding e)}))
           (sort-by (comp - :cosine-similarity))))))