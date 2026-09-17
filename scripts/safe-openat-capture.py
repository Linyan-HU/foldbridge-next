#!/usr/bin/env python3
"""Dirfd-anchored, fail-closed filesystem capture primitives for Case staging."""

import base64
import ctypes
import hashlib
import json
import os
from pathlib import PurePosixPath
import stat
import sys


MAX_REQUEST_BYTES = 1024 * 1024
MAX_CAPTURE_BYTES = 64 * 1024 * 1024
MAX_CAPTURE_OUTPUT_BYTES = 96 * 1024 * 1024
MAX_STRUCTURED_OUTPUT_BYTES = 32 * 1024 * 1024
MAX_SAFE_INTEGER = 9_007_199_254_740_991
READ_CHUNK_BYTES = 1024 * 1024
MAX_MATERIALIZE_ENTRIES = 200_000
MAX_MATERIALIZE_FILE_BYTES = 64 * 1024 * 1024
MAX_DATABASE_SOURCE_BYTES = 8 * 1024 * 1024 * 1024
FIXED_DIAGNOSTIC_TEXT = "Preview build failed.\n"

DIRECTORY_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
FILE_FLAGS = os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC


class SafeOpenatError(RuntimeError):
    pass


def _exact_keys(value, expected, label):
    if not isinstance(value, dict):
        raise SafeOpenatError(f"{label} must be an object")
    actual = set(value)
    expected = set(expected)
    if actual != expected:
        raise SafeOpenatError(
            f"{label} fields differ: missing={sorted(expected - actual)!r} extra={sorted(actual - expected)!r}"
        )


def _validate_segment(segment, label="segment"):
    if not isinstance(segment, str):
        raise SafeOpenatError(f"{label} must be a string")
    if not segment or segment in (".", "..") or "/" in segment or "\x00" in segment:
        raise SafeOpenatError(f"{label} is invalid")
    return segment


def _validate_root(root):
    if not isinstance(root, str) or not root.startswith("/") or "\x00" in root:
        raise SafeOpenatError("root must be a canonical absolute path")
    if os.path.normpath(root) != root or os.path.realpath(root) != root:
        raise SafeOpenatError("root must be a canonical absolute path without symlinks")
    components = [] if root == "/" else root[1:].split("/")
    for index, component in enumerate(components):
        _validate_segment(component, f"root segment[{index}]")
    return components


def _validate_max_bytes(max_bytes):
    if isinstance(max_bytes, bool) or not isinstance(max_bytes, int) or max_bytes <= 0:
        raise SafeOpenatError("maxBytes must be a positive integer")
    if max_bytes > MAX_SAFE_INTEGER:
        raise SafeOpenatError("maxBytes exceeds the safe integer limit")
    return max_bytes


def _identity(file_stat):
    return (file_stat.st_dev, file_stat.st_ino, stat.S_IFMT(file_stat.st_mode))


def _same_identity(left, right):
    return _identity(left) == _identity(right)


def _directory_metadata(file_stat):
    return (file_stat.st_mtime_ns, file_stat.st_ctime_ns)


def _open_directory_edge(
    parent_fd,
    segment,
    *,
    watch_parent,
    relative_segments,
    watch_child_metadata=False,
):
    parent_before = os.fstat(parent_fd)
    try:
        child_fd = os.open(segment, DIRECTORY_FLAGS, dir_fd=parent_fd)
    except OSError as error:
        raise SafeOpenatError(
            f"cannot open non-symlink directory edge {'/'.join(relative_segments + (segment,))}: {error}"
        ) from error
    try:
        child_stat = os.fstat(child_fd)
    except OSError as error:
        os.close(child_fd)
        raise SafeOpenatError(
            f"cannot inspect opened directory edge {'/'.join(relative_segments + (segment,))}: {error}"
        ) from error
    if not stat.S_ISDIR(child_stat.st_mode):
        os.close(child_fd)
        raise SafeOpenatError(f"directory edge is not a directory: {'/'.join(relative_segments + (segment,))}")
    return {
        "parent_fd": parent_fd,
        "child_fd": child_fd,
        "segment": segment,
        "child_stat": child_stat,
        "parent_metadata": _directory_metadata(parent_before) if watch_parent else None,
        "child_metadata": _directory_metadata(child_stat) if watch_child_metadata else None,
        "display": "/".join(relative_segments + (segment,)),
    }


def _verify_directory_edge(edge):
    child_now = os.fstat(edge["child_fd"])
    if not _same_identity(child_now, edge["child_stat"]) or not stat.S_ISDIR(child_now.st_mode):
        raise SafeOpenatError(f"opened directory edge drifted: {edge['display']}")
    if edge["child_metadata"] is not None and _directory_metadata(child_now) != edge["child_metadata"]:
        raise SafeOpenatError(f"opened directory root ABA drift detected: {edge['display']}")
    try:
        named_now = os.stat(edge["segment"], dir_fd=edge["parent_fd"], follow_symlinks=False)
    except OSError as error:
        raise SafeOpenatError(f"directory edge disappeared: {edge['display']}: {error}") from error
    if not _same_identity(named_now, edge["child_stat"]) or not stat.S_ISDIR(named_now.st_mode):
        raise SafeOpenatError(f"directory edge drifted or became a symlink: {edge['display']}")
    if edge["parent_metadata"] is not None:
        parent_now = os.fstat(edge["parent_fd"])
        if _directory_metadata(parent_now) != edge["parent_metadata"]:
            raise SafeOpenatError(f"directory edge ABA drift detected: {edge['display']}")


def _verify_edges(edges):
    for edge in edges:
        _verify_directory_edge(edge)


def _verify_and_close_directory_edge(edge):
    try:
        _verify_directory_edge(edge)
    finally:
        os.close(edge["child_fd"])


def _open_canonical_root(root):
    components = _validate_root(root)
    fds = [os.open("/", DIRECTORY_FLAGS)]
    edges = []
    relative = ()
    try:
        for index, component in enumerate(components):
            edge = _open_directory_edge(
                fds[-1],
                component,
                watch_parent=False,
                relative_segments=relative,
                watch_child_metadata=index == len(components) - 1,
            )
            edges.append(edge)
            fds.append(edge["child_fd"])
            relative += (component,)
        return fds, edges
    except Exception:
        for fd in reversed(fds):
            os.close(fd)
        raise


def _file_record(root, segments, file_stat, digest):
    absolute = str(PurePosixPath(root, *segments))
    return {
        "path": absolute,
        "size": file_stat.st_size,
        "mtimeNs": str(file_stat.st_mtime_ns),
        "inode": str(file_stat.st_ino),
        "device": str(file_stat.st_dev),
        "sha256": digest,
    }


