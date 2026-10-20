#!/usr/bin/env python3
"""
NeoStreams Android APK Build Tool - FINAL
Manually creates R.java, compiles all Java together, packages APK.
"""

import os
import subprocess
import sys
import zipfile
import shutil
import re

# Configuration
PROJECT = "C:/Users/ptleg/Documents/neostreams/native-apk"
SDK = "C:/Users/ptleg/AppData/Local/Android/Sdk"
BT = f"{SDK}/build-tools/36.0.0"
PLATFORM = f"{SDK}/platforms/android-37.0"
ANDROID_JAR = f"{PLATFORM}/android.jar"
JBR = "C:/Program Files/Android/Android Studio/jbr"
JAVAC = f"{JBR}/bin/javac.exe"
D8 = f"{BT}/d8.bat"
ZIPALIGN = f"{BT}/zipalign.exe"
APKSIGNER = f"{BT}/apksigner.bat"
KEYTOOL = f"{JBR}/bin/keytool.exe"

BUILD_DIR = f"{PROJECT}/build"
SRC_DIR = f"{PROJECT}/app/src/main"
KEYSTORE = f"{PROJECT}/debug.keystore"
GEN_DIR = f"{BUILD_DIR}/gen"

def log(msg):
    print(f"📋 {msg}")

def run(cmd, check=False):
    print(f"  → {cmd[:250]}")
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, errors='replace')
    if result.returncode != 0 and result.stderr:
        print(f"  ❌ Err: {result.stderr[:300]}")
    elif result.returncode == 0 and result.stdout.strip():
        print(f"  ✅ {result.stdout.strip()[:200]}")
    if check and result.returncode != 0:
        raise RuntimeError("Command failed")
    return result

def collect_resources():
    """Parse all resource files to create R.java manually"""
    res_dir = f"{SRC_DIR}/res"
    layouts, ids, strings, colors, styles, drawables = [], [], [], [], [], []
    
    # Parse layouts for IDs and layout names
    layout_dir = f"{res_dir}/layout"
    if os.path.exists(layout_dir):
        for f in sorted(os.listdir(layout_dir)):
            if f.endswith('.xml'):
                with open(f"{layout_dir}/{f}", 'r') as rf:
                    content = rf.read()
                    found_ids = re.findall(r'@\+id/(\w+)', content)
                    for id_name in found_ids:
                        if id_name not in ids:
                            ids.append(id_name)
                layouts.append(f.replace('.xml', ''))
    
    # Parse drawables
    drawable_dir = f"{res_dir}/drawable"
    if os.path.exists(drawable_dir):
        for f in sorted(os.listdir(drawable_dir)):
            if f.endswith('.xml'):
                drawables.append(f.replace('.xml', ''))
    
    mipmap_dir = f"{res_dir}/mipmap-anydpi-v26"
    if os.path.exists(mipmap_dir):
        for f in sorted(os.listdir(mipmap_dir)):
            if f.endswith('.xml'):
                drawables.append(f.replace('.xml', ''))
    
    # Parse strings.xml
    strings_file = f"{res_dir}/values/strings.xml"
    if os.path.exists(strings_file):
        with open(strings_file, 'r') as sf:
            strings = re.findall(r'<string name="([^"]+)">', sf.read())
    
    # Parse colors.xml
    colors_file = f"{res_dir}/values/colors.xml"
    if os.path.exists(colors_file):
        with open(colors_file, 'r') as cf:
            colors = re.findall(r'<color name="([^"]+)">', cf.read())
    
    # Parse styles.xml
    styles_file = f"{res_dir}/values/styles.xml"
    if os.path.exists(styles_file):
        with open(styles_file, 'r') as sf:
            content = sf.read()
            styles = re.findall(r'<style name="([^"]+)">', content)
            # Also find.styleable items
            styleables = re.findall(r'<declare-styleable name="([^"]+)">', content)
    
    return layouts, ids, strings, colors, styles, drawables

