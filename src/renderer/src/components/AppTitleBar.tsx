import React from 'react'
import { appIdentity } from '../../../shared/appIdentity'
import { useSettingsStore } from '../store/settingsStore'
import TitleBar from './TitleBar'
// Imported, not a `./taliesin.png` string: an import is hashed into the bundle
// by vite, while a bare string resolved through the renderer's publicDir, which
// copied the whole resources/ tree into out/renderer on top of asarUnpack
// shipping it. See the document repo's ecosystem-rollout-checklist.md R-002.
// It is 192px, not the house 128px, because Settings also draws it larger.
import appIcon from '../assets/taliesin.webp'

/**
 * Taliesin's title bar: the house `TitleBar` (title-bar v1), wired to this
 * app's settings, icon and window calls. The house module stays as the template
 * has it; change this file, not that one. Taliesin's own bar controls (page
 * navigation, Report Issue, Creidhne) are on the nav bar below it, not here, so
 * this bar has no children.
 */
function AppTitleBar(): React.ReactElement {
  const theme = useSettingsStore((s) => s.theme)
  return (
    <TitleBar
      name={appIdentity.productName}
      icon={appIcon}
      theme={theme}
      platform={window.api.platform}
      controls={{
        minimize: () => window.api.minimizeWindow(),
        maximize: () => window.api.maximizeWindow(),
        close: () => window.api.closeWindow()
      }}
    />
  )
}

export default AppTitleBar