def _validate_file_record(record, label):
    _exact_keys(record, ["path", "size", "mtimeNs", "inode", "device", "sha256"], label)
    if not isinstance(record["path"], str) or not record["path"].startswith("/"):
        raise SafeOpenatError(f"{label}.path is invalid")
    if isinstance(record["size"], bool) or not isinstance(record["size"], int) or record["size"] < 0:
        raise SafeOpenatError(f"{label}.size is invalid")
    for field in ("mtimeNs", "inode", "device"):
        value = record[field]
        if not isinstance(value, str) or not value.isdigit():
            raise SafeOpenatError(f"{label}.{field} is invalid")
    digest = record["sha256"]
    if not isinstance(digest, str) or len(digest) != 64 or any(
        character not in "0123456789abcdef" for character in digest
    ):
        raise SafeOpenatError(f"{label}.sha256 is invalid")
    return record


def capture_anchored(root, segments, *, max_bytes, include_bytes, hook=None):
    root_components = _validate_root(root)
    if not isinstance(segments, list) or not segments:
        raise SafeOpenatError("segments must be a non-empty array")
    segments = [_validate_segment(value, f"segments[{index}]") for index, value in enumerate(segments)]
    if not isinstance(include_bytes, bool):
        raise SafeOpenatError("includeBytes must be boolean")
    if max_bytes is not None:
        max_bytes = _validate_max_bytes(max_bytes)
    elif include_bytes:
        raise SafeOpenatError("base64 capture requires a finite maxBytes")
    if include_bytes and max_bytes > MAX_CAPTURE_BYTES:
        raise SafeOpenatError(f"base64 capture maxBytes exceeds helper limit {MAX_CAPTURE_BYTES}")
    if hook is not None and not callable(hook):
        raise SafeOpenatError("hook must be callable or None")

    fds, root_edges = _open_canonical_root(root)
    request_edges = []
    file_fd = None
    try:
        relative = ()
        for segment in segments[:-1]:
            edge = _open_directory_edge(
                fds[-1],
                segment,
                watch_parent=True,
                relative_segments=relative,
                watch_child_metadata=True,
            )
            request_edges.append(edge)
            fds.append(edge["child_fd"])
            relative += (segment,)
            if hook is not None:
                hook("after_directory_open", relative)

        if hook is not None:
            hook("before_file_open", tuple(segments))
        final_parent_fd = fds[-1]
        final_parent_metadata = _directory_metadata(os.fstat(final_parent_fd))
        final_segment = segments[-1]
        try:
            file_fd = os.open(final_segment, FILE_FLAGS, dir_fd=final_parent_fd)
        except OSError as error:
            raise SafeOpenatError(f"cannot open non-symlink file {'/'.join(segments)}: {error}") from error
        before = os.fstat(file_fd)
        if not stat.S_ISREG(before.st_mode):
            raise SafeOpenatError(f"final entry is not a regular file: {'/'.join(segments)}")
        if max_bytes is not None and before.st_size > max_bytes:
            raise SafeOpenatError(
                f"file exceeds {max_bytes} bytes after reading 0 bytes: {'/'.join(segments)}"
            )
        if hook is not None:
            hook("after_file_open", tuple(segments))

        digest = hashlib.sha256()
        chunks = [] if include_bytes else None
        bytes_read = 0
        while bytes_read < before.st_size:
            _verify_edges(request_edges)
            current = os.fstat(file_fd)
            if max_bytes is not None and current.st_size > max_bytes:
                raise SafeOpenatError(
                    f"file exceeds {max_bytes} bytes after reading {bytes_read} bytes: {'/'.join(segments)}"
                )
            read_size = min(READ_CHUNK_BYTES, current.st_size - bytes_read)
            if max_bytes is not None:
                read_size = min(read_size, max_bytes - bytes_read)
            if read_size <= 0:
                raise SafeOpenatError(f"bounded read cannot progress: {'/'.join(segments)}")
            chunk = os.read(file_fd, read_size)
            if not chunk:
                break
            bytes_read += len(chunk)
            if max_bytes is not None and bytes_read > max_bytes:
                raise SafeOpenatError(
                    f"file exceeds {max_bytes} bytes after reading {bytes_read} bytes: {'/'.join(segments)}"
                )
            digest.update(chunk)
            if chunks is not None:
                chunks.append(chunk)
            if hook is not None:
                hook("after_read", tuple(segments))

        after = os.fstat(file_fd)
        if max_bytes is not None and after.st_size > max_bytes:
            raise SafeOpenatError(
                f"file exceeds {max_bytes} bytes after reading {bytes_read} bytes: {'/'.join(segments)}"
            )
        if (
            not _same_identity(before, after)
            or before.st_size != after.st_size
            or before.st_mtime_ns != after.st_mtime_ns
            or before.st_ctime_ns != after.st_ctime_ns
            or bytes_read != after.st_size
        ):
            raise SafeOpenatError(f"opened file changed while being captured: {'/'.join(segments)}")
        try:
            named_after = os.stat(final_segment, dir_fd=final_parent_fd, follow_symlinks=False)
        except OSError as error:
            raise SafeOpenatError(f"final file edge disappeared: {'/'.join(segments)}: {error}") from error
        if not _same_identity(named_after, after) or not stat.S_ISREG(named_after.st_mode):
            raise SafeOpenatError(f"final file edge drifted or became a symlink: {'/'.join(segments)}")
        if _directory_metadata(os.fstat(final_parent_fd)) != final_parent_metadata:
            raise SafeOpenatError(f"final file edge ABA drift detected: {'/'.join(segments)}")
        _verify_edges(request_edges)
        _verify_edges(root_edges)

        result = {"record": _file_record(root, segments, after, digest.hexdigest())}
        if chunks is not None:
            result["bytesBase64"] = base64.b64encode(b"".join(chunks)).decode("ascii")
        return result
    finally:
        if file_fd is not None:
            os.close(file_fd)
        for fd in reversed(fds):
            os.close(fd)


def utf8_byte_sorted(values):
    if not isinstance(values, list):
        raise SafeOpenatError("UTF-8 sort input must be an array")
    encoded = []
    for index, value in enumerate(values):
        _validate_segment(value, f"UTF-8 sort value[{index}]")
        try:
            encoded.append((value.encode("utf-8", "strict"), value))
        except UnicodeEncodeError as error:
            raise SafeOpenatError(f"UTF-8 sort value[{index}] is not valid UTF-8") from error
    return [value for _, value in sorted(encoded)]