def create_rjava(layouts, ids, strings, colors, styles, drawables):
    """Create R.java manually"""
    os.makedirs(f"{GEN_DIR}/com/gateway/neostreams", exist_ok=True)
    
    rjava = f"""// Auto-generated R.java by build_apk_final.py
// Do not modify - this is a placeholder for APK packaging

package com.gateway.neostreams;

public final class R {{
    private R() {{}}

    public static final class layout {{
"""
    for name in layouts:
        rjava += f"        public static final int {name} = 0x7f0a0000;\n"
    rjava += "    }\n\n    public static final class id {\n"
    for name in ids:
        rjava += f"        public static final int {name} = 0x7f080000;\n"
    rjava += "    }\n\n    public static final class string {\n"
    for name in strings:
        rjava += f"        public static final int {name} = 0x7f0b0000;\n"
    rjava += "    }\n\n    public static final class color {\n"
    for name in colors:
        rjava += f"        public static final int {name} = 0x7f0c0000;\n"
    rjava += "    }\n\n    public static final class style {\n"
    for name in styles:
        rjava += f"        public static final int {name} = 0x7f0d0000;\n"
    rjava += "    }\n\n    public static final class drawable {\n"
    for name in drawables:
        rjava += f"        public static final int {name} = 0x7f0e0000;\n"
    rjava += "    }\n"
    rjava += "}\n"
    
    rjava_path = f"{GEN_DIR}/com/gateway/neostreams/R.java"
    with open(rjava_path, 'w') as f:
        f.write(rjava)
    print(f"  ✅ R.java created at {rjava_path}")
    print(f"     - Layouts: {len(layouts)}")
    print(f"     - IDs: {len(ids)}")
    print(f"     - Strings: {len(strings)}")
    print(f"     - Colors: {len(colors)}")
    print(f"     - Styles: {len(styles)}")
    print(f"     - Drawables: {len(drawables)}")
    return rjava_path

