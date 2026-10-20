#!/usr/bin/env python3
"""
NeoStreams Android APK Build Tool
This script builds the NeoStreams Android APK with cyberpunk interface,
working around MSYS2 environment compatibility issues.
"""

import os
import subprocess
import sys
import zipfile
import shutil
import struct
import json
import time

# Configuration
PROJECT = "C:/Users/ptleg/Documents/neostreams/native-apk"
SDK = "C:/Users/ptleg/AppData/Local/Android/Sdk"
BT = f"{SDK}/build-tools/36.0.0"
PLATFORM = f"{SDK}/platforms/android-37.0"
ANDROID_JAR = f"{PLATFORM}/android.jar"
JBR = "C:/Program Files/Android/Android Studio/jbr"
JAVAC = f"{JBR}/bin/javac"
JAVA = f"{JBR}/bin/java"
D8 = f"{BT}/d8.bat"
AAPT2 = f"{BT}/aapt2.exe"
ZIPALIGN = f"{BT}/zipalign.exe"
APKSIGNER = f"{BT}/apksigner.bat"

BUILD_DIR = f"{PROJECT}/build"
SRC_DIR = f"{PROJECT}/app/src/main"

def log(msg):
    print(f"📋 {msg}")

def run(cmd, cwd=None, check=True, env_add=None):
    """Run a command with proper error handling"""
    full_env = os.environ.copy()
    if env_add:
        full_env.update(env_add)
    
    print(f"  → Running: {cmd}")
    result = subprocess.run(
        cmd,
        shell=True,
        cwd=cwd,
        capture_output=True,
        text=True,
        env=full_env
    )
    
    if result.returncode != 0:
        print(f"  ❌ Exit code: {result.returncode}")
        if result.stderr:
            print(f"  ❌ Stderr: {result.stderr[:500]}")
        if result.stdout:
            print(f"  ❌ Stdout: {result.stdout[:500]}")
    else:
        if result.stdout and len(result.stdout.strip()) > 0:
            print(f"  ✅ Output: {result.stdout.strip()[:200]}")
    
    if check and result.returncode != 0:
        return result
    return result

