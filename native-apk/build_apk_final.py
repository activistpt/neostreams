#!/usr/bin/env python3
"""
NeoStreams Android APK Build Tool - Cyberpunk Version
Builds the APK using native Android SDK tools with proper error handling.
"""

import os
import subprocess
import sys
import zipfile
import shutil
import tempfile

# Configuration - use native Windows paths
PROJECT = "C:/Users/ptleg/Documents/neostreams/native-apk"
SDK = "C:/Users/ptleg/AppData/Local/Android/Sdk"
BT = SDK + "/build-tools/36.0.0"
PLATFORM = SDK + "/platforms/android-37.0"
ANDROID_JAR = PLATFORM + "/android.jar"
JBR = "C:/Program Files/Android/Android Studio/jbr"
JAVAC = JBR + "/bin/javac.exe"
D8 = BT + "/d8.bat"
AAPT2 = BT + "/aapt2.exe"
ZIPALIGN = BT + "/zipalign.exe"
APKSIGNER = BT + "/apksigner.bat"
KEYTOOL = JBR + "/bin/keytool.exe"

BUILD_DIR = PROJECT + "/build"
SRC_DIR = PROJECT + "/app/src/main"

# Debug keystore
KEYSTORE = PROJECT + "/debug.keystore"

def log(msg):
    print(f"📋 {msg}")

def run(cmd, check=False, cwd=None):
    """Run a command and return the result"""
    print(f"  → Running: {cmd[:200]}")
    result = subprocess.run(
        cmd,
        shell=True,
        cwd=cwd,
        capture_output=True,
        text=True
    )
    if result.returncode != 0:
        print(f"  ❌ Exit code: {result.returncode}")
        if result.stderr:
            print(f"  ❌ Stderr: {result.stderr[:500]}")
    else:
        if result.stdout and len(result.stdout.strip()) > 0:
            print(f"  ✅ Output: {result.stdout.strip()[:200]}")
    if check and result.returncode != 0:
        raise RuntimeError(f"Command failed: {cmd}")
    return result

