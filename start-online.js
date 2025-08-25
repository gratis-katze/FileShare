const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting FileShare in ONLINE mode...\n');

// Check if uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    console.log('📁 Creating uploads directory...');
    fs.mkdirSync(uploadDir);
}

// Start the FileShare server
console.log('🔧 Starting FileShare server on port 3000...');
const server = spawn('node', ['server.js'], {
    stdio: ['inherit', 'pipe', 'pipe']
});

let serverReady = false;

server.stdout.on('data', (data) => {
    const output = data.toString();
    console.log(output);
    
    // Check if server is ready
    if (output.includes('FileShare server running on port 3000') && !serverReady) {
        serverReady = true;
        console.log('✅ Server is ready! Starting tunnel...\n');
        startTunnel();
    }
});

server.stderr.on('data', (data) => {
    console.error(`Server error: ${data}`);
});

function startTunnel() {
    console.log('🌐 Creating tunnel with serveo.net...');
    
    const tunnel = spawn('ssh', [
        '-o', 'StrictHostKeyChecking=no',
        '-4',
        '-R', '80:127.0.0.1:3000',
        'serveo.net'
    ], {
        stdio: ['inherit', 'pipe', 'pipe']
    });

    tunnel.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('🔗', output);
        
        // Extract and highlight the public URL
        const urlMatch = output.match(/https:\/\/[a-f0-9]+\.serveo\.net/);
        if (urlMatch) {
            console.log('\n🎉 SUCCESS! Your FileShare is now accessible online at:');
            console.log(`🌍 ${urlMatch[0]}`);
            console.log('\n📋 Share this URL with anyone to access your FileShare!');
            console.log('💡 Press Ctrl+C to stop both server and tunnel\n');
        }
    });

    tunnel.stderr.on('data', (data) => {
        const output = data.toString();
        if (!output.includes('Pseudo-terminal') && !output.includes('Warning: Permanently added')) {
            console.error(`Tunnel: ${output}`);
        }
    });

    tunnel.on('close', (code) => {
        console.log('\n🔴 Tunnel closed. Stopping server...');
        server.kill();
        process.exit(code);
    });

    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
        console.log('\n🛑 Shutting down...');
        tunnel.kill();
        server.kill();
        process.exit(0);
    });
}

server.on('close', (code) => {
    console.log(`\n🔴 Server exited with code ${code}`);
    process.exit(code);
});