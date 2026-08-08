#!/bin/bash
# Stop script for LiteGIS

echo "Stopping LiteGIS..."

if [ -f .pids/backend.pid ]; then
  BACKEND_PID=$(cat .pids/backend.pid)
  if ps -p $BACKEND_PID > /dev/null; then
    kill $BACKEND_PID 2>/dev/null
    echo "Backend stopped."
  fi
  rm .pids/backend.pid
fi

if [ -f .pids/frontend.pid ]; then
  FRONTEND_PID=$(cat .pids/frontend.pid)
  if ps -p $FRONTEND_PID > /dev/null; then
    kill $FRONTEND_PID 2>/dev/null
    echo "Frontend stopped."
  fi
  rm .pids/frontend.pid
fi

echo "App stopped successfully."
