import httpx
import os

MAILBOXLAYER_API_KEY = os.getenv("MAILBOXLAYER_API_KEY")  # put this in .env

async def is_real_email(email: str) -> bool:
    url = f"http://apilayer.net/api/check?access_key={MAILBOXLAYER_API_KEY}&email={email}&smtp=1&format=1"
    async with httpx.AsyncClient() as client:
        response = await client.get(url)
        data = response.json()
        return data.get("smtp_check", False)