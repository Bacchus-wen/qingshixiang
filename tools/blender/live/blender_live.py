#!/usr/bin/env python3
"""Standard-library CLI for a persistent headless Blender session."""
import argparse
import fcntl
import http.client
import json
import os
from pathlib import Path
import subprocess
import sys
import time

DEFAULT_BLENDER = "/Applications/Blender.app/Contents/MacOS/Blender"
STATE_DIR = Path("/tmp/blender-live")
SERVER = Path(__file__).resolve().with_name("server.py")


def request(port, payload, timeout):
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=timeout)
    try:
        connection.request("POST", "/", json.dumps(payload), {"Content-Type": "application/json"})
        response = connection.getresponse()
        if response.status != 200:
            raise RuntimeError(f"Unexpected HTTP status {response.status}")
        data = json.loads(response.read())
        if not isinstance(data, dict) or not {"ok", "stdout", "error", "result"} <= data.keys():
            raise RuntimeError("Port is not serving the Blender Live protocol")
        return data
    finally:
        connection.close()


def identity(port, timeout=2):
    data = request(port, {"action": "status"}, timeout)
    result = data.get("result")
    if not data["ok"] or not isinstance(result, dict) or result.get("protocol") != "blender-live/1":
        raise RuntimeError("Port is not serving Blender Live")
    if result.get("server") != str(SERVER):
        raise RuntimeError("Port belongs to another project copy; use a different --port")
    return result


def alive(pid):
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False


def start(args, pidfile, logfile):
    try:
        running = identity(args.port)
    except ConnectionRefusedError:
        running = None
    except TimeoutError:
        if pidfile.exists() and alive(int(pidfile.read_text())):
            print(json.dumps({"running": True, "busy": True, "pid": int(pidfile.read_text())}))
            return
        raise RuntimeError("Port is busy or unresponsive; no new process was started")
    if running:
        print(json.dumps({"running": True, **running}, ensure_ascii=False))
        return
    if pidfile.exists() and alive(int(pidfile.read_text())):
        raise RuntimeError("Recorded process is alive but not responding; inspect " + str(logfile))
    pidfile.unlink(missing_ok=True)
    with logfile.open("ab", buffering=0) as log:
        child = subprocess.Popen(
            [args.blender, "-b", "--factory-startup", "--python-exit-code", "1", "-P", str(SERVER),
             "--", "--port", str(args.port)],
            stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
            start_new_session=True, close_fds=True,
        )
    pidfile.write_text(str(child.pid) + "\n")
    deadline = time.monotonic() + min(args.timeout, 60)
    try:
        while time.monotonic() < deadline:
            if child.poll() is not None:
                raise RuntimeError(f"Blender exited ({child.returncode}); inspect {logfile}")
            try:
                running = identity(args.port, 1)
            except (ConnectionRefusedError, TimeoutError):
                time.sleep(0.2)
                continue
            if running["pid"] != child.pid:
                raise RuntimeError("Another process acquired the port during startup")
            print(json.dumps({"started": True, **running, "log": str(logfile)}, ensure_ascii=False))
            return
        raise RuntimeError("Blender startup timed out; inspect " + str(logfile))
    except BaseException:
        if child.poll() is None:
            child.terminate()
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()
        pidfile.unlink(missing_ok=True)
        raise


def positive(value):
    number = int(value)
    if number < 1:
        raise argparse.ArgumentTypeError("must be positive")
    return number


def resolution(value):
    try:
        width, height = map(int, value.lower().split("x"))
        if not 1 <= width <= 16384 or not 1 <= height <= 16384:
            raise ValueError()
        return [width, height]
    except ValueError:
        raise argparse.ArgumentTypeError("use WIDTHxHEIGHT (each 1..16384)") from None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=9877)
    parser.add_argument("--timeout", type=positive, default=300, help="request timeout in seconds")
    parser.add_argument("--blender", default=os.environ.get("BLENDER_BIN", DEFAULT_BLENDER))
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("start", "stop", "status", "reset"):
        commands.add_parser(name)
    execute = commands.add_parser("exec")
    execute.add_argument("file", nargs="?")
    execute.add_argument("-c", "--code")
    render = commands.add_parser("render")
    render.add_argument("output")
    render.add_argument("--engine", choices=["EEVEE", "CYCLES"], default="EEVEE")
    render.add_argument("--samples", type=positive, default=32)
    render.add_argument("--res", type=resolution, default=[1280, 720])
    export = commands.add_parser("export")
    export.add_argument("output")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("--port must be 1..65535")
    if args.command == "exec" and ((args.file is None) == (args.code is None)):
        parser.error("exec requires exactly one of FILE or -c CODE")
    STATE_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    pidfile = STATE_DIR / f"{args.port}.pid"
    logfile = STATE_DIR / f"{args.port}.log"
    try:
        if args.command == "start":
            with (STATE_DIR / f"{args.port}.lock").open("a") as lock:
                fcntl.flock(lock, fcntl.LOCK_EX)
                start(args, pidfile, logfile)
            return 0
        try:
            running = identity(args.port, args.timeout)
        except ConnectionRefusedError:
            if args.command in {"status", "stop"}:
                print(json.dumps({"running": False, "port": args.port}))
                return 0 if args.command == "stop" else 1
            raise RuntimeError("Blender Live is not running; run start first") from None
        if args.command == "status":
            print(json.dumps({"running": True, **running}, ensure_ascii=False))
            return 0
        payload = {"action": args.command}
        if args.command == "exec":
            payload["code"] = Path(args.file).read_text(encoding="utf-8") if args.file else args.code
        elif args.command in {"render", "export"}:
            payload["path"] = str(Path(args.output).expanduser().resolve())
            suffix = ".png" if args.command == "render" else ".glb"
            if Path(args.output).suffix.lower() != suffix:
                raise ValueError("Output must end in " + suffix)
            if args.command == "render":
                payload.update(engine=args.engine, samples=args.samples, resolution=args.res)
        data = request(args.port, payload, args.timeout)
        print(json.dumps(data, ensure_ascii=False, indent=2))
        if args.command == "stop" and data["ok"]:
            deadline = time.monotonic() + 10
            while alive(running["pid"]) and time.monotonic() < deadline:
                time.sleep(0.1)
            if alive(running["pid"]):
                raise RuntimeError("Shutdown requested but process has not exited; inspect " + str(logfile))
            if pidfile.exists() and int(pidfile.read_text()) == running["pid"]:
                pidfile.unlink()
        return 0 if data["ok"] else 1
    except (OSError, ValueError, RuntimeError, http.client.HTTPException) as error:
        print(f"blender-live: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
