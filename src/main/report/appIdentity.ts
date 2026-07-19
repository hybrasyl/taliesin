// The single per-app identity constant for the portable Report Issue / diagnostics
// module. This is the ONLY file a sibling app edits to adopt the module — every
// other module file is drop-in.
//
// All house apps point `intakeOwner`/`intakeRepo` at the SAME public intake repo
// (hybrasyl/cernunnos); only `productName` + `appLabel` differ. The label is what
// lets maintainers triage/move issues by their source app.
//
// Keep this file free of electron/node imports — it holds no I/O, only data, and
// mirrors the house skeleton's src/shared/ contract (see the document repo's
// docs/architecture/report-issue-module.md).

export interface AppIdentity {
  productName: string
  intakeOwner: string
  intakeRepo: string
  appLabel: string
  homepage: string
}

export const appIdentity: AppIdentity = {
  productName: 'Taliesin',
  intakeOwner: 'hybrasyl',
  intakeRepo: 'cernunnos',
  appLabel: 'app:taliesin',
  homepage: 'https://github.com/hybrasyl/taliesin'
}