def _named_stat(parent_fd, segment, display, *, missing_ok=False):
    try:
        return os.stat(segment, dir_fd=parent_fd, follow_symlinks=False)
    except FileNotFoundError:
        if missing_ok:
            return None
        raise SafeOpenatError(f"required entry is missing: {display}")
    except OSError as error:
        raise SafeOpenatError(f"cannot stat entry {display}: {error}") from error


def _open_expected_directory(parent_fd, segment, relative, *, missing_ok, hook):
    display = "/".join(relative + (segment,))
    named = _named_stat(parent_fd, segment, display, missing_ok=missing_ok)
    if named is None:
        return None
    if not stat.S_ISDIR(named.st_mode):
        raise SafeOpenatError(f"expected non-symlink directory: {display}")
    edge = _open_directory_edge(
        parent_fd,
        segment,
        watch_parent=True,
        relative_segments=relative,
        watch_child_metadata=True,
    )
    if hook is not None:
        try:
            hook("after_directory_open", relative + (segment,))
        except Exception:
            os.close(edge["child_fd"])
            raise
    return edge


def _enumerate_case_paths(root, hook=None):
    fds, root_edges = _open_canonical_root(root)
    root_fd = fds[-1]
    selections = []
    try:
        for pdb_id in utf8_byte_sorted(os.listdir(root_fd)):
            pdb_stat = _named_stat(root_fd, pdb_id, pdb_id)
            if not stat.S_ISDIR(pdb_stat.st_mode):
                if stat.S_ISLNK(pdb_stat.st_mode):
                    raise SafeOpenatError(f"symlink is not allowed in Case inventory: {pdb_id}")
                continue
            pdb_edge = _open_expected_directory(root_fd, pdb_id, (), missing_ok=False, hook=hook)
            try:
                pdb_fd = pdb_edge["child_fd"]
                chains_edge = _open_expected_directory(
                    pdb_fd, "chains", (pdb_id,), missing_ok=True, hook=hook
                )
                if chains_edge is None:
                    continue
                try:
                    chains_fd = chains_edge["child_fd"]
                    for auth_chain in utf8_byte_sorted(os.listdir(chains_fd)):
                        auth_stat = _named_stat(
                            chains_fd, auth_chain, f"{pdb_id}/chains/{auth_chain}"
                        )
                        if not stat.S_ISDIR(auth_stat.st_mode):
                            if stat.S_ISLNK(auth_stat.st_mode):
                                raise SafeOpenatError(
                                    f"symlink is not allowed in Case inventory: {pdb_id}/chains/{auth_chain}"
                                )
                            continue
                        auth_edge = _open_expected_directory(
                            chains_fd,
                            auth_chain,
                            (pdb_id, "chains"),
                            missing_ok=False,
                            hook=hook,
                        )
                        try:
                            auth_fd = auth_edge["child_fd"]
                            profiles_edge = _open_expected_directory(
                                auth_fd,
                                "profiles",
                                (pdb_id, "chains", auth_chain),
                                missing_ok=True,
                                hook=hook,
                            )
                            if profiles_edge is None:
                                continue
                            try:
                                profiles_fd = profiles_edge["child_fd"]
                                index_stat = _named_stat(
                                    profiles_fd,
                                    "profile-index.json.gz",
                                    f"{pdb_id}/chains/{auth_chain}/profiles/profile-index.json.gz",
                                    missing_ok=True,
                                )
                                if index_stat is None:
                                    continue
                                if not stat.S_ISREG(index_stat.st_mode):
                                    raise SafeOpenatError(
                                        f"profile-index must be a non-symlink regular file: {pdb_id}/{auth_chain}"
                                    )
                                selections.append({"pdbId": pdb_id, "authChain": auth_chain})
                            finally:
                                _verify_and_close_directory_edge(profiles_edge)
                        finally:
                            _verify_and_close_directory_edge(auth_edge)
                finally:
                    _verify_and_close_directory_edge(chains_edge)
            finally:
                _verify_and_close_directory_edge(pdb_edge)
        _verify_edges(root_edges)
        return selections
    finally:
        for fd in reversed(fds):
            os.close(fd)


def inventory_anchored(root, *, profile_index_max_bytes, hook=None):
    profile_index_max_bytes = _validate_max_bytes(profile_index_max_bytes)
    if profile_index_max_bytes > MAX_CAPTURE_BYTES:
        raise SafeOpenatError(f"profile-index max exceeds {MAX_CAPTURE_BYTES} bytes")
    selections = _enumerate_case_paths(root, hook=hook)
    output = []
    for ordinal, selection in enumerate(selections):
        segments = [
            selection["pdbId"],
            "chains",
            selection["authChain"],
            "profiles",
            "profile-index.json.gz",
        ]
        captured = capture_anchored(
            root,
            segments,
            max_bytes=profile_index_max_bytes,
            include_bytes=False,
            hook=hook,
        )
        output.append({"ordinal": ordinal, **selection, "segments": segments, "record": captured["record"]})
    final_selections = _enumerate_case_paths(root)
    if selections != final_selections:
        raise SafeOpenatError("Case inventory changed during anchored capture")
    return output


def _validate_caps(max_bytes_by_relative_path, default_max_bytes):
    if default_max_bytes is not None:
        default_max_bytes = _validate_max_bytes(default_max_bytes)
    if not isinstance(max_bytes_by_relative_path, dict):
        raise SafeOpenatError("maxBytesByRelativePath must be an object")
    caps = {}
    for relative, value in max_bytes_by_relative_path.items():
        if not isinstance(relative, str) or not relative:
            raise SafeOpenatError("relative cap path must be a non-empty string")
        parts = relative.split("/")
        for index, part in enumerate(parts):
            _validate_segment(part, f"relative cap path segment[{index}]")
        caps[relative] = _validate_max_bytes(value)
    return caps, default_max_bytes


def tree_snapshot_anchored(
    root,
    *,
    max_bytes_by_relative_path,
    default_max_bytes,
    hook=None,
):
    caps, default_max_bytes = _validate_caps(max_bytes_by_relative_path, default_max_bytes)
    fds, root_edges = _open_canonical_root(root)
    directories = []
    files = []

    def visit(directory_fd, relative):
        directory_stat = os.fstat(directory_fd)
        directories.append({"path": "/".join(relative), "mtimeNs": str(directory_stat.st_mtime_ns)})
        for name in utf8_byte_sorted(os.listdir(directory_fd)):
            child_relative = relative + (name,)
            display = "/".join(child_relative)
            named = _named_stat(directory_fd, name, display)
            if stat.S_ISLNK(named.st_mode):
                raise SafeOpenatError(f"symlink is not allowed in tree: {display}")
            if stat.S_ISDIR(named.st_mode):
                edge = _open_expected_directory(
                    directory_fd, name, relative, missing_ok=False, hook=hook
                )
                try:
                    visit(edge["child_fd"], child_relative)
                finally:
                    _verify_and_close_directory_edge(edge)
            elif stat.S_ISREG(named.st_mode):
                captured = capture_anchored(
                    root,
                    list(child_relative),
                    max_bytes=caps.get(display, default_max_bytes),
                    include_bytes=False,
                    hook=hook,
                )
                files.append({"path": display, "record": captured["record"]})
            else:
                raise SafeOpenatError(f"non-regular tree entry is not allowed: {display}")

    try:
        visit(fds[-1], ())
        _verify_edges(root_edges)
        return {"directories": directories, "files": files}
    finally:
        for fd in reversed(fds):
            os.close(fd)


