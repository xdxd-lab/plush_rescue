#!/usr/bin/env python3
"""Register an approved change to a locked module (stdlib only).

Run this only after the user has approved the change. It records the current
SHA-256 of the file as the new lock and appends an approved_changes entry, so
qa/invariants.test.mjs accepts the file again.

Usage:
  python3 qa/approve-lock-change.py --path camera.js --reason "..." --approved-by "..."
"""
import argparse
import datetime
import hashlib
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
MANIFEST = ROOT / 'qa' / 'locked-modules.json'


def sha256_of(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--path', required=True, help='locked file, relative to the repo root, e.g. camera.js')
    ap.add_argument('--reason', required=True, help='why the change was approved')
    ap.add_argument('--approved-by', required=True, dest='approved_by', help='who approved it')
    ap.add_argument('--date', default=datetime.date.today().isoformat(), help='default: today (YYYY-MM-DD)')
    args = ap.parse_args()

    doc = json.loads(MANIFEST.read_text(encoding='utf-8'))
    entry = next((e for e in doc['locked'] if e['path'] == args.path), None)
    if entry is None:
        sys.exit(f'error: {args.path} is not in {MANIFEST.relative_to(ROOT)}')

    target = ROOT / args.path
    if not target.is_file():
        sys.exit(f'error: {target} does not exist')
    old, new = entry['sha256'], sha256_of(target)
    if old == new:
        sys.exit(f'error: {args.path} still matches its lock; nothing to register')

    entry.setdefault('approved_changes', []).append({
        'date': args.date,
        'approved_by': args.approved_by,
        'reason': args.reason,
        'old_sha256': old,
        'new_sha256': new,
    })
    entry['sha256'] = new
    MANIFEST.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'registered {args.path}: {old[:12]} -> {new[:12]} (approved_by={args.approved_by})')


if __name__ == '__main__':
    main()
