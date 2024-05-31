#!/bin/bash

set -e

pnpm vite build
TARGET=RN pnpm vite build
mv rn-dist/nanoquery.cjs ./dist/nanoquery.native.cjs
rm -rf ./rn-dist

pnpm test
