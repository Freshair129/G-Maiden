"""CR-047 read-only model/fixture inventory; stdlib only, NOT an inference benchmark."""
import hashlib
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def varint(data, pos):
    value, shift = 0, 0
    while True:
        byte = data[pos]
        pos += 1
        value |= (byte & 127) << shift
        if byte < 128:
            return value, pos
        shift += 7


def fields(data):
    """Read wire fields of the checked-in ONNX protobuf without loading an engine."""
    pos = 0
    while pos < len(data):
        tag, pos = varint(data, pos)
        number, wire = tag >> 3, tag & 7
        if wire == 0:
            value, pos = varint(data, pos)
        elif wire == 2:
            length, pos = varint(data, pos)
            value, pos = data[pos:pos + length], pos + length
        elif wire in (1, 5):
            length = 8 if wire == 1 else 4
            value, pos = data[pos:pos + length], pos + length
        else:
            raise ValueError(f"Unsupported wire type {wire}")
        yield number, value


def one(data, field):
    return next(value for number, value in fields(data) if number == field)


def shape(value_info):
    tensor_type = one(one(value_info, 2), 1)
    dimensions = one(tensor_type, 2)
    return [dict(fields(dim)).get(1, "symbolic")
            for number, dim in fields(dimensions) if number == 1]


def artifact(path):
    data = (ROOT / path).read_bytes()
    return {"path": path, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def main():
    model = (ROOT / "models/minimap-detector.onnx").read_bytes()
    graph = one(model, 7)
    nodes = [data for field, data in fields(graph) if field == 1]
    initializers = [data for field, data in fields(graph) if field == 5]
    weights = []
    for data in initializers:
        entries = list(fields(data))
        weights.append({
            "name": one(data, 8).decode(),
            "element_type": one(data, 2),
            "raw_bytes": sum(len(v) for n, v in entries if n == 9),
        })
    report = {
        "evidence": "measured-offline-artifact-inventory",
        "command": "python tests/benches/cr047_inventory.py",
        "inference_executed": False,
        "input_shapes": [shape(d) for n, d in fields(graph) if n == 11],
        "output_shapes": [shape(d) for n, d in fields(graph) if n == 12],
        "operators": dict(sorted(Counter(one(n, 4).decode() for n in nodes).items())),
        "opsets": [dict(fields(d)) for n, d in fields(model) if n == 8],
        "labels": len(json.loads((ROOT / "models/labels.json").read_text())),
        "initializer_raw_bytes": sum(w["raw_bytes"] for w in weights),
        "initializers": weights,
        "artifacts": [artifact(p) for p in [
            "models/minimap-detector.onnx", "models/labels.json",
            "src-tauri/src/capture.rs", "src-tauri/src/cv/prefilter.rs",
            "src-tauri/src/cv/patch_cache.rs",
            *[f"assets/minimap-icons/{name}.png" for name in
              ["axe", "crystal_maiden", "pudge", "lina", "juggernaut"]],
        ]],
    }
    # Empty domain is bytes in protobuf; JSON represents it explicitly as text.
    report["opsets"] = [{str(k): v.decode() if isinstance(v, bytes) else v
                         for k, v in row.items()} for row in report["opsets"]]
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
