# Self-Hosting Guide

This guide explains how to host your FileShare app from your own laptop/computer and expose it to the internet.

## Prerequisites

- Old laptop/computer that can run 24/7
- Stable internet connection with decent upload speed
- Access to your router's admin panel
- Basic command line knowledge

## Step 1: Prepare Your Laptop

### Install Dependencies
```bash
# Make sure Node.js is installed
node --version
npm --version

# Install your app dependencies
npm install
```

### Test Locally First
```bash
# Start the app
npm start
# or
node server.js

# Test it works at http://localhost:3000 (or whatever port you use)
```

## Step 2: Find Your Local Network Info

### Get Your Laptop's Local IP
```bash
# On macOS/Linux:
ifconfig | grep "inet " | grep -v 127.0.0.1

# On Windows:
ipconfig
```
Look for something like `192.168.1.100` or `192.168.0.50`

### Get Your Public IP
```bash
curl ifconfig.me
```
Or visit `whatismyip.com`

## Step 3: Router Configuration

### Access Your Router
1. Open browser and go to:
   - `192.168.1.1` (most common)
   - `192.168.0.1`
   - `10.0.0.1`
2. Login with admin credentials (often on router sticker)

### Port Forwarding Setup
1. Look for "Port Forwarding", "Virtual Servers", or "NAT" settings
2. Create a new rule:
   - **External Port**: 80 (for HTTP) or 443 (for HTTPS)
   - **Internal Port**: 3000 (or whatever your app uses)
   - **Internal IP**: Your laptop's local IP from Step 2
   - **Protocol**: TCP

### Example Configuration
```
Service Name: FileShare
External Port: 80
Internal IP: 192.168.1.100
Internal Port: 3000
Protocol: TCP
```

## Step 4: Dynamic DNS (Recommended)

Since your public IP changes, use a dynamic DNS service:

### Free Options:
- **No-IP**: `noip.com` (free subdomain)
- **DuckDNS**: `duckdns.org` (completely free)
- **Cloudflare**: If you own a domain

### Setup Example (DuckDNS):
1. Create account at `duckdns.org`
2. Create a subdomain like `yourapp.duckdns.org`
3. Install DuckDNS client on your laptop:
```bash
# Create update script
echo 'curl "https://www.duckdns.org/update?domains=yourapp&token=YOUR_TOKEN&ip="' > ~/duckdns_update.sh
chmod +x ~/duckdns_update.sh

# Add to crontab to update every 5 minutes
crontab -e
# Add line: */5 * * * * ~/duckdns_update.sh >/dev/null 2>&1
```

## Step 5: SSL Certificate (HTTPS)

### Using Let's Encrypt (Recommended)
```bash
# Install certbot
# macOS:
brew install certbot

# Ubuntu/Debian:
sudo apt install certbot

# Generate certificate
sudo certbot certonly --standalone -d yourapp.duckdns.org
```

### Update Your App for HTTPS
Modify your server.js to use HTTPS:
```javascript
const https = require('https');
const fs = require('fs');

const options = {
  key: fs.readFileSync('/etc/letsencrypt/live/yourapp.duckdns.org/privkey.pem'),
  cert: fs.readFileSync('/etc/letsencrypt/live/yourapp.duckdns.org/fullchain.pem')
};

https.createServer(options, app).listen(443, () => {
  console.log('HTTPS Server running on port 443');
});
```

## Step 6: Testing

### Test Internal Access
```bash
# From your laptop
curl http://192.168.1.100:3000

# From another device on same network
curl http://192.168.1.100:3000
```

### Test External Access
```bash
# From external network or online tool
curl http://YOUR_PUBLIC_IP:80
# or
curl https://yourapp.duckdns.org
```

## Step 7: Running 24/7

### Keep App Running
```bash
# Install PM2 for process management
npm install -g pm2

# Start your app with PM2
pm2 start server.js --name "fileshare"

# Make PM2 start on boot
pm2 startup
pm2 save
```

### Keep Laptop Running
- Disable sleep/hibernate in power settings
- Keep laptop plugged in
- Ensure good ventilation

## Security Considerations

1. **Firewall**: Only open necessary ports
2. **Updates**: Keep your app and system updated
3. **Monitoring**: Monitor for unusual activity
4. **Backups**: Regular backups of uploaded files
5. **Rate Limiting**: Implement upload/download limits

## Troubleshooting

### Common Issues:
- **Can't connect externally**: Check port forwarding rules
- **Dynamic IP changed**: Verify DNS update is working  
- **SSL issues**: Check certificate renewal (certbot renew)
- **Slow uploads**: Your internet upload speed is the bottleneck

### Testing Commands:
```bash
# Check if port is open from outside
nmap -p 80 YOUR_PUBLIC_IP

# Test from external service
curl -I http://yourapp.duckdns.org
```

## Alternative: VPS Hosting

If self-hosting proves unreliable, consider a cheap VPS:
- DigitalOcean Droplet ($6/month)
- Linode Nanode ($5/month)  
- Vultr ($6/month)

These provide better uptime, bandwidth, and don't tie up your home internet.