"""Bind one shared Host flock and the pre-enrolled persistent ledger directory."""
import fcntl
import os
import re
from pathlib import Path
import stat

DEV_LOCK = Path('/run/lock/otr-universal-finite-service.lock')

def identity(status):
    return status.st_dev, status.st_ino

class WriterLease:
    def __init__(self,lock,ledger,ledger_identity,uid=0):
        self.lock=Path(lock)
        self.ledger=Path(ledger)
        self.ledger_identity=tuple(ledger_identity)
        self.uid=uid
        self._lockfd=self._ledgerfd=None

    def __enter__(self):
        try:
            self._lockfd=os.open(self.lock,os.O_RDWR|os.O_NOFOLLOW|os.O_CLOEXEC)
            fcntl.flock(self._lockfd,fcntl.LOCK_EX|fcntl.LOCK_NB)
            self._ledgerfd=os.open(self.ledger,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_CLOEXEC)
            self.assert_current(self.ledger)
            return self
        except Exception:
            self.__exit__(None,None,None)
            raise

    def assert_current(self,ledger):
        if self._lockfd is None or self._ledgerfd is None or Path(ledger)!=self.ledger:
            raise ValueError('EXACT_HELD_WRITER_AND_LEDGER_REQUIRED')
        locked=os.fstat(self._lockfd)
        held_ledger=os.fstat(self._ledgerfd)
        if (not stat.S_ISREG(locked.st_mode) or locked.st_uid!=self.uid or locked.st_nlink!=1
            or identity(locked)!=identity(self.lock.lstat()) or held_ledger.st_uid!=self.uid
            or stat.S_IMODE(held_ledger.st_mode)!=0o700
            or identity(held_ledger)!=self.ledger_identity
            or identity(self.ledger.lstat())!=self.ledger_identity):
            raise ValueError('WRITER_OR_DURABLE_LEDGER_IDENTITY_DRIFT')

    def has_intent(self):
        self.assert_current(self.ledger)
        for name in ('forward.intent','inverse.intent'):
            try:
                os.stat(name,dir_fd=self._ledgerfd,follow_symlinks=False)
                return True
            except FileNotFoundError:
                pass
        return False

    def claim_intent(self,name,frame_sha256):
        if name not in ('forward.intent','inverse.intent') or not re.fullmatch('[0-9a-f]{64}',frame_sha256):
            raise ValueError('EXACT_INTENT_IDENTITY_REQUIRED')
        self.assert_current(self.ledger)
        fd=os.open(name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW|os.O_CLOEXEC,
                   0o600,dir_fd=self._ledgerfd)
        with os.fdopen(fd,'wb') as out:
            out.write((frame_sha256+'\n').encode())
            out.flush()
            os.fsync(out.fileno())
        os.fsync(self._ledgerfd)
        self.assert_current(self.ledger)

    def __exit__(self,*_):
        if self._ledgerfd is not None:
            os.close(self._ledgerfd)
            self._ledgerfd=None
        if self._lockfd is not None:
            os.close(self._lockfd)
            self._lockfd=None
