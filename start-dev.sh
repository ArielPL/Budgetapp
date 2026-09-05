#!/bin/bash
# Start the dev server by double-clicking, without a shell that has nvm loaded.
# cd's to wherever this script lives, so moving the repo does not break it again.
export PATH="/Users/ariel/.nvm/versions/node/v22.22.3/bin:$PATH"
cd "$(dirname "$0")"
exec npm run dev -- --port 5173
