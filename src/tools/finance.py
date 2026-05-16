import csv
import os

def analyze_mpesa_records(query: str, chama_id: str = "default") -> str:
    """
    Analyzes M-Pesa transaction records to answer questions about contributions, 
    fines, and loans.
    
    Args:
        query: The specific financial question (e.g., 'Did John Doe pay in May?')
        chama_id: The identifier for the chama (defaults to 'default')
        
    Returns:
        A summary of the relevant transactions found.
    """
    # In a real app, we would query Firestore or a specific CSV/PDF from Cloud Storage
    data_path = os.path.join("data", "sample_mpesa.csv")
    
    if not os.path.exists(data_path):
        return "Error: Financial records not found for this chama."
    
    results = []
    query_lower = query.lower()
    
    try:
        with open(data_path, mode='r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                # Basic keyword matching for the prototype
                # In production, this would use a more robust search or LLM extraction
                details = row['Details'].lower()
                if any(word in details for word in query_lower.split()):
                    results.append(f"- {row['Completion Time']}: {row['Details']} (Amount: {row['Paid In'] or row['Withdrawn']}, Status: {row['Transaction Status']})")
                    
        if not results:
            return f"No specific transactions found matching '{query}'."
            
        return "Found the following relevant transactions:\n" + "\n".join(results)
        
    except Exception as e:
        return f"An error occurred while analyzing records: {str(e)}"

if __name__ == "__main__":
    # Test
    print(analyze_mpesa_records("John Doe May"))