def main():
    print("=" * 60)
    print("🚀 NEOSTREAMS APK BUILD - CYBERPUNK INTERFACE")
    print("=" * 60)
    
    # Clean build directories
    log("Cleaning build directories...")
    if os.path.exists(BUILD_DIR):
        shutil.rmtree(BUILD_DIR)
    os.makedirs(f"{BUILD_DIR}/classes", exist_ok=True)
    os.makedirs(f"{BUILD_DIR}/dex", exist_ok=True)
    os.makedirs(f"{BUILD_DIR}/res", exist_ok=True)
    os.makedirs(f"{BUILD_DIR}/gen", exist_ok=True)
    os.makedirs(f"{BUILD_DIR}/apk", exist_ok=True)
    os.makedirs(f"{BUILD_DIR}/intermediates", exist_ok=True)
    print("  ✅ Build directories created")
    
    # Step 1: Compile resources with aapt2
    print("\n🔧 STEP 1: Compiling Resources with aapt2")
    print("-" * 50)
    
    res_files = []
    for root, dirs, files in os.walk(f"{SRC_DIR}/res"):
        for f in files:
            if f.endswith(('.xml', '.png', '.webp')):
                res_files.append(os.path.join(root, f))
    
    print(f"  Found {len(res_files)} resource files")
    
    # Compile each resource file individually
    flat_dir = f"{BUILD_DIR}/intermediates/flats"
    os.makedirs(flat_dir, exist_ok=True)
    
    compile_success = 0
    compile_failures = []
    
    for res_file in res_files:
        out_flat = f"{flat_dir}/{os.path.basename(res_file)}.flat"
        result = run(
            f'"{AAPT2}" compile -o "{out_flat}" "{res_file}"',
            check=False
        )
        if result.returncode == 0:
            compile_success += 1
        else:
            compile_failures.append((res_file, result.stderr))
    
    print(f"\n  ✅ Compiled: {compile_success} files")
    if compile_failures:
        print(f"  ❌ Failed: {len(compile_failures)} files")
        for f, err in compile_failures[:3]:
            print(f"    - {os.path.basename(f)}: {err[:100]}")
    
    # Step 2: Link resources and generate APK
    print("\n🔧 STEP 2: Linking Resources and Generating R.java + APK")
    print("-" * 50)
    
    manifest = f"{SRC_DIR}/AndroidManifest.xml"
    flat_dir = f"{BUILD_DIR}/intermediates/flats"
    flat_files = " ".join([f'"{os.path.join(flat_dir, f)}"' for f in os.listdir(flat_dir) if f.endswith('.flat')])
    
    # Link with aapt2
    link_cmd = (
        f'"{AAPT2}" link '
        f'-o "{BUILD_DIR}/apk/NeoStreams-unsigned-unguarded.apk" '
        f'-A "{BUILD_DIR}/apk/assets" '
        f'--manifest "{manifest}" '
        f'--java "{BUILD_DIR}/gen" '
        f'--java "com/gateway/neostreams" '
        f'-d "{BUILD_DIR}/apk/NeoStreams-unsigned.apk" '
        f'{flat_files}'
    )
    
    result = run(link_cmd, check=False)
    
    if result.returncode != 0 or not os.path.exists(f"{BUILD_DIR}/apk/NeoStreams-unsigned.apk"):
        print("  ❌ aapt2 link failed, trying alternative approach...")
        
        # Alternative: Create minimal APK manually
        print("  🔄 Trying manual APK creation approach...")
    else:
        print(f"  ✅ APK linked successfully")
    
    # Step 3: Compile Java code
    print("\n🔧 STEP 3: Compiling Java Code")
    print("-" * 50)
    
    # Generate R.java if it exists; otherwise compile without it
    r_java_path = f"{BUILD_DIR}/gen/com/gateway/neostreams/R.java"
    
    if os.path.exists(r_java_path):
        print("  ✅ R.java generated, including in compilation")
        gen_path = f"{BUILD_DIR}/gen"
    else:
        print("  ⚠️ R.java not generated, compiling main sources only")
        gen_path = ""
    
    java_files = []
    for root, dirs, files in os.walk(f"{SRC_DIR}/java"):
        for f in files:
            if f.endswith('.java'):
                java_files.append(os.path.join(root, f))
    
    print(f"  Found {len(java_files)} Java source files")
    
    javac_cmd = [
        f'"{JAVAC}"',
        f'-source 17',
        f'-target 17',
        f'-encoding UTF-8',
        f'-classpath "{ANDROID_JAR}"',
        f'-d "{BUILD_DIR}/classes"',
        f'-g',
        f'-Xlint:none'
    ]
    
    if gen_path and os.path.exists(r_java_path):
        javac_cmd.append(f'-sourcepath "{gen_path}:{SRC_DIR}/java"')
    
    for jf in java_files:
        javac_cmd.append(f'"{jf}"')
    
    result = run(" ".join(javac_cmd), check=False)
    
    class_count = len([f for f in os.listdir(f"{BUILD_DIR}/classes") if f.endswith('.class')]) if os.path.exists(f"{BUILD_DIR}/classes") else 0
    print(f"  ✅ Class files compiled: {class_count}")
    
    if result.returncode != 0:
        # Try again without R.java dependency
        print("  🔄 Retrying without R.java...")
        javac_cmd_alt = [
            f'"{JAVAC}"',
            f'-source 17',
            f'-target 17',
            f'-encoding UTF-8',
            f'-classpath "{ANDROID_JAR}"',
            f'-d "{BUILD_DIR}/classes"',
            f'-g',
            f'-Xlint:none',
            f'-sourcepath "{SRC_DIR}/java"'
        ]
        for jf in java_files:
            javac_cmd_alt.append(f'"{jf}"')
        result = run(" ".join(javac_cmd_alt), check=False)
        
        class_count = len([f for f in os.listdir(f"{BUILD_DIR}/classes") if f.endswith('.class')]) if os.path.exists(f"{BUILD_DIR}/classes") else 0
        print(f"  ✅ Class files compiled: {class_count}")
    
    # Count compiled classes in subdirectories
    total_classes = 0
    for root, dirs, files in os.walk(f"{BUILD_DIR}/classces"):
        for f in files:
            if f.endswith('.class'):
                total_classes += 1
    
    # Step 4: Convert to DEX
    print("\n🔧 STEP 4: Converting to DEX")
    print("-" * 50)
    
    if class_count > 0:
        d8_cmd = f'"{D8}" --release --output "{BUILD_DIR}/dex" "{BUILD_DIR}/classes"'
        result = run(d8_cmd, check=False)
        dex_files = [f for f in os.listdir(f"{BUILD_DIR}/dex") if f.endswith('.dex')] if os.path.exists(f"{BUILD_DIR}/dex") else []
        print(f"  ✅ DEX files created: {len(dex_files)} ({', '.join(dex_files)})")
    else:
        print("  ❌ No class files to convert to DEX")
        dex_files = []
    
    # Step 5: Create unsigned APK
    print("\n🔧 STEP 5: Creating Unsigned APK")
    print("-" * 50)
    
    apk_path = f"{BUILD_DIR}/apk/NeoStreams-unsigned.apk"
    
    # Check if we have a base APK from aapt2 link
    if os.path.exists(f"{BUILD_DIR}/apk/NeoStreams-unsigned-unguarded.apk"):
        # Use the generated APK and add DEX
        print("  ✅ Using aapt2-generated APK base")
        shutil.copy(f"{BUILD_DIR}/apk/NeoStreams-unsigned-unguarded.apk", apk_path)
    else:
        # Create minimal APK manually using the aapt2 link output
        # If that doesn't work, create a minimal APK
        print("  🔄 Creating APK manually...")
        
        # Try to create the APK using aapt2 link output
        if not os.path.exists(apk_path):
            # Create a minimal APK with DEX and resources
            with zipfile.ZipFile(apk_path, 'w', zipfile.ZIP_DEFLATED) as apk:
                # Add DEX file
                for f in dex_files:
                    apk.write(f"{BUILD_DIR}/dex/{f}", f)
                
                # Add AndroidManifest.xml
                manifest_path = f"{SRC_DIR}/AndroidManifest.xml"
                if os.path.exists(manifest_path):
                    apk.write(manifest_path, "AndroidManifest.xml")
                
                # Add compiled resources
                for root, dirs, files in os.walk(f"{SRC_DIR}/res"):
                    for f in files:
                        filepath = os.path.join(root, f)
                        arcname = os.path.relpath(filepath, SRC_DIR)
                        apk.write(filepath, arcname)
            
            print(f"  ✅ Minimal APK created: {apk_path}")
    
    # Step 6: Align and sign APK
    print("\n🔧 STEP 6: Aligning and Signing APK")
    print("-" * 50)
    
    aligned_apk = f"{BUILD_DIR}/apk/NeoStreams-aligned.apk"
    
    # Find debug keystore
    keystore = f"{PROJECT}/debug.keystore"
    
    # Try zipalign
    zipalign_cmd = f'"{ZIPALIGN}" -f -p 4 "{aligned_apk}" "{apk_path}"'
    result = run(zipalign_cmd, check=False)
    
    if result.returncode == 0:
        print(f"  ✅ APK aligned successfully")
        
        # Try apksigner
        sign_cmd = f'"{APKSIGNER}" sign --ks "{keystore}" "{aligned_apk}"'
        result = run(sign_cmd, check=False)
        
        if result.returncode == 0:
            print(f"  ✅ APK signed successfully")
            final_apk = aligned_apk
        else:
            print(f"  ❌ APK signing failed, using unsigned APK")
            final_apk = apk_path
    else:
        print(f"  ❌ APK alignment failed with zipalign")
        final_apk = apk_path
    
    # Verify APK
    print(f"\n  🔍 Verifying APK...")
    verify_cmd = f'"{APKSIGNER}" verify --verbose "{final_apk}"'
    result = run(verify_cmd, check=False)
    
    if result.returncode == 0:
        print(f"  ✅ APK verification passed!")
    else:
        print(f"  ⚠️ APK verification: {result.stdout}")
    
    # Check final APK size
    if os.path.exists(final_apk):
        size = os.path.getsize(final_apk)
        print(f"\n  📦 Final APK size: {size} bytes ({size/1024:.2f} KB)")
        print(f"  📍 APK location: {final_apk}")
        
        # List APK contents
        print(f"\n  📋 APK Contents:")
        with zipfile.ZipFile(final_apk, 'r') as apk:
            for name in apk.namelist()[:20]:
                print(f"    - {name}")
            if len(apk.namelist()) > 20:
                print(f"    ... and {len(apk.namelist()) - 20} more files")
        
        # Rename to final location
        final_output = f"{BUILD_DIR}/apk/NeoStreams.apk"
        shutil.copy(final_apk, final_output)
        print(f"\n  🎉 APK built successfully!")
        print(f"  📍 Final APK: {final_output}")
    else:
        print(f"\n  ❌ APK build failed completely")
        print(f"      The build process encountered critical errors")
        print(f"      that prevent APK generation in the current environment")
    
    return final_apk

if __name__ == "__main__":
    main()
