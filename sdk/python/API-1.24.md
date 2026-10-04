# API 1.24: Offline Policy

`lds_sdk.lifecycle.offline_only()` returns the host's offline-runtime policy.
This fork always returns `True`, independently of credentials and distribution
overrides. Use the query before admitting a feature that needs an online API.

Local ComfyUI, Ollama, LM Studio and private-network peers remain supported.
Operator-started Setup downloads are a separate preparation path. Runtime
inference must use prepared local files and caches.

`lds_sdk.network.local_api_url(value)` validates a configured HTTP(S) API URL.
It returns the trimmed URL or raises `ValueError` when the host is invalid,
unresolved or public. All DNS results must be local. Use it before calling a
local tool through an independent HTTP client. Video recovery uses this check.

The query does not sandbox trusted Python code. A plugin must follow the policy
and must not bypass it through an independent client or subprocess.
