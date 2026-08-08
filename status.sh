#!/bin/bash
# Status script for SimpleGIS

echo "SimpleGIS Status:"
echo "-----------------"

if [ -f .pids/backend.pid ]; then
  BACKEND_PID=$(cat .pids/backend.pid)
  if ps -p $BACKEND_PID > /dev/null; then
    echo "✅ Backend is RUNNING (PID: $BACKEND_PID)"
  else
    echo "❌ Backend is NOT running (PID file exists but process is dead)"
  fi
else
  echo "❌ Backend is NOT running (No PID file)"
fi

if [ -f .pids/frontend.pid ]; then
  FRONTEND_PID=$(cat .pids/frontend.pid)
  if ps -p $FRONTEND_PID > /dev/null; then
    echo "✅ Frontend is RUNNING (PID: $FRONTEND_PID)"
  else
    echo "❌ Frontend is NOT running (PID file exists but process is dead)"
  fi
else
  echo "❌ Frontend is NOT running (No PID file)"
fi
echo "-----------------"
