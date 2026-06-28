import requests
import os
from dotenv import load_dotenv

load_dotenv()

class PinataIPFSService:
    """
    Minimal IPFS service using Pinata for evidence storage.
    Ensures informal records are verifiable and permanently linked to Vara Network transactions.
    """
    def __init__(self):
        self.api_key = os.getenv("PINATA_API_KEY")
        self.api_secret = os.getenv("PINATA_API_SECRET")
        self.base_url = "https://api.pinata.cloud/pinning/pinFileToIPFS"

    def upload_file(self, file_path: str) -> str:
        """
        Uploads a file to IPFS via Pinata.
        Returns the CID (hash) of the file.
        """
        if not self.api_key or not self.api_secret:
            return "Error: Pinata API credentials missing. Please set PINATA_API_KEY and PINATA_API_SECRET."

        if not os.path.exists(file_path):
            return f"Error: File not found at {file_path}"

        headers = {
            'pinata_api_key': self.api_key,
            'pinata_secret_api_key': self.api_secret
        }

        try:
            with open(file_path, 'rb') as f:
                response = requests.post(
                    self.base_url,
                    files={'file': f},
                    headers=headers
                )

            if response.status_code == 200:
                cid = response.json().get('IpfsHash')
                return f"ipfs://{cid}"
            else:
                return f"Error uploading to IPFS: {response.text}"

        except Exception as e:
            return f"Error connecting to IPFS service: {str(e)}"

if __name__ == "__main__":
    # Test
    # service = PinataIPFSService()
    # print(service.upload_file("data/sample_ledger.jpg"))
    pass
