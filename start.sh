#!/bin/bash
# Start script for SimpleGIS

echo "Starting SimpleGIS..."
mkdir -p .pids

# Start Backend
cd backend
npm run start > ../.pids/backend.log 2>&1 &
echo $! > ../.pids/backend.pid
echo "Backend started."
cd ..

# Start Frontend
cd frontend
npm run dev > ../.pids/frontend.log 2>&1 &
echo $! > ../.pids/frontend.pid
echo "Frontend started."
cd ..

echo "App is starting up!"
echo "Check backend logs: tail -f .pids/backend.log"
echo "Check frontend logs: tail -f .pids/frontend.log"
echo "Use ./status.sh to check status and ./stop.sh to stop."
