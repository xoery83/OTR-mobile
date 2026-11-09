import type { Migration } from "../migrations";

export const tripCoreLocalDocumentMigration: Migration = {
  id: 77,
  name: "trip_core_local_document_metadata",
  sql: `
CREATE TABLE trip_core_trip_operational_documents_next (
  cache_account_id TEXT NOT NULL,
  mirror_key TEXT NOT NULL,
  "id" TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "owner_account_id" TEXT NOT NULL,
  "visibility" TEXT NOT NULL,
  "hidden_at" TEXT,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  "field_state" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "media_type" TEXT NOT NULL,
  "byte_size" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "custody" TEXT NOT NULL,
  "source_representation_id" TEXT,
  "storage_object_key" TEXT,
  "content_version" INTEGER NOT NULL,
  "ticket_face_index" INTEGER,
  "qr_region" TEXT,
  "custody_receipt_id" TEXT CHECK (("custody"='LOCAL_ONLY') = ("custody_receipt_id" IS NULL)),
  PRIMARY KEY(cache_account_id, "trip_id", mirror_key),
  UNIQUE(cache_account_id, "trip_id", "id")
);
INSERT INTO trip_core_trip_operational_documents_next
  SELECT * FROM trip_core_trip_operational_documents;
DROP TABLE trip_core_trip_operational_documents;
ALTER TABLE trip_core_trip_operational_documents_next RENAME TO trip_core_trip_operational_documents;
CREATE INDEX trip_core_trip_operational_documents_scope ON trip_core_trip_operational_documents(cache_account_id,"trip_id");
  `,
};
