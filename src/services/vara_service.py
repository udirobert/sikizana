import os
from typing import Optional, List
from dataclasses import dataclass
# Note: gear-py is required. Install via: pip install gear-py
# from gear_py import GearApi, ActorId

@dataclass
class DisputeOnChain:
    id: int
    creator: str
    metadata_cid: str
    arbitrator: Optional[str]
    verdict_cid: Optional[str]
    status: str

class VaraService:
    """
    Service to interact with the Sikizana program on Vara Network.
    """
    def __init__(self, node_url: str = "wss://testnet.vara.network"):
        self.node_url = node_url
        self.program_id = os.getenv("VARA_PROGRAM_ID")
        # self.api = GearApi(node_url)
        # self.api.connect()

    def get_dispute(self, dispute_id: int) -> Optional[DisputeOnChain]:
        """
        Queries the on-chain state for a specific dispute.
        """
        # Mocking the on-chain query logic
        # In real implementation:
        # state = self.api.get_state(self.program_id, {"GetDispute": dispute_id})
        return None

    def submit_verdict(self, dispute_id: int, verdict_cid: str, private_key: str):
        """
        Sends a message to the Vara Network to resolve a dispute.
        """
        # In real implementation:
        # payload = {"ResolveDispute": {"dispute_id": dispute_id, "verdict_cid": verdict_cid}}
        # self.api.send_message(self.program_id, payload, private_key=private_key)
        print(f"Submitting verdict for dispute {dispute_id} to Vara: {verdict_cid}")
        return True

    def listen_for_disputes(self):
        """
        Background listener for new dispute events on-chain.
        """
        # In real implementation:
        # for event in self.api.subscribe_events():
        #     if event.name == "DisputeRegistered":
        #         # Trigger arbitrator agent
        #         pass
        pass
