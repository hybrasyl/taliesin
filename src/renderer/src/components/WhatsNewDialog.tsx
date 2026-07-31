import React, { useEffect, useState } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  CircularProgress,
  Divider,
  List,
  ListItem,
  Typography
} from '@mui/material'

/**
 * "What's new": renders the CHANGELOG.md bundled with the app.
 *
 * Bundled rather than fetched, so the dialog works offline and always shows the
 * notes for the version actually installed rather than whatever is on main.
 *
 * The file is read on open, not at mount, so a dialog nobody opens costs
 * nothing. The result is cached for the session — the changelog cannot change
 * under a running build.
 */
function WhatsNewDialog({
  open,
  onClose
}: {
  open: boolean
  onClose: () => void
}): React.ReactElement {
  // undefined = not read yet; null = the file wasn't bundled.
  const [text, setText] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    if (open && text === undefined) void window.api.getChangelog().then(setText)
  }, [open, text])

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>What&apos;s new</DialogTitle>
      <DialogContent dividers>
        {text === undefined && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        )}
        {text === null && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            The changelog wasn&apos;t bundled with this build.
          </Typography>
        )}
        {text && <ChangelogBody markdown={stripPreamble(text)} />}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}

/**
 * Everything from the first `## ` heading on — drops the file's H1, the
 * Keep-a-Changelog blurb, and the HTML comment holding the release process
 * (internal notes, not release notes). Falls back to the whole file if no
 * version heading is found, so a reformatted changelog still shows something.
 */
export function stripPreamble(markdown: string): string {
  const match = /^## /m.exec(markdown)
  return match ? markdown.slice(match.index) : markdown
}

/** One release: `## [2.8.0] - 2026-07-20` and the groups beneath it. */
export interface Release {
  /** Heading text with the brackets stripped, e.g. `2.8.0` or `Unreleased`. */
  version: string
  /** Trailing date if the heading carried one, else null. */
  date: string | null
  groups: { heading: string; items: string[] }[]
}

/**
 * Parses the constrained Keep-a-Changelog shape this repo actually writes:
 * `## [version] - date`, `### Added|Changed|Fixed|…`, and `- ` bullets that may
 * wrap onto indented continuation lines.
 *
 * Deliberately not a general markdown parser. The file's structure is fixed by
 * the release process documented in its own preamble, so a purpose-built reader
 * covers it exactly and keeps react-markdown + remark-gfm out of the bundle for
 * one dialog. Anything unrecognised is ignored rather than guessed at.
 */
export function parseChangelog(markdown: string): Release[] {
  const releases: Release[] = []
  let release: Release | null = null
  let group: { heading: string; items: string[] } | null = null

  for (const line of markdown.split('\n')) {
    const version = /^## +(.*)$/.exec(line)
    if (version) {
      const text = version[1].trim()
      // `[2.8.0] - 2026-07-20`, or bare `[Unreleased]`.
      const parts = /^\[?([^\]]+?)\]?(?: +- +(.+))?$/.exec(text)
      release = {
        version: parts ? parts[1].trim() : text,
        date: parts?.[2]?.trim() ?? null,
        groups: []
      }
      releases.push(release)
      group = null
      continue
    }

    const heading = /^### +(.*)$/.exec(line)
    if (heading && release) {
      group = { heading: heading[1].trim(), items: [] }
      release.groups.push(group)
      continue
    }

    const bullet = /^- +(.*)$/.exec(line)
    if (bullet && group) {
      group.items.push(bullet[1])
      continue
    }

    // An indented, non-empty line continues the bullet above it — the changelog
    // wraps its prose at ~100 columns, so most entries span several lines.
    if (group && group.items.length > 0 && /^ +\S/.test(line)) {
      group.items[group.items.length - 1] += ' ' + line.trim()
    }
  }

  return releases
}

/** Inline `**bold**` and `` `code` `` within one bullet. Splits on both at once
 *  so the two cannot nest incorrectly; anything else is left as plain text. */
export function renderInline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <Box
          key={i}
          component="code"
          sx={{
            px: 0.5,
            py: 0.125,
            borderRadius: 0.5,
            bgcolor: 'action.hover',
            fontFamily: 'monospace',
            fontSize: '0.85em'
          }}
        >
          {part.slice(1, -1)}
        </Box>
      )
    }
    return <React.Fragment key={i}>{part}</React.Fragment>
  })
}

function ChangelogBody({ markdown }: { markdown: string }): React.ReactElement {
  const releases = parseChangelog(markdown)

  return (
    <Box data-testid="changelog-body">
      {releases.map((release, ri) => (
        <Box key={release.version + ri} sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {release.version}
            </Typography>
            {release.date && (
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {release.date}
              </Typography>
            )}
          </Box>
          <Divider sx={{ mt: 0.5, mb: 1 }} />
          {release.groups.map((group, gi) => (
            <Box key={group.heading + gi} sx={{ mb: 1.5 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                {group.heading}
              </Typography>
              <List dense disablePadding sx={{ listStyleType: 'disc', pl: 3 }}>
                {group.items.map((item, ii) => (
                  <ListItem key={ii} sx={{ display: 'list-item', px: 0, py: 0.25 }}>
                    <Typography variant="body2">{renderInline(item)}</Typography>
                  </ListItem>
                ))}
              </List>
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  )
}

export default WhatsNewDialog
