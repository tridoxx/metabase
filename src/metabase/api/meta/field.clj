(ns metabase.api.meta.field
  (:require [compojure.core :refer [GET PUT POST]]
            [medley.core :as medley]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            [metabase.db.metadata-queries :as metadata]
            [metabase.driver :as driver]
            (metabase.models [hydrate :refer [hydrate]]
                             [field :refer [Field] :as field]
                             [field-values :refer [FieldValues]]
                             [foreign-key :refer [ForeignKey] :as fk])
            [metabase.util :as u]))

(defannotation FieldSpecialType [symb value :nillable]
  (checkp-contains? field/special-types symb (keyword value)))

(defannotation FieldType [symb value :nillable]
  (checkp-contains? field/field-types symb (keyword value)))

(defannotation ForeignKeyRelationship [symb value :nillable]
  (checkp-contains? fk/relationships symb (keyword value)))

(defendpoint GET "/:id" [id]
  (->404 (sel :one Field :id id)
         read-check
         (hydrate [:table :db])))

(defendpoint PUT "/:id" [id :as {{:keys [special_type preview_display description]} :body}]
  {special_type FieldSpecialType
   ;; TODO - base_type ??
   }
  (write-check Field id)
  (check-500 (upd-non-nil-keys Field id
               :special_type    special_type
               :preview_display preview_display
               :description     description))
  (sel :one Field :id id))

(defendpoint GET "/:id/summary" [id]
  (let-404 [field (sel :one Field :id id)]
    (read-check field)
    [[:count     (metadata/field-count field)]
     [:distincts (metadata/field-distinct-count field)]]))


(defendpoint GET "/:id/foreignkeys" [id]
  (read-check Field id)
  (-> (sel :many ForeignKey :origin_id id)
      (hydrate [:origin :table] [:destination :table])))


(defendpoint POST "/:id/foreignkeys" [id :as {{:keys [target_field relationship]} :body}]
  {target_field Required
   relationship [Required ForeignKeyRelationship]}
  (write-check Field id)
  (write-check Field target_field)
  (-> (ins ForeignKey
        :origin_id id
        :destination_id target_field
        :relationship relationship)
      (hydrate [:origin :table] [:destination :table])))


(defn- create-field-values
  "Create `FieldValues` for a `Field`."
  [{:keys [id] :as field} human-readable-values]
  (ins FieldValues
    :field_id id
    :values (metadata/field-distinct-values field)
    :human_readable_values human-readable-values))


(defendpoint GET "/:id/values" [id]
  (let-404 [{:keys [special_type] :as field} (sel :one Field :id id)]
    (read-check field)
    (if-not (= special_type "category")
      {:values {} :human_readable_values {}}   ; only categories get to have values
      (or (sel :one FieldValues :field_id id)
          (create-field-values field nil)))))


(defendpoint POST "/:id/value_map_update" [id :as {{:keys [fieldId values_map]} :body}] ; WTF is the reasoning behind client passing fieldId in POST params?
  {values_map [Required Dict]}
  (let-404 [{:keys [special_type]  :as field} (sel :one Field :id id)]
    (write-check field)
    (check (= special_type "category")
      [400 "You can only update the mapped values of a Field whose 'special_type' is 'category'."])
    (if-let [field-values-id (sel :one :id FieldValues :field_id id)]
      (check-500 (upd FieldValues field-values-id
                   :human_readable_values values_map))
      (create-field-values field values_map)))
  {:status :success})


(define-routes)
