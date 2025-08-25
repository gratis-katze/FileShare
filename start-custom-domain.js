const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration - UPDATE THESE VALUES
const CUSTOM_DOMAIN = 'FelixShare'; // Replace with your actual domain
const PORT = 3000;

console.log('🚀 Starting FileShare with Custom Domain...\n');

// Validate configuration
if (CUSTOM_DOMAIN === 'your-domain.com') {
    console.log('❌ Please update CUSTOM_DOMAIN in start-custom-domain.js with your actual domain');
    console.log('   Example: fileshare.example.com');
    process.exit(1);
}

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

// Start tunnel with custom domain
console.log(`✅ Starting tunnel for ${CUSTOM_DOMAIN}...\n`);
startCustomDomainTunnel();

function startCustomDomainTunnel() {
    console.log(`🌐 Creating tunnel with custom domain: ${CUSTOM_DOMAIN}`);
    console.log('📋 Make sure your DNS records are configured:');
    console.log(`   CNAME: ${CUSTOM_DOMAIN} -> serveo.net`);
    console.log(`   TXT: _serveo-authkey.${CUSTOM_DOMAIN} -> SHA256:mn3We/paynzTwfHoDT6lGm9GeazmuZ9PH66n52tAhmo\n`);
    
    const tunnel = spawn('ssh', [
        '-o', 'StrictHostKeyChecking=no',
        '-4',
        '-R', `${CUSTOM_DOMAIN}:80:127.0.0.1:${PORT}`,
        'serveo.net'
    ], {
        stdio: ['inherit', 'pipe', 'pipe']
    });

    tunnel.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('🔗', output);
        
        // Look for success message or URL
        if (output.includes(CUSTOM_DOMAIN)) {
            console.log('\n🎉 SUCCESS! Your FileShare is now accessible at:');
            console.log(`🌍 https://${CUSTOM_DOMAIN}`);
            console.log('\n📋 Share this URL with anyone to access your FileShare!');
            console.log('💡 Press Ctrl+C to stop both server and tunnel\n');
        }
    });

    tunnel.stderr.on('data', (data) => {
        const output = data.toString();
        if (output.includes('Permission denied') || output.includes('Authentication failed')) {
            console.error('\n❌ Authentication failed! Please check:');
            console.error(`   1. DNS TXT record: _serveo-authkey.${CUSTOM_DOMAIN} = SHA256:mn3We/paynzTwfHoDT6lGm9GeazmuZ9PH66n52tAhmo`);
            console.error(`   2. DNS CNAME record: ${CUSTOM_DOMAIN} -> serveo.net`);
            console.error('   3. DNS propagation (may take a few minutes)\n');
        } else if (!output.includes('Pseudo-terminal') && !output.includes('Warning: Permanently added')) {
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