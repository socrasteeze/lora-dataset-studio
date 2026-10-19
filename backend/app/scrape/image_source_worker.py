"""Explicit source worker. Its private configuration arrives only on stdin."""
import sys


def main():
    if __package__:
        from .image_source_engines import main as execute
    else:
        from image_source_engines import main as execute
    return execute()


if __name__ == '__main__':
    sys.exit(main())