def sha256_manifest_anchored(
    root,
    *,
    max_bytes_by_relative_path,
    default_max_bytes,
    exclude=("reports/sha256.txt",),
    hook=None,
):
    if not isinstance(exclude, (list, tuple)) or not all(isinstance(value, str) for value in exclude):
        raise SafeOpenatError("exclude must be an array of strings")
    tree = tree_snapshot_anchored(
        root,
        max_bytes_by_relative_path=max_bytes_by_relative_path,
        default_max_bytes=default_max_bytes,
        hook=hook,
    )
    excluded = set(exclude)
    rows = []
    for item in tree["files"]:
        relative = item["path"]
        if relative in excluded:
            continue
        if "\n" in relative or "\r" in relative:
            raise SafeOpenatError(f"unsafe path in SHA-256 manifest: {relative!r}")
        rows.append(f"{item['record']['sha256']}  {relative}")
    return "".join(f"{row}\n" for row in rows)


def _validate_relative_path(relative, label, *, allow_root=False):
    if not isinstance(relative, str):
        raise SafeOpenatError(f"{label} must be a string")
    if relative == "" and allow_root:
        return ()
    if not relative or relative.startswith("/") or "\x00" in relative:
        raise SafeOpenatError(f"{label} is invalid")
    segments = relative.split("/")
    return tuple(_validate_segment(segment, f"{label} segment[{index}]") for index, segment in enumerate(segments))


def _validate_materialize_inventory(inventory):
    _exact_keys(inventory, ["directories", "files"], "expectedInventory")
    directories = inventory["directories"]
    files = inventory["files"]
    if not isinstance(directories, list) or not isinstance(files, list):
        raise SafeOpenatError("expectedInventory directories and files must be arrays")
    if len(directories) + len(files) > MAX_MATERIALIZE_ENTRIES:
        raise SafeOpenatError("expectedInventory exceeds entry limit")
    if not directories or directories[0] != "":
        raise SafeOpenatError("expectedInventory directories must begin with the root entry")
    expected_directory_order = sorted(directories, key=lambda value: value.encode("utf-8", "strict"))
    if directories != expected_directory_order or len(set(directories)) != len(directories):
        raise SafeOpenatError("expectedInventory directories must be unique and UTF-8 byte sorted")
    directory_set = set()
    for index, relative in enumerate(directories):
        segments = _validate_relative_path(relative, f"expectedInventory.directories[{index}]", allow_root=True)
        directory_set.add(relative)
        if segments and "/".join(segments[:-1]) not in directory_set:
            raise SafeOpenatError(f"expectedInventory directory parent is missing: {relative}")

    normalized_files = []
    previous = None
    total_bytes = 0
    for index, item in enumerate(files):
        _exact_keys(item, ["path", "size", "sha256", "mode"], f"expectedInventory.files[{index}]")
        segments = _validate_relative_path(item["path"], f"expectedInventory.files[{index}].path")
        if previous is not None and previous.encode("utf-8") >= item["path"].encode("utf-8"):
            raise SafeOpenatError("expectedInventory files must be unique and UTF-8 byte sorted")
        previous = item["path"]
        parent = "/".join(segments[:-1])
        if parent not in directory_set:
            raise SafeOpenatError(f"expectedInventory file parent is missing: {item['path']}")
        size = item["size"]
        if isinstance(size, bool) or not isinstance(size, int) or size < 0 or size > MAX_MATERIALIZE_FILE_BYTES:
            raise SafeOpenatError(f"expectedInventory file size is invalid: {item['path']}")
        digest = item["sha256"]
        if not isinstance(digest, str) or len(digest) != 64 or any(character not in "0123456789abcdef" for character in digest):
            raise SafeOpenatError(f"expectedInventory SHA-256 is invalid: {item['path']}")
        mode = item["mode"]
        if mode not in ("100644", "100755"):
            raise SafeOpenatError(f"expectedInventory mode is invalid: {item['path']}")
        total_bytes += size
        if total_bytes > MAX_SAFE_INTEGER:
            raise SafeOpenatError("expectedInventory total bytes exceed safe integer limit")
        normalized_files.append({"path": item["path"], "size": size, "sha256": digest, "mode": mode})
    return {"directories": list(directories), "files": normalized_files}


def _hash_regular_file_at(parent_fd, name, relative, *, max_bytes=MAX_MATERIALIZE_FILE_BYTES):
    display = "/".join(relative + (name,))
    parent_metadata = _directory_metadata(os.fstat(parent_fd))
    try:
        file_fd = os.open(name, FILE_FLAGS, dir_fd=parent_fd)
    except OSError as error:
        raise SafeOpenatError(f"cannot open materialize source file {display}: {error}") from error
    try:
        before = os.fstat(file_fd)
        if not stat.S_ISREG(before.st_mode):
            raise SafeOpenatError(f"materialize source is not a regular file: {display}")
        if before.st_size > max_bytes:
            raise SafeOpenatError(f"materialize source exceeds {max_bytes} bytes: {display}")
        digest = hashlib.sha256()
        bytes_read = 0
        while bytes_read < before.st_size:
            chunk = os.read(file_fd, min(READ_CHUNK_BYTES, before.st_size - bytes_read))
            if not chunk:
                break
            digest.update(chunk)
            bytes_read += len(chunk)
        after = os.fstat(file_fd)
        named = _named_stat(parent_fd, name, display)
        if (
            not _same_identity(before, after)
            or not _same_identity(after, named)
            or before.st_size != after.st_size
            or before.st_mtime_ns != after.st_mtime_ns
            or before.st_ctime_ns != after.st_ctime_ns
            or bytes_read != after.st_size
            or _directory_metadata(os.fstat(parent_fd)) != parent_metadata
        ):
            raise SafeOpenatError(f"materialize source file edge changed or ABA drifted: {display}")
        return {
            "path": display,
            "size": after.st_size,
            "sha256": digest.hexdigest(),
            "mode": "100755" if after.st_mode & 0o111 else "100644",
        }
    finally:
        os.close(file_fd)


