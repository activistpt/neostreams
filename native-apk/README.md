# NeoStreams Native Android APK

## Overview

NeoStreams Native Android APK is a standalone Android application that provides native video playback functionality for NeoStreams IPTV streaming service. This APK replaces the traditional WebView-based approach with native Android components for better performance, audio, and video support.

## Features

### Core Features
- **Native Authentication**: Direct login with NeoStreams credentials (`pirata`/`neoiptv369!` or `admin`/`neostreams`)
- **Playlist Management**: Browse and manage all NeoStreams IPTV sources
- **Dual Video Players**: 
  - **Xtream Player**: For Xtream API sources
  - **Stream Player**: For direct M3U stream URLs
- **Native Video Playback**: Full native Android video playback using MediaPlayer
- **Responsive UI**: Material Design with smooth navigation
- **Offline Support**: Cached authentication tokens for reduced server calls
- **Background Playback**: Continue watching even with app in background

### Native Capabilities
- **Hardware Acceleration**: Native video decoding using Android's MediaPlayer
- **Audio Focus Management**: Proper handling of audio focus changes
- **Network Handling**: Robust network connectivity with retry logic
- **Resource Management**: Efficient memory and battery usage
- **Permissions**: Required permissions for network and storage operations

## Technical Architecture

### Components

1. **MainActivity** - Login screen and authentication
   - Username/password input
   - Authentication token caching
   - OAuth2-style token management
   - Automatic session validation

2. **NeoStreamsActivity** - Main app interface
   - Playlist browser with two-column layout
   - Source type detection (Xtream API vs M3U)
   - Native player launch based on source type
   - Real-time playlist updates

3. **XtreamPlayerActivity** - Xtream API video player
   - Handles Xtream API authentication and stream resolution
   - Native M3U8 and TS stream playback
   - Buffering and seek support
   - Full-screen video controls

4. **StreamPlayerActivity** - Direct stream player
   - Simple M3U stream playback
   - Network error handling
   - Adaptive bitrate support
   - Progress tracking

5. **PlayerUtils** - Native playback utilities
   - MediaPlayer wrapper classes
   - SurfaceView management
   - Audio focus handling
   - Video rendering optimizations

### Data Flow

```
Login → API Auth → Token Cache → Playlist Load → Source Selection → Player Launch → Stream Playback
```

## API Integration

### NeoStreams REST API Endpoints

- `POST /api/auth` - Authentication (User/Pass)
- `GET /api/playlists` - All IPTV sources
- `GET /api/source` - Source configuration
- `GET /api/health` - Health check
- `GET /proxy` - Stream proxy
- `GET /proxy/m3u8` - M3U8 stream proxy

### Authentication Flow

1. User enters credentials (`pirata`/`neoiptv369!` or `admin`/`neostreams`)
2. App sends credentials to `/api/auth` endpoint
3. Receives authentication token from NeoStreams server
4. Token cached locally for session persistence
5. Token validated on subsequent API calls
6. Auto-refresh for long-running sessions

### Playlist Processing

- Parse JSON response from `/api/playlists`
- Filter and categorize sources (Xtream API vs M3U)
- Extract stream URLs and metadata
- Cache locally for offline access
- Display in native RecyclerView with custom adapters

## Video Playback

### Native Player Features

- **Hardware Acceleration**: Native video decoding
- **Adaptive Bitrate**: Dynamic quality based on network
- **Buffer Management**: Smooth playback with buffer management
- **Seek Support**: Forward/backward navigation
- **Playback Controls**: Play/pause/seek with visual feedback
- **Fullscreen Mode**: Immersive video viewing experience

### Stream Types Supported

1. **Xtream API Sources** (`type: "xtream-m3u"`)
   - Contains base URL, username, and password
   - Needs additional API calls to resolve actual stream URLs
   - Requires authentication with server credentials

2. **Direct M3U Sources** (`type: "m3u"`)
   - Direct stream URLs
   - Immediate playback support
   - Simpler processing path

## Build Instructions

### Prerequisites

- Windows 10/11 or Linux/macOS
- Android SDK (36.0.0)
- Android Studio JDK (bundled with Android Studio)
- Build tools (aapt2, d8, apksigner)
- Java Development Kit (JDK 17+)

