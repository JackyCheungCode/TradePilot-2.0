# TradePilot Inbox ClamAV scanner

This service runs beside the official ClamAV daemon. The daemon's TCP port is only exposed on the private Docker network; the HTTP API binds to host loopback so it can be reached through a Cloudflare Tunnel or another authenticated private ingress.

## Deploy

1. Copy `.env.example` to `.env` and generate a unique secret:
   `openssl rand -hex 32`
2. Start the service:
   `docker compose up -d --build`
3. Wait for ClamAV's initial signature database download and health check.
4. Publish only `http://127.0.0.1:8787` through a Cloudflare Tunnel hostname. Do not publish port 3310.
5. Configure the Worker with the scanner HTTPS URL and the same HMAC secret.

The API accepts only `POST /scan` with `application/octet-stream`, a 25 MiB maximum body, a 60-second timestamp window, a SHA-256 body digest, and an HMAC-SHA256 signature over `timestamp.digest`. It returns `{"status":"clean"}` or `{"status":"infected"}`; daemon errors fail closed.

ClamAV uses the official `clamav/clamav:1.4` image. The database volume is persistent and FreshClam updates signatures in the container. The 4 GiB memory limit follows ClamAV's Docker guidance. Review the upstream image release notes before upgrading the pinned feature line.

## Worker configuration

Set these Cloudflare Worker variables/secrets (do not commit secret values):

- `INBOX_SCANNER_URL`: the HTTPS URL published through your private tunnel, e.g. `https://inbox-scanner.example.com`
- `INBOX_SCANNER_HMAC_SECRET`: the same random secret as `SCANNER_HMAC_SECRET`

Without both settings, the Worker intentionally does not upload or release attachments.
