const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Get mode from command line argument
const mode = process.argv[2];

if (!mode || !['local', 'online', 'custom', 'ngrok'].includes(mode)) {
    console.log('🚀 FileShare Launcher\n');
    console.log('Usage: node start.js <mode>');
    console.log('');
    console.log('Modes:');
    console.log('  local   - Start local server only (default port 3000)');
    console.log('  online  - Start with automatic serveo.net tunnel');
    console.log('  custom  - Start with custom domain tunnel');
    console.log('  ngrok   - Start with ngrok tunnel');
    console.log('');
    console.log('Examples:');
    console.log('  node start.js local');
    console.log('  node start.js online');
    console.log('  node start.js custom');
    console.log('  node start.js ngrok');
    process.exit(1);
}

// Configuration for custom domain mode
const CUSTOM_DOMAIN = 'FelixShare'; // Replace with your actual domain
const PORT = 3000;

console.log(`🚀 Starting FileShare in ${mode.toUpperCase()} mode...\n`);

// Validate custom domain configuration
if (mode === 'custom' && CUSTOM_DOMAIN === 'your-domain.com') {
    console.log('❌ Please update CUSTOM_DOMAIN in start.js with your actual domain');
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

// Start appropriate tunnel based on mode
if (mode === 'local') {
    console.log(`✅ FileShare started in LOCAL mode!`);
    console.log(`🌍 Access your FileShare at: http://localhost:${PORT}`);
    console.log('💡 Press Ctrl+C to stop the server\n');
} else if (mode === 'online') {
    console.log('✅ Starting tunnel...\n');
    checkAndGenerateSSHKey(() => {
        startOnlineTunnel();
    });
} else if (mode === 'custom') {
    console.log(`✅ Starting tunnel for ${CUSTOM_DOMAIN}...\n`);
    checkAndGenerateSSHKey(() => {
        startCustomDomainTunnel();
    });
} else if (mode === 'ngrok') {
    console.log('✅ Starting ngrok tunnel...\n');
    startNgrokTunnel();
}

function checkAndGenerateSSHKey(callback) {
    const sshDir = path.join(os.homedir(), '.ssh');
    const privateKeyPath = path.join(sshDir, 'id_rsa');
    const publicKeyPath = path.join(sshDir, 'id_rsa.pub');
    
    // Check if SSH directory exists
    if (!fs.existsSync(sshDir)) {
        console.log('🔑 Creating .ssh directory...');
        fs.mkdirSync(sshDir, { mode: 0o700 });
    }
    
    // Check if SSH keys exist
    if (!fs.existsSync(privateKeyPath) || !fs.existsSync(publicKeyPath)) {
        console.log('🔑 SSH keys not found. Generating new SSH key pair...');
        console.log('   This is required for creating secure tunnels.\n');
        
        try {
            // Generate SSH key using ssh-keygen
            const keygenProcess = spawn('ssh-keygen', [
                '-t', 'rsa',
                '-b', '2048',
                '-f', privateKeyPath,
                '-N', '',  // No passphrase
                '-C', 'FileShare-auto-generated'
            ], {
                stdio: 'inherit'
            });
            
            keygenProcess.on('close', (code) => {
                if (code === 0) {
                    console.log('✅ SSH key pair generated successfully!');
                    console.log(`   Private key: ${privateKeyPath}`);
                    console.log(`   Public key: ${publicKeyPath}\n`);
                    callback();
                } else {
                    console.error('❌ Failed to generate SSH key pair');
                    console.error('   Please run: ssh-keygen -t rsa -b 2048');
                    process.exit(1);
                }
            });
            
            keygenProcess.on('error', (error) => {
                console.error('❌ ssh-keygen command not found or failed');
                console.error('   Please install OpenSSH or run manually: ssh-keygen -t rsa -b 2048');
                process.exit(1);
            });
            
        } catch (error) {
            console.error('❌ Error generating SSH keys:', error.message);
            console.error('   Please run manually: ssh-keygen -t rsa -b 2048');
            process.exit(1);
        }
    } else {
        console.log('✅ SSH keys found - ready to create tunnel');
        callback();
    }
}

function startOnlineTunnel() {
    console.log('🌐 Creating tunnel with serveo.net...');
    
    const tunnel = spawn('ssh', [
        '-o', 'StrictHostKeyChecking=no',
        '-4',
        '-R', 'felixshare:80:127.0.0.1:3000',
        'serveo.net'
    ], {
        stdio: ['inherit', 'pipe', 'pipe']
    });

    tunnel.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('🔗', output);
        
        // Extract and highlight the public URL
        const urlMatch = output.match(/https:\/\/felixshare\.serveo\.net/) || output.match(/https:\/\/[a-f0-9]+\.serveo\.net/);
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

    setupTunnelHandlers(tunnel);
}

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

    setupTunnelHandlers(tunnel);
}

function startNgrokTunnel() {
    console.log('🌐 Creating ngrok tunnel...');
    
    const tunnel = spawn('ngrok', ['http', PORT.toString()], {
        stdio: ['inherit', 'pipe', 'pipe']
    });

    tunnel.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('🔗', output);
    });

    tunnel.stderr.on('data', (data) => {
        const output = data.toString();
        console.error(`Ngrok: ${output}`);
    });

    // Check ngrok API for the public URL
    setTimeout(() => {
        checkNgrokStatus();
    }, 3000);

    setupTunnelHandlers(tunnel);
}

function checkNgrokStatus() {
    const http = require('http');
    
    const req = http.get('http://localhost:4040/api/tunnels', (res) => {
        let data = '';
        res.on('data', (chunk) => {
            data += chunk;
        });
        res.on('end', () => {
            try {
                const tunnels = JSON.parse(data);
                if (tunnels.tunnels && tunnels.tunnels.length > 0) {
                    const publicUrl = tunnels.tunnels[0].public_url;
                    console.log('\n🎉 SUCCESS! Your FileShare is now accessible online at:');
                    console.log(`🌍 ${publicUrl}`);
                    console.log('\n📋 Share this URL with anyone to access your FileShare!');
                    console.log('💡 Press Ctrl+C to stop both server and tunnel');
                    console.log(`📊 Ngrok Web Interface: http://localhost:4040\n`);
                }
            } catch (error) {
                console.log('⏳ Ngrok tunnel starting up...');
                setTimeout(() => checkNgrokStatus(), 2000);
            }
        });
    }).on('error', (error) => {
        console.log('⏳ Waiting for ngrok to start...');
        setTimeout(() => checkNgrokStatus(), 2000);
    });
}

function setupTunnelHandlers(tunnel) {
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

// Handle Ctrl+C gracefully for local mode
if (mode === 'local') {
    process.on('SIGINT', () => {
        console.log('\n🛑 Shutting down...');
        server.kill();
        process.exit(0);
    });
}

server.on('close', (code) => {
    console.log(`\n🔴 Server exited with code ${code}`);
    process.exit(code);
});