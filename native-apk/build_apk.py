#!/usr/bin/env python3
"""Build NeoStreams Native APK without Gradle.
Uses aapt2, d8, and apksigner from the Android SDK.
"""
import os
import sys
import zipfile
import struct
import subprocess
import shutil

# Project paths
PROJECT = "C:/Users/ptleg/Documents/neostreams/native-apk"
SDK = "C:/Users/ptleg/AppData/Local/Android/Sdk"
JBR = "C:/Program Files/Android/Android Studio/jbr"
BT = f"{SDK}/build-tools/36.0.0"
PLATFORM = f"{SDK}/platforms/android-37.0"
ANDROID_JAR = f"{PLATFORM}/android.jar"

# Build directories
BUILD = os.path.join(PROJECT, "build")
BUILD_CLASSES = os.path.join(BUILD, "classes")
BUILD_DEX = os.path.join(BUILD, "dex")
BUILD_RES = os.path.join(BUILD, "res")
BUILD_GEN = os.path.join(BUILD, "gen")
BUILD_APK = os.path.join(BUILD, "apk")

# Ensure build directories exist
for d in [BUILD, BUILD_CLASSES, BUILD_DEX, BUILD_RES, BUILD_GEN, BUILD_APK]:
    os.makedirs(d, exist_ok=True)

print("=== NeoStreams Native APK Build ===")
print(f"BUILD-TOOLS: {BT}")
print(f"PLATFORM: {PLATFORM}")
print(f"JAVAC: {JBR}/bin/javac.exe")
print()

# Step 1: aapt2 compile (compile all resources)
print("==> aapt2 compile")
res_dir = os.path.join(PROJECT, "app/src/main/res")
flat_dir = BUILD_RES

# Compile resources individually
resource_files = []
for root, dirs, files in os.walk(res_dir):
    for f in files:
        if f.endswith(".xml") or f.endswith(".png"):
            resource_files.append(os.path.join(root, f))

success_count = 0
for res_file in sorted(resource_files):
    flat_name = res_file.replace(res_dir, "").replace("\\", "_").replace("/", "_") + ".flat"
    flat_path = os.path.join(flat_dir, flat_name)
    try:
        result = subprocess.run(
            [f"{BT}/aapt2.exe", "compile", res_file, "-o", flat_path],
            capture_output=True, text=True, cwd=PROJECT
        )
        if result.returncode == 0:
            success_count += 1
        else:
            print(f"  Failed: {res_file}")
            print(f"  Error: {result.stderr}")
    except Exception as e:
        print(f"  Exception for {res_file}: {e}")

print(f"Compiled {success_count}/{len(resource_files)} resources")

flat_files = [os.path.join(flat_dir, f) for f in os.listdir(flat_dir) if f.endswith(".flat")]

# Step 2: aapt2 link (generate R.java and base APK)
print("==> aapt2 link")
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

result = subprocess.run(link_cmd, capture_output=True, text=True, cwd=PROJECT)
if result.returncode != 0:
    print("Link output:", result.stdout)
    print("Link errors:", result.stderr)
    print("aapt2 link failed!")
    sys.exit(1)

print("aapt2 link successful!")

# Step 3: Compile Java (including generated R.java)
print("==> javac (compiling Java + R.java)")
java_files = []
for root, dirs, files in os.walk(os.path.join(PROJECT, "app/src/main/java")):
    for f in files:
        if f.endswith(".java"):
            java_files.append(os.path.join(root, f))

# Include generated R.java
gen_java = os.path.join(BUILD_GEN, "com/gateway/neostreams/R.java")
if os.path.exists(gen_java):
    java_files.append(gen_java)
    print(f"Including generated R.java")

classpath = ANDROID_JAR
javac_cmd = [
    f"{JBR}/bin/javac.exe",
    "-source", "17",
    "-target", "17",
    "-encoding", "UTF-8",
    "-nowarn",
    "-classpath", classpath,
    "-d", BUILD_CLASSES,
] + java_files

result = subprocess.run(javac_cmd, capture_output=True, text=True, cwd=PROJECT)
if result.returncode != 0:
    print("Java compilation errors:")
    print(result.stdout)
    print(result.stderr)
    print("Java compilation failed!")
    sys.exit(1)

print("Java compilation successful!")

# Step 4: DEX compilation
print("==> d8")
os.environ["JAVA_HOME"] = JBR
dex_cmd = [
    f"{BT}/d8.bat",
    "--release",
    "--min-api", "24",
    "--lib", ANDROID_JAR,
    "--output", BUILD_DEX,
    BUILD_CLASSES,
]

