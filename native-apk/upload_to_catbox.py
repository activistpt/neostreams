#!/usr/bin/env python3
"""
Upload NeoStreams APK to Catbox.moe
"""

import requests
import os
import sys

def upload_apk_to_catbox(apk_path):
    """Upload APK to catbox.moe"""
    
    # Catbox.moe API endpoint for file upload
    url = "https://catbox.moe/user/api.php"
    
    # Prepare the file upload
    with open(apk_path, 'rb') as file:
        files = {
            'fileToUpload': (
                os.path.basename(apk_path),
                file,
                'application/vnd.android.package-archive'
            )
        }
        
        # Prepare the form data
        data = {
            'reqtype': 'fileupload'
        }
        
        # Make the request
        print(f"📤 Uploading {os.path.basename(apk_path)} to catbox.moe...")
        response = requests.post(url, files=files, data=data, timeout=60)
        
        if response.status_code == 200:
            result = response.text
            print(f"✅ Upload successful!")
            print(f"📋 Response: {result}")
            
            # Parse the response to extract download URL
            if 'http' in result:
                # Extract the URL from the response
                import re
                url_match = re.search(r'(https://files\.catbox\.moe/[^\s]+)', result)
                if url_match:
                    download_url = url_match.group(1)
                    print(f"📎 Download URL: {download_url}")
                    return download_url
                else:
                    print(f"⚠️ Could not extract download URL from response")
                    print(f"📋 Raw response: {result}")
            else:
                print(f"⚠️ Unexpected response format: {result}")
        else:
            print(f"❌ Upload failed!")
            print(f"❌ Status code: {response.status_code}")
            print(f"❌ Response: {response.text[:500]}")
    
    return None

def main():
    print("=" * 60)
    print("🚀 NEOSTREAMS APK UPLOAD TO CATBOX.MOE")
    print("=" * 60)
    
    # Path to the APK file
    apk_path = "build/apk/NeoStreams.apk"
    
    # Check if APK exists
    if not os.path.exists(apk_path):
        print(f"❌ APK not found at {apk_path}")
        sys.exit(1)
    
    print(f"📦 Found APK: {os.path.basename(apk_path)}")
    print(f"📏 Size: {os.path.getsize(apk_path)} bytes")
    
    # Upload to catbox.moe
    download_url = upload_apk_to_catbox(apk_path)
    
    if download_url:
        print(f"\n🎉 SUCCESS!")
        print(f"📎 APK uploaded successfully to: {download_url}")
        print(f"💾 The APK can now be downloaded and installed on Android devices")
        sys.exit(0)
    else:
        print(f"\n❌ UPLOAD FAILED")
        sys.exit(1)

if __name__ == "__main__":
    main()
