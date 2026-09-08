import unittest
from routes.scan import create_scan_session, submit_scan_result, poll_scan_result, ScanResultSubmit
from fastapi import HTTPException

class TestScanAPI(unittest.TestCase):
    def test_scan_session_lifecycle(self):
        # 1. Create session
        created = create_scan_session()
        self.assertIsNotNone(created.session_id)
        self.assertIsNotNone(created.session_secret)

        session_id = created.session_id
        session_secret = created.session_secret

        # 2. Poll initial status
        initial = poll_scan_result(session_id)
        self.assertEqual(initial.status, "waiting")
        self.assertIsNone(initial.data)

        # 3. Submit scan result
        payload = ScanResultSubmit(
            session_secret=session_secret,
            extracted_data={
                "invoice_number": "436",
                "waybill_number": "438",
                "brand": "DSL",
                "customer_name": "RAYIAS VETERINARY PHARMACY",
                "products": [
                    {
                        "name": "DOX TABLET 10GRM",
                        "unit": "Pieces",
                        "quantity": 400
                    }
                ]
            }
        )
        sub_res = submit_scan_result(session_id, payload)
        self.assertEqual(sub_res["message"], "Scan result submitted successfully.")

        # 4. Poll completed status
        completed = poll_scan_result(session_id)
        self.assertEqual(completed.status, "completed")
        self.assertEqual(completed.data["invoice_number"], "436")
        self.assertEqual(completed.data["customer_name"], "RAYIAS VETERINARY PHARMACY")
        self.assertEqual(len(completed.data["products"]), 1)
        self.assertEqual(completed.data["products"][0]["unit"], "Pieces")

    def test_scan_session_invalid_secret(self):
        created = create_scan_session()
        session_id = created.session_id

        payload = ScanResultSubmit(
            session_secret="invalid-secret-123",
            extracted_data={}
        )
        with self.assertRaises(HTTPException) as cm:
            submit_scan_result(session_id, payload)
        self.assertEqual(cm.exception.status_code, 403)

if __name__ == "__main__":
    unittest.main()
