#!/usr/bin/env python3
"""Capture one native dashboard screenshot per App Store device class."""
import json
import os
import pathlib
import struct
import subprocess
import sys
import time
import tempfile
from importlib.util import module_from_spec, spec_from_file_location


def run(*args, check=True):
    result = subprocess.run(args, text=True, capture_output=True, check=check)
    if result.stderr:
        print(result.stderr, file=sys.stderr, end='')
    return result.stdout.strip()


kind, app = sys.argv[1:]
output = pathlib.Path('screenshots') / kind
output.mkdir(parents=True, exist_ok=True)
devices = json.loads(run('xcrun', 'simctl', 'list', 'devices', 'available', '-j'))['devices']
preferences = ['iPhone 16 Pro', 'iPhone 15 Pro', 'iPhone 17 Pro'] if kind == 'iphone' else ['iPad Pro 13-inch (M4)', 'iPad Pro 13-inch (M5)', 'iPad Pro (12.9-inch) (6th generation)']
chosen = next((device for name in preferences for runtime, entries in reversed(list(devices.items())) if '.iOS-' in runtime for device in entries if device['name'] == name), None)
if not chosen:
    raise RuntimeError('No suitable simulator: ' + json.dumps(devices))
device = chosen['udid']
print('Selected simulator:', chosen, flush=True)
run('xcrun', 'simctl', 'boot', device, check=False)
run('xcrun', 'simctl', 'bootstatus', device, '-b')
run('xcrun', 'simctl', 'ui', device, 'appearance', 'dark')
run('xcrun', 'simctl', 'status_bar', device, 'override', '--time', '9:41', '--dataNetwork', 'wifi', '--wifiMode', 'active', '--wifiBars', '3', '--batteryState', 'charged', '--batteryLevel', '100')
run('xcrun', 'simctl', 'install', device, app)
bundle = run('/usr/libexec/PlistBuddy', '-c', 'Print CFBundleIdentifier', app + '/Info.plist')
container = run('xcrun', 'simctl', 'get_app_container', device, bundle, 'data')
spec = spec_from_file_location('fixture', pathlib.Path(__file__).with_name('seed-screenshot-db.py'))
fixture = module_from_spec(spec)
spec.loader.exec_module(fixture)
fixture.seed(pathlib.Path(container) / 'Documents/SQLite/lixo.db')
run('xcrun', 'simctl', 'launch', device, bundle)
time.sleep(15)
routes = [
    ('01-dashboard', 'lixo:///', 'Ready for the next session.*'),
]
manifest = {'device': chosen, 'bundleIdentifier': bundle, 'buildURL': os.environ.get('SIMULATOR_ARTIFACT_URL'), 'screenshots': []}
try:
    # iOS 26 requires explicit confirmation for the first custom-scheme link.
    # Maestro drives the real simulator accessibility UI and checks each route.
    commands = []
    for name, url, expected in routes:
        commands += [
            {'openLink': url},
            {'tapOn': {'text': 'Open', 'optional': True}},
            {'extendedWaitUntil': {'visible': expected, 'timeout': 30000}},
            {'assertNotVisible': 'Open in.*'},
            {'waitForAnimationToEnd': {'timeout': 5000}},
            {'takeScreenshot': name},
        ]
    with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml') as flow:
        flow.write(json.dumps({'appId': bundle}) + '\n---\n' + json.dumps(commands))
        flow.flush()
        result = subprocess.run(['maestro', '--device', device, 'test', '--test-output-dir', str(output / 'maestro'), flow.name], check=False)
    for name, url, _ in routes:
        matches = list((output / 'maestro').rglob(name + '.png'))
        if not matches:
            continue
        assert len(matches) == 1, matches
        path = output / (name + '.png')
        matches[0].replace(path)
        width, height = struct.unpack('>II', path.read_bytes()[16:24])
        allowed = {(1206, 2622), (1179, 2556)} if kind == 'iphone' else {(2064, 2752), (2048, 2732)}
        assert (width, height) in allowed, (path, width, height)
        manifest['screenshots'].append({'file': path.name, 'width': width, 'height': height, 'route': url})
        print(path, width, height, flush=True)
    result.check_returncode()
    assert len(manifest['screenshots']) == len(routes), 'Missing screenshot output'
finally:
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    run('xcrun', 'simctl', 'spawn', device, 'log', 'show', '--last', '3m', '--style', 'compact', '--predicate', 'process == "Lixo"', check=False)
    run('xcrun', 'simctl', 'shutdown', device, check=False)
