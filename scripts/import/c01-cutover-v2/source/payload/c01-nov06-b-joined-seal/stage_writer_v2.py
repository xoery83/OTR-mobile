"""Joined Writer with a required positive predecessor for inverse dispatch."""
from stage_writer import StageWriter


class JoinedStageWriter(StageWriter):
    def _claim_bound(self, action, payload_sha):
        if action == "v5-inverse" and self.view()["v5-forward"] == "UNCLAIMED":
            raise ValueError("JOINED_FORWARD_INTENT_REQUIRED")
        # The base claim checks the exact predecessor's terminal callback.
        super()._claim_bound(action, payload_sha)