def _snapshot_open_tree(root_fd):
    directories = []
    files = []

    def visit(directory_fd, relative):
        directories.append("/".join(relative))
        for name in utf8_byte_sorted(os.listdir(directory_fd)):
            child_relative = relative + (name,)
            display = "/".join(child_relative)
            named = _named_stat(directory_fd, name, display)
            if stat.S_ISLNK(named.st_mode):
                raise SafeOpenatError(f"symlink is not allowed in materialize source: {display}")
            if stat.S_ISDIR(named.st_mode):
                edge = _open_expected_directory(
                    directory_fd, name, relative, missing_ok=False, hook=None
                )
                try:
                    visit(edge["child_fd"], child_relative)
                finally:
                    _verify_and_close_directory_edge(edge)
            elif stat.S_ISREG(named.st_mode):
                files.append(_hash_regular_file_at(directory_fd, name, relative))
            else:
                raise SafeOpenatError(f"non-regular materialize source entry is not allowed: {display}")

    visit(root_fd, ())
    return {"directories": directories, "files": files}


def _open_relative_directory(root_fd, segments, *, hook=None, watch_final_metadata=True):
    fds = [os.dup(root_fd)]
    edges = []
    relative = ()
    try:
        for index, segment in enumerate(segments):
            edge = _open_directory_edge(
                fds[-1],
                segment,
                watch_parent=True,
                relative_segments=relative,
                watch_child_metadata=watch_final_metadata or index < len(segments) - 1,
            )
            edges.append(edge)
            fds.append(edge["child_fd"])
            relative += (segment,)
            if hook is not None:
                hook("after_destination_directory_open", relative)
        return fds, edges
    except Exception:
        for fd in reversed(fds):
            os.close(fd)
        raise


def _mkdir_relative_destination(partial_fd, segments, hook, created_identities):
    parent_segments = segments[:-1]
    fds, edges = _open_relative_directory(
        partial_fd, parent_segments, hook=hook, watch_final_metadata=False
    )
    try:
        parent_fd = fds[-1]
        name = segments[-1]
        display = "/".join(segments)
        if _named_stat(parent_fd, name, display, missing_ok=True) is not None:
            raise SafeOpenatError(f"materialize destination already exists: {display}")
        try:
            os.mkdir(name, 0o755, dir_fd=parent_fd)
        except OSError as error:
            raise SafeOpenatError(f"cannot create materialize destination directory {display}: {error}") from error
        created_stat = _named_stat(parent_fd, name, display)
        if not stat.S_ISDIR(created_stat.st_mode):
            raise SafeOpenatError(f"created materialize destination is not a directory: {display}")
        created_identities[_identity(created_stat)] = "directory"
        if hook is not None:
            hook("after_destination_directory_create", segments)
        edge = _open_directory_edge(
            parent_fd,
            name,
            watch_parent=True,
            relative_segments=parent_segments,
            watch_child_metadata=True,
        )
        try:
            if hook is not None:
                hook("after_destination_directory_open", segments)
            _verify_directory_edge(edge)
        finally:
            os.close(edge["child_fd"])
        _verify_edges(edges)
    finally:
        for fd in reversed(fds):
            os.close(fd)


def _copy_expected_file(source_fd, partial_fd, expected, created_identities, hook):
    segments = tuple(expected["path"].split("/"))
    source_fds, source_edges = _open_relative_directory(source_fd, segments[:-1])
    destination_fds, destination_edges = _open_relative_directory(
        partial_fd, segments[:-1], watch_final_metadata=False
    )
    input_fd = None
    output_fd = None
    try:
        source_parent = source_fds[-1]
        destination_parent = destination_fds[-1]
        source_parent_metadata = _directory_metadata(os.fstat(source_parent))
        try:
            input_fd = os.open(segments[-1], FILE_FLAGS, dir_fd=source_parent)
        except OSError as error:
            raise SafeOpenatError(f"cannot open materialize source file {expected['path']}: {error}") from error
        source_before = os.fstat(input_fd)
        if not stat.S_ISREG(source_before.st_mode):
            raise SafeOpenatError(f"materialize source is not regular: {expected['path']}")
        source_mode = "100755" if source_before.st_mode & 0o111 else "100644"
        if source_before.st_size != expected["size"] or source_mode != expected["mode"]:
            raise SafeOpenatError(f"materialize source metadata drifted: {expected['path']}")
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC
        try:
            output_fd = os.open(
                segments[-1], flags, int(expected["mode"][-3:], 8), dir_fd=destination_parent
            )
        except OSError as error:
            raise SafeOpenatError(f"cannot create materialize destination file {expected['path']}: {error}") from error
        created_identities[_identity(os.fstat(output_fd))] = "file"
        digest = hashlib.sha256()
        copied = 0
        while copied < source_before.st_size:
            chunk = os.read(input_fd, min(READ_CHUNK_BYTES, source_before.st_size - copied))
            if not chunk:
                break
            digest.update(chunk)
            copied += len(chunk)
            offset = 0
            while offset < len(chunk):
                count = os.write(output_fd, chunk[offset:])
                if count <= 0:
                    raise SafeOpenatError(f"materialize destination write made no progress: {expected['path']}")
                offset += count
        os.fchmod(output_fd, int(expected["mode"][-3:], 8))
        source_after = os.fstat(input_fd)
        source_named = _named_stat(source_parent, segments[-1], expected["path"])
        if (
            not _same_identity(source_before, source_after)
            or not _same_identity(source_after, source_named)
            or source_before.st_mtime_ns != source_after.st_mtime_ns
            or source_before.st_ctime_ns != source_after.st_ctime_ns
            or copied != source_after.st_size
            or digest.hexdigest() != expected["sha256"]
            or _directory_metadata(os.fstat(source_parent)) != source_parent_metadata
        ):
            raise SafeOpenatError(f"materialize source content or edge drifted: {expected['path']}")
        destination_after = os.fstat(output_fd)
        destination_named = _named_stat(destination_parent, segments[-1], expected["path"])
        if (
            not _same_identity(destination_after, destination_named)
            or not stat.S_ISREG(destination_after.st_mode)
            or destination_after.st_size != expected["size"]
        ):
            raise SafeOpenatError(f"materialize destination file edge drifted: {expected['path']}")
        _verify_edges(source_edges)
        _verify_edges(destination_edges)
        if hook is not None:
            hook("after_destination_file_copy", segments)
    finally:
        if output_fd is not None:
            os.close(output_fd)
        if input_fd is not None:
            os.close(input_fd)
        for fd in reversed(destination_fds):
            os.close(fd)
        for fd in reversed(source_fds):
            os.close(fd)


