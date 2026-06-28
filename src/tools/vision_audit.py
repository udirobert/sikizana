import os
import google.generativeai as genai
from PIL import Image
import io
from dotenv import load_dotenv

load_dotenv()

# Configure Gemini for Vision tasks
genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))
vision_model = genai.GenerativeModel('gemini-1.5-flash') # Flash is optimized for fast vision tasks

def analyze_ledger_image(image_path: str, query: str = "Extract all transactions") -> str:
    """
    Uses Gemini Multimodal (Vision) to parse an image of a handwritten ledger or receipt.
    This is a core 'moat' feature for XPRIZE, enabling digital auditing of informal records.
    """
    if not os.path.exists(image_path):
        return f"Error: Image not found at {image_path}"

    try:
        # Load the image
        img = Image.open(image_path)

        # System Prompt for Vision-to-Data
        prompt = f"""
        You are a professional forensic auditor for informal savings groups (ROSCAs/Chamas).
        Analyze the provided image (ledger, receipt, or bank statement).

        Task: {query}

        Guidelines:
        1. Extract Date, Member Name, Amount, and Transaction Type (Contribution, Loan, Fine, Payout).
        2. If handwriting is unclear, provide your best guess but mark it with [?].
        3. Format the output as a clean table or bulleted list.
        4. If it's a receipt, verify the total and the M-Pesa/Bank reference code.
        """

        response = vision_model.generate_content([prompt, img])
        return response.text

    except Exception as e:
        return f"Error analyzing image: {str(e)}"

def verify_receipt_against_claim(receipt_image_path: str, claimed_amount: float) -> str:
    """
    Specific tool to verify a single receipt against a user's claim.
    """
    query = f"Verify if this receipt shows a payment of {claimed_amount}. Check the date and reference code."
    return analyze_ledger_image(receipt_image_path, query)

if __name__ == "__main__":
    # Placeholder for local testing
    # print(analyze_ledger_image("data/sample_ledger.jpg"))
    pass
