"""Independent unified-sighash check, written only from the specification text.

Source of the rules: doc/unified-sighash.md in Bitcoin Knots
v29.4.3.knots20260508 (commit a7c4617524c334f542484bfef3919b9f12573840).
No code from Knots was used. It computes the signature hash for each vector in
src/test/data/unified_sighash.json at that commit and reports how many match.

Usage (from a Knots checkout at the pinned commit):
    python3 -I unified_sighash_check.py src/test/data/unified_sighash.json

Exit status 0 means every vector matched. The script never signs anything and
needs no keys. Verification record: references/fork-rules.md.

Assumptions the specification does not state, taken from BIP341/BIP342:
tapleaf version 0xc0. The vectors assume no annex and no executed
OP_CODESEPARATOR, so those branches are fixed here.
"""
import hashlib
import json
import struct
import sys


def sha256(b):
    return hashlib.sha256(b).digest()


def tagged(tag, msg):
    t = sha256(tag.encode())
    return sha256(t + t + msg)


def compact(n):
    if n < 0xFD:
        return bytes([n])
    if n <= 0xFFFF:
        return b"\xfd" + struct.pack("<H", n)
    if n <= 0xFFFFFFFF:
        return b"\xfe" + struct.pack("<I", n)
    return b"\xff" + struct.pack("<Q", n)


def ser_script(s):
    return compact(len(s)) + s


class R:
    def __init__(self, b):
        self.b, self.i = b, 0

    def take(self, n):
        v = self.b[self.i:self.i + n]
        assert len(v) == n, "short read"
        self.i += n
        return v

    def cs(self):
        f = self.take(1)[0]
        if f < 0xFD:
            return f
        return struct.unpack({0xFD: "<H", 0xFE: "<I", 0xFF: "<Q"}[f], self.take({0xFD: 2, 0xFE: 4, 0xFF: 8}[f]))[0]


def parse_tx(raw):
    r = R(raw)
    version = r.take(4)
    n = r.cs()
    segwit = False
    if n == 0:  # BIP144 marker
        flag = r.take(1)[0]
        assert flag == 1
        segwit = True
        n = r.cs()
    vin = []
    for _ in range(n):
        outpoint = r.take(36)
        script = r.take(r.cs())
        seq = r.take(4)
        vin.append((outpoint, script, seq))
    vout = []
    for _ in range(r.cs()):
        value = r.take(8)
        spk = r.take(r.cs())
        vout.append(value + ser_script(spk))
    if segwit:
        for _ in range(len(vin)):
            for _ in range(r.cs()):
                r.take(r.cs())
    locktime = r.take(4)
    assert r.i == len(raw), "trailing bytes"
    return version, vin, vout, locktime


SINGLE, NONE, ACP, ALL = 3, 2, 0x80, 1


def sighash(script_code, raw, n_in, hash_type, script_type, spent):
    version, vin, vout, locktime = parse_tx(raw)
    out_type = hash_type & 0x1F
    acp = bool(hash_type & ACP)
    spent_ser = [struct.pack("<q", v) + ser_script(s) for v, s in spent]
    m = bytes([0, hash_type & 0xFF]) + version + locktime + b"\x00"
    if not acp:
        m += sha256(b"".join(o for o, _, _ in vin))
        m += sha256(b"".join(struct.pack("<q", v) for v, _ in spent))
        m += sha256(b"".join(ser_script(s) for _, s in spent))
        m += sha256(b"".join(q for _, _, q in vin))
    if out_type not in (NONE, SINGLE):
        m += sha256(b"".join(vout))
    m += bytes([script_type])
    if acp:
        m += vin[n_in][0] + spent_ser[n_in] + vin[n_in][2]
    else:
        m += struct.pack("<I", n_in)
    if script_type in (0, 1):
        m += ser_script(script_code)
    else:
        m += b"\x00"  # vectors assume no annex
    if out_type == SINGLE:
        if n_in >= len(vout):
            return None
        m += sha256(vout[n_in])
    if script_type == 3:
        # "tapleaf hash, as BIP341 defines it": leaf version 0xc0 assumed.
        m += tagged("TapLeaf", b"\xc0" + ser_script(script_code))
        m += b"\x00" + b"\xff\xff\xff\xff"
    return tagged("UnifiedSighash", m)


def main(path):
    rows = json.load(open(path))[1:]
    ok = bad = 0
    by_type = {}
    for code, raw, n_in, ht, st, spent, want in rows:
        got = sighash(bytes.fromhex(code), bytes.fromhex(raw), n_in, ht, st,
                      [(v, bytes.fromhex(s)) for v, s in spent])
        match = got is not None and got.hex() == want
        by_type.setdefault(st, [0, 0])[0 if match else 1] += 1
        ok += match
        bad += not match
    print(f"vectors: {ok + bad}, reproduced: {ok}, mismatched: {bad}")
    for st in sorted(by_type):
        print(f"  script type {st}: {by_type[st][0]} ok, {by_type[st][1]} mismatched")
    hts = sorted({r[3] for r in rows})
    print("hash types used:", ", ".join(hex(h) for h in hts))
    return 0 if bad == 0 else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
