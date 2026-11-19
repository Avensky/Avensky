"""Restore the game bundle's Git LFS objects from an existing AvenLab checkout."""
import argparse
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import tempfile


def git(repo, *args):
    return subprocess.check_output(["git", "-C", str(repo), *args], text=True).strip()


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def media_dir(repo):
    for line in git(repo, "lfs", "env").splitlines():
        if line.startswith("LocalMediaDir="):
            return Path(line.split("=", 1)[1])
    raise SystemExit(f"Git LFS could not locate the media directory in {repo}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Existing AvenLab checkout with its game models downloaded")
    args = parser.parse_args()
    repo = Path(git(Path.cwd(), "rev-parse", "--show-toplevel"))
    source = args.source.resolve()
    cache, destination = media_dir(source), media_dir(repo)
    missing = []
    count = 0
    for line in git(repo, "lfs", "ls-files", "--long", "HEAD").splitlines():
        oid, _, name = line.split(" ", 2)
        relative = Path(oid[:2], oid[2:4], oid)
        target = destination / relative
        if target.exists() and digest(target) == oid:
            continue
        # Older revisions sometimes stored a model directly in the working tree.
        for candidate in (cache / relative, source / name):
            if not candidate.is_file() or digest(candidate) != oid:
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as stream:
                temp = Path(stream.name)
            try:
                shutil.copyfile(candidate, temp)
                if digest(temp) != oid:
                    raise SystemExit(f"Source changed while copying {name}. Run again.")
                os.replace(temp, target)
            finally:
                temp.unlink(missing_ok=True)
            count += 1
            break
        else:
            missing.append(name)
    if missing:
        raise SystemExit("The source checkout needs the following model files:\n" + "\n".join(missing))
    subprocess.run(["git", "-C", str(repo), "lfs", "checkout"], check=True)
    subprocess.run(["git", "-C", str(repo), "lfs", "fsck"], check=True)
    print(f"Restored {count} model objects. All game model hashes verified.")


if __name__ == "__main__":
    main()
