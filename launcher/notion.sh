#!/bin/sh
# macOS: start Notion in Claude-debug mode (CDP port 9222) or normal mode. UNTESTED; reports welcome.
#   ./notion.sh debug | ./notion.sh normal
# Quits Notion first (it saves continuously, so nothing is lost).
MODE="${1:-debug}"
PORT=9222
osascript -e 'quit app "Notion"' 2>/dev/null
i=0; while pgrep -xq Notion && [ $i -lt 20 ]; do sleep 0.25; i=$((i+1)); done
if [ "$MODE" = "debug" ]; then
  open -na Notion --args --remote-debugging-port=$PORT --disable-backgrounding-occluded-windows --disable-renderer-backgrounding
  i=0; until curl -s "http://localhost:$PORT/json/version" >/dev/null; do
    [ $i -ge 60 ] && { echo "Notion started but port $PORT did not open within 30 s." >&2; exit 1; }
    sleep 0.5; i=$((i+1)); done
  echo "Notion started in debug mode (port $PORT)."
else
  open -a Notion && echo "Notion started in normal mode."
fi
