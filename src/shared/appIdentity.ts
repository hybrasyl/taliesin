// The single per-app identity constant, read by the Report Issue module and the
// update-check module. A sibling app that adopts either edits this file; the
// module files themselves are drop-in.
//
// All house apps point `intakeOwner`/`intakeRepo` at the SAME public intake repo
// (hybrasyl/cernunnos); only `productName` + `appLabel` differ. The label is what
// lets maintainers triage/move issues by their source app.
//
// Keep this file free of electron/node imports: main, the renderer and
// scripts/publish-version.mjs all read it (see the document repo's
// docs/architecture/report-issue-module.md and update-check-module.md).

export interface AppIdentity {
  productName: string
  intakeOwner: string
  intakeRepo: string
  appLabel: string
  homepage: string
  /**
   * The app's key in the house version manifest (update-check module). Lower
   * case, the repo name. Set explicitly, so a package rename cannot move the app
   * to a key that nothing writes.
   */
  updateKey: string
  /**
   * The update notice opens a manifest `url` only when it starts with this. Today
   * it is the app's GitHub releases path; it changes when downloads move to S3.
   */
  releaseUrlPrefix: string
}

export const appIdentity: AppIdentity = {
  productName: 'Taliesin',
  intakeOwner: 'hybrasyl',
  intakeRepo: 'cernunnos',
  appLabel: 'app:taliesin',
  homepage: 'https://github.com/hybrasyl/taliesin',
  updateKey: 'taliesin',
  releaseUrlPrefix: 'https://github.com/hybrasyl/taliesin/releases/'
}
