from typing import List, Dict, Any
from core.gemini_client import gemini_client

class BatchProcessorService:
    def compare_clauses(
        self, 
        contracts: List[Dict[str, Any]], 
        clause_type: str
    ) -> Dict[str, Any]:
        """
        Extracts relevant clause data from the analyzed contracts list,
        and performs a comparative Gemini RAG comparison.
        """
        contracts_payload = []
        for contract in contracts:
            # Find the clause of matching type in this contract's analysis
            clause_text = "Clause not found in this contract."
            for clause in contract.get("clauses", []):
                if clause.get("clause_type", "").lower() == clause_type.lower():
                    clause_text = clause.get("clause_text", "")
                    break
                    
            contracts_payload.append({
                "filename": contract.get("filename", "Unknown Contract"),
                "clause_text": clause_text
            })
            
        # Call Gemini model for side-by-side comparison
        return gemini_client.compare_clauses_batch(contracts_payload, clause_type)

batch_processor_service = BatchProcessorService()
