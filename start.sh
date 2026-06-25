#!/bin/bash

set -e

ng build shared-utils

ng s host-app --port 4200 &
ng s home --port 4301 &
ng s list --port 4302 &
ng s grid --port 4303 &
ng s search --port 4304 &
