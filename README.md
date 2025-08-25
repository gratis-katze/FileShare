# FileShare - Cloud Storage Server

A simple file transfer application that turns any laptop into personal cloud storage.

## Features

- Upload files via web interface
- Download files from any device on the network
- Delete files remotely
- Drag & drop file upload
- Responsive web interface
- Cross-platform compatibility

## Setup

1. Install Node.js (if not already installed)
2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   npm start
   ```

4. Access the web interface:
   - Local: http://localhost:3000
   - From other devices: http://[YOUR_IP]:3000

## Getting Your IP Address

### Windows:
```cmd
ipconfig
```

### macOS/Linux:
```bash
ifconfig
```

Look for your local IP address (usually starts with 192.168.x.x or 10.x.x.x)

## Usage

1. Open the web interface in any browser
2. Upload files by clicking "Choose Files" or drag & drop
3. Download or delete files using the file cards
4. Access from any device on the same network using your IP address

## Files Storage

All uploaded files are stored in the `uploads/` directory on the host machine.