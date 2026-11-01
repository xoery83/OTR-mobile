"""Fixed-source renderer only. No SQL execution or arbitrary input/output paths."""
import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
HERE = Path(__file__).resolve().parent
SOURCES = {
    'docs/ops/auth-private-profile-20261031/private-profile.body.sql': 'cf3081ab03aae25ed9373f84968d5118f81628df7a9c0fb59a08ad6fe7631b54',
    'docs/ops/auth-private-profile-20261031/hosted-install-candidate/INSTALL_CANDIDATE.sql': '2652b1af01f083d7f1aaca39d2b0b37904f7ff14e2ca8f5164ec114d5ea2d15e',
    'docs/ops/auth-private-profile-aka-20261102/private-profile.body.sql': '550a36d72333c970b564c759aa6446c85705409401748358cceb99bfc6053608',
}
OLD_GATE = 'OTR_PRIVATE_PROFILE_DEV_INSTALL_20261101_V1'
GATE = 'OTR_PRIVATE_PROFILE_AKA_DEV_INSTALL_20261102_V1'


def render():
    values = []
    for name, expected in SOURCES.items():
        path = ROOT / name
        if path.is_symlink() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError('FROZEN_PROFILE_SOURCE_MISMATCH')
        values.append(path.read_text())
    old_body, install, aka_body = values
    if install.count(old_body) != 1 or install.count(OLD_GATE) != 1:
        raise ValueError('FROZEN_PROFILE_EMBEDDING_MISMATCH')
    return install.replace(old_body, aka_body).replace(OLD_GATE, GATE)


if __name__ == '__main__':
    import sys
    if len(sys.argv) != 1:
        raise ValueError('FIXED_RENDERER_NO_ARGUMENTS')
    value = render()
    (HERE / 'INSTALL_CANDIDATE.sql').write_text(value)
    print('RENDERED_ONLY_SHA256=' + hashlib.sha256(value.encode()).hexdigest())