def _clear_created_destination(directory_fd, created_identities, relative=()):
    for name in utf8_byte_sorted(os.listdir(directory_fd)):
        display = "/".join(relative + (name,))
        named = _named_stat(directory_fd, name, display)
        if stat.S_ISLNK(named.st_mode):
            os.unlink(name, dir_fd=directory_fd)
            continue
        identity = _identity(named)
        kind = created_identities.get(identity)
        if stat.S_ISREG(named.st_mode):
            if kind != "file":
                raise SafeOpenatError(f"diagnostic reset refuses unknown file: {display}")
            os.unlink(name, dir_fd=directory_fd)
            continue
        if stat.S_ISDIR(named.st_mode):
            if kind != "directory":
                raise SafeOpenatError(f"diagnostic reset refuses unknown directory: {display}")
            edge = _open_directory_edge(
                directory_fd,
                name,
                watch_parent=False,
                relative_segments=relative,
                watch_child_metadata=False,
            )
            try:
                if not _same_identity(os.fstat(edge["child_fd"]), named):
                    raise SafeOpenatError(f"diagnostic reset directory edge drifted: {display}")
                _clear_created_destination(edge["child_fd"], created_identities, relative + (name,))
                current = _named_stat(directory_fd, name, display)
                if not _same_identity(current, named):
                    raise SafeOpenatError(f"diagnostic reset directory edge changed: {display}")
            finally:
                os.close(edge["child_fd"])
            os.rmdir(name, dir_fd=directory_fd)
            continue
        raise SafeOpenatError(f"diagnostic reset refuses unknown non-regular entry: {display}")


def _write_fixed_diagnostic(partial_fd):
    try:
        os.mkdir("reports", 0o755, dir_fd=partial_fd)
    except OSError as error:
        raise SafeOpenatError(f"cannot create diagnostic reports directory: {error}") from error
    reports_edge = _open_directory_edge(
        partial_fd,
        "reports",
        watch_parent=False,
        relative_segments=(),
        watch_child_metadata=False,
    )
    report_fd = None
    try:
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC
        report_fd = os.open("build-error.txt", flags, 0o644, dir_fd=reports_edge["child_fd"])
        diagnostic_bytes = FIXED_DIAGNOSTIC_TEXT.encode("utf-8")
        offset = 0
        while offset < len(diagnostic_bytes):
            count = os.write(report_fd, diagnostic_bytes[offset:])
            if count <= 0:
                raise SafeOpenatError("diagnostic write made no progress")
            offset += count
        os.fchmod(report_fd, 0o644)
    finally:
        if report_fd is not None:
            os.close(report_fd)
        os.close(reports_edge["child_fd"])
    expected = {
        "directories": ["", "reports"],
        "files": [{
            "path": "reports/build-error.txt",
            "size": len(FIXED_DIAGNOSTIC_TEXT.encode("utf-8")),
            "sha256": hashlib.sha256(FIXED_DIAGNOSTIC_TEXT.encode("utf-8")).hexdigest(),
            "mode": "100644",
        }],
    }
    if _snapshot_open_tree(partial_fd) != expected:
        raise SafeOpenatError("diagnostic reset did not produce the fixed plaintext layout")


def _rename_directory_no_replace(parent_fd, source_name, destination_name):
    libc = ctypes.CDLL(None, use_errno=True)
    source = os.fsencode(source_name)
    destination = os.fsencode(destination_name)
    if sys.platform == "darwin" and hasattr(libc, "renameatx_np"):
        result = libc.renameatx_np(parent_fd, source, parent_fd, destination, 0x00000004)
    elif hasattr(libc, "renameat2"):
        result = libc.renameat2(parent_fd, source, parent_fd, destination, 0x00000001)
    else:
        raise SafeOpenatError("atomic no-replace directory rename is unavailable")
    if result != 0:
        error_number = ctypes.get_errno()
        raise SafeOpenatError(
            f"atomic no-replace directory rename failed: {os.strerror(error_number)}"
        )


def materialize_anchored(
    source_root,
    out_parent,
    *,
    partial_name,
    final_name,
    expected_inventory,
    publish,
    diagnostic_text,
    hook=None,
):
    _validate_segment(partial_name, "partialName")
    _validate_segment(final_name, "finalName")
    if partial_name == final_name:
        raise SafeOpenatError("partialName and finalName must differ")
    if not isinstance(publish, bool):
        raise SafeOpenatError("publish must be boolean")
    if hook is not None and not callable(hook):
        raise SafeOpenatError("hook must be callable or None")
    expected = _validate_materialize_inventory(expected_inventory)
    if publish:
        if diagnostic_text is not None:
            raise SafeOpenatError("published materialization cannot contain diagnosticText")
    else:
        if diagnostic_text != FIXED_DIAGNOSTIC_TEXT:
            raise SafeOpenatError("diagnosticText must equal the fixed public-safe diagnostic")
        diagnostic_bytes = diagnostic_text.encode("utf-8")
        diagnostic_expected = {
            "directories": ["", "reports"],
            "files": [{
                "path": "reports/build-error.txt",
                "size": len(diagnostic_bytes),
                "sha256": hashlib.sha256(diagnostic_bytes).hexdigest(),
                "mode": "100644",
            }],
        }
        if expected != diagnostic_expected:
            raise SafeOpenatError("diagnostic materialization inventory is not the fixed plaintext layout")

    source_fds, source_root_edges = _open_canonical_root(source_root)
    out_fds = []
    out_root_edges = []
    partial_edge = None
    created_identities = {}
    renamed = False
    try:
        source_stat = os.fstat(source_fds[-1])
        if stat.S_IMODE(source_stat.st_mode) != 0o700:
            raise SafeOpenatError("private materialize source root must have mode 0700")
        initial_source = _snapshot_open_tree(source_fds[-1])
        if initial_source != expected:
            raise SafeOpenatError("private materialize source inventory differs from frozen expectedInventory")
        _verify_edges(source_root_edges)

        out_fds, out_root_edges = _open_canonical_root(out_parent)
        # The helper intentionally changes out-parent contents, so retain edge identity
        # without treating our own directory-entry mutation as root metadata drift.
        if out_root_edges:
            out_root_edges[-1]["child_metadata"] = None
        out_fd = out_fds[-1]
        if _named_stat(out_fd, final_name, final_name, missing_ok=True) is not None:
            raise SafeOpenatError(f"final materialize destination already exists: {final_name}")
        if _named_stat(out_fd, partial_name, partial_name, missing_ok=True) is not None:
            raise SafeOpenatError(f"partial materialize destination already exists: {partial_name}")
        try:
            os.mkdir(partial_name, 0o700, dir_fd=out_fd)
        except OSError as error:
            raise SafeOpenatError(f"cannot create materialize partial directory: {error}") from error
        partial_edge = _open_directory_edge(
            out_fd,
            partial_name,
            watch_parent=True,
            relative_segments=(),
            watch_child_metadata=False,
        )
        partial_fd = partial_edge["child_fd"]
        try:
            for relative in expected["directories"][1:]:
                _mkdir_relative_destination(
                    partial_fd,
                    tuple(relative.split("/")),
                    hook,
                    created_identities,
                )
            for item in expected["files"]:
                _copy_expected_file(
                    source_fds[-1], partial_fd, item, created_identities, hook
                )

            final_source = _snapshot_open_tree(source_fds[-1])
            if final_source != expected:
                raise SafeOpenatError("private materialize source changed before publication")
            final_destination = _snapshot_open_tree(partial_fd)
            if final_destination != expected:
                raise SafeOpenatError("materialize destination differs from frozen expectedInventory")
            _verify_edges(source_root_edges)
            _verify_directory_edge(partial_edge)
            _verify_edges(out_root_edges)
            if publish:
                os.fchmod(partial_fd, 0o755)
                _verify_directory_edge(partial_edge)
                if _named_stat(out_fd, final_name, final_name, missing_ok=True) is not None:
                    raise SafeOpenatError(f"final materialize destination appeared before rename: {final_name}")
                _rename_directory_no_replace(out_fd, partial_name, final_name)
                renamed = True
                final_stat = _named_stat(out_fd, final_name, final_name)
                if not _same_identity(final_stat, os.fstat(partial_fd)) or not stat.S_ISDIR(final_stat.st_mode):
                    raise SafeOpenatError("published final directory identity differs after atomic rename")
                return {"published": True, "name": final_name}
            return {"published": False, "name": partial_name}
        except Exception as materialize_error:
            if renamed:
                raise
            try:
                _verify_directory_edge(partial_edge)
                _clear_created_destination(partial_fd, created_identities)
                os.fchmod(partial_fd, 0o700)
                _write_fixed_diagnostic(partial_fd)
                _verify_directory_edge(partial_edge)
                _verify_edges(out_root_edges)
            except Exception as diagnostic_error:
                raise SafeOpenatError(
                    f"materialize failed and fixed diagnostic reset also failed: {diagnostic_error}"
                ) from materialize_error
            raise
    finally:
        if partial_edge is not None:
            os.close(partial_edge["child_fd"])
        for fd in reversed(out_fds):
            os.close(fd)
        for fd in reversed(source_fds):
            os.close(fd)


