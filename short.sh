#!/bin/bash

PORT=4200

echo "Stopping process on port $PORT..."

PID=$(lsof -ti tcp:$PORT)
if [ -n "$PID" ]; then
  kill $PID 2>/dev/null && echo "Process killed." || echo "Failed to kill process."
else
  echo "No process found on port $PORT."
fi

ng s host-app --port $PORT &
