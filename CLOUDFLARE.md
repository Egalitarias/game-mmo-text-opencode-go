# Cloudflare Integration Guide

This document describes how to deploy the game server behind Cloudflare for DDoS protection, CDN, and SSL/TLS termination.

## Overview

Cloudflare acts as a reverse proxy in front of your game server, providing:
- **DDoS Protection**: Layer 3/4/7 attack mitigation
- **SSL/TLS Termination**: Automatic HTTPS for WebSocket connections
- **Rate Limiting**: Application-level request throttling
- **CDN**: Global edge caching (limited benefit for real-time game traffic)
- **Web Application Firewall (WAF)**: Protection against common exploits

## Architecture

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ wss://game.yourdomain.com
       ▼
┌─────────────────┐
│   Cloudflare    │  ← DDoS protection, SSL termination, rate limiting
│   Edge Network  │
└──────┬──────────┘
       │ ws://your-server-ip:3000
       ▼
┌─────────────────┐
│  Game Server    │  ← Your Node.js server (edge gateways)
│  (Port 3000)    │
└─────────────────┘
```

## Setup Instructions

### 1. Cloudflare Account Setup

1. Create a Cloudflare account at https://cloudflare.com
2. Add your domain (e.g., `yourgame.com`)
3. Update your domain's nameservers to Cloudflare's nameservers
4. Wait for DNS propagation (usually 5-30 minutes)

### 2. Configure DNS Records

In Cloudflare Dashboard → DNS → Records:

```
Type: A
Name: game (or @ for root domain)
IPv4 Address: YOUR_SERVER_IP
Proxy Status: Proxied (orange cloud)
TTL: Auto
```

### 3. Enable WebSocket Support

Cloudflare Dashboard → Network → WebSockets:
- **Enable WebSockets**: ON (should be enabled by default)

### 4. SSL/TLS Configuration

Cloudflare Dashboard → SSL/TLS → Overview:
- **Encryption Mode**: Full (Strict)
- **Always Use HTTPS**: ON
- **Minimum TLS Version**: TLS 1.2

### 5. Firewall Rules (Recommended)

Cloudflare Dashboard → Security → WAF → Firewall Rules:

**Rule 1: Block non-WebSocket traffic to game endpoint**
```
(http.request.uri.path eq "/ws" and not http.request.headers["Upgrade"] eq "websocket")
Action: Block
```

**Rule 2: Rate limit connections per IP**
```
(ip.src in {1.1.1.1/24})
Action: Challenge
Description: Rate limit suspicious IPs
```

### 6. Rate Limiting (Optional)

Cloudflare Dashboard → Security → WAF → Rate Limiting Rules:

```
Path: /ws
Requests per 10 seconds: 100
Action: Block for 1 minute
```

## Server Configuration

### Environment Variables

Add to your `.env` file:

```bash
# Cloudflare Integration
USE_CLOUDFLARE=true
CLOUDFLARE_PROXY_IPS=173.245.48.0/20,103.21.244.0/22,103.22.200.0/22,103.31.4.0/22,141.101.64.0/18,108.162.192.0/18,190.93.240.0/20,188.114.96.0/20,197.234.240.0/22,198.41.128.0/17,162.158.0.0/15,104.16.0.0/13,104.24.0.0/14,172.64.0.0/13,131.0.72.0/22
```

### Code Changes (Optional)

If you want the server to be "Cloudflare-aware," update `packages/server/src/index.ts`:

```typescript
import { config } from 'dotenv';
config();

const USE_CLOUDFLARE = process.env.USE_CLOUDFLARE === 'true';
const CF_PROXY_IPS = process.env.CLOUDFLARE_PROXY_IPS?.split(',') || [];

wss.on('connection', (ws, req) => {
  // Trust Cloudflare headers if configured
  let clientIP: string;
  
  if (USE_CLOUDFLARE && req.headers['cf-connecting-ip']) {
    clientIP = req.headers['cf-connecting-ip'] as string;
  } else {
    clientIP = req.socket.remoteAddress || 'unknown';
  }
  
  console.log(`Client connected from ${clientIP}`);
  
  // Log Cloudflare Ray ID for debugging
  if (USE_CLOUDFLARE && req.headers['cf-ray']) {
    console.log(`CF-Ray: ${req.headers['cf-ray']}`);
  }
  
  // ... rest of connection handling
});
```

### Health Check Endpoint (Recommended)

Add a health check endpoint for Cloudflare monitoring:

```typescript
import http from 'http';

const healthServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

healthServer.listen(3001, () => {
  console.log('Health check server listening on port 3001');
});
```

Then in Cloudflare Dashboard → Load Balancing → Monitors:
- **Type**: HTTPS
- **Path**: /health
- **Expected Response**: 200

## Testing

### Verify Cloudflare is Active

```bash
# Check if traffic is going through Cloudflare
curl -I https://game.yourdomain.com/ws

# Should see headers like:
# server: cloudflare
# cf-ray: <ray-id>
```

### Test WebSocket Connection

```javascript
const ws = new WebSocket('wss://game.yourdomain.com/ws');
ws.onopen = () => console.log('Connected through Cloudflare!');
```

### Monitor in Cloudflare Dashboard

- **Analytics & Logs**: View traffic patterns and attacks
- **Security Events**: See blocked requests and challenges
- **Caching**: Monitor cache hit rates (low for WebSocket traffic)

## Benefits

✅ **DDoS Protection**: Automatic mitigation of volumetric attacks  
✅ **SSL/TLS**: Free certificates and automatic renewal  
✅ **Rate Limiting**: Protect against abuse  
✅ **Global Edge Network**: Reduced latency for international players  
✅ **Analytics**: Detailed traffic insights  
✅ **Zero Code Changes Required**: Works with existing server  

## Limitations

⚠️ **WebSocket Idle Timeout**: Cloudflare closes idle WebSocket connections after 100 seconds  
⚠️ **Connection Limits**: Free plan limits concurrent connections  
⚠️ **No Layer 4 Protection**: Free plan only protects HTTP/HTTPS, not raw TCP/UDP  
⚠️ **Latency Overhead**: Adds ~10-50ms latency due to proxying  

## Mitigating WebSocket Idle Timeout

Cloudflare closes WebSocket connections that are idle for 100 seconds. To prevent this:

### Option 1: Server-Side Ping (Recommended)

The server already implements heartbeat pings every 15 seconds (`HEARTBEAT_MS`), which keeps connections alive.

### Option 2: Client-Side Ping

Add periodic pings from the client:

```typescript
// In packages/client/src/net/socket.ts
setInterval(() => {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ t: 'ping', clientTime: Date.now() }));
  }
}, 30000); // Every 30 seconds
```

## Cost Considerations

- **Free Plan**: Sufficient for small games (<100 concurrent players)
- **Pro Plan ($20/month)**: Advanced WAF rules, more rate limits
- **Business Plan ($200/month)**: Required for Cloudflare Spectrum (raw TCP/UDP protection)

## Troubleshooting

### WebSocket Connection Fails

1. Check Cloudflare Dashboard → Network → WebSockets is enabled
2. Verify SSL/TLS mode is "Full" or "Full (Strict)"
3. Check firewall rules aren't blocking WebSocket upgrades
4. Test direct connection (bypass Cloudflare) to isolate issue

### High Latency

1. Check Cloudflare Dashboard → Caching → Configuration → Development Mode
2. Ensure "Rocket Loader" is disabled (can interfere with WebSockets)
3. Consider using Cloudflare's "Argo Smart Routing" (paid feature)

### Connection Drops

1. Verify heartbeat interval is < 100 seconds
2. Check Cloudflare Analytics for connection errors
3. Review firewall rules for overly aggressive blocking

## Alternative: Direct Connection

If Cloudflare causes issues, you can:

1. **Disable proxy** (grey cloud) in DNS settings
2. **Use direct IP** in client configuration
3. **Implement application-level DDoS protection** (see `packages/server/src/gateway/ratelimit.ts`)

## Related Documentation

- [DEPLOY.md](./DEPLOY.md) - General deployment guide
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture
- [Cloudflare WebSocket Docs](https://developers.cloudflare.com/fundamentals/reference/http-request-headers/#upgrade)

## Support

For Cloudflare-specific issues:
- [Cloudflare Community](https://community.cloudflare.com/)
- [Cloudflare Support](https://support.cloudflare.com/)

For game server issues:
- Check server logs: `journalctl -u game-server`
- Review Cloudflare Analytics dashboard
