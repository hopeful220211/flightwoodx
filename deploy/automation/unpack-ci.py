"""Verify a single-build archive before isolated CI consumers use its files."""
import hashlib
import importlib.util
from pathlib import Path
import re
import sys


def main():
    if len(sys.argv) != 5:
        raise ValueError("Expected archive, digest, commit and new target directory")
    archive, digest, commit, target = sys.argv[1:]
    source = Path(archive)
    if not re.fullmatch(r"[0-9a-f]{64}", digest) or not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ValueError("Invalid digest or commit")
    if source.is_symlink() or not source.is_file() or source.stat().st_size > 256 * 1024 * 1024:
        raise ValueError("Invalid build archive")
    spec = importlib.util.spec_from_file_location("fwx_archive", Path(__file__).with_name("server.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    with source.open("rb") as stream:
        checksum = hashlib.sha256()
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            checksum.update(chunk)
        if checksum.hexdigest() != digest:
            raise ValueError("Build archive digest mismatch")
        stream.seek(0)
        # Reuse the production parser's path, size, manifest and file-hash checks.
        module.unpack_archive(stream, Path(target), commit)
    print("Build archive verified: " + commit)


if __name__ == "__main__":
    main()