### Build Steps

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd neostreams-native-apk
   ```

2. **Ensure Android SDK is installed**
   ```bash
   # Check if Android SDK exists
   ls "$LOCALAPPDATA/Android/Sdk"
   ```

3. **Set up environment variables**
   ```bash
   export ANDROID_SDK_ROOT="$LOCALAPPDATA/Android/Sdk"
   export ANDROID_STUDIO_JBR="/c/Program Files/Android/Android Studio/jbr"
   ```

4. **Make the build script executable**
   ```bash
   chmod +x build_neostreams_apk.sh
   ```

5. **Run the build script**
   ```bash
   ./build_neostreams_apk.sh . NeoStreams
   ```

6. **Verify the generated APK**
   ```bash
   # Check build output
   ls -la build/apk/
   
   # Verify APK signature
   build-tools/36.0.0/apksigner.bat verify --verbose --print-certs build/apk/NeoStreams.apk
   ```

### Build Output

The build process creates:
- `build/classes/` - Compiled Java classes
- `build/dex/` - DEX files
- `build/apk/unsigned.apk` - Unsigned APK
- `build/apk/aligned.apk` - Zip-aligned APK
- `build/apk/NeoStreams.apk` - Signed APK

## Usage

### Installation

1. **Connect Android device or start emulator**
   ```bash
   adb devices
   ```

2. **Install the APK**
   ```bash
   adb install -r build/apk/NeoStreams.apk
   ```

3. **Run the app**
   ```bash
   adb shell am start -n com.gateway.neostreams/.MainActivity
   ```

### First Time Setup

1. **Launch the app**
   - First launch shows login screen

2. **Enter NeoStreams credentials**
   - Use `pirata` / `neoiptv369!` (recommended)
   - Or use `admin` / `neostreams` (legacy support)

3. **Wait for authentication**
   - App validates credentials with NeoStreams server
   - Loads playlist from server

4. **Browse and watch streams**
   - Select any playlist source to start playback
   - Choose between Xtream Player and Stream Player
   - Enjoy native video playback!

### Troubleshooting

#### Common Issues

1. **Authentication Failures**
   ```
   # Check if NeoStreams server is reachable
   ping 192.168.1.199
   
   # Verify API endpoints
   curl http://192.168.1.199:3000/api/health
   ```

2. **Video Playback Issues**
   ```
   # Clear app cache
   adb shell pm clear com.gateway.neostreams
   
   # Check network connectivity
   adb shell pm grant com.gateway.neostreams android.permission.INTERNET
   ```

3. **APK Installation Failures**
   ```
   # Check if device is authorized
   adb devices
   
   # Enable USB debugging if needed
   ```

#### Support

For issues and support, please check:
- [NeoStreams Documentation](https://neostreams.onrender.com/)
- [GitHub Repository](https://github.com/activistpt/neostreams)
- [Android SDK Troubleshooting](https://developer.android.com/studio/command-line)

## Performance Optimization

### Memory Management

- **Background Activities**: Pause video playback when app is in background
- **Resource Cleanup**: Properly release MediaPlayer resources
- **Caching**: Cache authentication tokens and playlist data

### Network Optimization

- **Connection Pooling**: Reuse HTTP connections
- **Request Throttling**: Limit concurrent requests
- **Offline Mode**: Cache critical data for offline access

### Battery Life

- **Audio Focus**: Properly handle audio focus changes
- **Background Limits**: Limit background activities
- **Network Efficiency**: Use efficient data transfer protocols

## Future Enhancements

### Planned Features

1. **Multi-account Support**
   - Support for multiple NeoStreams accounts
   - Account switching
   - Profile management

2. **Advanced Playback Features**
   - Picture-in-Picture mode
   - Subtitle support
   - Audio track selection
   - Chapter markers

3. **Enhanced UI**
   - Dark theme support
   - Material Design 3
   - Dynamic theming
   - Custom animations

4. **Advanced Features**
   - WiFi direct streaming
   - Cast support
   - Download for offline viewing
   - Social features

### Technical Roadmap

- **Phase 1**: Core functionality (current)
- **Phase 2**: Performance optimization
- **Phase 3**: Advanced features
- **Phase 4**: Platform expansion (iOS support)

## License

This project is licensed under the MIT License. See `LICENSE` file for details.

## Credits

- **NeoStreams Team**: For the core NeoStreams backend service
- **Android SDK Team**: For the Android platform
- **Community Contributors**: For feedback and improvements

## Version History

### Version 1.0.0
- Initial release
- Core NeoStreams functionality
- Native video playback support
- Full authentication integration

### Version 1.1.0
- [Planned] Multi-account support
- [Planned] Enhanced UI components
- [Planned] Performance improvements

## Conclusion

NeoStreams Native Android APK provides a native, high-performance alternative to the WebView-based approach. With native video playback, better performance, and enhanced user experience, this APK represents the next generation of NeoStreams mobile client.

For feedback, issues, or feature requests, please visit the GitHub repository or contact the development team.

---

*This document was generated as part of the NeoStreams Native Android APK project.*
