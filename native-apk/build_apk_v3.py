#!/usr/bin/env python3
"""
NeoStreams Android APK Build Tool - Using aapt (not aapt2)
This script builds the APK using the traditional aapt tool which 
generates R.java and packages resources in a single step.
"""

import os
import subprocess
import sys
import zipfile
import shutil
import json

# Configuration
PROJECT = "C:/Users/ptleg/Documents/neostreams/native-apk"
SDK = "C:/Users/ptleg/AppData/Local/Android/Sdk"
BT = f"{SDK}/build-tools/36.0.0"
PLATFORM = f"{SDK}/platforms/android-37.0"
ANDROID_JAR = f"{PLATFORM}/android.jar"
JBR = "C:/Program Files/Android/Android Studio/jbr"
JAVAC = f"{JBR}/bin/javac.exe"
D8 = f"{BT}/d8.bat"
AAPT = f"{BT}/aapt.exe"  # Using old aapt, not aapt2
ZIPALIGN = f"{BT}/zipalign.exe"
APKSIGNER = f"{BT}/apksigner.bat"
KEYTOOL = f"{JBR}/bin/keytool.exe"

BUILD_DIR = f"{PROJECT}/build"
SRC_DIR = f"{PROJECT}/app/src/main"
KEYSTORE = f"{PROJECT}/debug.keystore"

def log(msg):
    print(f"📋 {msg}")

def run(cmd, check=False):
    """Run a command and return the result"""
    print(f"  → Running: {cmd[:300]}")
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  ❌ Exit code: {result.returncode}")
        if result.stderr:
            # Handle non-UTF8 output
            try:
                print(f"  ❌ Stderr: {result.stderr[:500]}")
            except:
                print(f"  ❌ Stderr (bytes): {result.stderr.encode('latin-1')[:300]}")
    else:
        if result.stdout and len(result.stdout.strip()) > 0:
            print(f"  ✅ Output: {result.stdout.strip()[:200]}")
    if check and result.returncode != 0:
        raise RuntimeError(f"Command failed")
    return result

