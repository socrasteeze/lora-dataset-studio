"""A scan-only gallery-dl child. It reads its private configuration on stdin."""
import json
import logging
import sys


def main():
    # No default gallery-dl config, browser profile, postprocessor, shell action,
    # external module, media downloader, or inherited proxy configuration.
    from gallery_dl import config, job
    request = json.load(sys.stdin)
    config.clear()
    for key, value in request['config'].items():
        config.set((), key, value)
    logging.disable(logging.CRITICAL)
    scan = job.DataJob(request['url'], file=sys.stdout)
    scan.run()
    if scan.exception:
        code = getattr(scan.exception, 'code', 1)
        print(json.dumps([-1, {'kind': 'auth' if code & 16 else 'network'}]), flush=True)
        return 1
    return scan.status


if __name__ == '__main__':
    sys.exit(main())