def _open_database_source(root, segments, hook=None):
    if not isinstance(segments, list) or not segments:
        raise SafeOpenatError("sourceSegments must be a non-empty array")
    segments = tuple(
        _validate_segment(value, f"sourceSegments[{index}]")
        for index, value in enumerate(segments)
    )
    fds, root_edges = _open_canonical_root(root)
    # The source file descriptor is the authority for this operation. A transient
    # rename of another entry in the source root cannot change the pinned bytes.
    if root_edges:
        root_edges[-1]["child_metadata"] = None
    request_edges = []
    file_fd = None
    try:
        relative = ()
        for segment in segments[:-1]:
            edge = _open_directory_edge(
                fds[-1],
                segment,
                watch_parent=True,
                relative_segments=relative,
                watch_child_metadata=True,
            )
            request_edges.append(edge)
            fds.append(edge["child_fd"])
            relative += (segment,)
        parent_fd = fds[-1]
        try:
            file_fd = os.open(segments[-1], FILE_FLAGS, dir_fd=parent_fd)
        except OSError as error:
            raise SafeOpenatError(
                f"cannot open anchored database source {'/'.join(segments)}: {error}"
            ) from error
        source_stat = os.fstat(file_fd)
        if not stat.S_ISREG(source_stat.st_mode):
            raise SafeOpenatError(
                f"anchored database source is not a regular file: {'/'.join(segments)}"
            )
        if hook is not None:
            hook("after_database_source_open", segments)
        return {
            "root": root,
            "fds": fds,
            "root_edges": root_edges,
            "request_edges": request_edges,
            "parent_fd": parent_fd,
            "segments": segments,
            "file_fd": file_fd,
            "source_stat": source_stat,
        }
    except Exception:
        if file_fd is not None:
            os.close(file_fd)
        for fd in reversed(fds):
            os.close(fd)
        raise


def _close_database_source(source):
    os.close(source["file_fd"])
    for fd in reversed(source["fds"]):
        os.close(fd)


def _verify_database_source(source, final_stat, *, allow_path_rename=False):
    named = _named_stat(
        source["parent_fd"],
        source["segments"][-1],
        "/".join(source["segments"]),
    )
    before = source["source_stat"]
    if (
        not _same_identity(before, final_stat)
        or not _same_identity(final_stat, named)
        or before.st_size != final_stat.st_size
        or before.st_mtime_ns != final_stat.st_mtime_ns
        or (not allow_path_rename and before.st_ctime_ns != final_stat.st_ctime_ns)
    ):
        raise SafeOpenatError("anchored database source content or edge changed")
    _verify_edges(source["request_edges"])
    _verify_edges(source["root_edges"])


def open_database_source_anchored(root, segments, *, max_bytes, hook=None):
    """Open and hash a database through canonical dirfd/openat edges.

    The returned descriptor remains the authority until
    ``close_database_source_anchored`` is called.  Callers may open the database
    through ``fdPath`` without resolving the original pathname again.
    """
    _validate_root(root)
    max_bytes = _validate_max_bytes(max_bytes)
    if max_bytes > MAX_DATABASE_SOURCE_BYTES:
        raise SafeOpenatError(
            f"database source maxBytes exceeds helper limit {MAX_DATABASE_SOURCE_BYTES}"
        )
    source = _open_database_source(root, segments, hook=hook)
    try:
        record = hash_database_source_anchored(source, max_bytes=max_bytes)
        fd_path = f"/dev/fd/{source['file_fd']}"
        probe_fd = None
        try:
            probe_fd = os.open(fd_path, FILE_FLAGS)
            fd_path_stat = os.fstat(probe_fd)
        except OSError as error:
            raise SafeOpenatError(
                f"database descriptor path is unavailable: {error}"
            ) from error
        finally:
            if probe_fd is not None:
                os.close(probe_fd)
        if not _same_identity(fd_path_stat, os.fstat(source["file_fd"])):
            raise SafeOpenatError("database descriptor path does not reopen the anchored file")
        return {
            "source": source,
            "record": record,
            "fdPath": fd_path,
            "maxBytes": max_bytes,
            "allowPathRename": True,
        }
    except Exception:
        _close_database_source(source)
        raise


