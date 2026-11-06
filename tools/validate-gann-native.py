"""Exercise production Studio authoring/install and Maiden GSI on an owned desktop.

This is native injected-GSI evidence, not a live-match or acoustic qualification.
Requires already-built custom-protocol executables and an isolated native config.
"""
import argparse
import csv
import ctypes
import hashlib
import json
import os
import socket
import sys
from pathlib import Path
import subprocess
import time
import urllib.request
import winreg
import zipfile


def request(url, payload=None):
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=5) as response:
        raw = response.read().decode()
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return raw


def run_cli(exe, command, job, env, output):
    result = subprocess.run([str(exe), command, str(job)], env=env,
                            capture_output=True, text=True, encoding="utf-8",
                            errors="replace", timeout=300,
                            creationflags=subprocess.CREATE_NO_WINDOW)
    output.write_text(result.stdout + result.stderr, encoding="utf-8")
    if result.returncode:
        raise RuntimeError(f"{command} exited {result.returncode}: {result.stderr[-1500:]}")
    return json.loads(result.stdout.strip().splitlines()[-1])


def dota_pids():
    result = subprocess.run(["tasklist", "/FI", "IMAGENAME eq dota2.exe", "/FO", "CSV", "/NH"],
                            capture_output=True, text=True, errors="replace", timeout=10,
                            creationflags=subprocess.CREATE_NO_WINDOW)
    return {int(row[1]) for row in csv.reader(result.stdout.splitlines())
            if len(row) > 1 and row[0].lower() == "dota2.exe" and row[1].isdigit()}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--studio", type=Path, required=True)
    parser.add_argument("--maiden", type=Path, required=True)
    parser.add_argument("--ffmpeg", type=Path, required=True)
    parser.add_argument("--node", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--build-job", type=Path, required=True)
    parser.add_argument("--critical-package", type=Path, required=True)
    parser.add_argument("--live-gsi-config", type=Path, required=True)
    parser.add_argument("--dota-exe", type=Path)
    args = parser.parse_args()
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    observe_out = out / f"native-observer-{os.getpid()}"
    observe_out.mkdir()
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        debug_port = reservation.getsockname()[1]
    env = dict(os.environ, LOCALAPPDATA=str(out / "appdata"),
               APPDATA=str(out / "roaming"), FFMPEG_PATH=str(args.ffmpeg.resolve()),
               WEBVIEW2_USER_DATA_FOLDER=str(out / "webview"),
               WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=f"--remote-debugging-port={debug_port} --remote-debugging-address=127.0.0.1")
    report = {"status": "INCOMPLETE", "method": "production native binaries with injected GSI",
              "windows_build": sys.getwindowsversion().build,
              "debugger_port": debug_port,
              "binaries": {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in [args.studio, args.maiden]},
              "trials": []}
    proc = None
    desktop = None
    stdout = None
    stderr = None
    observer = None
    owned_dota = set()
    game = None
    guard = None
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.CreateFileW.argtypes = [ctypes.c_wchar_p, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_void_p, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_void_p]
    kernel.CreateFileW.restype = ctypes.c_void_p
    kernel.CloseHandle.argtypes = [ctypes.c_void_p]
    try:
        # Owned, temporary read-share handle prevents either test UI from repairing
        # the current user's live Dota configuration while another app owns it.
        before_cfg = args.live_gsi_config.read_bytes()
        guard = kernel.CreateFileW(str(args.live_gsi_config.resolve()), 0x80000000, 1, None, 3, 0, None)
        if guard in (None, ctypes.c_void_p(-1).value):
            raise ctypes.WinError(ctypes.get_last_error())
        report["live_gsi_config_guard"] = {"before_sha256": hashlib.sha256(before_cfg).hexdigest(), "owned_read_handle": True}
        build_job = json.loads(args.build_job.read_text(encoding="utf-8-sig"))
        build_job["outputPath"] = str(out / f"studio-created-{os.getpid()}.gann")
        generated_job = out / f"build-job-{os.getpid()}.json"
        generated_job.write_text(json.dumps(build_job), encoding="utf-8")
        built = run_cli(args.studio, "--gann-build", generated_job, env, out / "studio-create.log")
        package = Path(built["path"])
        report["created"] = built
        with zipfile.ZipFile(package) as archive:
            index = json.loads(archive.read("gann.json"))
            registry = json.loads(archive.read(index["manifest"]))
        registries = {built["pack_id"]: registry}
        report["container_sha256"] = hashlib.sha256(package.read_bytes()).hexdigest()
        voice_root = args.maiden.parent.resolve() / "voice-cache"
        active_pointer = voice_root / "active-pack.txt"
        before_active = active_pointer.read_bytes() if active_pointer.exists() else None
        install_job = out / "install-job.json"
        install_job.write_text(json.dumps({"path": str(package), "gmaidenDir": str(args.maiden.parent.resolve()), "activate": False}))
        installed = run_cli(args.studio, "--gann-install", install_job, env, out / "studio-install.log")
        assert installed["container_sha256"] == report["container_sha256"]
        assert not installed["activated"]
        after_active = active_pointer.read_bytes() if active_pointer.exists() else None
        assert after_active == before_active, "Filesystem install changed active selection"
        installed_dir = Path(installed["pack_dir"])
        assert installed_dir.parent.parent.resolve() == voice_root
        for entry in index["files"]:
            payload_bytes = (installed_dir / entry["path"]).read_bytes()
            assert len(payload_bytes) == entry["bytes"]
            assert hashlib.sha256(payload_bytes).hexdigest() == entry["sha256"]
        report["installed_payload_count"] = len(index["files"])
        report["install_preserved_active_pointer"] = True
        report["installed"] = installed
        integration = out / "appdata/G-Maiden"
        integration.mkdir(parents=True, exist_ok=True)
        # Explicit invalid remembered selection prevents repair from touching a live game's cfg.
        (integration / "gsi-dota-path.txt").write_text(str(out / "no-dota-install"))
        (integration / "settings.json").write_text(json.dumps({"announcerEnabled": True, "voiceEnabled": True, "killVisuals": True, "masterEnabled": False, "autoAdvice": False, "cloudContextOptIn": False, "telemetrySource": "off"}))
        name = f"GannNativeValidation_{os.getpid()}"
        user = ctypes.WinDLL("user32", use_last_error=True)
        user.CreateDesktopW.argtypes = [ctypes.c_wchar_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_void_p]
        user.CreateDesktopW.restype = ctypes.c_void_p
        user.CloseDesktop.argtypes = [ctypes.c_void_p]
        desktop = user.CreateDesktopW(name, None, None, 0, 0x1ff, None)
        if not desktop:
            raise ctypes.WinError(ctypes.get_last_error())
        startup = subprocess.STARTUPINFO()
        startup.lpDesktop = name
        existing_dota = dota_pids()
        if not existing_dota:
            if not args.dota_exe:
                raise RuntimeError("A real Dota process is required by the native freshness watchdog")
            game = subprocess.Popen([str(args.dota_exe.resolve()), "-novid"], cwd=args.dota_exe.parent,
                                    env=env, startupinfo=startup, creationflags=subprocess.CREATE_NO_WINDOW,
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            owned_dota.add(game.pid)
            deadline = time.monotonic() + 60
            while time.monotonic() < deadline:
                running = dota_pids()
                if game.pid in running and game.poll() is None:
                    break
                if game.poll() is not None:
                    raise RuntimeError("Owned Dota exited; an unrelated game process is never adopted")
                time.sleep(.5)
            else:
                raise RuntimeError("Owned Dota launch did not establish the real process watchdog prerequisite")
        report["dota_processes"] = {"preexisting": sorted(existing_dota), "owned_launch": sorted(owned_dota)}
        stdout = (out / "maiden-stdout.log").open("w", encoding="utf-8")
        stderr = (out / "maiden-stderr.log").open("w", encoding="utf-8")
        proc = subprocess.Popen([str(args.maiden.resolve())], cwd=args.maiden.parent,
                                env=env, startupinfo=startup,
                                creationflags=subprocess.CREATE_NO_WINDOW,
                                stdout=stdout, stderr=stderr)
        report["owned_pid"] = proc.pid
        deadline = time.monotonic() + 60
        health = None
        healthy = False
        while time.monotonic() < deadline:
            if proc.poll() is not None:
                raise RuntimeError(f"Owned Maiden exited {proc.returncode}; inspect maiden-stderr.log")
            try:
                port = int((integration / "gsi-port.txt").read_text().strip())
                base = f"http://127.0.0.1:{port}"
                health = request(base + "/health")
                if health.get("service") == "g-maiden" and health.get("voiceRootId"):
                    healthy = True
                    break
            except (OSError, ValueError):
                pass
            time.sleep(.25)
        if not healthy:
            raise RuntimeError("Owned runtime did not publish healthy endpoint")
        ownership = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command",
                                    f"(Get-NetTCPConnection -LocalPort {port} -State Listen).OwningProcess"],
                                   capture_output=True, text=True, timeout=20,
                                   creationflags=subprocess.CREATE_NO_WINDOW)
        assert str(proc.pid) in ownership.stdout.split(), "GSI listener does not belong to the owned candidate"
        report["health"] = health
        observer = subprocess.Popen([str(args.node.resolve()), str(Path(__file__).with_name("gann-native-observer.mjs")), str(observe_out), str(debug_port)],
                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                    creationflags=subprocess.CREATE_NO_WINDOW)
        deadline = time.monotonic() + 60
        while not (observe_out / "observer-ready.json").exists():
            if observer.poll() is not None:
                raise RuntimeError(f"Native observer failed: {observer.communicate()[1].decode(errors='replace')}")
            if time.monotonic() >= deadline:
                raise RuntimeError("Native overlay listener did not become ready")
            time.sleep(.25)
        install_job.write_text(json.dumps({"path": str(package), "gmaidenDir": str(args.maiden.parent.resolve()), "activate": True}))
        report["activated"] = run_cli(args.studio, "--gann-install", install_job, env, out / "studio-activate.log")
        assert report["activated"]["activated"]
        # The real active local Steam identity is read only and is never written to evidence.
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Valve\Steam\ActiveProcess") as key:
            active_user, _ = winreg.QueryValueEx(key, "ActiveUser")
        assert active_user > 0, "Native personal events require an active local Steam login"
        steam = str(76561197960265728 + active_user)
        payload = {"provider": {"name": "Dota 2", "appid": 570, "version": 1, "timestamp": int(time.time())},
                   "map": {"game_state": "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS", "matchid": "9910310001", "clock_time": 0, "daytime": True, "radiant_score": 0, "dire_score": 0},
                   "player": {"steamid": steam, "gold": 600, "net_worth": 600, "gpm": 0, "xpm": 0, "team_name": "radiant", "kills": 0, "deaths": 0, "assists": 0, "last_hits": 0, "denies": 0},
                   "hero": {"name": "npc_dota_hero_crystal_maiden", "level": 1, "alive": True, "health_percent": 100, "mana_percent": 100, "health": 600, "max_health": 600, "buyback_cost": 0, "respawn_seconds": 0}, "items": {"slot0": {"name": "empty"}}}
        for kills, event in enumerate(["match_start", "first_blood", "double_kill", "triple_kill", "ultra_kill", "rampage"]):
            payload["provider"]["timestamp"] = int(time.time())
            payload["player"]["kills"] = kills
            payload["map"]["radiant_score"] = kills
            payload["map"]["clock_time"] = kills
            assert request(base + "/gsi", payload) == "ok"
            expected = registry["events"][event]
            report["trials"].append({"event": event, "expected_pairs": expected})
            for _ in range(16):
                time.sleep(.25)
                request(base + "/gsi", payload)
        # Configurable HP safety is detected natively even though this fixture has no danger mapping.
        payload["map"]["clock_time"] = 6
        payload["hero"]["health_percent"] = 26
        payload["hero"]["health"] = 156
        request(base + "/gsi", payload)
        payload["hero"]["health_percent"] = 24
        payload["hero"]["health"] = 144
        request(base + "/gsi", payload)
        time.sleep(.5)
        report["trials"].append({"event": "danger", "expected": "native HP threshold detected, unmapped and silent"})
        payload["player"]["deaths"] = 1
        payload["hero"]["alive"] = False
        payload["hero"]["health"] = payload["hero"]["health_percent"] = 0
        assert request(base + "/gsi", payload) == "ok"
        time.sleep(1)
        report["trials"].append({"event": "death", "expected": "unmapped, no new media"})
        # A second real GANN distinguishes original voice from mixed SFX and exercises
        # mapped Critical HP playback while the normal announcer is disabled.
        with zipfile.ZipFile(args.critical_package) as archive:
            critical_index = json.loads(archive.read("gann.json"))
            critical_registry = json.loads(archive.read(critical_index["manifest"]))
        critical_id = critical_index["announcer_id"]
        critical_sounds = {sound["sound_id"]: sound for sound in critical_registry["sounds"]}
        critical_banners = {banner["banner_id"]: banner for banner in critical_registry["banners"]}
        for mapping in critical_registry["events"]["danger"]:
            banner = critical_banners[mapping["banner_id"]]
            assert critical_sounds[banner["original_sound_id"]]["sha256"] != critical_sounds[banner["playback_sound_id"]]["sha256"], "Critical fixture must distinguish original and played bytes"
        report["critical_container_sha256"] = hashlib.sha256(args.critical_package.read_bytes()).hexdigest()
        report["critical_fixture_has_distinct_audio"] = True
        registries[critical_id] = critical_registry
        (observe_out / "observer-command.json").write_text(json.dumps({"id": 1, "command": "set_announcer_enabled", "args": {"enabled": False}}))
        deadline = time.monotonic() + 10
        while True:
            try:
                command = json.loads((observe_out / "observer-command-result.json").read_text())
                if command.get("id") == 1 and command.get("ok"):
                    break
            except (OSError, ValueError):
                pass
            if time.monotonic() >= deadline:
                raise RuntimeError("Native control did not disable normal announcer")
            time.sleep(.1)
        install_job.write_text(json.dumps({"path": str(args.critical_package.resolve()), "gmaidenDir": str(args.maiden.parent.resolve()), "activate": True}))
        report["critical_activated"] = run_cli(args.studio, "--gann-install", install_job, env, out / "studio-critical-activate.log")
        payload["map"]["matchid"] = "9910310002"
        payload["map"]["clock_time"] = 30
        payload["player"]["kills"] = payload["player"]["deaths"] = 0
        payload["hero"]["alive"] = True
        payload["hero"]["health_percent"] = 26
        payload["hero"]["health"] = 156
        request(base + "/gsi", payload)
        payload["hero"]["health_percent"] = 24
        payload["hero"]["health"] = 144
        request(base + "/gsi", payload)
        report["trials"].append({"event": "danger", "pack_id": critical_id, "expected_pairs": critical_registry["events"]["danger"], "announcer_enabled": False})
        for _ in range(36):
            time.sleep(.25)
            request(base + "/gsi", payload)
        (observe_out / "observer-stop").write_text("stop")
        observed_stdout, observed_stderr = observer.communicate(timeout=15)
        (out / "observer.log").write_bytes(observed_stdout + observed_stderr)
        assert observer.returncode == 0, "Native observer failed"
        evidence = json.loads((observe_out / "observer-evidence.json").read_text())
        report["native_observer_evidence"] = str(observe_out)
        events = [event for sample in evidence["samples"] for event in sample["events"]]
        receipts = []
        for line in (out / "maiden-stderr.log").read_text(encoding="utf-8", errors="replace").splitlines():
            if "[G-AnnouncerMedia] {" in line:
                receipts.append(json.loads(line.split("[G-AnnouncerMedia] ", 1)[1]))
        expected_keys = {(trial.get("pack_id", built["pack_id"]), trial["event"])
                         for trial in report["trials"] if "expected_pairs" in trial}
        all_starts = {event["id"]: event for event in events if event["phase"] == "start"}
        assert all((event.get("manifestVisual", {}).get("packId"), event["event"]) in expected_keys
                   for event in all_starts.values()), "Unexpected pack/event produced native media"
        all_admissions = [receipt for receipt in receipts if receipt["phase"] == "admitted"]
        assert all((receipt["pack_id"], receipt["event"]) in expected_keys
                   for receipt in all_admissions), "Unexpected pack/event admitted audio"
        report["native_start_count"] = len(all_starts)
        report["native_admission_count"] = len(all_admissions)
        for trial in report["trials"]:
            expected_pack = trial.get("pack_id", built["pack_id"])
            registry = registries[expected_pack]
            banners_by_id = {banner["banner_id"]: banner for banner in registry["banners"]}
            sounds_by_id = {sound["sound_id"]: sound for sound in registry["sounds"]}
            starts = {event["id"]: event for event in events if event["event"] == trial["event"] and event["phase"] == "start" and event.get("manifestVisual", {}).get("packId") == expected_pack}
            if "expected_pairs" not in trial:
                assert not starts, "Unmapped event emitted media"
                assert not any(receipt["event"] == trial["event"] and receipt["pack_id"] == expected_pack
                               for receipt in all_admissions), "Unmapped event admitted audio"
                text = (out / "maiden-stderr.log").read_text(encoding="utf-8", errors="replace")
                assert f"phase=unmapped event={trial['event']} source=gann" in text
                trial["status"] = "NATIVE_EVENT_UNMAPPED_AND_SILENT"
                continue
            assert len(starts) == 1, f"Expected exactly one native paired lifecycle for {trial['event']}, got {len(starts)}"
            allowed = {pair["banner_id"] for pair in trial["expected_pairs"]}
            admitted = [receipt for receipt in receipts if receipt["event"] == trial["event"] and receipt["phase"] == "admitted" and receipt["pack_id"] == expected_pack]
            assert len(admitted) == 1, f"Expected exactly one native audio admission for {trial['event']}, got {len(admitted)}"
            for receipt in admitted:
                assert receipt["pack_id"] == expected_pack and receipt["banner_id"] in allowed
                banner = banners_by_id[receipt["banner_id"]]
                assert receipt["original_sha256"] == sounds_by_id[banner["original_sound_id"]]["sha256"]
                assert receipt["played_sha256"] == sounds_by_id[banner["playback_sound_id"]]["sha256"]
            for playback_id, event in starts.items():
                assert event["manifestVisual"]["packId"] == expected_pack
                assert event["manifestVisual"]["bannerId"] in allowed
                videos = [video for sample in evidence["samples"] for video in sample["videos"] if video["id"] == playback_id and video["ready"] >= 2 and video["time"] > 0 and video["frames"] > 0 and video["error"] is None]
                assert videos, f"Native video did not decode for {trial['event']}"
                assert all(video["muted"] and event["manifestVisual"]["bannerId"] in video["url"] for video in videos)
                assert playback_id in evidence["captured"], f"No rendered screenshot for {trial['event']}"
            trial["status"] = "PAIRED_NATIVE_PLAYBACK_AND_RENDER_VERIFIED"
        report["status"] = "PASS_NATIVE_INJECTED_GSI"
    except Exception as error:
        report["error"] = str(error)
        raise
    finally:
        if observer is not None and observer.poll() is None:
            (observe_out / "observer-stop").write_text("stop")
            try:
                observer.communicate(timeout=5)
            except subprocess.TimeoutExpired:
                subprocess.run(["taskkill", "/PID", str(observer.pid), "/T", "/F"], capture_output=True, timeout=30)
        if proc is not None and proc.poll() is None:
            # Only the process created and recorded above and its owned children.
            subprocess.run(["taskkill", "/PID", str(proc.pid), "/T", "/F"], capture_output=True, timeout=30)
        if stdout:
            stdout.close()
        if stderr:
            stderr.close()
        if desktop:
            if game is not None and game.poll() is None:
                subprocess.run(["taskkill", "/PID", str(game.pid), "/F"], capture_output=True, timeout=30)
                game.wait(timeout=10)
            report["owned_dota_stopped"] = sorted(owned_dota)
            user.CloseDesktop(desktop)
        if guard not in (None, ctypes.c_void_p(-1).value):
            kernel.CloseHandle(guard)
            report["live_gsi_config_guard"]["released"] = True
            after_cfg = args.live_gsi_config.read_bytes()
            report["live_gsi_config_guard"]["after_sha256"] = hashlib.sha256(after_cfg).hexdigest()
            if after_cfg != before_cfg:
                report["status"] = "FAILED_LIVE_CONFIG_CHANGED"
        (out / "native-result.json").write_text(json.dumps(report, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
