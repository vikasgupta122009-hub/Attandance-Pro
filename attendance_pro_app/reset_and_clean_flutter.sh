#!/bin/bash
# Reset and Clean Flutter Project Dependencies Script
# Use this script to resolve IDE "red lines", corrupted locks, or cache issues.

echo "========================================="
echo "  RESETS & CLEANS FLUTTER BUILD CACHE    "
echo "========================================="

# Move to the project root directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "Step 1: Running aggressive Flutter clean..."
flutter clean

echo "Step 2: Wiping local build caches & code locks..."
rm -rf .dart_tool
rm -rf .packages
rm -rf pubspec.lock

echo "Step 3: Repairing global Pub cache..."
flutter pub cache clean --force

echo "Step 4: Pulling fresh dependencies..."
flutter pub get

echo "Step 5: Generating fresh synthetic config files..."
# If code-generation is needed, it would run here, but standard is just getting package files.
flutter pub get

echo "========================================="
echo "   RE-BOOTSTRAP COMPLETED SUCCESSFULLY     "
echo "========================================="
echo "Project cache is cleared. Please:"
echo "1. In Android Studio, go to File -> Invalidate Caches -> Restart."
echo "2. Wait for Android Studio to index the clean dependency database."
echo "3. Target your physical/emulated device and hit run."
