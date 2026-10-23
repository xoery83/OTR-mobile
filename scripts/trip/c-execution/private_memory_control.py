"""Fixed operator command loop: no code evaluation, credential export or automatic retry."""
def run_and_hold_private_memory(passwords, execute_fixed, commands, emit):
    def attempt():
        try:
            execute_fixed(passwords)
            emit('FIXED_RUNNER_RETURNED_HOLD')
        except Exception:
            emit('FIXED_RUNNER_STOPPED_HOLD')
    attempt()
    continued=False
    for line in commands:
        command=line.strip()
        if command=='release-private-memory-after-safe-close':
            passwords.clear();emit('PRIVATE_MEMORY_RELEASED');return
        if command=='continue-fixed-reviewed-runner'and not continued:
            # The fixed executor must validate a new pinned manifest, prior counts,
            # queue and actual outcomes before any dispatch. Never reset its journal.
            continued=True;attempt()
        else:emit('UNKNOWN_OR_REPEATED_COMMAND_NO_ACTION')
    # EOF does not release or execute. Operator holds until explicitly reconciled.
    import time
    while True:time.sleep(1)
