import unittest
import asyncio
from io import BytesIO
from pathlib import Path
from fastapi import UploadFile
from routes.scan import create_scan_session, process_scan_image, poll_scan_result

class TestScanVisionAPI(unittest.TestCase):
    def test_process_image_with_gemini(self):
        # 1. Create a scan session
        created = create_scan_session()
        self.assertIsNotNone(created.session_id)
        session_id = created.session_id
        session_secret = created.session_secret

        # 2. Check initial poll status
        poll = poll_scan_result(session_id)
        self.assertEqual(poll.status, "waiting")

        # 3. Process sample image
        img_path = Path(__file__).resolve().parents[2] / "an example of the ocr_image.jpg"
        if not img_path.exists():
            self.skipTest("Sample image not found")

        with open(img_path, "rb") as f:
            file_bytes = f.read()

        upload_file = UploadFile(
            filename="test_invoice.jpg",
            file=BytesIO(file_bytes),
            headers={"content-type": "image/jpeg"}
        )

        res = asyncio.run(process_scan_image(session_id, upload_file, session_secret))

        self.assertIn("extracted_data", res)
        extracted = res["extracted_data"]
        self.assertTrue(bool(extracted.get("customer_name")))
        self.assertTrue(bool(extracted.get("invoice_number")))
        self.assertIn("products", extracted)

        # 4. Poll and verify completion
        poll_done = poll_scan_result(session_id)
        self.assertEqual(poll_done.status, "completed")
        self.assertEqual(poll_done.data["customer_name"], extracted["customer_name"])

if __name__ == "__main__":
    unittest.main()
