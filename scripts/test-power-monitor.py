"""Exercise the real monitor process, notification stream, lock and EOF guard."""
import json
import fcntl
import os
import pathlib
import select
import signal
import subprocess
import sys
import tempfile
import time


def line(process):
    assert select.select([process.stdout], [], [], 5)[0], "Power event timed out"
    return json.loads(process.stdout.readline())


with tempfile.TemporaryDirectory(prefix="cafmoda-power-runtime-") as directory:
    journal = str(pathlib.Path(directory) / "recovery.json")
    helper = sys.argv[1]
    monitor = subprocess.Popen([helper, "--watch", journal], stdin=subprocess.PIPE,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        first = line(monitor)
        assert isinstance(first["onBattery"], bool)
        assert isinstance(first["lowPowerMode"], bool)
        duplicate = subprocess.run([helper, "--watch", journal], input=b"",
                                   capture_output=True, timeout=5)
        assert duplicate.returncode != 0
        assert b"Another Cafmoda" in duplicate.stderr
        monitor.stdin.write(b"\n")
        monitor.stdin.flush()
        assert line(monitor) == first
        with open(journal + ".mutation-lock", "a") as mutation_lock:
            fcntl.flock(mutation_lock, fcntl.LOCK_EX)
            monitor.stdin.close()
            time.sleep(0.1)
            assert monitor.poll() is None, "Recovery must wait for in-flight writes"
            fcntl.flock(mutation_lock, fcntl.LOCK_UN)
            assert monitor.wait(timeout=5) == 0, monitor.stderr.read()
    finally:
        if monitor.poll() is None:
            monitor.kill()
            monitor.wait()

    # A killed owner cannot run a quit handler. Kernel pipe closure must still
    # release the monitor lock, proving the independent recovery path runs.
    owner_code = """
import subprocess, sys, time
helper = subprocess.Popen([sys.argv[1], '--watch', sys.argv[2]], stdin=subprocess.PIPE,
                          stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
assert helper.stdout.readline()
print(helper.pid, flush=True)
time.sleep(30)
"""
    owner = subprocess.Popen([sys.executable, "-c", owner_code, helper, journal],
                             stdout=subprocess.PIPE, text=True)
    child = None
    try:
        assert select.select([owner.stdout], [], [], 5)[0]
        child = int(owner.stdout.readline())
        owner.kill()
        owner.wait(timeout=5)
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            probe = subprocess.Popen([helper, "--watch", journal], stdin=subprocess.PIPE,
                                     stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            result, _ = probe.communicate(timeout=5)
            if probe.returncode == 0 and result:
                child = None
                break
            time.sleep(0.05)
        else:
            raise AssertionError("Force-quit recovery did not release the lock")
    finally:
        if owner.poll() is None:
            owner.kill()
            owner.wait()
        if child:
            try:
                os.kill(child, signal.SIGTERM)
            except ProcessLookupError:
                pass

print("PASS: real power stream, exclusive owner, refresh, EOF cleanup and force-quit recovery")
