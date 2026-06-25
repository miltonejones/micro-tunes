#!/bin/bash

# Define the ports used by the applications
PORTS=(4200 4301 4302 4303 4304)

echo "Attempting to stop Angular apps by port number..."

for port in "${PORTS[@]}"; do
  # Find the Process ID (PID) listening on the current port
  PID=$(lsof -ti tcp:"$port")

  if [ -n "$PID" ]; then
    echo "Found process(es) $PID on port $port. Killing them..."
    if kill $PID; then
      echo "Successfully killed process(es) $PID."
    else
      echo "Failed to kill process(es) $PID on port $port."
    fi
  else
    echo "No process found listening on port $port."
  fi
done

echo "Stop script finished."