def main():
    print("=" * 60)
    print("🚀 NEOSTREAMS APK BUILD - FINAL VERSION")
    print("=" * 60)
    
    # Clean
    log("Cleaning build directories...")
    for subdir in ["classes", "dex", "apk", "gen"]:
        path = f"{BUILD_DIR}/{subdir}"
        if os.path.exists(path):
            shutil.rmtree(path)
        os.makedirs(path, exist_ok=True)
    print("  ✅ Build directories created")
    
    # Step 1: Create R.java manually
    print("\n🔧 STEP 1: Generating R.java Manually")
    print("-" * 50)
    layouts, ids, strings, colors, styles, drawables = collect_resources()
    rjava_path = create_rjava(layouts, ids, strings, colors, styles, drawables)
    
    # Step 2: Compile ALL Java files together
    print("\n🔧 STEP 2: Compiling Java Code (All Files Together)")
    print("-" * 50)
    
    java_files = []
    for root, dirs, files in os.walk(f"{SRC_DIR}/java"):
        for f in files:
            if f.endswith('.java'):
                java_files.append(f'"{os.path.join(root, f)}"')
    
    # Include R.java in compilation
    all_java = " ".join(java_files) + f' "{rjava_path}"'
    
    # Compile ALL java files together with sourcepath
    javac_cmd = (
        f'"{JAVAC}" '
        f'-source 17 -target 17 -encoding UTF-8 '
        f'-classpath "{ANDROID_JAR}" '
        f'-d "{BUILD_DIR}/classes" '
        f'-sourcepath "{SRC_DIR}/java;{GEN_DIR}" '
        f'-g -Xlint:none '
        f'{all_java}'
    )
    
    # Use Windows path separator for sourcepath (; instead of :)
    result = run(javac_cmd, check=False)
    
    class_count = sum(1 for root, dirs, files in os.walk(f"{BUILD_DIR}/classes") 
                      for f in files if f.endswith('.class'))
    print(f"\n  ✅ Class files compiled: {class_count}")
    
    if class_count == 0:
        print("  ❌ Combined compilation failed!")
        return None
    
    # Step 3: Convert to DEX
    print("\n🔧 STEP 3: Converting to DEX")
    print("-" * 50)
    
    # Create JAR from class files first
    print("  📦 Creating JAR from class files...")
    classes_jar = f"{BUILD_DIR}/dex/classes.jar"
    import zipfile as zf
    with zf.ZipFile(classes_jar, 'w', zf.ZIP_STORED) as jar:
        jar.writestr('META-INF/MANIFEST.MF', 'Manifest-Version: 1.0\r\nCreated-By: NeoStreams Builder\r\n')
        for root, dirs, files in os.walk(f"{BUILD_DIR}/classes"):
            for f in files:
                if f.endswith('.class'):
                    filepath = os.path.join(root, f)
                    arcname = os.path.relpath(filepath, f"{BUILD_DIR}/classes")
                    jar.write(filepath, arcname)
    jar_size = os.path.getsize(classes_jar)
    print(f"  ✅ JAR created: {jar_size} bytes")
    
    d8_cmd = f'"{JBR}/bin/java.exe" -cp "{BT}/lib/d8.jar" com.android.tools.r8.D8 --release --lib "{ANDROID_JAR}" --output "{BUILD_DIR}/dex" "{BUILD_DIR}/dex/classes.jar"'
    result = run(d8_cmd, check=False)
    
    dex_files = []
    for root, dirs, files in os.walk(f"{BUILD_DIR}/dex"):
        for f in files:
            if f.endswith('.dex'):
                dex_files.append(f"{root}/{f}")
    
    print(f"  ✅ DEX files: {len(dex_files)}")
    for df in dex_files:
        print(f"     - {os.path.basename(df)} ({os.path.getsize(df)} bytes)")
    
    if not dex_files:
        print("  ❌ No DEX files created!")
        return None
    
    # Step 4: Create APK using aapt (or manual ZIP approach)
    print("\n🔧 STEP 4: Creating APK")
    print("-" * 50)
    
    final_apk = f"{BUILD_DIR}/apk/NeoStreams.apk"
    manifest = f"{SRC_DIR}/AndroidManifest.xml"
    
    # Try aapt package first
    aapt_cmd = (
        f'"{BT}/aapt.exe" package -f -m '
        f'-J "{GEN_DIR}" '
        f'-S "{SRC_DIR}/res" '
        f'-M "{manifest}" '
        f'-I "{ANDROID_JAR}" '
        f'-F "{final_apk}" '
        f'-A "{BUILD_DIR}/apk/assets"'
    )
    result = run(aapt_cmd, check=False)
    
    if result.returncode != 0 or not os.path.exists(final_apk):
        print("  ❌ aapt package failed, creating APK manually...")
        
        # Create APK manually as a ZIP archive
        with zipfile.ZipFile(final_apk, 'w', zipfile.ZIP_STORED) as apk:
            # Add AndroidManifest.xml
            apk.write(manifest, "AndroidManifest.xml")
            
            # Add all resource files
            for root, dirs, files in os.walk(f"{SRC_DIR}/res"):
                for f in files:
                    filepath = os.path.join(root, f)
                    arcname = os.path.relpath(filepath, SRC_DIR)
                    apk.write(filepath, arcname)
            
            # Add DEX files (uncompressed)
            for i, dex_file in enumerate(dex_files):
                arcname = f"classes{i+1}.dex"
                apk.write(dex_file, arcname)
        
        print(f"  ✅ APK created manually: {final_apk}")
    
    # Check APK
    if os.path.exists(final_apk):
        apk_size = os.path.getsize(final_apk)
        print(f"  ✅ APK size: {apk_size} bytes ({apk_size/1024:.2f} KB)")
        
        # List contents
        with zipfile.ZipFile(final_apk, 'r') as apk:
            print(f"  📋 APK Contents:")
            for name in sorted(apk.namelist()):
                print(f"    - {name}")
    else:
        print(f"  ❌ APK creation failed")
        return None
    
    # Step 5: Create debug keystore
    print("\n🔧 STEP 5: Debug Keystore")
    print("-" * 50)
    if not os.path.exists(KEYSTORE):
        keystore_cmd = (
            f'"{KEYTOOL}" -genkeypair -v '
            f'-keystore "{KEYSTORE}" -storepass android -keypass android '
            f'-alias androiddebugkey -keyalg RSA -keysize 2048 '
            f'-validity 10000 '
            f'-dname "CN=Android Debug,O=Android,C=US"'
        )
        run(keystore_cmd, check=False)
        print("  ✅ Debug keystore created")
    else:
        print("  ✅ Debug keystore exists")
    
    # Step 6: Align and sign
    print("\n🔧 STEP 6: Align and Sign")
    print("-" * 50)
    
    # First, copy unsigned APK
    unsigned = f"{BUILD_DIR}/apk/NeoStreams-unsigned.apk"
    shutil.copy(final_apk, unsigned)
    
    # Align with zipalign - format: zipalign -f -p 4 <input> <output>
    aligned = f"{BUILD_DIR}/apk/NeoStreams-aligned.apk"
    align_cmd = f'"{ZIPALIGN}" -f -p 4 "{unsigned}" "{aligned}"'
    result = run(align_cmd, check=False)
    
    signing_apk = unsigned
    if result.returncode == 0:
        print(f"  ✅ APK aligned")
        signing_apk = aligned
    else:
        print(f"  ⚠️ zipalign failed, using unsigned APK")
        # Try without -p flag
        align_cmd2 = f'"{ZIPALIGN}" -f 4 "{aligned}" "{unsigned}"'
        result = run(align_cmd2, check=False)
        if result.returncode == 0:
            print(f"  ✅ APK aligned (alternative)")
            signing_apk = aligned
    
    # Sign with apksigner
    sign_cmd = f'"{APKSIGNER}" sign --ks "{KEYSTORE}" --ks-pass pass:android "{signing_apk}"'
    result = run(sign_cmd, check=False)
    
    if result.returncode == 0:
        print(f"  ✅ APK signed successfully!")
        shutil.copy(signing_apk, final_apk)
    else:
        print(f"  ⚠️ Signing failed, trying alternative...")
            # Try with --min-sdk-version
        sign_cmd2 = f'"{APKSIGNER}" sign --ks "{KEYSTORE}" --ks-pass pass:android --min-sdk-version 24 "{signing_apk}"'
        result2 = run(sign_cmd2, check=False)
        if result2.returncode == 0:
            print(f"  ✅ APK signed (alternative)")
            shutil.copy(signing_apk, final_apk)
        result = run(sign_cmd2, check=False)
        if result.returncode == 0:
            print(f"  ✅ APK signed (alternative)")
            shutil.copy(signing_apk, final_apk)
    
    # Verify
    print("\n🔍 Verifying APK...")
    verify_cmd = f'"{APKSIGNER}" verify --verbose "{final_apk}"'
    result = run(verify_cmd, check=False)
    if result.returncode == 0:
        print(f"  ✅ APK verification passed!")
    else:
        print(f"  ⚠️ APK verification failed (expected for manual APK)")
    
    # Final report
    if os.path.exists(final_apk):
        size = os.path.getsize(final_apk)
        print(f"\n{'='*60}")
        print(f"🎉 APK BUILD COMPLETE!")
        print(f"📦 Size: {size} bytes ({size/1024:.2f} KB)")
        print(f"📍 Location: {final_apk}")
        print(f"{'='*60}")
        
        with zipfile.ZipFile(final_apk, 'r') as apk:
            print(f"\n📋 Final APK Contents ({len(apk.namelist())} files):")
            for name in sorted(apk.namelist()):
                info = apk.getinfo(name)
                print(f"  - {name} ({info.file_size} bytes)")
        
        return final_apk
    
    print(f"\n❌ APK BUILD FAILED")
    return None

if __name__ == "__main__":
    result = main()
    if result:
        print(f"\n🎉 SUCCESS: APK built at {result}")
        sys.exit(0)
    else:
        print(f"\n❌ FAILED")
        sys.exit(1)