result = subprocess.run(dex_cmd, capture_output=True, text=True, cwd=PROJECT, shell=True)
if result.returncode != 0:
    print("DEX compilation errors:")
    print(result.stdout)
    print(result.stderr)
    print("DEX compilation failed!")
    sys.exit(1)

print("DEX compilation successful!")

# Step 5: Inject classes.dex into APK
print("==> inject dex")
base_apk = os.path.join(BUILD_APK, "base.apk")
dex_path = os.path.join(BUILD_DEX, "classes.dex")
unsigned_apk = os.path.join(BUILD_APK, "unsigned.apk")

REQUIRED = {"classes.dex", "AndroidManifest.xml", "resources.arsc"}
with zipfile.ZipFile(base_apk, "r") as zin, zipfile.ZipFile(unsigned_apk, "w", zipfile.ZIP_STORED) as zout:
    for item in zin.namelist():
        if item != "classes.dex":
            compress = zipfile.ZIP_STORED if item in REQUIRED else zipfile.ZIP_DEFLATED
            zout.writestr(item, zin.read(item), compress_type=compress)
    # Add classes.dex (MUST be ZIP_STORED)
    with open(dex_path, "rb") as f:
        zout.writestr("classes.dex", f.read(), compress_type=zipfile.ZIP_STORED)

print(f"Created unsigned APK: {unsigned_apk}")

# Step 6: zipalign
print("==> zipalign")
aligned_apk = os.path.join(BUILD_APK, "aligned.apk")
result = subprocess.run(
    [f"{BT}/zipalign.exe", "-f", "-p", "4", unsigned_apk, aligned_apk],
    capture_output=True, text=True, cwd=PROJECT
)
if result.returncode != 0:
    print("zipalign errors:", result.stderr)
    print("zipalign failed!")
    sys.exit(1)

print("zipalign successful!")

# Step 7: apksigner
print("==> apksigner")
KS_DIR = os.path.expandvars(r"%USERPROFILE%\.android")
KS = os.path.join(KS_DIR, "debug.keystore")
OUT_APK = os.path.join(BUILD_APK, "NeoStreams.apk")

if not os.path.exists(KS):
    print("==> Generating debug keystore")
    os.makedirs(KS_DIR, exist_ok=True)
    keytool_cmd = [
        f"{JBR}/bin/keytool.exe",
        "-genkeypair", "-v",
        "-keystore", KS,
        "-storepass", "android",
        "-keypass", "android",
        "-alias", "androiddebugkey",
        "-keyalg", "RSA",
        "-keysize", "2048",
        "-validity", "10000",
        "-dname", "CN=Android Debug,O=Android,C=US",
    ]
    result = subprocess.run(keytool_cmd, capture_output=True, text=True, cwd=PROJECT)
    if result.returncode != 0:
        print("keytool errors:", result.stderr)
        print("keytool failed!")
        sys.exit(1)
    print("Debug keystore generated!")

apksigner_cmd = [
    f"{BT}/apksigner.bat",
    "sign",
    "--ks", KS,
    "--ks-pass", "pass:android",
    "--key-pass", "pass:android",
    "--ks-key-alias", "androiddebugkey",
    "--min-sdk-version", "24",
    "--out", OUT_APK,
    aligned_apk,
]

result = subprocess.run(apksigner_cmd, capture_output=True, text=True, cwd=PROJECT)
if result.returncode != 0:
    print("apksigner errors:", result.stderr)
    print("apksigner failed!")
    sys.exit(1)

print("APK signing successful!")

# Step 8: Verify
print("==> verify")
verify_cmd = [f"{BT}/apksigner.bat", "verify", "--verbose", "--print-certs", OUT_APK]
result = subprocess.run(verify_cmd, capture_output=True, text=True, cwd=PROJECT)
print(result.stdout)
if result.stderr:
    print("Verify stderr:", result.stderr)

print()
print("=== Build Complete ===")
print(f"APK: {OUT_APK}")
if os.path.exists(OUT_APK):
    size = os.path.getsize(OUT_APK)
    print(f"Size: {size/1024:.1f} KB")

    # Show APK contents
    with zipfile.ZipFile(OUT_APK) as z:
        print("\nAPK Contents:")
        for name in sorted(z.namelist()):
            print(f"  {name}")
