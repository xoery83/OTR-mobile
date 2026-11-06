"""Check the fixed systemd properties with native calendar serialization."""
from controls import verify_timer


def verify_systemd_keeper(show, timeout_usec, unit, at_ms, argv, budget):
    def observed(name, prop):
        value = show(name, prop)
        if prop == "TimersCalendar":
            return value.replace(" UTC ;", " UTC;")
        return value
    return verify_timer(observed, timeout_usec, unit, at_ms, argv, budget)
