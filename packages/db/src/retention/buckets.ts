// #112 (a-retention): the buckets the sweepers delete from, as the job uses them. The composition root (the worker
// job) passes Cloud Storage; tests pass doubles. Objects sit under `orgs/{org_id}/` (#79 §3).

/** One object in a retention bucket. */
export interface RetentionObject {
  name: string
  /** The object's custom metadata. */
  metadata: Record<string, string>
  /** When the object was written. */
  timeCreated: Date
  /** The uploader's stamp: the frame's project semester end on FRAMES_BUCKET, null when unset. */
  customTime: Date | null
}

/** The slice of Cloud Storage a sweeper needs: list a prefix, delete one object. */
export interface RetentionBucket {
  list(prefix: string): Promise<RetentionObject[]>
  /** Deletes `name`; a missing object is already gone, so it is not an error. */
  delete(name: string): Promise<void>
}

/** FRAMES_BUCKET holds camera frames, EXPORTS_BUCKET the account and organisation export files (#79 §6). */
export interface RetentionBuckets {
  frames: RetentionBucket
  exports: RetentionBucket
}
