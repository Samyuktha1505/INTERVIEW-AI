from pydantic import BaseModel
from typing import List

class SessionIdList(BaseModel):
    session_ids: List[str]
