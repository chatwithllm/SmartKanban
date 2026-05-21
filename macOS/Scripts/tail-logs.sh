#!/usr/bin/env bash
/usr/bin/log show --last 30s \
  --predicate 'subsystem == "com.kanbanclaude.kanbanclaude"' \
  --info --debug 2>&1 | tail -80