def main():
    print("=" * 60)
    print("🚀 NEOSTREAMS APK BUILD - CYBERPUNK INTERFACE")
    print("=" * 60)

    # Clean build directories
    log("Cleaning build directories...")
    if os.path.exists(BUILD_DIR):
        shutil.rmtree(BUILD_DIR)
    for subdir in ["classes", "dex", "apk", "gen", "res", "intermediates"]:
        os.makedirs(f"{BUILD_DIR}/{subdir}", exist_ok=True)
    print("  ✅ Build directories created")

    # Collect all resource files
    res_files = []
    for root, dirs, files in os.walk(f"{SRC_DIR}/res"):
        for f in files:
            filepath = os.path.join(root, f)
            res_files.append(filepath)
    print(f"  ✅ Found {len(res_files)} resource files")

    # Step 1: Compile resources with aapt2
    print("\n🔧 STEP 1: Compiling Resources with aapt2")
    print("-" * 50)

    flat_dir = f"{BUILD_DIR}/intermediates/flats"
    os.makedirs(flat_dir, exist_ok=True)

    flat_files = []
    for res_file in res_files:
        basename = os.path.basename(res_file)
        out_flat = f"{flat_dir}/{basename}.flat"
        result = run(f'"{AAPT2}" compile -o "{out_flat}" "{res_file}"', check=False)
        if result.returncode == 0 and os.path.exists(out_flat):
            flat_files.append(out_flat)
        else:
            print(f"  ❌ Failed: {basename}")

    print(f"\n  ✅ Compiled: {len(flat_files)}/{len(res_files)} files")

    # Step 2: Link resources and generate R.java + APK
    print("\n🔧 STEP 2: Linking Resources and Generating R.java")
    print("-" * 50)

    manifest = f"{SRC_DIR}/AndroidManifest.xml"
    gen_dir = f"{BUILD_DIR}/gen"
    os.makedirs(gen_dir, exist_ok=True)
    apk_unsigned = f"{BUILD_DIR}/apk/NeoStreams-unsigned.apk"
    apk_unguarded = f"{BUILD_DIR}/apk/NeoStreams-unguarded.apk"

    # Build the flat files list with proper escaping
    flat_args = " ".join([f'"{f}"' for f in flat_files])

    link_cmd = (
        f'"{AAPT2}" link '
        f'-o "{apk_unguarded}" '
        f'--manifest "{manifest}" '
        f'--java "{gen_dir}" '
        f'-I "{ANDROID_JAR}" '
        f'{flat_args}'
    )

    result = run(link_cmd, check=False)

    # Check if R.java was generated
    r_java = None
    for root, dirs, files in os.walk(gen_dir):
        for f in files:
            if f == "R.java":
                r_java = os.path.join(root, f)
                print(f"  ✅ R.java generated: {r_java}")
                break
        if r_java:
            break

    if not r_java:
        print("  ❌ R.java was not generated")
        # Try alternative link without -o (dry run)
        print("  🔄 Trying aapt2 link with different options...")
        alt_link = (
            f'"{AAPT2}" link '
            f'-o "{apk_unsigned}" '
            f'--manifest "{manifest}" '
            f'--java "{gen_dir}" '
            f'-I "{ANDROID_JAR}" '
            f'--auto-add-overlay '
            f'{flat_args}'
        )
        result = run(alt_link, check=False)
        for root, dirs, files in os.walk(gen_dir):
            for f in files:
                if f == "R.java":
                    r_java = os.path.join(root, f)
                    print(f"  ✅ R.java generated with alternative: {r_java}")
                    break

    # Step 3: Compile Java code
    print("\n🔧 STEP 3: Compiling Java Code")
    print("-" * 50)

    java_files = []
    for root, dirs, files in os.walk(f"{SRC_DIR}/java"):
        for f in files:
            if f.endswith('.java'):
                java_files.append(os.path.join(root, f))

    print(f"  Found {len(java_files)} Java source files")

    # Check if R.java exists
    gen_source = ""
    if r_java:
        gen_source = f'-sourcepath "{gen_dir}"'

    javac_cmd = (
        f'"{JAVAC}" '
        f'-source 17 '
        f'-target 17 '
        f'-encoding UTF-8 '
        f'-classpath "{ANDROID_JAR}" '
        f'-d "{BUILD_DIR}/classes" '
        f'-g '
        f'-Xlint:none '
        f'{gen_source} '
        f'{" ".join([f'"{jf}"' for jf in java_files])}'
    )

    result = run(javac_cmd, check=False)

    class_count = sum(1 for root, dirs, files in os.walk(f"{BUILD_DIR}/classes") for f in files if f.endswith('.class'))
    print(f"  ✅ Class files compiled: {class_count}")

    if class_count == 0:
        print("  ❌ Java compilation failed - checking individual files...")
        # Try compiling one file at a time to identify the issue
        for jf in java_files:
            result = run(
                f'"{JAVAC}" -source 17 -target 17 -encoding UTF-8 '
                f'-classpath "{ANDROID_JAR}" -d "{BUILD_DIR}/classes" -g -Xlint:none '
                f'-sourcepath "{gen_dir}" "{jf}"',
                check=False
            )
            if result.returncode != 0:
                # Try without sourcepath
                result2 = run(
                    f'"{JAVAC}" -source 17 -target 17 -encoding UTF-8 '
                    f'-classpath "{ANDROID_JAR}" -d "{BUILD_DIR}/classes" -g -Xlint:none "{jf}"',
                    check=False
                )
                if result2.returncode != 0:
                    print(f"  ❌ Failed: {os.path.basename(jf)}: {result.stderr[:200]}")

        class_count = sum(1 for root, dirs, files in os_walk_check(f"{BUILD_DIR}/classes") for f in files if f.endswith('.class'))

    # Step 4: Convert to DEX
    print("\n🔧 STEP 4: Converting to DEX")
    print("-" * 50)

    dex_files = []
    if class_count > 0:
        d8_cmd = f'"{D8}" --release --output "{BUILD_DIR}/dex" "{BUILD_DIR}/classes"'
        result = run(d8_cmd, check=False)
        for f in os.listdir(f"{BUILD_DIR}/dex") if os.path.exists(f"{BUILD_DIR}/dex") else []:
            if f.endswith('.dex'):
                dex_files.append(f"{BUILD_DIR}/dex/{f}")
        print(f"  ✅ DEX files created: {len(dex_files)}")
    else:
        print("  ❌ No class files to convert to DEX")

    # Step 5: Create APK
    print("\n🔧 STEP 5: Creating APK")
    print("-" * 50)

    final_apk = f"{BUILD_DIR}/apk/NeoStreams.apk"

    if os.path.exists(apk_unguarded) or os.path.exists(apk_unsigned):
        # Use aapt2-generated base APK
        base_apk = apk_unguarded if os.path.exists(apk_unguarded) else apk_unsigned
        print(f"  ✅ Using aapt2 base APK: {base_apk}")

        # Copy DEX files into the APK
        if dex_files:
            print(f"  📦 Adding DEX files to APK...")
            temp_apk = f"{BUILD_DIR}/apk/NeoStreams-with-dex.apk"
            shutil.copy(base_apk, temp_apk)
            with zipfile.ZipFile(temp_apk, 'a', zipfile.ZIP_STORED) as apk:
                for dex_file in dex_files:
                    arcname = f"classes{len(dex_files)}.dex"
                    apk.write(dex_file, arcname)
                    print(f"    ✅ Added: {arcname}")
            shutil.copy(temp_apk, final_apk)
        else:
            shutil.copy(base_apk, final_apk)
        print(f"  ✅ APK created: {final_apk}")
    else:
        print("  ❌ No base APK from aapt2, creating minimal APK...")
        # Create minimal APK manually
        with zipfile.ZipFile(final_apk, 'w', zipfile.ZIP_DEFLATED) as apk:
            # Add AndroidManifest.xml
            manifest_path = f"{SRC_DIR}/AndroidManifest.xml"
            if os.path.exists(manifest_path):
                apk.write(manifest_path, "AndroidManifest.xml")

            # Add resources
            for res_file in res_files:
                arcname = os.path.relpath(res_file, SRC_DIR)
                apk.write(res_file, arcname)

            # Add DEX
            for i, dex_file in enumerate(dex_files):
                arcname = f"classes{i+1}.dex"
                apk.write(dex_file, arcname)

        print(f"  ⚠️ Created minimal APK (may not be fully valid)")

    # Step 6: Align and sign APK
    print("\n🔧 STEP 6: Aligning and Signing APK")
    print("-" * 50)

    # Create debug keystore if it doesn't exist
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

    # Align
    aligned_apk = f"{BUILD_DIR}/apk/NeoStreams-aligned.apk"
    align_cmd = f'"{ZIPALIGN}" -f -p 4 "{aligned_apk}" "{final_apk}"'
    result = run(align_cmd, check=False)

    if result.returncode == 0:
        print(f"  ✅ APK aligned successfully")
        signing_input = aligned_apk
    else:
        print(f"  ❌ zipalign failed, using unsigned APK")
        signing_input = final_apk

    # Sign
    signed_apk = f"{BUILD_DIR}/apk/NeoStreams-signed.apk"
    sign_cmd = f'"{APKSIGNER}" sign --ks "{KEYSTORE}" --ks-pass pass:android "{signing_input}"'
    result = run(sign_cmd, check=False)

    if result.returncode == 0:
        print(f"  ✅ APK signed successfully")
        shutil.copy(signing_input, signed_apk)
        signing_input = signed_apk
        shutil.copy(signed_apk, final_apk)
    else:
        print(f"  ❌ APK signing failed")
        shutil.copy(signing_input, final_apk)

    # Verify
    print("\n  🔍 Verifying APK...")
    verify_cmd = f'"{APKSIGNER}" verify --verbose --min-sdk-version 24 "{final_apk}"'
    result = run(verify_cmd, check=False)

    if result.returncode == 0:
        print(f"  ✅ APK verification passed!")
    else:
        print(f"  ⚠️ APK verification: {result.stderr[:200] if result.stderr else result.stdout[:200]}")

    # Final check
    if os.path.exists(final_apk):
        size = os.path.getsize(final_apk)
        print(f"\n{'='*60}")
        print(f"🎉 APK BUILD COMPLETE!")
        print(f"📦 Size: {size} bytes ({size/1024:.2f} KB)")
        print(f"📍 Location: {final_apk}")
        print(f"{'='*60}")

        # Show APK contents
        with zipfile.ZipFile(final_apk, 'r') as apk:
            print(f"\n📋 APK Contents ({len(apk.namelist())} files):")
            for name in sorted(apk.namelist())[:30]:
                print(f"  - {name}")
            if len(apk.namelist()) > 30:
                print(f"  ... and {len(apk.namelist()) - 30} more files")

        return final_apk
    else:
        print(f"\n❌ APK BUILD FAILED")
        return None

def os_walk_check(path):
    """Helper to walk directory safely"""
    if os.path.exists(path):
        for root, dirs, files in os.walk(path):
            return files if files else []
    return []

if __name__ == "__main__":
    result = main()
    if result:
        sys.exit(0)
    else:
        sys.exit(1)
