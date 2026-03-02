const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Get mode from command line argument
const mode = process.argv[2];

if (!mode || !['local', 'tunnel'].includes(mode)) {
    console.log('🚀 FileShare Launcher\n');
    console.log('Usage: node start.js <mode>');
    console.log('');
    console.log('Modes:');
    console.log('  local   - Start local server only (default port 3000)');
    console.log('  tunnel  - Start with a public HTTPS tunnel (no signup required)');
    console.log('');
    console.log('Examples:');
    console.log('  node start.js local');
    console.log('  node start.js tunnel');
    process.exit(1);
}

const PORT = 3000;

console.log(`🚀 Starting FileShare in ${mode.toUpperCase()} mode...\n`);

// Check if uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    console.log('📁 Creating uploads directory...');
    fs.mkdirSync(uploadDir);
}

// Start the FileShare server
console.log(`🔧 Starting FileShare server on port ${PORT}...`);
const server = spawn('node', ['server.js'], {
    stdio: ['inherit', 'pipe', 'pipe']
});

server.stdout.on('data', (data) => {
    console.log(data.toString());
});

server.stderr.on('data', (data) => {
    console.error(`Server error: ${data}`);
});

server.on('close', (code) => {
    console.log(`\n🔴 Server exited with code ${code}`);
    process.exit(code);
});

if (mode === 'local') {
    console.log(`✅ FileShare started in LOCAL mode!`);
    console.log(`🌍 Access your FileShare at: http://localhost:${PORT}`);
    console.log('💡 Press Ctrl+C to stop the server\n');

    process.on('SIGINT', () => {
        console.log('\n🛑 Shutting down...');
        server.kill();
        process.exit(0);
    });
} else if (mode === 'tunnel') {
    console.log('✅ Starting tunnel...\n');
    startTunnel();
}

async function startTunnel() {
    console.log('🌐 Creating public tunnel...');

    let localtunnel;
    try {
        localtunnel = require('localtunnel');
    } catch {
        console.error('❌ localtunnel not found. Run: npm install');
        server.kill();
        process.exit(1);
    }

    let tunnel;
    try {
        tunnel = await localtunnel({ port: PORT });
    } catch (err) {
        console.error('❌ Failed to create tunnel:', err.message);
        server.kill();
        process.exit(1);
    }

    console.log('\n🎉 SUCCESS! Your FileShare is now accessible online at:');
    console.log(`🌍 ${tunnel.url}`);
    console.log('\n📋 Share this URL with anyone to access your FileShare!');
    console.log('💡 Note: first-time visitors will see a one-time confirmation page.');
    console.log('💡 Press Ctrl+C to stop both server and tunnel\n');

    tunnel.on('error', (err) => {
        console.error('❌ Tunnel error:', err.message);
    });

    tunnel.on('close', () => {
        console.log('\n🔴 Tunnel closed. Stopping server...');
        server.kill();
        process.exit(0);
    });

    process.on('SIGINT', () => {
        console.log('\n🛑 Shutting down...');
        tunnel.close();
        server.kill();
        process.exit(0);
    });
}
