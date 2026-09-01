import os
import requests
import json
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
BASE_URL = "http://localhost:8000"

def test_flow():
    # 1. Login to backend
    login_res = requests.post(f"{BASE_URL}/auth/login", json={
        "email": "diversaysolutions@gmail.com",
        "password": "diversaysolutions@2025"
    })
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Call backend /analytics/dashboard
    dash_res = requests.get(f"{BASE_URL}/analytics/dashboard", headers=headers)
    print("Backend response status:", dash_res.status_code)
    dash_data = dash_res.json()
    backend_data = dash_data.get("delayed_orders", [])
    print("Backend data extracted (delayed_orders count):", len(backend_data))

    # 3. Build Gemini prompt as in AIChatWidget.jsx
    user_prompt = "Which orders are overdue or delayed?"
    prompt = f"""You are the AI Assistant for Diversay Solutions Limited, a commercial logistics, order fulfillment, and sales distribution enterprise in Nigeria.

The user asked the following question on their company portal:
"{user_prompt}"

The backend API returned the following concise summary data for this query:
{json.dumps(backend_data, indent=2)}

Instructions:
1. Directly, thoroughly, and comprehensively answer the user's question ("{user_prompt}") based strictly on the retrieved summary data.
2. Extrapolate Hidden Insights: Act as an expert senior logistics & operations analyst. Do not just list raw numbers; analyze the data to surface non-obvious patterns, operational risks, stock imbalances, concentration bottlenecks, or operational efficiency trends.
3. Be Nuanced & Domain-Specific: Provide a rich, nuanced explanation using precise logistics terminology (e.g. fulfillment throughput, reorder thresholds, dispatched volume, waybill cost allocation, driver distribution).
4. Do NOT Ask Follow-Up Questions: Conclude your analysis authoritatively. Do NOT end with conversational follow-up questions, closing prompts, or offers for further help (such as "Would you like me to check anything else?", "Let me know if you need more details", etc.).
5. Domain Context: In this application, "sales trends", "sales volume", and "sales performance" are evaluated using order counts, order frequency, and dispatched item quantities (monetary prices/revenue are not tracked in this logistics portal). Do NOT report ₦0 revenue or claim there are no sales; instead explain sales activity using order count, frequency, and volume.
6. Format your response cleanly with markdown headers, bold callouts, bullet points, and beautifully structured tables where applicable.
7. Important Distinction: "total_registered_customer_accounts" refers to the total number of registered customers. The "customers_who_placed_orders_*" metrics refer only to those who placed orders recently. Do not confuse total customer accounts with active ordering subsets."""

    # 4. Call Gemini API
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key={GEMINI_API_KEY}"
    print("\nCalling Gemini API at:", url.split("?key=")[0])
    res = requests.post(url, json={"contents": [{"parts": [{"text": prompt}]}]})
    
    print("Gemini API Response Status:", res.status_code)
    print("Gemini API Response Body:")
    print(res.text)

if __name__ == "__main__":
    test_flow()