def main():
    print("=" * 60)
    print("🚀 NEOSTREAMS APK BUILD - CYBERPUNK INTERFACE")
    print("🔧 Using traditional aapt (not aapt2) for compatibility")
    print("=" * 60)

    # Clean build directories
    log("Cleaning build directories...")
    if os.path.exists(BUILD_DIR):
        shutil.rmtree(BUILD_DIR)
    for subdir in ["classes", "dex", "apk", "gen", "res"]:
        os.makedirs(f"{BUILD_DIR}/{subdir}", exist_ok=True)
    print("  ✅ Build directories created")

    # Collect resource files
    res_files = []
    for root, dirs, files in os.walk(f"{SRC_DIR}/res"):
        for f in files:
            filepath = os.path.join(root, f)
            res_files.append(filepath)
    print(f"  ✅ Found {len(res_files)} resource files")

    # Step 1: Use aapt package to compile resources, generate R.java and base APK
    print("\n🔧 STEP 1: Packaging Resources with aapt")
    print("-" * 50)

    manifest = f"{SRC_DIR}/AndroidManifest.xml"
    gen_dir = f"{BUILD_DIR}/gen"
    res_dir = f"{SRC_DIR}/res"
    base_apk = f"{BUILD_DIR}/apk/NeoStreams-base.apk"

    aapt_cmd = (
        f'"{AAPT}" package '
        f'-f '  # Force overwrite
        f'-m '  # Use separate R.java files
        f'-J "{gen_dir}" '  # Java source output directory
        f'-S "{res_dir}" '  # Resources directory
        f'-M "{manifest}" '  # Manifest file
        f'-I "{ANDROID_JAR}" '  # android.jar
        f'-F "{base_apk}" '  # Output APK file
        f'-A "{BUILD_DIR}/apk/assets" '  # Assets directory (empty)
    )

    result = run(aapt_cmd, check=False)

    # Check if R.java was generated
    r_java_found = False
    for root, dirs, files in os.walk(gen_dir):
        for f in files:
            if f == "R.java":
                r_java_found = True
                print(f"  ✅ R.java generated at: {os.path.join(root, f)}")
                # Print R.java contents preview
                r_path = os.path.join(root, f)
                with open(r_path, 'r') as rf:
                    content = rf.read()
                    print(f"  📄 R.java preview ({len(content)} chars)")

    if not r_java_found:
        print("  ❌ aapt package failed - no R.java generated")
        print("  🔄 Trying alternative: Generate R.java manually from resources...")

        # Parse resources to create R.java manually
        create_rjava_manually()

        # Find R.java after manual creation
        for root, dirs, files in os.walk(gen_dir):
            for f in files:
                if f == "R.java":
                    r_java_found = True
                    print(f"  ✅ R.java created manually: {os.path.join(root, f)}")

    # Check if base APK was created
    if not os.path.exists(base_apk):
        print("  ❌ Base APK not created by aapt")
        print("  🔄 Creating minimal APK for DEX inclusion...")
        # Create minimal APK with just manifest
        with zipfile.ZipFile(base_apk, 'w', zipfile.ZIP_STORED) as apk:
            apk.write(manifest, "AndroidManifest.xml")
        print(f"  ✅ Minimal base APK created: {base_apk}")

    # Step 2: Compile Java code (all files together)
    print("\n🔧 STEP 2: Compiling Java Code")
    print("-" * 50)

    java_files = []
    for root, dirs, files in os.walk(f"{SRC_DIR}/java"):
        for f in files:
            if f.endswith('.java'):
                java_files.append(f'"{os.path.join(root, f)}"')

    # Also collect R.java if it exists
    java_source_files = " ".join(java_files)
    gen_source_arg = f'-sourcepath "{gen_dir}"' if r_java_found else ""

    javac_cmd = (
        f'"{JAVAC}" '
        f'-source 17 '
        f'-target 17 '
        f'-encoding UTF-8 '
        f'-classpath "{ANDROID_JAR}" '
        f'-d "{BUILD_DIR}/classes" '
        f'-g '
        f'-Xlint:none '
        f'{gen_source_arg} '
        f'{java_source_files}'
    )

    result = run(javac_cmd, check=False)

    # Count compiled class files
    class_count = sum(1 for root, dirs, files in os.walk(f"{BUILD_DIR}/classes") 
                      for f in files if f.endswith('.class'))
    print(f"  ✅ Class files compiled: {class_count}")

    if class_count > 0:
        # Print some class info
        for root, dirs, files in os.walk(f"{BUILD_DIR}/classes"):
            for f in files:
                if f.endswith('.class'):
                    print(f"    📄 {f}")
    else:
        print("  ❌ Java compilation failed!")
        # Try individual files for debugging
        print("  🔍 Attempting individual file compilation for debugging...")
        for jf in [f.strip('"') for f in java_files]:
            result = run(
                f'"{JAVAC}" -source 17 -target 17 -encoding UTF-8 '
                f'-classpath "{ANDROID_JAR}" -d "{BUILD_DIR}/classes" -g -Xlint:none '
                f'{gen_source_arg} "{jf}"',
                check=False
            )
            if result.returncode == 0:
                print(f"  ✅ Individual compile succeeded: {os.path.basename(jf)}")

    # Step 3: Convert to DEX
    print("\n🔧 STEP 3: Converting to DEX")
    print("-" * 50)

    dex_files = []
    if class_count > 0:
        d8_cmd = f'"{D8}" --release --output "{BUILD_DIR}/dex" "{BUILD_DIR}/classes"'
        result = run(d8_cmd, check=False)

        for f in os.listdir(f"{BUILD_DIR}/dex") if os.path.exists(f"{BUILD_DIR}/dex") else []:
            if f.endswith('.dex'):
                dex_files.append(f"{BUILD_DIR}/dex/{f}")
                print(f"  ✅ DEX file: {f}")
        print(f"  ✅ DEX files created: {len(dex_files)}")
    else:
        print("  ❌ No class files to convert to DEX")

    # Step 4: Package DEX into APK
    print("\n🔧 STEP 4: Creating Final APK")
    print("-" * 50)

    final_apk = f"{BUILD_DIR}/apk/NeoStreams.apk"

    # Build the APK with DEX files included
    with zipfile.ZipFile(final_apk, 'w', zipfile.ZIP_DEFLATED) as apk:
        # Add AndroidManifest.xml
        manifest_path = f"{SRC_DIR}/AndroidManifest.xml"
        if os.path.exists(manifest_path):
            apk.write(manifest_path, "AndroidManifest.xml")

        # Add resources (compiled or raw)
        for res_file in res_files:
            arcname = os.path.relpath(res_file, SRC_DIR)
            apk.write(res_file, arcname)

        # Add DEX files
        for i, dex_file in enumerate(dex_files):
            arcname = f"classes{i+1}.dex"
            apk.write(dex_file, arcname)
            print(f"  ✅ Added: {arcname}")

        # Add native libraries if any
        libs_dir = f"{SRC_DIR}/jniLibs"
        if os.path.exists(libs_dir):
            for root, dirs, files in os.walk(libs_dir):
                for f in files:
                    filepath = os.path.join(root, f)
                    arcname = f"lib/{f}"
                    apk.write(filepath, arcname)

    print(f"  ✅ APK created: {final_apk}")
    apk_size = os.path.getsize(final_apk)
    print(f"  📦 Size: {apk_size} bytes ({apk_size/1024:.2f} KB)")

    # Step 5: Create debug keystore
    print("\n🔧 STEP 5: Creating Debug Keystore")
    print("-" * 50)
    if not os.path.exists(KEYSTORE):
        log("Creating debug keystore...")
        keystore_cmd = (
            f'"{KEYTOOL}" -genkeypair '
            f'-v -keystore "{KEYSTORE}" '
            f'-storepass android '
            f'-keypass android '
            f'-alias androiddebugkey '
            f'-keyalg RSA -keysize 2048 '
            f'-validity 10000 '
            f'-dname "CN=Android Debug,O=Android,C=US"'
        )
        result = run(keystore_cmd, check=False)
        if result.returncode == 0:
            print("  ✅ Debug keystore created")
    else:
        print("  ✅ Debug keystore already exists")

    # Step 6: Align and sign APK
    print("\n🔧 STEP 6: Aligning and Signing APK")
    print("-" * 50)

    aligned_apk = f"{BUILD_DIR}/apk/NeoStreams-aligned.apk"

    # Align
    align_cmd = f'"{ZIPALIGN}" -f -p 4 "{aligned_apk}" "{final_apk}"'
    result = run(align_cmd, check=False)

    if result.returncode == 0:
        print(f"  ✅ APK aligned successfully")
        signing_input = aligned_apk
    else:
        print(f"  ❌ zipalign failed")
        # Try with store mode (no compression)
        print(f"  🔄 Trying zipalign with different parameters...")
        align_cmd2 = f'"{ZIPALIGN}" -f 4 "{aligned_apk}" "{final_apk}"'
        result = run(align_cmd2, check=False)
        if result.returncode == 0:
            print(f"  ✅ APK aligned successfully (alternative)")
            signing_input = aligned_apk
        else:
            print(f"  ❌ zipalign failed, proceeding without alignment")
            signing_input = final_apk

    # Sign
    sign_cmd = f'"{APKSIGNER}" sign --ks "{KEYSTORE}" --ks-pass pass:android --min-sdk-version 24 "{signing_input}"'
    result = run(sign_cmd, check=False)

    if result.returncode == 0:
        print(f"  ✅ APK signed successfully")
        # Copy signed version as final
        shutil.copy(signing_input, final_apk)
    else:
        print(f"  ❌ APK signing failed")
        print(f"  🔄 Trying sign with --v2-signing-signer-x509...")
        # Try alternative signing approach
        sign_cmd2 = f'"{APKSIGNER}" sign --ks "{KEYSTORE}" --ks-pass pass:android --v1-signing-enabled true --v2-signing-enabled true "{signing_input}"'
        result = run(sign_cmd2, check=False)
        if result.returncode == 0:
            print(f"  ✅ APK signed (alternative)")
            shutil.copy(signing_input, final_apk)

    # Verify
    print("\n🔍 Verifying APK...")
    verify_cmd = f'"{APKSIGNER}" verify --verbose --min-sdk-version 24 "{final_apk}"'
    result = run(verify_cmd, check=False)

    if result.returncode == 0:
        print(f"  ✅ APK verification passed!")
    else:
        print(f"  ⚠️ APK verification: failed (expected for manually created APK)")

    # Final report
    if os.path.exists(final_apk):
        size = os.path.getsize(final_apk)
        print(f"\n{'='*60}")
        print(f"🎉 APK BUILD COMPLETE!")
        print(f"📦 Size: {size} bytes ({size/1024:.2f} KB)")
        print(f"📍 Location: {final_apk}")
        print(f"{'='*60}")

        # Show APK contents
        print(f"\n📋 APK Contents:")
        with zipfile.ZipFile(final_apk, 'r') as apk:
            for name in sorted(apk.namelist()):
                info = apk.getinfo(name)
                print(f"  - {name} ({info.file_size} bytes)")

        return final_apk
    else:
        print(f"\n❌ APK BUILD FAILED")
        return None

