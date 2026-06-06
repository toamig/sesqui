# Quantize a trained AZ model (float JSON) to int8 for shipping. Per-tensor
# symmetric int8 for the (large) weight matrices, biases kept as float (tiny).
# The app dequantizes once at load, so inference speed is unchanged; only the
# shipped file shrinks (~1 MB -> ~150 KB).
#
#   python ml/quantize.py --in ml/models/azNet-iter4.json --out src/game/ai/azNetQuant.json

import argparse, base64, json
import numpy as np


def quant_tensor(w):
    a = np.asarray(w, dtype=np.float32)
    scale = float(np.max(np.abs(a))) / 127.0 or 1.0
    q = np.clip(np.round(a / scale), -127, 127).astype(np.int8)
    return scale, base64.b64encode(q.tobytes()).decode("ascii")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", default="ml/models/azNet-iter4.json")
    ap.add_argument("--out", default="src/game/ai/azNetQuant.json")
    args = ap.parse_args()

    src = json.load(open(args.inp))
    out = {"arch": src.get("arch", ""), "q": "int8", "layers": {}}
    for name, layer in src["layers"].items():
        ws, wq = quant_tensor(layer["w"])
        out["layers"][name] = {
            "ws": round(ws, 8),
            "wq": wq,
            "b": [round(float(x), 6) for x in layer["b"]],
        }
    json.dump(out, open(args.out, "w"))

    fkb = len(json.dumps(src)) // 1024
    qkb = len(json.dumps(out)) // 1024
    print(f"float {fkb} KB -> int8 {qkb} KB ({args.out})")

    # Report worst-case quantization error per layer (sanity).
    for name, layer in src["layers"].items():
        a = np.asarray(layer["w"], dtype=np.float32)
        scale = float(np.max(np.abs(a))) / 127.0 or 1.0
        deq = np.clip(np.round(a / scale), -127, 127).astype(np.float32) * scale
        err = float(np.max(np.abs(a - deq)))
        print(f"  {name}: max abs err {err:.5f}")


if __name__ == "__main__":
    main()