def hash_database_source_anchored(handle, *, max_bytes=None):
    """Re-hash a still-open database descriptor and verify its original edge."""
    if not isinstance(handle, dict) or "file_fd" not in handle:
        if not isinstance(handle, dict) or "source" not in handle:
            raise SafeOpenatError("database source handle is invalid")
        source = handle["source"]
        if max_bytes is None:
            max_bytes = handle.get("maxBytes")
    else:
        source = handle
    max_bytes = _validate_max_bytes(max_bytes)
    before = os.fstat(source["file_fd"])
    if before.st_size > max_bytes:
        raise SafeOpenatError(
            f"database source exceeds {max_bytes} bytes after reading 0 bytes"
        )
    os.lseek(source["file_fd"], 0, os.SEEK_SET)
    digest = hashlib.sha256()
    bytes_read = 0
    while bytes_read < before.st_size:
        chunk = os.read(
            source["file_fd"],
            min(READ_CHUNK_BYTES, before.st_size - bytes_read),
        )
        if not chunk:
            break
        digest.update(chunk)
        bytes_read += len(chunk)
        if bytes_read > max_bytes:
            raise SafeOpenatError(
                f"database source exceeds {max_bytes} bytes after reading {bytes_read} bytes"
            )
    after = os.fstat(source["file_fd"])
    if bytes_read != after.st_size:
        raise SafeOpenatError("database source hash did not consume the complete file")
    _verify_database_source(
        source,
        after,
        allow_path_rename=bool(handle.get("allowPathRename", False))
        if isinstance(handle, dict)
        else False,
    )
    return _file_record(
        source["root"],
        source["segments"],
        after,
        digest.hexdigest(),
    )


def close_database_source_anchored(handle, *, expected_record):
    """Verify the pinned descriptor one final time, then close every owned fd."""
    if not isinstance(handle, dict) or "source" not in handle or "maxBytes" not in handle:
        raise SafeOpenatError("database source handle is invalid")
    try:
        record = hash_database_source_anchored(handle, max_bytes=handle["maxBytes"])
        if record != expected_record:
            raise SafeOpenatError("database source changed while its read-only connection was active")
        return record
    finally:
        _close_database_source(handle["source"])


def _parse_request(raw):
    if len(raw) > MAX_REQUEST_BYTES:
        raise SafeOpenatError("request exceeds input limit")
    if not raw.endswith(b"\n") or b"\n" in raw[:-1]:
        raise SafeOpenatError("request must be exactly one JSON line ending with newline")
    try:
        def reject_duplicate_keys(pairs):
            parsed = {}
            for key, value in pairs:
                if key in parsed:
                    raise SafeOpenatError(f"request JSON contains duplicate key {key!r}")
                parsed[key] = value
            return parsed

        def reject_non_json_constant(value):
            raise SafeOpenatError(f"request JSON contains invalid constant {value}")

        request = json.loads(
            raw[:-1].decode("utf-8"),
            object_pairs_hook=reject_duplicate_keys,
            parse_constant=reject_non_json_constant,
        )
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise SafeOpenatError(f"request is invalid JSON: {error}") from error
    return request


def _dispatch(request):
    if not isinstance(request, dict) or not isinstance(request.get("operation"), str):
        raise SafeOpenatError("request must be an object with a string operation")
    operation = request["operation"]
    if operation == "capture":
        _exact_keys(request, ["operation", "root", "segments", "maxBytes", "includeBytes"], "request")
        captured = capture_anchored(
            request["root"],
            request["segments"],
            max_bytes=request["maxBytes"],
            include_bytes=request["includeBytes"],
        )
        return {"operation": operation, **captured}
    if operation == "inventory":
        _exact_keys(request, ["operation", "root", "profileIndexMaxBytes"], "request")
        return {
            "operation": operation,
            "items": inventory_anchored(
                request["root"],
                profile_index_max_bytes=request["profileIndexMaxBytes"],
            ),
        }
    if operation == "tree":
        _exact_keys(
            request,
            ["operation", "root", "maxBytesByRelativePath", "defaultMaxBytes"],
            "request",
        )
        return {
            "operation": operation,
            **tree_snapshot_anchored(
                request["root"],
                max_bytes_by_relative_path=request["maxBytesByRelativePath"],
                default_max_bytes=request["defaultMaxBytes"],
            ),
        }
    if operation == "sha256":
        _exact_keys(
            request,
            ["operation", "root", "maxBytesByRelativePath", "defaultMaxBytes", "exclude"],
            "request",
        )
        return {
            "operation": operation,
            "manifest": sha256_manifest_anchored(
                request["root"],
                max_bytes_by_relative_path=request["maxBytesByRelativePath"],
                default_max_bytes=request["defaultMaxBytes"],
                exclude=request["exclude"],
            ),
        }
    if operation == "materialize":
        _exact_keys(
            request,
            [
                "operation",
                "sourceRoot",
                "outParent",
                "partialName",
                "finalName",
                "expectedInventory",
                "publish",
                "diagnosticText",
            ],
            "request",
        )
        return {
            "operation": operation,
            **materialize_anchored(
                request["sourceRoot"],
                request["outParent"],
                partial_name=request["partialName"],
                final_name=request["finalName"],
                expected_inventory=request["expectedInventory"],
                publish=request["publish"],
                diagnostic_text=request["diagnosticText"],
            ),
        }
    raise SafeOpenatError("request operation is invalid")


def encode_response(response, *, max_output_bytes=None):
    if not isinstance(response, dict) or response.get("operation") not in (
        "capture",
        "inventory",
        "tree",
        "sha256",
        "materialize",
    ):
        raise SafeOpenatError("response operation is invalid")
    if max_output_bytes is None:
        max_output_bytes = (
            MAX_CAPTURE_OUTPUT_BYTES
            if response["operation"] == "capture"
            else MAX_STRUCTURED_OUTPUT_BYTES
        )
    max_output_bytes = _validate_max_bytes(max_output_bytes)
    output = (
        json.dumps(
            response,
            ensure_ascii=False,
            allow_nan=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        + "\n"
    ).encode("utf-8")
    if len(output) > max_output_bytes:
        raise SafeOpenatError(f"response exceeds output limit {max_output_bytes} bytes")
    return output


def main():
    try:
        raw = sys.stdin.buffer.read(MAX_REQUEST_BYTES + 1)
        response = _dispatch(_parse_request(raw))
        output = encode_response(response)
    except Exception as error:
        sys.stderr.write(f"error: {error}\n")
        return 1
    sys.stdout.buffer.write(output)
    sys.stdout.buffer.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
