import pandas as pd
from pypdf import PdfReader
import os
import re

def parse_mpesa_pdf(file_path: str) -> pd.DataFrame:
    """
    Parses a standard M-Pesa PDF statement into a Pandas DataFrame.
    Note: Real M-Pesa PDFs are often encrypted. This logic assumes a decrypted/standard format.
    """
    if not os.path.exists(file_path):
        return pd.DataFrame()

    reader = PdfReader(file_path)
    text = ""
    for page in reader.pages:
        text += page.extract_text()

    # Simple regex-based extraction for M-Pesa transactions
    # [Receipt No.] [Completion Time] [Details] [Status] [Paid In] [Withdrawn] [Balance]
    pattern = r"([A-Z0-9]{10})\s+(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2})\s+(.*?)\s+(Completed|Failed)\s+([\d,.]+)?\s+([\d,.]+)?\s+([\d,.]+)"
    matches = re.findall(pattern, text)

    df = pd.DataFrame(matches, columns=[
        'Receipt No.', 'Completion Time', 'Details', 'Status', 'Paid In', 'Withdrawn', 'Balance'
    ])
    return df

def analyze_mpesa_records(query: str, chama_id: str = "default") -> str:
    """
    Advanced analyzer for M-Pesa records supporting both CSV and PDF.
    """
    # Prefer CSV for reliability in the prototype, fallback to PDF search
    csv_path = os.path.join("data", f"{chama_id}_mpesa.csv")
    pdf_path = os.path.join("data", f"{chama_id}_mpesa.pdf")

    # Fallback to default if chama-specific records don't exist
    if not os.path.exists(csv_path):
        csv_path = os.path.join("data", "sample_mpesa.csv")

    try:
        if os.path.exists(csv_path):
            df = pd.read_csv(csv_path)
        elif os.path.exists(pdf_path):
            df = parse_mpesa_pdf(pdf_path)
        else:
            return "Error: No M-Pesa records found (CSV or PDF)."

        # LLM-friendly summary of the data
        query_lower = query.lower()

        # Simple keyword filtering with Pandas
        mask = df['Details'].str.contains(query_lower, case=False, na=False)
        filtered_df = df[mask]

        if filtered_df.empty:
            return f"No records found for '{query}'."

        summary = f"Found {len(filtered_df)} relevant transactions:\n"
        for _, row in filtered_df.iterrows():
            summary += f"- {row['Completion Time']}: {row['Details']} | Amount: {row.get('Paid In') or row.get('Withdrawn')} | Status: {row['Status']}\n"

        return summary

    except Exception as e:
        return f"Error analyzing financial records: {str(e)}"

if __name__ == "__main__":
    # Test with sample CSV
    print(analyze_mpesa_records("John Doe"))
