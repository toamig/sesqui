# AlphaZero-lite trainer: shared conv trunk with a value head (win prob, MSE) and
# a policy head (64 destination cells, soft cross-entropy vs the MCTS visit
# distribution). Exports azNet.json for the pure-TS PUCT search (azNet.ts).
#
#   python ml/trainAZ.py --epochs 30 --data ml/data2
#
# Architecture MUST match azNet.ts:
#   conv24(3x3,same,relu) -> conv24(3x3,same,relu) -> flatten(NHWC) ->
#   trunk dense64(relu) -> { value dense1(sigmoid), policy dense64(logits) }

import argparse, glob, json, sys
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

# Cell transpose permutation (row*8+col -> col*8+row), for mirror augmentation.
T = np.array([(j % 8) * 8 + (j // 8) for j in range(64)], dtype=np.int64)


def load(data_dir):
    rows = []
    for f in glob.glob(f"{data_dir}/*.ndjson"):
        with open(f) as fh:
            for line in fh:
                line = line.strip()
                if line:
                    rows.append(json.loads(line))
    return rows


def build(rows):
    n = len(rows)
    X = np.zeros((n, 3, 8, 8), dtype=np.float32)
    V = np.zeros((n, 1), dtype=np.float32)
    P = np.zeros((n, 64), dtype=np.float32)
    for i, s in enumerate(rows):
        bv = np.frombuffer(s["b"].encode("ascii"), dtype=np.uint8).reshape(8, 8)
        X[i, 0] = bv == ord("V")
        X[i, 1] = bv == ord("H")
        X[i, 2] = 1.0 if s["c"] == "V" else 0.0
        V[i, 0] = s["v"]
        for cell, w in s["p"]:
            P[i, cell] = w
    return X, V, P


def mirror(X, V, P):
    Xm = np.empty_like(X)
    Xm[:, 0] = X[:, 1].transpose(0, 2, 1)
    Xm[:, 1] = X[:, 0].transpose(0, 2, 1)
    Xm[:, 2] = 1.0 - X[:, 2]
    Vm = 1.0 - V
    Pm = P[:, T]
    return Xm, Vm, Pm


class Net(nn.Module):
    def __init__(self):
        super().__init__()
        self.c1 = nn.Conv2d(3, 24, 3, padding=1)
        self.c2 = nn.Conv2d(24, 24, 3, padding=1)
        self.trunk = nn.Linear(24 * 8 * 8, 64)
        self.vhead = nn.Linear(64, 1)
        self.phead = nn.Linear(64, 64)

    def forward(self, x):
        x = torch.relu(self.c1(x))
        x = torch.relu(self.c2(x))
        x = x.permute(0, 2, 3, 1).reshape(x.size(0), -1)  # NHWC flatten
        t = torch.relu(self.trunk(x))
        return torch.sigmoid(self.vhead(t)), self.phead(t)


def rnd(a):
    return [round(float(x), 5) for x in np.asarray(a).ravel()]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="ml/data2")
    ap.add_argument("--epochs", type=int, default=30)
    ap.add_argument("--out", default="src/game/ai/azNet.json")
    ap.add_argument("--batch", type=int, default=512)
    args = ap.parse_args()

    dirs = [d.strip() for d in args.data.split(",") if d.strip()]
    rows = []
    for d in dirs:
        r = load(d)
        print(f"  {d}: {len(r)} positions")
        rows.extend(r)
    print(f"loaded {len(rows)} positions from {len(dirs)} dir(s)")
    if not rows:
        print("no data; run gen first", file=sys.stderr)
        sys.exit(1)

    Xo, Vo, Po = build(rows)
    Xm, Vm, Pm = mirror(Xo, Vo, Po)
    X = np.concatenate([Xo, Xm])
    Vy = np.concatenate([Vo, Vm])
    Py = np.concatenate([Po, Pm])
    n = len(X)
    print(f"training on {n} samples (incl. mirror)")

    rng = np.random.default_rng(0)
    perm = rng.permutation(n)
    X, Vy, Py = X[perm], Vy[perm], Py[perm]
    nval = n // 10
    to_t = lambda a: torch.from_numpy(a)
    Xtr, Xva = to_t(X[nval:]), to_t(X[:nval])
    Vtr, Vva = to_t(Vy[nval:]), to_t(Vy[:nval])
    Ptr, Pva = to_t(Py[nval:]), to_t(Py[:nval])

    model = Net()
    opt = torch.optim.Adam(model.parameters(), lr=1e-3)
    ntr = Xtr.size(0)

    def losses(vp, pp, vt, pt):
        vloss = F.mse_loss(vp, vt)
        ploss = -(pt * F.log_softmax(pp, dim=1)).sum(dim=1).mean()
        return vloss, ploss

    for ep in range(args.epochs):
        model.train()
        idx = torch.randperm(ntr)
        tv = tp = 0.0
        for b in range(0, ntr, args.batch):
            sel = idx[b : b + args.batch]
            vp, pp = model(Xtr[sel])
            vloss, ploss = losses(vp, pp, Vtr[sel], Ptr[sel])
            opt.zero_grad()
            (vloss + ploss).backward()
            opt.step()
            bs = sel.size(0)
            tv += vloss.item() * bs
            tp += ploss.item() * bs
        model.eval()
        with torch.no_grad():
            vvp, vpp = model(Xva)
            vvl, vpl = losses(vvp, vpp, Vva, Pva)
        print(
            f"epoch {ep+1}/{args.epochs}  v={tv/ntr:.4f} p={tp/ntr:.4f}  "
            f"val_v={vvl.item():.4f} val_p={vpl.item():.4f}"
        )

    model.eval()
    with torch.no_grad():
        dump = {
            "arch": "az-conv24x2-trunk64-value-policy64",
            "layers": {
                "conv1": {"w": rnd(model.c1.weight.permute(2, 3, 1, 0).contiguous().numpy()), "b": rnd(model.c1.bias.numpy())},
                "conv2": {"w": rnd(model.c2.weight.permute(2, 3, 1, 0).contiguous().numpy()), "b": rnd(model.c2.bias.numpy())},
                "trunk": {"w": rnd(model.trunk.weight.t().contiguous().numpy()), "b": rnd(model.trunk.bias.numpy())},
                "value": {"w": rnd(model.vhead.weight.t().contiguous().numpy()), "b": rnd(model.vhead.bias.numpy())},
                "policy": {"w": rnd(model.phead.weight.t().contiguous().numpy()), "b": rnd(model.phead.bias.numpy())},
            },
        }
    with open(args.out, "w") as fh:
        json.dump(dump, fh)
    print(f"wrote {args.out} ({len(json.dumps(dump))//1024} KB)")

    # Sanity: empty board value ~0.5; policy mass should be sensible (non-uniform).
    def eval_board(board, c):
        s = {"b": board, "c": c, "v": 0, "p": []}
        Xp, _, _ = build([s])
        with torch.no_grad():
            v, p = model(torch.from_numpy(Xp))
        return v.item(), torch.softmax(p, dim=1)[0].numpy()

    v, p = eval_board("." * 64, "V")
    top = np.argsort(p)[::-1][:5]
    print(f"probe empty: value={v:.3f}  top policy cells={list(top)} (center cells expected)")


if __name__ == "__main__":
    main()
