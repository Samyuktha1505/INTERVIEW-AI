import mysql.connector
from backend.config import DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT

def get_db_connection():
    return mysql.connector.connect(
        host=DB_HOST,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        port=DB_PORT
    )
