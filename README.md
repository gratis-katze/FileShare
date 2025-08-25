# FelixShare - Cloud Storage Server

A simple file transfer application that turns any laptop into personal cloud storage. Access your files locally or from anywhere on the internet!

<img width="1512" height="982" alt="Screenshot 2025-08-25 at 20 18 19" src="https://github.com/user-attachments/assets/a0f841c8-3a2d-4c30-a50c-4ab4bda70936" />


## Features

- Upload files and folders via web interface
- Folder structure preservation with expandable folder view
- Download files from any device
- Delete files and folders remotely
- Drag & drop file upload
- Internet access via secure tunneling
- Responsive web interface
- Cross-platform compatibility

## Setup

1. Install Node.js (if not already installed)
2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

### Local Network Access
```bash
npm start
```
- Runs server on port 3000
- Access locally: http://localhost:3000  
- Access from network: http://[YOUR_IP]:3000

### Internet Access
```bash
npm run ngrok
```
```bash
npm run serveo
```
- Automatically starts server and creates secure tunnel
- Provides public URL for internet access
- Perfect for accessing files from anywhere
- Press Ctrl+C to stop both server and tunnel

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

## How to Use

1. **Upload Files**: Click "Choose Files" or drag & drop files/folders
2. **Upload Folders**: Click "Choose Folder" to upload entire directory structures  
3. **Browse Files**: Folders appear as expandable items - click to view contents
4. **Download**: Click download button on any file
5. **Delete**: Remove files or entire folders with delete button

### File Organization
- Individual files appear with 📄 icon
- Folders appear with 📁 icon and show file count
- Click folders to expand/collapse and view contents
- Folder structure is preserved exactly as uploaded

## Files Storage

All uploaded files are stored in the `uploads/` directory on the host machine.
