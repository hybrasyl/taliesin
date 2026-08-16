import React from 'react'
import { Box, Tooltip, Typography } from '@mui/material'

/**
 * The hover card for a file-list row.
 *
 * Every row in both editors truncates: `noWrap` clips the primary line, and the
 * secondary lines clip with an ellipsis. In folder view the row drops the folder
 * from the label entirely, because the header above it already carries the
 * folder — which is right for reading a tree and wrong for the one moment you
 * want to know exactly which file a row is. The panel is 240px wide and the
 * names are not.
 *
 * So this shows the same lines the row does, whole, plus the path the row never
 * shows. It reports; it does not add. A line with no value is left out rather
 * than shown empty.
 */

export interface RowDetail {
  label: string
  /** Left out when this is empty, null or undefined. */
  value: string | number | null | undefined
}

/**
 * Wait before showing. A file list is scanned as much as it is read, and a
 * tooltip that appears the moment the pointer crosses a row turns a scan into a
 * flicker of cards.
 */
const ENTER_DELAY_MS = 600

export function RowTooltip({
  details,
  children
}: {
  details: RowDetail[]
  children: React.ReactElement
}): React.ReactElement {
  const lines = details.filter((d) => d.value !== null && d.value !== undefined && d.value !== '')
  if (lines.length === 0) return children

  return (
    <Tooltip
      // Not interactive: there is nothing in it to click, and an interactive
      // tooltip over a list row eats the click meant for the row beneath it.
      disableInteractive
      enterDelay={ENTER_DELAY_MS}
      enterNextDelay={ENTER_DELAY_MS}
      placement="right"
      title={
        <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 1, rowGap: 0.25 }}>
          {lines.map((d) => (
            <React.Fragment key={d.label}>
              <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                {d.label}
              </Typography>
              <Typography variant="caption" sx={{ wordBreak: 'break-all' }}>
                {d.value}
              </Typography>
            </React.Fragment>
          ))}
        </Box>
      }
    >
      {children}
    </Tooltip>
  )
}
