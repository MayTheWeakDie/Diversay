import json
import re
import ast

def _clean_json_response(raw_text: str) -> dict:
    """Strip markdown codeblock wrappers, repair common LLM syntax flaws, and parse JSON safely."""
    cleaned = raw_text.strip()
    
    if "```" in cleaned:
        cleaned = re.sub(r"```(?:json)?", "", cleaned, flags=re.IGNORECASE)
        cleaned = cleaned.replace("```", "")
    
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end != -1:
        cleaned = cleaned[start:end+1]

    # Attempt 1: Standard json.loads
    try:
        return json.loads(cleaned)
    except Exception:
        pass

    # Attempt 2: Repair common JSON syntax errors (trailing commas, Python constants)
    repaired = re.sub(r',\s*([\]}])', r'\1', cleaned)
    repaired_const = re.sub(r'\bNone\b', 'null', repaired)
    repaired_const = re.sub(r'\bTrue\b', 'true', repaired_const)
    repaired_const = re.sub(r'\bFalse\b', 'false', repaired_const)

    try:
        return json.loads(repaired_const)
    except Exception:
        pass

    # Attempt 3: Python AST literal_eval (handles single quotes, None, True, False natively)
    try:
        parsed_ast = ast.literal_eval(cleaned)
        if isinstance(parsed_ast, dict):
            return parsed_ast
    except Exception:
        pass

    # Attempt 4: AST evaluation on repaired text
    try:
        parsed_ast = ast.literal_eval(repaired)
        if isinstance(parsed_ast, dict):
            return parsed_ast
    except Exception as e:
        print(f"[JSON PARSE ERROR] Raw text: {raw_text[:200]}", flush=True)
        raise e

# Test cases that LLMs often generate:
test_cases = [
    '```json\n{"customer_name": "D AND T FARMS", "products": [{"name": "A-GeeMix", "quantity": 25,},]}\n```', # trailing comma
    '{"customer_name": "TEST", \'invoice_number\': \'DSL/SA/123\', "driver_name": None, "date": "2026-09-15"}', # single quotes + None
    'Here is your JSON:\n{\n  "customer_name": "ABC STORE",\n  "products": []\n}\nHope this helps!' # conversational text
]

for idx, tc in enumerate(test_cases):
    parsed = _clean_json_response(tc)
    print(f"Test {idx + 1} passed: {parsed}")
