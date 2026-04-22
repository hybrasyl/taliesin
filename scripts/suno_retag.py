#!/usr/bin/env python3
"""
Move Suno-style prompts out of the ID3 Genre (TCON) frame and into a
user-defined TXXX:PROMPT frame, where prose-length descriptions belong.

Why: Suno writes the generation prompt into the Genre frame, which is
spec-defined as a short classification. This pollutes music players that
surface Genre as a tag (including Taliesin). The clean fix is to move the
prompt into a TXXX user-defined text frame keyed "PROMPT".

Usage:
    python suno_retag.py [PATH] [options]

    PATH defaults to the current directory. Directories are scanned recursively
    unless --no-recursive is given.

Options:
    --dry-run           Show what would change without writing.
    --threshold N       Genre length above which to migrate (default: 20).
    --keep-genre        Copy the prompt to TXXX:PROMPT but leave Genre intact.
    --no-recursive      Only process files directly in PATH.

Requires: pip install mutagen

The script is idempotent. On a second run, files whose TXXX:PROMPT already
matches the Genre text are left alone (or Genre is cleared if --keep-genre
was not set and it still has the prompt).

Leave this script in your music library directory and re-run after importing
new files from Suno.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

try:
    from mutagen.id3 import ID3, TXXX
    from mutagen.mp3 import MP3
except ImportError:
    sys.stderr.write("Missing dependency. Install with: pip install mutagen\n")
    sys.exit(1)


PROMPT_KEY = "PROMPT"
DEFAULT_THRESHOLD = 20


def genre_text(tags) -> str:
    tcon = tags.get("TCON") if tags is not None else None
    if tcon is None or not tcon.text:
        return ""
    return "\n".join(str(t) for t in tcon.text).strip()


def prompt_text(tags) -> str:
    txxx = tags.get("TXXX:" + PROMPT_KEY) if tags is not None else None
    if txxx is None or not txxx.text:
        return ""
    return "\n".join(str(t) for t in txxx.text).strip()


def process_file(path: Path, threshold: int, dry_run: bool, keep_genre: bool) -> tuple[str, str]:
    try:
        audio = MP3(path, ID3=ID3)
    except Exception as e:
        return ("error", f"{path}: cannot read ({e})")

    if audio.tags is None:
        return ("skip", f"{path}: no ID3 tags")

    g = genre_text(audio.tags)
    existing = prompt_text(audio.tags)

    # Genre is already short/empty. If PROMPT also unset, nothing to do.
    if len(g) <= threshold:
        return ("skip", f"{path}: genre short or empty")

    preview = g[:60] + ("..." if len(g) > 60 else "")

    # Already migrated: PROMPT matches. Optionally finish the job by clearing Genre.
    if existing == g:
        if keep_genre:
            return ("skip", f"{path}: PROMPT already matches")
        if dry_run:
            return ("dry", f"{path}: would clear Genre (PROMPT already present)")
        audio.tags.delall("TCON")
        audio.save()
        return verify_and_report(path, keep_genre, "cleared", "Genre cleared (PROMPT already present)")

    if dry_run:
        action = "set PROMPT"
        if not keep_genre:
            action += " and clear Genre"
        return ("dry", f"{path}: would {action} -- {preview!r}")

    # Write TXXX:PROMPT (desc is the key, text is the value)
    audio.tags.add(TXXX(encoding=3, desc=PROMPT_KEY, text=g))
    if not keep_genre:
        audio.tags.delall("TCON")
    audio.save()
    suffix = "Genre kept" if keep_genre else "Genre cleared"
    return verify_and_report(path, keep_genre, "migrated", f"PROMPT set, {suffix} -- {preview!r}")


def verify_and_report(path: Path, keep_genre: bool, status: str, msg: str) -> tuple[str, str]:
    """After saving, re-read the file to confirm the mutation actually took effect."""
    try:
        check = MP3(path, ID3=ID3)
    except Exception:
        return (status, f"{path}: {msg} (could not re-verify)")
    still_has_genre = check.tags is not None and "TCON" in check.tags
    if not keep_genre and still_has_genre:
        return ("error", f"{path}: Genre still present after save! (possibly ID3v1 tag; try --clear-v1)")
    return (status, f"{path}: {msg}")


def main() -> int:
    p = argparse.ArgumentParser(
        description="Move Suno prompts from Genre to a TXXX:PROMPT frame.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    p.add_argument("path", nargs="?", default=".", help="File or directory (default: cwd)")
    p.add_argument("--dry-run", action="store_true", help="Show changes without writing")
    p.add_argument("--threshold", type=int, default=DEFAULT_THRESHOLD,
                   help=f"Genre length above which to migrate (default: {DEFAULT_THRESHOLD})")
    p.add_argument("--keep-genre", action="store_true",
                   help="Set PROMPT but do not clear the Genre frame")
    p.add_argument("--no-recursive", action="store_true",
                   help="Do not recurse into subdirectories")
    args = p.parse_args()

    root = Path(args.path)
    if not root.exists():
        sys.stderr.write(f"Path does not exist: {root}\n")
        return 1

    if root.is_file():
        files = [root] if root.suffix.lower() == ".mp3" else []
    elif args.no_recursive:
        files = sorted(root.glob("*.mp3"))
    else:
        files = sorted(root.rglob("*.mp3"))

    if not files:
        print("No .mp3 files found.")
        return 0

    counts = {"migrated": 0, "cleared": 0, "skip": 0, "dry": 0, "error": 0}
    for f in files:
        status, msg = process_file(f, args.threshold, args.dry_run, args.keep_genre)
        counts[status] += 1
        if status != "skip":
            print(msg)

    print(
        f"\n{len(files)} files scanned: "
        f"{counts['migrated']} migrated, "
        f"{counts['cleared']} genre cleared, "
        f"{counts['dry']} dry-run changes, "
        f"{counts['skip']} skipped, "
        f"{counts['error']} errors"
    )
    return 0 if counts["error"] == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
