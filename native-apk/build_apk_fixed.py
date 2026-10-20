#!/usr/bin/env python3
"""NeoStreams Native APK Build - Fixed version using direct aapt2 calls"""
import os
import subprocess
import zipfile
import sys

PROJECT = "C:/Users/ptleg/Documents/neostreams/native-apk"
SDK = "C:/Users/ptleg/AppData/Local/Android/Sdk"
BT = f"{SDK}/build-tools/36.0.0"
PLATFORM = f"{SDK}/platforms/android-37.0"
ANDROID_JAR = f"{PLATFORM}/android.jar"
JBR = "C:/Program Files/Android/Android Studio/jbr"

print("=== NeoStreams Native APK Build (Python Fixed) ===")
print(f"BUILD-TOOLS: {BT}")
print(f"PLATFORM: {PLATFORM}")
print(f"JAVAC: {JBR}/bin/javac.exe")
print()

# Create build directories
BUILD = os.path.join(PROJECT, "build")
BUILD_CLASSES = os.path.join(BUILD, "classes")
BUILD_DEX = os.path.join(BUILD, "dex")
BUILD_RES = os.path.join(BUILD, "res")
BUILD_GEN = os.path.join(BUILD, "gen")
BUILD_APK = os.path.join(BUILD, "apk")

for d in [BUILD, BUILD_CLASSES, BUILD_DEX, BUILD_RES, BUILD_GEN, BUILD_APK]:
    os.makedirs(d, exist_ok=True)

# Step 1: Compile resources using individual files
print("==> aapt2 compile (individual files)")
res_dir = os.path.join(PROJECT, "app/src/main/res")
flat_dir = BUILD_RES

# First, clear any existing flat files
for f in os.listdir(flat_dir):
    if f.endswith(".flat"):
        os.remove(os.path.join(flat_dir, f))

# Compile each resource file individually
import glob
resource_files = []
for root, dirs, files in os.walk(res_dir):
    for f in files:
        if f.endswith(".xml") or f.endswith(".png") or f.endswith(".jpg") or f.endswith(".jpeg"):
            resource_files.append(os.path.join(root, f))

success_count = 0
for res_file in sorted(resource_files):
    flat_name = res_file.replace(res_dir, "").replace("\\", "_").replace("/", "_") + ".flat"
    flat_path = os.path.join(flat_dir, flat_name)
    try:
        print(f"  Compiling: {os.path.basename(res_file)}")
        result = subprocess.run(
            [f"{BT}/aapt2.exe", "compile", res_file, "-o", flat_path],
            capture_output=True, text=True, cwd=PROJECT
        )
        if result.returncode == 0:
            success_count += 1
        else:
            print(f"    Failed: {result.stderr}")
    except Exception as e:
        print(f"    Exception: {e}")

print(f"Compiled {success_count}/{len(resource_files)} resources")

flat_files = [os.path.join(flat_dir, f) for f in os.listdir(flat_dir) if f.endswith(".flat")]
print(f"Generated {len(flat_files)} .flat files")

# Verify flat file format
for flat_file in flat_files:
    try:
        with open(flat_file, 'rb') as f:
            magic = f.read(4)
            magic_hex = magic.hex()
            if magic_hex == "54504141":  # APCA magic
                print(f"  {os.path.basename(flat_file)}: APCA magic ✓")
            else:
                print(f"  {os.path.basename(flat_file)}: Magic {magic_hex} (not APCA)")
    except Exception as e:
        print(f"  Error reading {flat_file}: {e}")

# Step 2: aapt2 link
print("\n==> aapt2 link")
manifest = os.path.join(PROJECT, "app/src/main/AndroidManifest.xml")
os.makedirs(BUILD_GEN, exist_ok=True)
os.makedirs(BUILD_APK, exist_ok=True)

link_cmd = [
    f"{BT}/aapt2.exe", "link",
    "-o", os.path.join(BUILD_APK, "base.apk"),
    "-I", ANDROID_JAR,
    "--manifest", manifest,
    "--java", BUILD_GEN,
    "--min-sdk-version", "24",
    "--target-sdk-version", "37",
    "--version-code", "100",
    "--version-name", "1.0.0",
] + flat_files

print(f"Running: {' '.join(link_cmd[:8])} ... + {len(flat_files)} flat files")
result = subprocess.run(link_cmd, capture_output=True, text=True, cwd=PROJECT)
if result.returncode != 0:
    print("Link failed!")
    print("STDOUT:", result.stdout)
    print("STDERR:", result.stderr)
    sys.exit(1)

print("aapt2 link successful!")

# Step 3: Verify R.java was generated
r_java = os.path.join(BUILD_GEN, "com/gateway/neostreams/R.java")
if os.path.exists(r_java):
    print(f"R.java generated: {r_java}")
    with open(r_java, 'r') as f:
        content = f.read()
        print(f"R.java preview (first 500 chars):\n{content[:500]}...")
else:
    print("ERROR: R.java not found!")
    print(f"Files in build/gen: {os.listdir(BUILD_GEN)}")
    sys.exit(1)

print("\n=== Build Complete ===")
print(f"R.java: {r_java}")
print(f"Base APK: {os.path.join(BUILD_APK, 'base.apk')}")
print(f"Build directory: {BUILD}")

# Show R.java location in file system
print(f"\nDirectory structure in build/gen:")
for root, dirs, files in os.walk(BUILD_GEN):
    level = root.replace(BUILD_GEN, "").count(os.sep)
    indent = "  " * level
    print(f"{indent}{os.path.basename(root)}/")
    subindent = "  " * (level + 1)
    for file in files:
        print(f"{subindent}{file}")

print("\n=== SUCCESS ===")
print("The APK build process completed successfully!")
print(f"The R.java file has been generated at: {r_java}")
print("You can now proceed with Java compilation and DEX processing.")
