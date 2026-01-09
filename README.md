# LinkedIn Data Extractor

A Chrome extension for extracting your LinkedIn profile data, analytics, and network insights. Built with Manifest V3.

## Features

- **Cookie-based Authentication**: Securely uses your existing LinkedIn session
- **Network Interception**: Captures LinkedIn Voyager API responses in real-time
- **DOM Extraction**: Falls back to DOM scraping when API data isn't available
- **Local Storage**: All data stays on your machine - no external servers
- **Export Functionality**: Export your data as JSON or CSV
- **Privacy-Focused**: You control what data is captured and stored

## Architecture

```
linkedin-data-extractor/
├── manifest.json           # Extension configuration (Manifest V3)
├── background/
│   └── service-worker.js   # Background service worker
├── content/
│   ├── interceptor.js      # Network request interceptor
│   ├── dom-extractor.js    # DOM data extraction
│   ├── content-script.js   # Main content script orchestrator
│   ├── injected.js         # Page context script
│   └── styles.css          # Injected styles
├── popup/
│   ├── popup.html          # Extension popup UI
│   ├── popup.css           # Popup styles
│   └── popup.js            # Popup functionality
└── icons/
    ├── icon.svg            # Source icon
    ├── icon16.png          # 16x16 icon
    ├── icon32.png          # 32x32 icon
    ├── icon48.png          # 48x48 icon
    └── icon128.png         # 128x128 icon
```

## Installation

### From Source (Developer Mode)

1. **Generate Icons** (if using placeholders):
   - Open `icons/generate-icons.html` in your browser
   - Click "Download All Icons"
   - Move downloaded files to the `icons/` folder

2. **Load Extension**:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `extension` folder

3. **Navigate to LinkedIn**:
   - Go to `https://www.linkedin.com`
   - Log in to your account
   - Click the extension icon in your toolbar

## Usage

### Automatic Capture
When you browse LinkedIn, the extension automatically captures:
- Profile data from API responses
- Analytics information
- Connection summaries
- Feed content

### Manual Extraction
1. Click the extension icon
2. Click "Extract Now" to capture current page data
3. View captured data with "View Data" button

### Exporting Data
- **JSON Export**: Complete data export with all details
- **CSV Export**: Tabular format for spreadsheet analysis

## Data Captured

### Profile Data
- Name, headline, location
- Profile photo URL
- Connection count
- Follower count
- Member URN

### Analytics Data
- Profile views
- Post impressions
- Search appearances

### API Responses
All LinkedIn Voyager API responses are captured, including:
- `/voyager/api/identity/*` - Profile information
- `/voyager/api/relationships/*` - Connections and network
- `/voyager/api/analytics/*` - Analytics data
- `/voyager/api/feed/*` - Feed content

## Technical Details

### How It Works

1. **Cookie Access**: The extension reads LinkedIn's authentication cookies (`li_at`, `JSESSIONID`) through Chrome's cookies API.

2. **Network Interception**: Content scripts monkey-patch `window.fetch()` and `XMLHttpRequest` to intercept all API calls to LinkedIn's Voyager API.

3. **DOM Extraction**: When API data isn't available, the extension scrapes data directly from LinkedIn's rendered DOM.

4. **Message Passing**: Data flows from content scripts → service worker → storage, with the popup UI querying the service worker for display.

### Key Differences from Taplio X

| Feature | Taplio X | This Extension |
|---------|----------|----------------|
| Data Storage | External servers | Local only |
| Auth Token Handling | Sent to backend | Stays local |
| Server Required | Yes | No |
| Privacy | Tokens shared | Full privacy |
| Export Options | Limited | JSON/CSV |

## Security Considerations

- **No External Servers**: All data stays on your local machine
- **No Token Transmission**: Authentication tokens are never sent externally
- **User Control**: You choose when to extract and what to export
- **Transparent**: All code is readable and auditable

## Permissions Explained

- `cookies`: Read LinkedIn authentication cookies
- `storage`: Store captured data locally
- `activeTab`: Access current tab for extraction
- `scripting`: Inject content scripts into LinkedIn pages
- `host_permissions` for `linkedin.com`: Required for content script injection

## Development

### Building
No build step required - the extension runs directly from source.

### Testing
1. Load the unpacked extension
2. Navigate to LinkedIn
3. Check the browser console for logs (filter by `[ContentScript]`, `[Interceptor]`, etc.)

### Debugging
- **Service Worker**: `chrome://extensions/` → Click "Inspect views: service worker"
- **Content Script**: DevTools on LinkedIn page → Console
- **Popup**: Right-click extension icon → "Inspect popup"

## Limitations

- Only works when logged into LinkedIn
- Some data requires visiting specific pages
- LinkedIn may change their API structure at any time
- Rate limits may apply to extensive data collection

## Legal Notice

This extension is for personal use to access YOUR OWN LinkedIn data. Use responsibly and in accordance with LinkedIn's Terms of Service. The developers are not responsible for any misuse.

## License

MIT License - See LICENSE file for details.

## Contributing

Contributions welcome! Please submit issues and pull requests on GitHub.
