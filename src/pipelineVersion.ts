/**
 * The pipeline’s output version — an opaque token the framework compares for
 * equality to decide whether a dataset can be skipped as unchanged.
 *
 * Managed by release-please (do not edit by hand): it is bumped when a release
 * PR is merged, and rotating it forces a full reprocess of every dataset on the
 * next run. Pass it to `new Pipeline({ pipelineVersion: PIPELINE_VERSION, … })`
 * alongside a `provenanceStore` to enable skipping.
 */
export const PIPELINE_VERSION = '2.1.1'; // x-release-please-version
