#!/usr/bin/env python3
"""
Startup script to run both FastAPI backend and Flask server concurrently
"""
import subprocess
import sys
import os
import signal
import time
from multiprocessing import Process
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def run_fastapi_backend():
    """Run the FastAPI backend server"""
    try:
        logger.info("Starting FastAPI backend server...")
        os.chdir("backend")
        subprocess.run([
            sys.executable, "-m", "uvicorn", "main:app", 
            "--reload", "--log-level", "debug", "--port", "8000"
        ], check=True)
    except subprocess.CalledProcessError as e:
        logger.error(f"FastAPI backend failed to start: {e}")
    except KeyboardInterrupt:
        logger.info("FastAPI backend stopped by user")

def run_flask_server():
    """Run the Flask server"""
    try:
        logger.info("Starting Flask server...")
        os.chdir("server")
        subprocess.run([
            sys.executable, "server.py"
        ], check=True)
    except subprocess.CalledProcessError as e:
        logger.error(f"Flask server failed to start: {e}")
    except KeyboardInterrupt:
        logger.info("Flask server stopped by user")

def main():
    """Main function to start both servers"""
    logger.info("Starting Interview AI servers...")
    
    # Store original directory
    original_dir = os.getcwd()
    
    try:
        # Start FastAPI backend in a separate process
        backend_process = Process(target=run_fastapi_backend)
        backend_process.start()
        
        # Give backend a moment to start
        time.sleep(2)
        
        # Start Flask server in a separate process
        server_process = Process(target=run_flask_server)
        server_process.start()
        
        logger.info("Both servers started successfully!")
        logger.info("FastAPI Backend: http://localhost:8000")
        logger.info("Flask Server: http://localhost:5000")
        logger.info("Press Ctrl+C to stop all servers")
        
        # Wait for both processes
        backend_process.join()
        server_process.join()
        
    except KeyboardInterrupt:
        logger.info("Shutting down servers...")
        backend_process.terminate()
        server_process.terminate()
        backend_process.join()
        server_process.join()
        logger.info("All servers stopped")
    finally:
        # Return to original directory
        os.chdir(original_dir)

if __name__ == "__main__":
    main() 