# TradePilot Inbox ClamAV scanner

This service runs beside the official ClamAV daemon. The daemon's TCP port is only exposed on the private Docker network; the HTTP API binds to host loopback so it can be reached through a Cloudflare Tunnel or another authenticated private ingress.

## Deploy

1. On the Linux host, enter `services/inbox-scanner` and copy `.env.example` to `.env`.
2. Generate a unique secret with `openssl rand -hex 32` and place the resulting value in `.env` as `SCANNER_HMAC_SECRET`.
3. Start the service from that directory:
   `docker compose up -d --build`
4. Wait for ClamAV's initial signature database download and health check.
5. Create a Cloudflare Tunnel public hostname that forwards to `http://127.0.0.1:8787`. Do not create a DNS record pointing directly at the host's public IP or expose ports 8787/3310.
6. Configure the Worker with the scanner HTTPS URL as the `INBOX_SCANNER_URL` Worker variable, and set the matching HMAC secret with `wrangler secret put INBOX_SCANNER_HMAC_SECRET` from an authorized deployment environment.

The API authenticates the timestamp, digest, and HMAC before buffering the request body; it accepts only `POST /scan` with `application/octet-stream`, a 25 MiB maximum body, a 60-second timestamp window, a SHA-256 body digest, and an HMAC-SHA256 signature over `timestamp.digest`. Only two concurrent scans are accepted; overload returns 503 so the Worker can retry. It returns `{"status":"clean"}` or `{"status":"infected"}`; daemon errors fail closed.

ClamAV uses the official `clamav/clamav:1.4` image. The database volume is persistent and FreshClam updates signatures in the container. The 4 GiB memory limit follows ClamAV's Docker guidance. Review the upstream image release notes before upgrading the pinned feature line.

## Worker configuration

Set these Cloudflare Worker variables/secrets (do not commit secret values):

- `INBOX_SCANNER_URL`: the HTTPS URL published through your private tunnel, e.g. `https://inbox-scanner.example.com`
- `INBOX_SCANNER_HMAC_SECRET`: the same random secret as `SCANNER_HMAC_SECRET`

Without both settings, the Worker intentionally does not upload or release attachments.
