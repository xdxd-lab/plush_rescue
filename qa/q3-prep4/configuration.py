"""Explicit local configuration; validate without creating files or processes."""
import json
import os
from pathlib import Path
import stat


def validate_private_directory(path):
    if path.is_symlink():
        raise ValueError('Q3 output directories must not be symlinks')
    if path.exists():
        metadata = path.stat()
        if not stat.S_ISDIR(metadata.st_mode):
            raise ValueError('Q3 output path must be a directory')
        if metadata.st_uid != os.getuid() or metadata.st_mode & 0o077:
            raise ValueError('Q3 output directories must be owned by the current user and private (0700)')


def prepare_output(root):
    """Create only private directories; refuse to repair or chmod existing paths."""
    for directory in (root, root / 'profiles', root / 'runs'):
        directory.mkdir(mode=0o700, parents=directory == root, exist_ok=True)
        validate_private_directory(directory)


def load_configuration(environ, candidate):
    keys = {'firefox': 'Q3_FIREFOX_BINARY', 'driver': 'Q3_GECKODRIVER_BINARY',
            'report_root': 'Q3_REPORT_ROOT'}
    result = {}
    for name, key in keys.items():
        value = environ.get(key)
        if not value or not Path(value).is_absolute():
            raise ValueError(key + ' must be an explicit absolute path')
        result[name] = Path(value).resolve()
    for name in ('firefox', 'driver'):
        if not result[name].is_file():
            raise ValueError(keys[name] + ' must identify an existing binary')
    candidate = candidate.resolve()
    output = result['report_root']
    if output == candidate or candidate in output.parents:
        raise ValueError('Q3_REPORT_ROOT must be outside the repository')
    for directory in (output, output / 'profiles', output / 'runs'):
        validate_private_directory(directory)
    return result


if __name__ == '__main__':
    import os
    import sys
    if sys.argv[1:] != ['--check']:
        raise SystemExit('Configuration validation only: use --check')
    configuration = load_configuration(os.environ, Path(__file__).resolve().parents[2])
    print(json.dumps({key: str(value) for key, value in configuration.items()}))
