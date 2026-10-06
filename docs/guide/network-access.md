# Network access and privacy

[Documentation](../README.md) · [Security policy](../../SECURITY.md)

Use **Settings** for normal configuration. The complete defaults, `config.json` keys, model locations and environment overrides live in [docs/guide/settings-reference.md](settings-reference.md).

The server binds to `127.0.0.1` by default. Before enabling LAN access or publishing a port, read [SECURITY.md](../../SECURITY.md#the-default-threat-model) and configure the access-token/VPN/reverse-proxy boundary that fits your network. The whole interface also works on a phone or tablet on your own network, so checking a run or triaging a bank does not need the machine that is training.

**What leaves this machine.** This fork does not collect usage statistics and does not send them anywhere. There is no Settings card for sharing. See [Usage statistics](settings-reference.md#usage-statistics).

The app reaches the internet only in these situations:

- **A download you start** — Setup and an Install button stream packages, node packs or weights from the documented hosts (Hugging Face, Civitai, GitHub, PyTorch, Ollama's install page). Nothing is fetched on page load. Two extras fetch their own weights the first time you start that install: the aesthetic head and the NSFW classifier plus SigLIP 2.
- **A private tool you configured** — localhost, a private LAN address, or the operator's tailnet. A public API address is refused before user data is sent.

In-app update checks, API image engines, rented-GPU training, Hugging Face publishing, Civitai browsing and the built-in scraper do not run. A saved key does not turn them back on.

When the app is served on an address the public internet can reach — a rented pod's proxy hostname, a tunnel — set `LDS_PUBLIC=1`. That forces the access token on whatever the setting says, so the switch cannot be turned off into an open door, and generates a token at boot if none exists. It applies to non-loopback binds only, and `LDS_ALLOW_UNAUTHENTICATED=1` still overrides it for setups that authenticate elsewhere.
