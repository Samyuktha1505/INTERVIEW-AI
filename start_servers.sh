#!/bin/bash

# Startup script to run both FastAPI backend and Flask server
echo "Starting Interview AI servers..."

# Function to cleanup background processes
cleanup() {
    echo "Shutting down servers..."
    kill $BACKEND_PID $SERVER_PID 2>/dev/null
    wait $BACKEND_PID $SERVER_PID 2>/dev/null
    echo "All servers stopped"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Start FastAPI backend
echo "Starting FastAPI backend server..."
cd backend
python -m uvicorn main:app --reload --log-level debug --port 8000 &
BACKEND_PID=$!
cd ..

# Wait a moment for backend to start
sleep 2

# Start Flask server
echo "Starting Flask server..."
cd server
python server.py &
SERVER_PID=$!
cd ..

echo "Both servers started successfully!"
echo "FastAPI Backend: http://localhost:8000"
echo "Flask Server: http://localhost:3001"
echo "Press Ctrl+C to stop all servers"

# Wait for both processes
wait $BACKEND_PID $SERVER_PID 