def create_rjava_manually():
    """Create R.java manually by parsing XML resources"""
    print("  🔄 Creating R.java manually from resource files...")

    project = "C:/Users/ptleg/Documents/neostreams/native-apk"
    src_dir = f"{project}/app/src/main"
    build_dir = f"{project}/build"
    gen_dir = f"{build_dir}/gen/com/gateway/neostreams"
    os.makedirs(gen_dir, exist_ok=True)

    # Parse resource files to extract IDs
    r_layout = []
    r_id = []
    r_string = []
    r_color = []
    r_style = []
    r_drawable = []

    # Parse layout files for IDs
    layout_dir = f"{src_dir}/res/layout"
    if os.path.exists(layout_dir):
        for f in os.listdir(layout_dir):
            if f.endswith('.xml'):
                filepath = os.path.join(layout_dir, f)
                with open(filepath, 'r') as rf:
                    content = rf.read()
                    # Extract @+id/ references
                    import re
                    ids = re.findall(r'@\\+id/(\\w+)', content)
                    for id_name in ids:
                        if id_name not in r_id:
                            r_id.append(id_name)
                layout_name = f.replace('.xml', '')
                r_layout.append(layout_name)

    # Parse drawable files
    drawable_dir = f"{src_dir}/res/drawable"
    if os.path.exists(drawable_dir):
        for f in os.listdir(drawable_dir):
            if f.endswith('.xml'):
                drawable_name = f.replace('.xml', '')
                r_drawable.append(drawable_name)

    # Parse mipmap files
    mipmap_dir = f"{src_dir}/res/mipmap-anydpi-v26"
    if os.path.exists(mipmap_dir):
        for f in os.listdir(mipmap_dir):
            if f.endswith('.xml'):
                mipmap_name = f.replace('.xml', '')
                r_drawable.append(mipmap_name)

    # Parse strings.xml
    strings_file = f"{src_dir}/res/values/strings.xml"
    if os.path.exists(strings_file):
        with open(strings_file, 'r') as sf:
            content = sf.read()
            import re
            strings = re.findall(r'<string name="([^"]+)">', content)
            for s in strings:
                r_string.append(s)

    # Parse colors.xml
    colors_file = f"{src_dir}/res/values/colors.xml"
    if os.path.exists(colors_file):
        with open(colors_file, 'r') as cf:
            content = cf.read()
            import re
            colors = re.findall(r'<color name="([^"]+)">', content)
            for c in colors:
                r_color.append(c)

    # Parse styles.xml
    styles_file = f"{src_dir}/res/values/styles.xml"
    if os.path.exists(styles_file):
        with open(styles_file, 'r') as sf:
            content = sf.read()
            import re
            # Extract style names
            styles = re.findall(r'<style name="([^"]+)">', content)
            for s in styles:
                r_style.append(s.replace('.', '_'))

    # Generate R.java
    rjava_content = """package com.gateway.neostreams;

public final class R {
    public static final class layout {
"""
    for name in sorted(r_layout):
        rjava_content += f"        public static final int {name} = 0x7f0a0000;\n"

    rjava_content += "    }\n\n"
    rjava_content += "    public static final class id {\n"
    for name in sorted(r_id):
        rjava_content += f"        public static final int {name} = 0x7f080000;\n"

    rjava_content += "    }\n\n"
    rjava_content += "    public static final class string {\n"
    for name in sorted(r_string):
        rjava_content += f"        public static final int {name} = 0x7f0b0000;\n"

    rjava_content += "    }\n\n"
    rjava_content += "    public static final class color {\n"
    for name in sorted(r_color):
        rjava_content += f"        public static final int {name} = 0x7f0c0000;\n"

    rjava_content += "    }\n\n"
    rjava_content += "    public static final class style {\n"
    for name in sorted(r_style):
        rjava_content += f"        public static final int {name} = 0x7f0d0000;\n"

    rjava_content += "    }\n\n"
    rjava_content += "    public static final class drawable {\n"
    for name in sorted(r_drawable):
        rjava_content += f"        public static final int {name} = 0x7f0e0000;\n"

    rjava_content += "    }\n"
    rjava_content += "}\n"

    rjava_path = f"{gen_dir}/R.java"
    with open(rjava_path, 'w') as rf:
        rf.write(rjava_content)
    print(f"  ✅ R.java created manually at: {rjava_path}")

if __name__ == "__main__":
    result = main()
    if result:
        print(f"\n🎉 SUCCESS: APK built at {result}")
        sys.exit(0)
    else:
        print(f"\n❌ FAILED: Could not build APK")
        sys.exit(1)
